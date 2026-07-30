import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

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

  assert.equal(backendPackage.scripts.prepare, undefined);
  assert.equal(
    backendPackage.scripts["prepare:database"],
    "prisma db push --schema=prisma/schema",
  );
  assert.equal(
    workspacePackage.scripts["prepare:database"],
    "pnpm --filter {{backendPackageName}} --fail-if-no-match prepare:database",
  );
};

main();
