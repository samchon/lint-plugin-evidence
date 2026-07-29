/** Validates the retained order of accepted benchmark turns. */
export namespace EvidenceBenchmarkTurnLedger {
  /** Canonical measured turn order shared by both benchmark arms. */
  export const NAMES = [
    "skills-contract",
    "backend-start",
    "backend-review",
    "backend-final",
    "frontend-start",
    "frontend-review",
    "frontend-final",
    "overall-review",
    "overall-final",
  ] as const;

  /** One canonical benchmark instruction name. */
  export type Name = (typeof NAMES)[number];

  /** Retained fields needed to admit an accepted turn. */
  export interface ITurn {
    /** Reported instruction name. */
    name?: unknown;

    /** Child-process exit status. */
    status?: unknown;

    /** Exact child-process command and arguments. */
    invocation?: unknown;

    /** Machine-gate acceptance written after the process succeeds. */
    accepted?: unknown;
  }

  /** Requires accepted successes to form a canonical prefix or complete ledger. */
  export function assertAcceptedOrder(
    turns: readonly ITurn[],
    complete: boolean = false,
  ): void {
    const accepted: readonly ITurn[] = turns.filter(
      (turn) => turn.accepted === true,
    );
    if (
      accepted.some(
        (turn) =>
          turn.status !== 0 ||
          !Array.isArray(turn.invocation) ||
          turn.invocation.some((value) => typeof value !== "string"),
      )
    )
      throw new Error(
        "Accepted benchmark turns must retain successful invocations.",
      );
    const actual: readonly unknown[] = accepted.map((turn) => turn.name);
    const expected: readonly Name[] = NAMES.slice(0, accepted.length);
    if (
      accepted.length > NAMES.length ||
      JSON.stringify(actual) !== JSON.stringify(expected) ||
      (complete && accepted.length !== NAMES.length)
    )
      throw new Error(
        "Accepted benchmark turns do not form the canonical instruction prefix.",
      );
  }
}
