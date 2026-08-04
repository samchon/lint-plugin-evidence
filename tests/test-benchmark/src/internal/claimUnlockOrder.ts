import fs from "node:fs";
import path from "node:path";

import { repositoryRoot } from "./suiteRoot.ts";

/**
 * Orders claims the way the Evidence arm's own instruction tells a cell to
 * unlock them.
 *
 * The order is a real property of the graph rather than a presentation detail:
 * a claim references the population an earlier layer produces, so enabling one
 * before its evidence exists selects nothing and proves nothing. Reading the
 * order from the instruction the measured agent receives is what keeps this
 * suite walking the same path a cell walks — and what makes a claim the
 * instruction forgot to mention a failure here rather than a silent gap in the
 * campaign.
 *
 * @param instruction Repository-relative instruction document to read.
 * @param claims Claim names discovered in the configuration under test.
 * @returns The same names, ordered by first mention in the instruction.
 */
export const claimUnlockOrder = (
  instruction: string,
  claims: readonly string[],
): string[] => {
  const location: string = path.resolve(repositoryRoot, instruction);
  const source: string = fs.readFileSync(location, "utf8");
  const positions = new Map<string, number>();
  for (const claim of claims) {
    const at: number = source.indexOf(`\`${claim}\``);
    if (at === -1)
      throw new Error(
        `${instruction} never names claim '${claim}', so no cell is told when to unlock it.`,
      );
    positions.set(claim, at);
  }
  return [...claims].sort(
    (left, right) => (positions.get(left) ?? 0) - (positions.get(right) ?? 0),
  );
};
