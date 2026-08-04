import fs from "node:fs";
import path from "node:path";

import {
  readActivationGates,
  readClaimNames,
  removeActivationGate,
  type IActivationGate,
} from "../internal/activationGates.ts";
import { acquireBenchmarkWorkspace } from "../internal/benchmarkWorkspace.ts";
import {
  readMissingAcknowledgements,
  type IMissingAcknowledgement,
} from "../internal/evidenceDiagnostics.ts";
import type { IBenchmarkWorkspace } from "../internal/IBenchmarkWorkspace.ts";
import type { IRunResult } from "../internal/IRunResult.ts";
import { provisionEnvironment } from "../internal/provisionEnvironment.ts";
import { runScript } from "../internal/runScript.ts";
import { sdkAccessorAddresses } from "../internal/sdkAccessorAddresses.ts";
import { materializeClaimLayer } from "../internal/workspaceLayer.ts";

/**
 * Verifies the backend test Program inherits the package claims and that its
 * own operation claim enumerates the SDK through the workspace link.
 *
 * The backend compiles as two Programs, and a claim populates only from the
 * Program that owns its hosts. `packages/backend/lint.config.ts` therefore
 * exports its graph with absolute roots and `test/lint.config.ts` spreads those
 * claims and adds `backend-tests`; if the spread carried nothing, or the
 * absolute roots stopped selecting in the nested Program, the package
 * obligations would vanish from the test build without a single diagnostic
 * changing.
 *
 * The operation reference is the sharper edge. It selects the generated
 * accessor surface out of an installed `package`, and a workspace dependency is
 * a link — pnpm writes a junction on Windows. Enumerating that link with a
 * walker that treats it as a plain entry returns nothing, and a reference that
 * selects nothing reports full coverage of work no one did. The scaffold test
 * already cites the one published operation, so this case takes that citation
 * away: the accessor then has to be demanded by name, which an empty population
 * can never do.
 *
 * 1. Build the workspace, then open every backend claim at once.
 * 2. Remove the scaffold's citations so nothing is acknowledged.
 * 3. Run both Programs' gates and read the obligations each reported.
 * 4. Assert the package claims hold in both, that `backend-tests` holds only where
 *    its hosts live, and that its operation obligations are exactly the
 *    accessors the generator published.
 */
export const test_benchmark_evidence_test_program_carries_the_package_claims =
  async (): Promise<void> => {
    const workspace: IBenchmarkWorkspace =
      await acquireBenchmarkWorkspace("evidence");
    provisionEnvironment(workspace.workspace);
    const backend: string = path.join(
      workspace.workspace,
      "packages",
      "backend",
    );
    for (const script of ["build:prisma", "build:sdk"])
      requireZero(backend, script);

    const packageConfig: string = path.join(backend, "lint.config.ts");
    const testConfig: string = path.join(backend, "test", "lint.config.ts");
    const packageClaims: string[] = readClaimNames(packageConfig);
    const testClaims: string[] = readClaimNames(testConfig);
    for (const file of [packageConfig, testConfig])
      for (const gate of readActivationGates(file) as IActivationGate[]) {
        materializeClaimLayer({
          workspace: workspace.workspace,
          claim: gate.claim,
        });
        removeActivationGate(file, gate.claim);
      }
    stripCitations(path.join(backend, "test", "features"));
    requireZero(backend, "build:prisma");

    const packageProgram: IRunResult = runScript({
      cwd: backend,
      script: "lint",
    });
    const testProgram: IRunResult = runScript({
      cwd: backend,
      script: "build:test",
    });

    // The spread is the claim under test. An absolute root is what lets one
    // declaration select the same population from two Programs, so a package
    // claim that reports in one and not the other means the nested Program
    // silently stopped owing it.
    for (const claim of packageClaims)
      for (const [program, result] of [
        ["package", packageProgram],
        ["test", testProgram],
      ] as const)
        if (obligationsFor(result, claim).length === 0)
          throw new Error(
            `Claim '${claim}' reported no obligation in the ${program} Program. The package configuration exports its graph with absolute roots and the test configuration spreads it, so this claim must owe the same units in both.\n\nCommand: pnpm run ${result.script}\n\nActual output:\n${result.output}`,
          );

    // The negative twin. `backend-tests` hosts on the e2e suite, which the
    // package Program does not compile, so a claim reporting there would mean
    // the graph is not bounded by the Program that owns its hosts.
    for (const claim of testClaims) {
      if (obligationsFor(testProgram, claim).length === 0)
        throw new Error(
          `Claim '${claim}' reported no obligation in the test Program, which is the only Program its hosts live in.\n\nActual output:\n${testProgram.output}`,
        );
      if (obligationsFor(packageProgram, claim).length !== 0)
        throw new Error(
          `Claim '${claim}' reported an obligation in the package Program, whose sources do not include its hosts.\n\nActual output:\n${packageProgram.output}`,
        );
    }

    assertOperationSurfaceEnumerated(workspace, testProgram, testClaims);
  };

/**
 * Asserts the operation obligations are exactly the accessors the SDK
 * published.
 *
 * Equality rather than presence: a reference that selected the whole package
 * instead of its accessor globs would demand more than the generator published,
 * and one that resolved the link partially would demand less. Both are ways for
 * the obligation to stop describing the published contract, and only the exact
 * set catches both.
 */
const assertOperationSurfaceEnumerated = (
  workspace: IBenchmarkWorkspace,
  testProgram: IRunResult,
  testClaims: readonly string[],
): void => {
  const published: string[] = sdkAccessorAddresses(
    path.join(workspace.workspace, "packages", "api", "src", "functional"),
  );
  const demanded: string[] = [];
  for (const claim of testClaims)
    for (const obligation of obligationsFor(testProgram, claim))
      // Every other reference on these claims resolves a Markdown document,
      // and a Markdown target always carries its path.
      if (!obligation.target.includes(".md")) demanded.push(obligation.target);
  const unique: string[] = [...new Set(demanded)].sort((left, right) =>
    left.localeCompare(right),
  );
  if (unique.join("\n") === published.join("\n")) return;
  throw new Error(
    `The operation reference must enumerate the generated accessor surface through the workspace link, but the obligations do not match what the generator published.\n\nPublished by the SDK:\n  ${published.join("\n  ") || "(none)"}\n\nDemanded by the graph:\n  ${unique.join("\n  ") || "(none)"}\n\nAn empty or partial demand here is the state that reports full coverage while checking nothing.\n\nActual output:\n${testProgram.output}`,
  );
};

/**
 * Removes every `@evidence` citation the scaffold ships under a directory.
 *
 * The template's e2e test already cites the one published operation, which is
 * correct for a delivered workspace and useless for observing the population: a
 * satisfied obligation and an obligation that does not exist both report
 * nothing. Taking the citation away puts the workspace in the state every
 * measured cell starts from — evidence owed, nothing acknowledged.
 */
const stripCitations = (directory: string): void => {
  for (const file of walk(directory)) {
    const source: string = fs.readFileSync(file, "utf8");
    const stripped: string = source
      .split("\n")
      .filter((line) => !/^\s*\*\s*@evidence(Exclude)?\s/.test(line))
      .join("\n");
    if (stripped !== source) fs.writeFileSync(file, stripped, "utf8");
  }
};

const obligationsFor = (
  result: IRunResult,
  claim: string,
): IMissingAcknowledgement[] =>
  readMissingAcknowledgements(result).filter(
    (obligation) => obligation.claim === claim,
  );

const walk = (directory: string): string[] => {
  const found: string[] = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const location: string = path.join(directory, entry.name);
    if (entry.isDirectory()) found.push(...walk(location));
    else if (entry.isFile() && entry.name.endsWith(".ts")) found.push(location);
  }
  return found;
};

const requireZero = (cwd: string, script: string): void => {
  const result = runScript({ cwd, script });
  if (result.status === 0) return;
  throw new Error(
    `\`pnpm ${script}\` must pass before either Program can be compared; the obligations of both are unobservable until it does.\n\nDirectory: ${cwd}\nExit status: ${String(result.status)}\n\nActual output:\n${result.output}`,
  );
};
