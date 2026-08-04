import fs from "node:fs";
import path from "node:path";

import { acquireBenchmarkWorkspace } from "../internal/benchmarkWorkspace.ts";
import { assertStatus } from "../internal/assertStatus.ts";
import type { IBenchmarkWorkspace } from "../internal/IBenchmarkWorkspace.ts";
import type { IRunResult } from "../internal/IRunResult.ts";
import { provisionEnvironment } from "../internal/provisionEnvironment.ts";
import { runScript } from "../internal/runScript.ts";

/**
 * Verifies the Plain arm builds, lints, and tests clean with no evidence
 * machinery anywhere in the delivered workspace.
 *
 * Plain is the control, and a control that does not start is not a measurement
 * — a cell that spends its first hour repairing the scaffold is measuring the
 * scaffold. The arm is also the place a leak would hide: the treatment variable
 * is the graph and nothing else, so a plugin dependency, an `evidence/` rule,
 * or a stray `@evidence` tag reaching Plain would invalidate every comparison
 * drawn from the campaign while both arms still went green. Both halves are
 * asserted here because either alone is satisfiable by the wrong workspace.
 *
 * 1. Materialize the Plain arm through the runner's own preparation path.
 * 2. Assert nothing in the delivered tree names the plugin or its tag.
 * 3. Run the layer gates a cell runs, from the packages that own them.
 * 4. Assert every one exits zero and none reports an `evidence/` rule.
 */
export const test_benchmark_plain_workspace_builds_without_evidence =
  async (): Promise<void> => {
    const workspace: IBenchmarkWorkspace =
      await acquireBenchmarkWorkspace("plain");
    assertNoEvidenceMachinery(workspace.workspace);

    provisionEnvironment(workspace.workspace);
    const backend: string = path.join(
      workspace.workspace,
      "packages",
      "backend",
    );
    // `schema` is not a layer gate; it is the disposable SQLite reset the
    // template prescribes before anything runs against a live server, and
    // `test` opens one.
    const gates: readonly string[] = [
      "build:prisma",
      "schema",
      "build:main",
      "build:sdk",
      "build:test",
      "lint",
      "test",
    ];
    for (const script of gates) {
      const result: IRunResult = runScript({ cwd: backend, script });
      assertStatus(
        result,
        0,
        `The Plain backend must pass \`pnpm ${script}\` on the delivered workspace. A cell that has written nothing yet cannot be asked to repair the scaffold before it starts.`,
      );
      assertNoEvidenceRule(result);
    }

    for (const owner of ["api", "frontend"]) {
      const result: IRunResult = runScript({
        cwd: path.join(workspace.workspace, "packages", owner),
        script: "lint",
      });
      assertStatus(
        result,
        0,
        `The Plain \`packages/${owner}\` package must lint clean on the delivered workspace.`,
      );
      assertNoEvidenceRule(result);
    }
  };

/**
 * Fails when the delivered Plain tree names the plugin or its tag at all.
 *
 * The scan reads the workspace rather than a list of files kept here, so an
 * overlay file that starts leaking into Plain is caught wherever it lands.
 * `node_modules` is skipped because it is the install, not the delivery, and
 * `.git` because the baseline commit stores the same bytes twice.
 */
const assertNoEvidenceMachinery = (workspace: string): void => {
  const deps: string = path.join(workspace, ".benchmark-deps");
  if (fs.existsSync(deps))
    throw new Error(
      `The Plain arm received a package archive at ${deps}. Plain never reads or installs the Evidence artifact.`,
    );
  const leaks: string[] = [];
  for (const file of walk(workspace)) {
    // Read as bytes: the delivered tree gains generated and database files
    // once the gates run, and decoding one of those as text would fail on
    // content that has nothing to do with the property under test.
    const source: Buffer = fs.readFileSync(file);
    for (const marker of ["@samchon/lint-plugin-evidence", "@evidence"])
      if (source.includes(marker))
        leaks.push(`${path.relative(workspace, file)} names ${marker}`);
  }
  if (leaks.length !== 0)
    throw new Error(
      `The Plain arm must differ from Evidence in the graph and nothing else, but the delivered workspace carries evidence material:\n${leaks.join("\n")}`,
    );
};

/**
 * Fails when a Plain gate reported anything only the Evidence arm configures.
 *
 * The markers name the plugin and its rule rather than a bare `evidence/`
 * prefix, which the workspace's own temporary path can contain by coincidence.
 * A control arm that fails for a coincidence is as useless as one that passes
 * for a leak.
 */
const assertNoEvidenceRule = (result: IRunResult): void => {
  for (const marker of ["evidence/graph", "@samchon/lint-plugin-evidence"])
    if (result.output.includes(marker))
      throw new Error(
        `A Plain gate named \`${marker}\`, so the treatment leaked into the control arm.\n\nCommand: pnpm run ${result.script}\nDirectory: ${result.cwd}\n\nActual output:\n${result.output}`,
      );
};

const walk = (directory: string): string[] => {
  const found: string[] = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === ".git") continue;
    const location: string = path.join(directory, entry.name);
    if (entry.isDirectory()) found.push(...walk(location));
    else if (entry.isFile()) found.push(location);
  }
  return found;
};
