import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";

/**
 * Names the stage a hand-driven run is actually on.
 *
 * The runner writes a Goal record when it brokers a stage itself. A stage
 * dispatched by hand — to resume a chain the runner refused to continue, or to
 * run a stage the chain skipped — leaves that record untouched, so a report
 * built from `state.json` alone keeps quoting the last stage the runner saw
 * however far the cell has since travelled. Two cells in this campaign read as
 * `quality-failed` and `completed` while both were building frontends.
 *
 * The console is not the fix, because a hand-driven console can be written
 * anywhere and two of them were written outside their run. The rollout is: the
 * session records every dispatch whichever process issued it, in the same file
 * the cost collector already prices from, and its header names the run. So the
 * stage a cell is on is recoverable from the same source as what it spent, and
 * one cannot drift from the other.
 *
 * What this reports is the last stage _dispatched_, never that it finished.
 * Finishing is the runner's word to give and a hand-driven stage never gets
 * it.
 */
export namespace EvidenceBenchmarkDirectStage {
  export interface IDirectStage {
    /** Stage name in the report's own vocabulary, such as `frontend-review`. */
    stage: string;
    /** When the session was handed this instruction. */
    dispatchedAt: number;
    /**
     * When the carrying session last wrote anything.
     *
     * A dispatch says a stage began and never that it ended, so this is the
     * only thing separating a stage still being worked from one that went quiet
     * hours ago. Both are `driven` as far as the runner is concerned.
     */
    lastActivityAt: number;
    /** Session that carried it. */
    sessionId: string;
  }

  const RUN_ID =
    /runs[\\/]+([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/u;

  const SESSION_ID =
    /rollout-[0-9T:-]+-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.jsonl$/u;

  /**
   * Every run's last hand-dispatched stage, keyed by run id.
   *
   * The instruction heading is the key rather than the file name, because a
   * hand-driven console carries whatever name its driver chose while the
   * instruction text is the thing the session was actually given.
   */
  export const collect = async (
    instructionsRoot: string,
  ): Promise<ReadonlyMap<string, IDirectStage>> => {
    const headings: ReadonlyMap<string, string> =
      readHeadings(instructionsRoot);
    const result: Map<string, IDirectStage> = new Map();
    if (headings.size === 0) return result;
    for (const file of rollouts()) {
      const runId: string | undefined = readRunId(file);
      if (runId === undefined) continue;
      const found: IDirectStage | undefined = await readLastDispatch(
        file,
        headings,
        fs.statSync(file).mtimeMs,
      );
      if (found === undefined) continue;
      const previous: IDirectStage | undefined = result.get(runId);
      if (previous === undefined || found.dispatchedAt > previous.dispatchedAt)
        result.set(runId, found);
    }
    return result;
  };

  /**
   * Maps each instruction's first line to the stage name it becomes.
   *
   * A remind instruction is shared by every attempt and its text cannot say
   * which one, so it maps to the unnumbered name. Reporting `backend-remind`
   * where the runner would have said `backend-remind-3` understates what is
   * known rather than inventing an attempt number.
   */
  const readHeadings = (
    instructionsRoot: string,
  ): ReadonlyMap<string, string> => {
    const headings: Map<string, string> = new Map();
    if (!fs.existsSync(instructionsRoot)) return headings;
    for (const arm of fs.readdirSync(instructionsRoot, {
      withFileTypes: true,
    })) {
      if (!arm.isDirectory()) continue;
      const armRoot: string = path.join(instructionsRoot, arm.name);
      for (const group of fs.readdirSync(armRoot, { withFileTypes: true })) {
        if (!group.isDirectory()) continue;
        const groupRoot: string = path.join(armRoot, group.name);
        for (const entry of fs.readdirSync(groupRoot)) {
          if (!entry.endsWith(".md")) continue;
          const name: string = entry.slice(0, -3);
          const heading: string | undefined = firstLine(
            path.join(groupRoot, entry),
          );
          if (heading === undefined) continue;
          headings.set(heading, `${group.name}-${name}`);
        }
      }
    }
    return headings;
  };

  const firstLine = (file: string): string | undefined =>
    fs
      .readFileSync(file, "utf8")
      .split(/\r?\n/u)
      .map((line) => line.trim())
      .find((line) => line.length !== 0);

  const rollouts = (): string[] => {
    const root: string = path.join(os.homedir(), ".codex", "sessions");
    if (!fs.existsSync(root)) return [];
    const walk = (directory: string): string[] =>
      fs
        .readdirSync(directory, { withFileTypes: true })
        .flatMap((entry) =>
          entry.isDirectory()
            ? walk(path.join(directory, entry.name))
            : /^rollout-.*\.jsonl$/u.test(entry.name)
              ? [path.join(directory, entry.name)]
              : [],
        );
    return walk(root);
  };

  /** Reads the run this session worked in, from its header alone. */
  const readRunId = (file: string): string | undefined => {
    const buffer: Buffer = Buffer.alloc(4096);
    const descriptor: number = fs.openSync(file, "r");
    try {
      const length: number = fs.readSync(
        descriptor,
        buffer,
        0,
        buffer.length,
        0,
      );
      return RUN_ID.exec(buffer.subarray(0, length).toString("utf8"))?.[1];
    } finally {
      fs.closeSync(descriptor);
    }
  };

  /**
   * Reads the last instruction this session was handed.
   *
   * Only a user-role turn counts. The same instruction text also appears in
   * tool output and in compaction summaries, and counting either would report a
   * stage the session merely read about.
   */
  const readLastDispatch = (
    file: string,
    headings: ReadonlyMap<string, string>,
    lastActivityAt: number,
  ): Promise<IDirectStage | undefined> =>
    new Promise((resolve) => {
      const sessionId: string = SESSION_ID.exec(file)?.[1] ?? "";
      let found: IDirectStage | undefined;
      readline
        .createInterface({ input: fs.createReadStream(file) })
        .on("line", (line) => {
          if (!line.includes('"user"')) return;
          let record: Record<string, any>;
          try {
            record = JSON.parse(line);
          } catch {
            return;
          }
          if (record.payload?.role !== "user") return;
          const text: string = (record.payload.content ?? [])
            .map((part: Record<string, any>) => part?.text ?? "")
            .join("\n");
          const heading: string | undefined = text
            .split(/\r?\n/u)
            .map((entry) => entry.trim())
            .find((entry) => entry.length !== 0);
          const stage: string | undefined =
            heading === undefined ? undefined : headings.get(heading);
          if (stage === undefined) return;
          const dispatchedAt: number = Date.parse(record.timestamp ?? "");
          if (!Number.isFinite(dispatchedAt)) return;
          if (found === undefined || dispatchedAt > found.dispatchedAt)
            found = { stage, dispatchedAt, lastActivityAt, sessionId };
        })
        .on("close", () => resolve(found));
    });
}
