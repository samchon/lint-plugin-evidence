import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";

/**
 * Restores the measurement a cell driven outside the runner never reported.
 *
 * The runner is the only writer of a cell's stage costs, so a cell it can no
 * longer resume stops reporting entirely: its goals keep the last figures the
 * runner wrote and everything after the handoff is absent. Reconstructing that
 * by hand is what this module exists to stop. Four separate errors came out of
 * doing it by hand — a per-turn console figure written where a thread delta
 * belongs, a thread total overwritten so an unfinished stage had no share left,
 * dead time between the runner's loss and the direct drive charged to the stage
 * that followed it, and a finished run's cursor left on its last goal so the
 * report poured every unattributed minute into it.
 *
 * A fifth came out of the first version of this module, and it is why the
 * boundaries below are derived the way they are. That version took a direct
 * drive's span from its console log's file times, which is a true measurement
 * only until someone moves the file: copying one sets both times to the moment
 * of the copy, and a 200 KB log then reports a span of zero. Reorganising a
 * cell's logs silently flattened three stages to nothing and handed their cost
 * to a neighbour. File metadata is not a record of when work happened.
 *
 * What is a record is the session rollout. It carries the same cumulative
 * counter the runner reads, stamped per event, and no file operation on the
 * logs can touch it. A stage the runner never recorded is therefore measured as
 * one contiguous block of rollout activity: dispatches are separated by minutes
 * of idleness and turns within a dispatch are not, so the blocks are the
 * dispatches. Nothing here is estimated, and a stage whose block cannot be
 * identified is left alone rather than given a plausible number.
 */
export namespace EvidenceBenchmarkReconcile {
  /**
   * One stage of the run, in objective order.
   *
   * A stage the runner measured is named alone and is not touched. A stage it
   * never recorded is marked `derive`, and takes one block of rollout activity.
   */
  export interface IStage {
    name: string;
    /** Whether this stage's cost must come from the rollout. */
    derive?: boolean;
  }

  export interface IProps {
    runRoot: string;
    rollout: string;
    /** Instruction root of the cell's arm, for a stage the runner never wrote. */
    instructionRoot: string;
    /** Every stage the run performed, in objective order. */
    stages: readonly IStage[];
    /**
     * Idleness that separates one dispatch from the next, in minutes.
     *
     * A turn's own pauses are well under this and the wait between dispatches
     * is well over it, so the split is not sensitive to the exact value. It is
     * exposed so a run whose dispatches were unusually close can say so rather
     * than have two of them silently merged.
     */
    idleMinutes?: number;
  }

  export interface IReconciled {
    index: number;
    name: string;
    tokens: number;
    elapsedMs: number;
    derived: boolean;
  }

  /** One dispatch: a contiguous run of rollout activity. */
  interface IBlock {
    from: number;
    to: number;
    opening: Record<string, number>;
    closing: Record<string, number>;
  }

  /**
   * Rewrites the costs of the stages that carry no measurement, and returns
   * every stage's figures as they now stand.
   *
   * Only a stage marked `derive` is written. A stage the runner measured is
   * evidence of what the runner saw, and recomputing it from the rollout would
   * replace a real measurement with a reconstruction — which is also how a
   * checkpoint verifies a fork, so changing those numbers makes the source of a
   * derived run unprovable.
   */
  export async function run(props: IProps): Promise<IReconciled[]> {
    const blocks: IBlock[] = split(
      await readRollout(props.rollout),
      (props.idleMinutes ?? 3) * 60_000,
    );
    const statePath: string = path.join(props.runRoot, "state.json");
    const file: Record<string, any> = JSON.parse(
      fs.readFileSync(statePath, "utf8"),
    );
    const state: Record<string, any> = file.state ?? file;

    // The runner is the only writer of a goal, so a stage it never drove has no
    // record to reconcile and the earlier version of this pass skipped it. That
    // is why the direct drives kept being costed by hand. The list below is
    // authoritative: a stage without a record gets one, and the records are then
    // ordered and renumbered to match, because a goal's index is its position
    // and matching on it while inserting would attach every later stage to the
    // wrong record.
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

    // The stages to derive are the run's last, because a cell leaves the runner
    // and does not return to it. They take the rollout's last blocks, in order,
    // so the count must agree: fewer blocks than stages means a dispatch left no
    // trace, and more means one of the earlier stages is being cut in half.
    const derived: number[] = props.stages
      .map((stage, order) => (stage.derive === true ? order : -1))
      .filter((order) => order !== -1);
    if (derived.some((order, at) => order !== derived[0]! + at))
      throw new Error(
        "Stages to derive must be consecutive: a run leaves the runner once and does not return to it.",
      );
    if (derived.length > blocks.length)
      throw new Error(
        `The rollout holds ${blocks.length} dispatches but ${derived.length} stages ask to be derived from it.`,
      );
    const taken: IBlock[] = blocks.slice(blocks.length - derived.length);

    const written: IReconciled[] = [];
    let cumulativeSeconds: number = 0;
    for (let order: number = 0; order < props.stages.length; ++order) {
      const record: Record<string, any> = records[order]!;
      const at: number = derived.indexOf(order);
      if (at !== -1) {
        const block: IBlock = taken[at]!;
        record.tokenUsage = usageDelta(block.closing, block.opening);
        record.elapsedMs = Math.max(0, block.to - block.from);
      }
      // `timeUsedSeconds` is the thread's running total, not this stage's
      // share: the report reads a stage as the difference between its own
      // figure and the one before it. Writing a per-stage value here makes
      // every published duration a difference of two unrelated numbers.
      cumulativeSeconds += Math.round((record.elapsedMs ?? 0) / 1000);
      if (record.goal === null || record.goal === undefined)
        record.goal = { status: "complete", timeUsedSeconds: cumulativeSeconds };
      else {
        record.goal.status = record.goal.status ?? "complete";
        record.goal.timeUsedSeconds = cumulativeSeconds;
      }
      written.push({
        index: order,
        name: props.stages[order]!.name,
        tokens: record.tokenUsage?.totalTokens ?? 0,
        elapsedMs: record.elapsedMs ?? 0,
        derived: at !== -1,
      });
    }

    // The counter's latest reading, not the sum of finished stages: the stage
    // still running has spent the difference, and the report hands that share to
    // whichever stage is current. Flattening it to the sum reports zero for work
    // that is happening right now.
    const latest: Record<string, number> = blocks.at(-1)?.closing ?? {};
    state.threadTokenUsage = {
      ...state.threadTokenUsage,
      ...usageDelta(latest, {}),
    };
    // The report derives a cell's total from the runner's own process records
    // and derives each stage row from the goals, so the two disagree by exactly
    // the work the runner did not spawn — which for a cell it lost is most of
    // the run. Declaring only what this pass derived leaves the rest missing:
    // one cell's header read half the sum of its own rows. What is inherited is
    // therefore every minute the goals account for that no process does.
    const spawnedMs: number = (state.processes ?? []).reduce(
      (sum: number, process: Record<string, any>) =>
        sum + (process.elapsedMs ?? 0),
      0,
    );
    state.inheritedProcessElapsedMs = Math.max(
      0,
      cumulativeSeconds * 1_000 - spawnedMs,
    );
    // A finished run's cursor sits past its last goal. Left on the last goal,
    // the report treats that stage as current and pours the unattributed wall
    // clock into it. A running one's cursor is its last stage, which the runner
    // would have advanced itself; left where the runner lost it, the report
    // names a stage that finished hours ago as the current one.
    state.nextInstructionIndex =
      state.status === "completed"
        ? state.goals.length
        : Math.max(0, state.goals.length - 1);
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
    const tail: string =
      split < 0 ? `${base}.md` : `${base.slice(0, split)}/${base.slice(split + 1)}.md`;
    const file: string = path.join(instructionRoot, ...tail.split("/"));
    if (!fs.existsSync(file))
      throw new Error(
        `Stage ${name} has no instruction at ${file}, so its record cannot be written from the arm's own text.`,
      );
    return {
      index: -1,
      name,
      relativePath: `${path.basename(instructionRoot)}/${tail}`,
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

  /**
   * The rollout's activity cut into dispatches at its idle gaps.
   *
   * A block opens on the counter as it stood when the block began, not on the
   * block's first reading, because the tokens the first turn spent are the rise
   * from where the previous dispatch left off. Taking the first reading instead
   * loses one turn's cost per stage.
   */
  function split(
    points: readonly [number, Record<string, number>][],
    idle: number,
  ): IBlock[] {
    const blocks: IBlock[] = [];
    let opening: Record<string, number> = {};
    let from: number | undefined;
    let previous: [number, Record<string, number>] | undefined;
    for (const point of points) {
      if (previous !== undefined && point[0] - previous[0] > idle) {
        blocks.push({
          from: from!,
          to: previous[0],
          opening,
          closing: previous[1],
        });
        opening = previous[1];
        from = undefined;
      }
      from ??= point[0];
      previous = point;
    }
    if (previous !== undefined && from !== undefined)
      blocks.push({ from, to: previous[0], opening, closing: previous[1] });
    return blocks;
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
}
