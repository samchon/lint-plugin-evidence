import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";

/**
 * Restores the measurement a cell driven outside the runner never reported.
 *
 * The runner is the only writer of a cell's stage costs, so a cell it can no
 * longer resume stops reporting entirely: its goals keep the last figures the
 * runner wrote and everything after the handoff is absent. Reconstructing that
 * by hand is what this module exists to stop. Three separate errors came out of
 * doing it by hand — a per-turn console figure written where a thread delta
 * belongs, a thread total overwritten so an unfinished stage had no share left,
 * and dead time between the runner's loss and the direct drive charged to the
 * stage that followed it.
 *
 * Codex keeps the same cumulative counter the runner reads in its session
 * rollout, so the measurement is recoverable exactly rather than approximately.
 * Everything below derives from that file and from the timestamps bounding each
 * stage; nothing is estimated.
 */
export namespace EvidenceBenchmarkReconcile {
  /** One stage's boundary sources: the runner's events, its console, or both. */
  export interface IStage {
    index: number;
    name: string;
    /** Console log of the direct drive, when one drove this stage. */
    console?: string;
  }

  export interface IProps {
    runRoot: string;
    rollout: string;
    stages: readonly IStage[];
  }

  export interface IReconciled {
    index: number;
    name: string;
    tokens: number;
    elapsedMs: number;
    runnerMs: number;
    directMs: number;
  }

  /**
   * Rewrites a run's stage costs from its rollout and returns what it wrote.
   *
   * Tokens are the counter's rise from the previous stage's end to this one's,
   * which loses nothing between stages because an idle thread consumes none.
   * Wall time cannot be taken the same way, since the gap between a lost runner
   * and a direct drive is real time in which no stage was running, so a stage
   * is credited with the runner's own span for it plus the span its console
   * covers and nothing else. Only those console spans are declared inherited,
   * because the process records already hold the runner's.
   */
  export async function run(props: IProps): Promise<IReconciled[]> {
    const points: [number, number][] = await readRollout(props.rollout);
    const spans: Map<string, { lo: number; hi: number }> =
      await readRunnerSpans(path.join(props.runRoot, "events.jsonl"));
    const statePath: string = path.join(props.runRoot, "state.json");
    const file: Record<string, any> = JSON.parse(
      fs.readFileSync(statePath, "utf8"),
    );
    const state: Record<string, any> = file.state ?? file;

    // A stage ends where the next one starts, so the boundaries are read in one
    // pass first: a stage that the runner kept an open cursor on would otherwise
    // absorb every later event it never did any work for.
    const starts: (number | undefined)[] = props.stages.map((stage) =>
      boundary(stage, spans, "lo"),
    );
    const ends: (number | undefined)[] = props.stages.map((stage, order) => {
      const own: number | undefined = boundary(stage, spans, "hi");
      const next: number | undefined = starts
        .slice(order + 1)
        .find((value) => value !== undefined);
      if (own === undefined) return next;
      return next === undefined ? own : Math.min(own, next);
    });

    const written: IReconciled[] = [];
    let previousCumulative: number = 0;
    let directTotal: number = 0;
    for (let order: number = 0; order < props.stages.length; ++order) {
      const stage: IStage = props.stages[order]!;
      const record: Record<string, any> | undefined = state.goals.find(
        (goal: Record<string, any>) => goal.index === stage.index,
      );
      const end: number | undefined = ends[order];
      if (record === undefined || end === undefined) continue;

      const cumulative: number = cumulativeAt(points, end);
      const tokens: number = Math.max(0, cumulative - previousCumulative);
      const span = spans.get(stage.name);
      const runnerMs: number =
        span === undefined ? 0 : Math.max(0, Math.min(span.hi, end) - span.lo);
      const directMs: number = consoleSpan(stage.console);
      directTotal += directMs;

      record.tokenUsage = { totalTokens: tokens };
      record.elapsedMs = runnerMs + directMs;
      if (record.goal !== null)
        record.goal = {
          status: record.goal?.status ?? "complete",
          timeUsedSeconds: Math.round(record.elapsedMs / 1000),
        };
      written.push({
        index: stage.index,
        name: stage.name,
        tokens,
        elapsedMs: record.elapsedMs,
        runnerMs,
        directMs,
      });
      previousCumulative = cumulative;
    }

    // The counter's latest reading, not the sum of finished stages: the stage
    // still running has spent the difference, and the report hands that share to
    // whichever stage is current. Flattening it to the sum reports zero for work
    // that is happening right now.
    const latest: number = points.at(-1)?.[1] ?? 0;
    state.threadTokenUsage.totalTokens = Math.max(latest, previousCumulative);
    state.inheritedProcessElapsedMs = directTotal;
    // A finished run's cursor sits past its last goal. Left on the last goal,
    // the report treats that stage as current and pours the unattributed wall
    // clock into it.
    if (state.status === "completed")
      state.nextInstructionIndex = state.goals.length;
    fs.writeFileSync(statePath, JSON.stringify(file, null, 2), "utf8");
    return written;
  }

  function boundary(
    stage: IStage,
    spans: Map<string, { lo: number; hi: number }>,
    edge: "lo" | "hi",
  ): number | undefined {
    const span = spans.get(stage.name);
    const runner: number | undefined = span?.[edge];
    const stat: fs.Stats | undefined =
      stage.console !== undefined && fs.existsSync(stage.console)
        ? fs.statSync(stage.console)
        : undefined;
    const direct: number | undefined =
      stat === undefined
        ? undefined
        : edge === "lo"
          ? stat.birthtimeMs
          : stat.mtimeMs;
    if (runner === undefined) return direct;
    if (direct === undefined) return runner;
    return edge === "lo" ? Math.min(runner, direct) : Math.max(runner, direct);
  }

  function consoleSpan(file: string | undefined): number {
    if (file === undefined || !fs.existsSync(file)) return 0;
    const stat: fs.Stats = fs.statSync(file);
    return Math.max(0, Math.round(stat.mtimeMs - stat.birthtimeMs));
  }

  function cumulativeAt(
    points: readonly [number, number][],
    at: number,
  ): number {
    let value: number = 0;
    for (const [moment, total] of points) {
      if (moment > at) break;
      value = total;
    }
    return value;
  }

  function readRollout(file: string): Promise<[number, number][]> {
    return new Promise((resolve) => {
      const points: [number, number][] = [];
      readline
        .createInterface({ input: fs.createReadStream(file) })
        .on("line", (line) => {
          if (!line.includes("total_token_usage")) return;
          try {
            const record: Record<string, any> = JSON.parse(line);
            const at: number = Date.parse(record.timestamp);
            const total: unknown =
              record.payload?.info?.total_token_usage?.total_tokens;
            if (Number.isFinite(at) && typeof total === "number")
              points.push([at, total]);
          } catch {
            return;
          }
        })
        .on("close", () =>
          resolve(points.sort((left, right) => left[0] - right[0])),
        );
    });
  }

  function readRunnerSpans(
    file: string,
  ): Promise<Map<string, { lo: number; hi: number }>> {
    return new Promise((resolve) => {
      const spans: Map<string, { lo: number; hi: number }> = new Map();
      if (!fs.existsSync(file)) return resolve(spans);
      readline
        .createInterface({ input: fs.createReadStream(file) })
        .on("line", (line) => {
          try {
            const record: Record<string, any> = JSON.parse(line);
            if (typeof record.stage !== "string") return;
            const at: number = Date.parse(record.recordedAt);
            if (!Number.isFinite(at)) return;
            const span = spans.get(record.stage);
            spans.set(
              record.stage,
              span === undefined
                ? { lo: at, hi: at }
                : { lo: Math.min(span.lo, at), hi: Math.max(span.hi, at) },
            );
          } catch {
            return;
          }
        })
        .on("close", () => resolve(spans));
    });
  }
}
