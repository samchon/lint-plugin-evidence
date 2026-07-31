import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { sanitizeBenchmarkEnvironment } from "../../../benchmark/src/sanitizeBenchmarkEnvironment.ts";

/**
 * Verifies database preparation remains an explicit benchmark step instead of
 * an install lifecycle.
 */
const main = (): void => {
  const repositoryRoot: string = path.resolve(import.meta.dirname, "../../..");
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

main();
