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
    name: string;
    /** Console log of the direct drive, when one drove this stage. */
    console?: string;
  }

  export interface IProps {
    runRoot: string;
    rollout: string;
    /** Instruction root of the cell's arm, for a stage the runner never wrote. */
    instructionRoot: string;
    /** Every stage the run performed, in objective order. */
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
    const points: [number, Record<string, number>][] = await readRollout(
      props.rollout,
    );
    const spans: Map<string, { lo: number; hi: number }> =
      await readRunnerSpans(path.join(props.runRoot, "events.jsonl"));
    const statePath: string = path.join(props.runRoot, "state.json");
    const file: Record<string, any> = JSON.parse(
      fs.readFileSync(statePath, "utf8"),
    );
    const state: Record<string, any> = file.state ?? file;

    // The runner is the only writer of a goal, so a stage it never drove has no
    // record to reconcile and the earlier version of this pass skipped it. That
    // is why the direct drives kept being costed by hand, and every hand-made
    // figure so far has been wrong in some way. The list below is authoritative:
    // a stage without a record gets one, and the records are then ordered and
    // renumbered to match, because a goal's index is its position and matching
    // on it while inserting would attach every later stage to the wrong record.
    const records: Record<string, any>[] = props.stages.map((stage) => {
      const found: Record<string, any> | undefined = state.goals.find(
        (goal: Record<string, any>) => goal.name === stage.name,
      );
      return found ?? created(stage.name, props.instructionRoot, state.goals);
    });
    const named: Set<string> = new Set(props.stages.map((stage) => stage.name));
    const orphan: Record<string, any> | undefined = state.goals.find(
      (goal: Record<string, any>) => !named.has(goal.name),
    );
    if (orphan !== undefined)
      throw new Error(
        `Stage list omits a stage the run already recorded: ${String(orphan.name)}. ` +
          `Reordering an incomplete list would renumber the run's goals against their own positions.`,
      );
    records.forEach((record, order) => (record.index = order));
    state.goals = records;

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
    let previousCumulative: Record<string, number> = {};
    let cumulativeSeconds: number = 0;
    let directTotal: number = 0;
    for (let order: number = 0; order < props.stages.length; ++order) {
      const stage: IStage = props.stages[order]!;
      const record: Record<string, any> = records[order]!;
      const end: number | undefined = ends[order];
      // A stage with neither a runner span nor a console left no record of when
      // it ran, so nothing about it is derivable and inventing a figure is the
      // very thing this module exists to stop.
      if (end === undefined) continue;

      const cumulative: Record<string, number> = cumulativeAt(points, end);
      // Where the runner recorded both boundaries itself, its own delta is
      // the measurement and a rollout-derived one must not replace it: a
      // checkpoint verifies a fork against exactly these numbers, and changing
      // them makes the source underivable.
      const measured: boolean =
        record.tokenUsageStart != null && record.tokenUsageEnd != null;
      const usage: Record<string, number> = measured
        ? usageDelta(
            asCounter(record.tokenUsageEnd),
            asCounter(record.tokenUsageStart),
          )
        : usageDelta(cumulative, previousCumulative);
      const tokens: number = usage.totalTokens!;
      const span = spans.get(stage.name);
      const runnerMs: number =
        span === undefined ? 0 : Math.max(0, Math.min(span.hi, end) - span.lo);
      const directMs: number = consoleSpan(stage.console);
      directTotal += directMs;

      record.tokenUsage = usage;
      record.elapsedMs = runnerMs + directMs;
      // Only the timing is reconciled. Replacing the Goal object would drop
      // what the runner put there — the thread it ran on above all — and a
      // checkpoint derivation compares that thread against its own record.
      //
      // `timeUsedSeconds` is the thread's running total, not this stage's
      // share: the report reads a stage as the difference between its own
      // figure and the one before it. Writing a per-stage value here makes
      // every published duration a difference of two unrelated numbers.
      cumulativeSeconds += Math.round(record.elapsedMs / 1000);
      if (record.goal !== null && record.goal !== undefined) {
        record.goal.status = record.goal.status ?? "complete";
        record.goal.timeUsedSeconds = cumulativeSeconds;
      }
      written.push({
        index: order,
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
    const latest: Record<string, number> = points.at(-1)?.[1] ?? {};
    const total: Record<string, number> = usageDelta(latest, {});
    if (total.totalTokens! >= (previousCumulative.total_tokens ?? 0))
      state.threadTokenUsage = { ...state.threadTokenUsage, ...total };
    state.inheritedProcessElapsedMs = directTotal;
    // A finished run's cursor sits past its last goal. Left on the last goal,
    // the report treats that stage as current and pours the unattributed wall
    // clock into it.
    //
    // A running one's cursor is the last stage with a record of having started,
    // which the runner would have advanced itself. Left where the runner lost
    // it, the report names a stage that finished hours ago as the current one
    // and hands it every token the stages after it actually spent.
    if (state.status === "completed")
      state.nextInstructionIndex = state.goals.length;
    else if (written.length !== 0)
      state.nextInstructionIndex = written.at(-1)!.index;
    fs.writeFileSync(statePath, JSON.stringify(file, null, 2), "utf8");
    return written;
  }

  /**
   * The record a stage would have had if the runner had driven it.
   *
   * Only what is derivable is written. The instruction is read from the arm's
   * own file rather than restated, and the fields the runner alone can know —
   * the turn a stage terminated on above all — stay null, because a fabricated
   * one would make a later checkpoint derive against a turn that never existed.
   * The continuation is copied from a sibling because every stage of a run
   * receives the same one.
   */
  function created(
    name: string,
    instructionRoot: string,
    siblings: readonly Record<string, any>[],
  ): Record<string, any> {
    // `overall-remind-3` is the third sending of `overall/remind.md`: the
    // attempt number is the runner's, not part of the instruction's identity.
    const base: string = name.replace(/-\d+$/, "");
    const split: number = base.indexOf("-");
    const relativePath: string = path.join(
      path.basename(instructionRoot),
      split < 0 ? `${base}.md` : base.slice(0, split),
      split < 0 ? "" : `${base.slice(split + 1)}.md`,
    );
    const file: string = path.join(
      instructionRoot,
      ...relativePath.split(path.sep).slice(1),
    );
    if (!fs.existsSync(file))
      throw new Error(
        `Stage ${name} has no instruction at ${file}, so its record cannot be written from the arm's own text.`,
      );
    return {
      index: -1,
      name,
      relativePath: relativePath.split(path.sep).join("/"),
      goal: null,
      terminalTurnId: null,
      terminalTurnCompleted: true,
      threadIdle: true,
      tokenUsageTurnId: null,
      tokenUsageStart: null,
      tokenUsageEnd: null,
      tokenUsage: usageDelta({}, {}),
      elapsedMs: 0,
      prescribedText: fs.readFileSync(file, "utf8"),
      continuationText: siblings.find(
        (goal) => typeof goal.continuationText === "string",
      )?.continuationText,
      objectiveText: "",
    };
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

  /** Reads a retained usage object in the rollout's own field spelling. */
  function asCounter(usage: Record<string, number>): Record<string, number> {
    return {
      total_tokens: usage.totalTokens ?? 0,
      input_tokens: usage.inputTokens ?? 0,
      cached_input_tokens: usage.cachedInputTokens ?? 0,
      cache_write_input_tokens: usage.cacheWriteInputTokens ?? 0,
      output_tokens: usage.outputTokens ?? 0,
      reasoning_output_tokens: usage.reasoningOutputTokens ?? 0,
    };
  }

  function consoleSpan(file: string | undefined): number {
    if (file === undefined || !fs.existsSync(file)) return 0;
    const stat: fs.Stats = fs.statSync(file);
    return Math.max(0, Math.round(stat.mtimeMs - stat.birthtimeMs));
  }

  /** The counter's reading at a moment, with every field it carries. */
  function cumulativeAt(
    points: readonly [number, Record<string, number>][],
    at: number,
  ): Record<string, number> {
    let value: Record<string, number> = {};
    for (const [moment, usage] of points) {
      if (moment > at) break;
      value = usage;
    }
    return value;
  }

  /**
   * A stage's usage is the counter's rise in every field, not only the total.
   * The retained shape is validated on load, so a partial object would make the
   * run unreadable — which is how a derivation of one cell first failed.
   */
  function usageDelta(
    to: Record<string, number>,
    from: Record<string, number>,
  ): Record<string, number> {
    const rise = (key: string): number =>
      Math.max(0, (to[key] ?? 0) - (from[key] ?? 0));
    return {
      totalTokens: rise("total_tokens"),
      inputTokens: rise("input_tokens"),
      cachedInputTokens: rise("cached_input_tokens"),
      cacheWriteInputTokens: rise("cache_write_input_tokens"),
      outputTokens: rise("output_tokens"),
      reasoningOutputTokens: rise("reasoning_output_tokens"),
    };
  }

  function readRollout(
    file: string,
  ): Promise<[number, Record<string, number>][]> {
    return new Promise((resolve) => {
      const points: [number, Record<string, number>][] = [];
      readline
        .createInterface({ input: fs.createReadStream(file) })
        .on("line", (line) => {
          if (!line.includes("total_token_usage")) return;
          try {
            const record: Record<string, any> = JSON.parse(line);
            const at: number = Date.parse(record.timestamp);
            const usage: Record<string, unknown> | undefined =
              record.payload?.info?.total_token_usage;
            if (Number.isFinite(at) && typeof usage?.total_tokens === "number")
              points.push([at, usage as Record<string, number>]);
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
