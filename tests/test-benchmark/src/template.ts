import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { sanitizeBenchmarkEnvironment } from "../../../benchmark/src/sanitizeBenchmarkEnvironment.ts";

/**
 * Verifies neutral template gates and the complete Plain input byte boundary.
 *
 * Plain receives base, Plain overlay, Plain instructions, and opaque
 * requirements. None may expose Evidence treatment markers, because the runner
 * cannot remove a byte after workspace materialization.
 *
 * 1. Inspect every file that can be copied or prompted into a Plain cell.
 * 2. Reject Evidence-only tags, package names, graph terms, paths, and config.
 * 3. Verify database preparation remains an explicit non-install step.
 */
const main = (): void => {
  const repositoryRoot: string = path.resolve(import.meta.dirname, "../../..");
  const plainInputs: string[] = [
    path.join(repositoryRoot, "benchmark", "instructions", "plain"),
    path.join(repositoryRoot, "benchmark", "requirements"),
    path.join(repositoryRoot, "benchmark", "template", "base"),
    path.join(repositoryRoot, "benchmark", "template", "plain"),
  ];
  const forbiddenPlainInput =
    /@todo\b|@evidence(?:Exclude)?\b|@samchon\/lint-plugin-evidence|evidence[- ]graph|\.agents\/skills\/evidence|instructions\/evidence|lint-plugin-evidence/iu;
  for (const root of plainInputs)
    visitFiles(root, (file) => {
      const relative: string = path
        .relative(repositoryRoot, file)
        .replaceAll(path.sep, "/");
      const source: string = fs.readFileSync(file, "utf8");
      assert.doesNotMatch(
        `${relative}\n${source}`,
        forbiddenPlainInput,
        `Plain input contains Evidence treatment bytes: ${relative}`,
      );
    });
  const backendPackage = JSON.parse(
    fs.readFileSync(
      path.join(
        repositoryRoot,
        "benchmark",
        "template",
        "base",
        "packages",
        "backend",
        "package.json",
      ),
      "utf8",
    ),
  ) as { scripts: Record<string, string> };
  const workspacePackage = JSON.parse(
    fs.readFileSync(
      path.join(
        repositoryRoot,
        "benchmark",
        "template",
        "base",
        "package.json",
      ),
      "utf8",
    ),
  ) as { scripts: Record<string, string> };
  const compilerConfig = JSON.parse(
    fs.readFileSync(
      path.join(
        repositoryRoot,
        "benchmark",
        "template",
        "base",
        "config",
        "tsconfig.json",
      ),
      "utf8",
    ),
  ) as { compilerOptions: Record<string, unknown> };

  assert.equal(backendPackage.scripts.prepare, undefined);
  assert.equal(
    backendPackage.scripts["prepare:database"],
    "prisma db push --schema=prisma/schema",
  );
  assert.equal(
    workspacePackage.scripts["prepare:database"],
    "pnpm --filter {{backendPackageName}} --fail-if-no-match prepare:database",
  );
  assert.equal(compilerConfig.compilerOptions.noErrorTruncation, true);

  assert.deepEqual(
    sanitizeBenchmarkEnvironment({
      Evidence_Benchmark_Archive: "artifact.tgz",
      KEEP_ME: "yes",
      Node_Options: '--trace-warnings --require "runtimeHookPreload.js"',
      TtsX_Runtime_Manifest: "runtime-manifest.json",
      TtSc_Tsgo_Binary: "tsgo",
    }),
    { KEEP_ME: "yes" },
  );
};

const visitFiles = (root: string, closure: (file: string) => void): void => {
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const location: string = path.join(root, entry.name);
    if (entry.isDirectory()) visitFiles(location, closure);
    else if (entry.isFile()) closure(location);
  }
};

main();
