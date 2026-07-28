import fs from "node:fs";
import path from "node:path";

import { EvidenceBenchmarkOperationPlan } from "./EvidenceBenchmarkOperationPlan.ts";
import type { IEvidenceBenchmarkOperation } from "./structures/IEvidenceBenchmarkOperation.ts";

/** Resolves run and block identities to their immutable prepared plans. */
export namespace EvidenceBenchmarkOperationRegistry {
  /** Finds one prepared run below the repository-owned transient work root. */
  export function run(
    repository: string,
    runId: string,
  ): {
    plan: IEvidenceBenchmarkOperation.IPlan;
    cell: IEvidenceBenchmarkOperation.ICell;
  } {
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,191}$/.test(runId))
      throw new Error("Benchmark run id is not a portable path segment.");
    const workRoot: string = path.join(repository, "benchmark", ".work");
    for (const block of directories(workRoot)) {
      const candidate: string = path.join(
        workRoot,
        block,
        "cells",
        runId,
        "operation-plan.json",
      );
      if (!fs.existsSync(candidate)) continue;
      const plan: IEvidenceBenchmarkOperation.IPlan =
        EvidenceBenchmarkOperationPlan.read(candidate);
      const cell: IEvidenceBenchmarkOperation.ICell | undefined =
        plan.cells.find((entry) => entry.runId === runId);
      if (cell === undefined)
        throw new Error(
          `Run-local plan does not contain its directory identity: ${runId}.`,
        );
      return { plan, cell };
    }
    throw new Error(`Unknown benchmark run: ${runId}.`);
  }

  /** Finds the single immutable plan for one prepared block. */
  export function block(
    repository: string,
    blockId: string,
  ): IEvidenceBenchmarkOperation.IPlan {
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,95}$/.test(blockId))
      throw new Error("Benchmark block id is not a portable path segment.");
    const cellsRoot: string = path.join(
      repository,
      "benchmark",
      ".work",
      blockId,
      "cells",
    );
    const plans: string[] = directories(cellsRoot)
      .map((runId) => path.join(cellsRoot, runId, "operation-plan.json"))
      .filter((location) => fs.existsSync(location));
    if (plans.length !== 4)
      throw new Error(
        `Benchmark block ${blockId} must expose four run-local plans, found ${plans.length}.`,
      );
    const resolved: IEvidenceBenchmarkOperation.IPlan[] = plans.map(
      EvidenceBenchmarkOperationPlan.read,
    );
    if (
      new Set(resolved.map((plan) => plan.planSha256)).size !== 1 ||
      resolved.some((plan) => plan.blockId !== blockId)
    )
      throw new Error(
        `Benchmark block ${blockId} contains inconsistent immutable plans.`,
      );
    return resolved[0]!;
  }

  function directories(root: string): string[] {
    if (!fs.existsSync(root)) return [];
    return fs
      .readdirSync(root, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort((left, right) => left.localeCompare(right, "en"));
  }
}
