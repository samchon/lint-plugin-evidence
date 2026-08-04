import path from "node:path";

import {
  readActivationGates,
  readClaimNames,
  readClaimsReferencingAPackage,
  removeActivationGate,
  type IActivationGate,
} from "../internal/activationGates.ts";
import { acquireBenchmarkWorkspace } from "../internal/benchmarkWorkspace.ts";
import { assertClaimActivated } from "../internal/assertClaimActivated.ts";
import { claimUnlockOrder } from "../internal/claimUnlockOrder.ts";
import type { IMissingAcknowledgement } from "../internal/evidenceDiagnostics.ts";
import type { IBenchmarkWorkspace } from "../internal/IBenchmarkWorkspace.ts";
import { runScript } from "../internal/runScript.ts";
import { sdkAccessorAddresses } from "../internal/sdkAccessorAddresses.ts";
import { materializeClaimLayer } from "../internal/workspaceLayer.ts";

/**
 * Verifies every staged frontend claim activates in its instructed order, and
 * that the hook obligation enumerates the SDK through the workspace link.
 *
 * The three frontend claims form a chain — a hook answers for the operations it
 * calls, a screen for the hooks it uses, a journey for the screens it walks —
 * so each one references a population the previous layer produces and only the
 * instructed order can observe any of them. The first link is also the one that
 * broke a cohort: it selects the accessor surface out of an installed
 * `package`, and a workspace dependency is a link that pnpm writes as a
 * junction on Windows. A walker that treats that link as a plain entry returns
 * nothing, and a reference that selects nothing reports full coverage of a
 * frontend that calls no API at all.
 *
 * Nothing this case writes carries a citation, so every claim it opens has
 * something to owe. Silence from an enabled claim is the failure.
 *
 * 1. Read the staged claims from the frontend configuration.
 * 2. Order them by the instruction the measured agent receives.
 * 3. For each, write its host layer, delete its marker, and lint the package.
 * 4. Assert the claim reported obligations, and that the hook claim demanded
 *    exactly the accessors the SDK publishes.
 */
export const test_benchmark_evidence_frontend_gates_activate_each_claim =
  async (): Promise<void> => {
    const workspace: IBenchmarkWorkspace =
      await acquireBenchmarkWorkspace("evidence");
    const frontend: string = path.join(
      workspace.workspace,
      "packages",
      "frontend",
    );
    const configuration: string = path.join(frontend, "lint.config.ts");

    const declared: string[] = readClaimNames(configuration);
    const gates: IActivationGate[] = readActivationGates(configuration);
    // A configuration this suite can no longer read yields nothing, and a walk
    // over nothing passes while proving nothing. Refuse it before the counts
    // agree with each other at zero.
    if (declared.length === 0)
      throw new Error(
        `${configuration} yielded no claim name. Either it declares none, or its shape changed and this suite is no longer reading it.`,
      );
    if (gates.length !== declared.length)
      throw new Error(
        `${configuration} declares ${String(declared.length)} claim(s) but stages ${String(gates.length)}. Every claim ships disabled so a cell unlocks it when its layer is complete.`,
      );
    for (const gate of gates)
      if (!(gate.comment[0] ?? "").startsWith("// Remove after"))
        throw new Error(
          `Claim '${gate.claim}' in ${configuration} stages its marker without a comment naming the layer that unlocks it.`,
        );

    const throughTheInstall: string[] =
      readClaimsReferencingAPackage(configuration);
    if (throughTheInstall.length === 0)
      throw new Error(
        `${configuration} declares no \`package\` reference. The frontend hook obligation reaches the generated SDK through the install, and that is the reference a workspace link can empty out; if it is gone, this case no longer covers the failure it exists for.`,
      );

    const order: string[] = claimUnlockOrder(
      "benchmark/instructions/evidence/frontend/start.md",
      gates.map((gate) => gate.claim),
    );
    for (const claim of order) {
      materializeClaimLayer({ workspace: workspace.workspace, claim });
      removeActivationGate(configuration, claim);
      const obligations: IMissingAcknowledgement[] = assertClaimActivated({
        result: runScript({ cwd: frontend, script: "lint" }),
        claim,
      });
      if (throughTheInstall.includes(claim))
        assertOperationSurface(workspace, claim, obligations);
    }
  };

/**
 * Asserts a claim referencing the installed SDK demanded its whole surface.
 *
 * Every published accessor must be owed. Presence of _some_ accessor would not
 * do: a reference that resolved the link partially demands less than the
 * generator published, and the operations it drops are exactly the ones no hook
 * will ever be required to call. An empty demand is the state that reports full
 * coverage of a frontend that reaches no API at all, so it fails here rather
 * than passing quietly.
 */
const assertOperationSurface = (
  workspace: IBenchmarkWorkspace,
  claim: string,
  obligations: readonly IMissingAcknowledgement[],
): void => {
  const published: string[] = sdkAccessorAddresses(
    path.join(workspace.workspace, "packages", "api", "src", "functional"),
  );
  const demanded = new Set<string>(
    obligations.map((obligation) => obligation.target),
  );
  const missing: string[] = published.filter(
    (address) => !demanded.has(address),
  );
  if (missing.length === 0) return;
  throw new Error(
    `Claim '${claim}' reaches the generated SDK through the installed package, but nothing was owed for ${missing.join(", ")} of the ${String(published.length)} published accessor(s).\n\nPublished by the SDK:\n  ${published.join("\n  ")}\n\nDemanded by this claim:\n  ${[...demanded].join("\n  ") || "(nothing)"}\n\nA package reference that enumerates a workspace link as a plain entry returns an empty population, and an empty population reports full coverage while checking nothing.`,
  );
};
