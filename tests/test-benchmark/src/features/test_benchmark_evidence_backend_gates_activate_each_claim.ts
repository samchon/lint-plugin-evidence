import path from "node:path";

import {
  readActivationGates,
  readClaimNames,
  removeActivationGate,
  type IActivationGate,
} from "../internal/activationGates.ts";
import { acquireBenchmarkWorkspace } from "../internal/benchmarkWorkspace.ts";
import { assertClaimActivated } from "../internal/assertClaimActivated.ts";
import { claimUnlockOrder } from "../internal/claimUnlockOrder.ts";
import type { IMissingAcknowledgement } from "../internal/evidenceDiagnostics.ts";
import type { IBenchmarkWorkspace } from "../internal/IBenchmarkWorkspace.ts";
import { provisionEnvironment } from "../internal/provisionEnvironment.ts";
import { requirementDocumentsDeclaringSections } from "../internal/requirementDocuments.ts";
import { runScript } from "../internal/runScript.ts";
import { materializeClaimLayer } from "../internal/workspaceLayer.ts";

/**
 * Verifies every staged backend claim really activates when its marker is
 * removed, one layer at a time.
 *
 * Deleting `disabled` is the Evidence arm's one prescribed edit to a frozen
 * configuration, and it is the moment the treatment either starts working or
 * silently stops existing. A claim that goes quiet when enabled looks exactly
 * like a claim that is satisfied: both exit zero. That is how a `package`
 * reference walking a pnpm junction as a plain entry voided a cohort — every
 * population came back empty, and an empty population demands nothing. So each
 * step asserts the claim demanded something, against a workspace whose freshly
 * written layer carries no citation at all.
 *
 * The order is read from the instruction the measured agent receives rather
 * than fixed here, because the order is a real property of the graph: a claim
 * enabled before the layer it references exists selects nothing.
 *
 * 1. Build the workspace far enough that every claim's population can exist.
 * 2. Assert every declared claim ships staged, with a comment naming its layer.
 * 3. For each claim in the instructed order, write its host layer, delete its
 *    marker, and run the gate that compiles the Program owning its hosts.
 * 4. Assert the claim reported obligations, and that its requirement reference
 *    reached every delivered document that declares a section.
 */
export const test_benchmark_evidence_backend_gates_activate_each_claim =
  async (): Promise<void> => {
    const workspace: IBenchmarkWorkspace =
      await acquireBenchmarkWorkspace("evidence");
    provisionEnvironment(workspace.workspace);
    const backend: string = path.join(
      workspace.workspace,
      "packages",
      "backend",
    );

    // The generated Prisma client and the generated SDK are what the package
    // and test Programs compile against; without them a gate fails on a missing
    // module rather than on an evidence obligation.
    for (const script of ["build:prisma", "build:sdk"])
      requireZero(backend, script);

    const gates: IActivationGate[] = readStagedClaims([
      path.join(backend, "lint.config.ts"),
      path.join(backend, "test", "lint.config.ts"),
    ]);
    const order: string[] = claimUnlockOrder(
      "benchmark/instructions/evidence/backend/start.md",
      gates.map((gate) => gate.claim),
    );
    for (const claim of order) {
      const gate: IActivationGate = locate(gates, claim);
      materializeClaimLayer({ workspace: workspace.workspace, claim });
      removeActivationGate(gate.file, claim);

      // A claim populates only from the Program that owns its hosts, so the
      // gate that proves it is the one compiling that Program: the package's
      // own lint for the package configuration, the test Program build for the
      // configuration that extends it.
      const script: string = gate.file.includes(`${path.sep}test${path.sep}`)
        ? "build:test"
        : "lint";
      // Mirrors the workspace-root `lint` script, which regenerates the Prisma
      // client before linting so a schema edit cannot leave the Program stale.
      requireZero(backend, "build:prisma");
      const obligations: IMissingAcknowledgement[] = assertClaimActivated({
        result: runScript({ cwd: backend, script }),
        claim,
      });
      assertRequirementsReached(workspace.workspace, claim, obligations);
    }
  };

/**
 * Reads every claim's activation marker and holds the staging contract.
 *
 * Both halves matter. A claim that ships enabled floods a cell's context with
 * errors for tags the instruction told it not to write yet, and a marker with
 * no comment leaves the unlock condition knowable only from a document the
 * configuration never points at.
 */
const readStagedClaims = (configurations: readonly string[]) => {
  const gates: IActivationGate[] = [];
  for (const file of configurations) {
    const declared: string[] = readClaimNames(file);
    const staged: IActivationGate[] = readActivationGates(file);
    if (staged.length !== declared.length)
      throw new Error(
        `${file} declares ${String(declared.length)} claim(s) but stages ${String(staged.length)}. Every claim ships disabled so a cell unlocks it when its layer is complete.`,
      );
    for (const gate of staged)
      if (!(gate.comment[0] ?? "").startsWith("// Remove after"))
        throw new Error(
          `Claim '${gate.claim}' in ${file} stages its marker without a comment naming the layer that unlocks it. The instruction tells a cell when to delete it; the configuration has to agree.`,
        );
    gates.push(...staged);
  }
  return gates;
};

/**
 * Fails when a requirement reference reached only part of the delivered
 * documents.
 *
 * The Markdown references reach out of the package into `docs/analysis/`, which
 * the runner copies byte-for-byte from the frozen requirements. A reference
 * that selects some documents and not others narrows the obligation without
 * saying so — the same silent shrinkage as an empty population, one document at
 * a time — and a reference that named a document the workspace does not carry
 * resolved against something other than the delivered requirements.
 */
const assertRequirementsReached = (
  workspace: string,
  claim: string,
  obligations: readonly IMissingAcknowledgement[],
): void => {
  const reached = new Set<string>();
  for (const obligation of obligations) {
    const separator: number = obligation.target.indexOf("#");
    const file: string =
      separator === -1
        ? obligation.target
        : obligation.target.slice(0, separator);
    if (file.endsWith(".md")) reached.add(file);
  }
  // A claim whose references are all Prisma or TypeScript owes no document at
  // all; only a claim that reached one is held to reaching them all.
  if (reached.size === 0) return;
  const expected: string[] = requirementDocumentsDeclaringSections(workspace);
  const missing: string[] = expected.filter(
    (document) => !reached.has(document),
  );
  if (missing.length !== 0)
    throw new Error(
      `Claim '${claim}' demanded evidence from ${String(reached.size)} of the ${String(expected.length)} delivered requirement documents; nothing was owed for ${missing.join(", ")}.`,
    );
  for (const document of reached)
    if (!expected.includes(document))
      throw new Error(
        `Claim '${claim}' demanded evidence from '${document}', which is not a delivered requirement document. The reference resolved against something other than \`docs/analysis/\`.`,
      );
};

const locate = (
  gates: readonly IActivationGate[],
  claim: string,
): IActivationGate => {
  const found: IActivationGate | undefined = gates.find(
    (gate) => gate.claim === claim,
  );
  if (found === undefined)
    throw new Error(`No activation marker was read for claim '${claim}'.`);
  return found;
};

const requireZero = (cwd: string, script: string): void => {
  const result = runScript({ cwd, script });
  if (result.status === 0) return;
  throw new Error(
    `\`pnpm ${script}\` must pass before any claim can be walked; the activation of every later claim is unobservable until it does.\n\nDirectory: ${cwd}\nExit status: ${String(result.status)}\n\nActual output:\n${result.output}`,
  );
};
