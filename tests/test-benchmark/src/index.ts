import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

// Minimal runner. Discovers `test_*` exports under `features/`, runs each, and
// exits non-zero if any threw.
//
// Same shape as the `test-evidence` runner, and for the same reason: these
// cases drive real processes and filesystems, so a runner only needs to import
// modules, call functions, and count failures. Discovery is what keeps the case
// list out of `package.json`, and running every case keeps one failure from
// hiding the ones behind it.
const directory: string = __dirname;

const collect = (root: string): string[] => {
  const found: string[] = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const location: string = path.join(root, entry.name);
    if (entry.isDirectory()) found.push(...collect(location));
    else if (entry.name.startsWith("test_") && entry.name.endsWith(".ts"))
      found.push(location);
  }
  return found;
};

const main = async (): Promise<void> => {
  const only: string | undefined = process.argv
    .find((argument) => argument.startsWith("--include="))
    ?.slice("--include=".length);

  const files: string[] = collect(path.join(directory, "features"))
    .filter((file) => only === undefined || file.includes(only))
    .sort((left, right) => left.localeCompare(right));

  const failures: Error[] = [];
  for (const file of files) {
    const module: Record<string, unknown> = await import(pathToFileURL(file).href);
    const tests: [string, () => unknown | Promise<unknown>][] = Object.entries(
      module,
    ).filter(
      (entry): entry is [string, () => unknown | Promise<unknown>] =>
        entry[0].startsWith("test_") && typeof entry[1] === "function",
    );
    const expected: string = path.basename(file, ".ts");
    if (tests.length !== 1 || tests[0]?.[0] !== expected) {
      failures.push(
        new Error(
          `${path.relative(directory, file)} must export exactly one test function named ${expected}; found ${tests.map(([name]) => name).join(", ") || "none"}.`,
        ),
      );
      continue;
    }

    const [[name, test]] = tests;
    const started: number = Date.now();
    try {
      await test();
      console.log(`  - ${name}: ${Date.now() - started} ms`);
    } catch (error) {
      console.log(`  - ${name}: FAILED`);
      failures.push(error as Error);
    }
  }

  if (failures.length === 0) {
    console.log(`\nSuccess — ${files.length} feature(s).`);
    return;
  }
  for (const failure of failures) console.error(failure);
  console.error(`\nFailed — ${failures.length} case(s).`);
  process.exit(-1);
};

main().catch((error: unknown) => {
  console.error(error);
  process.exit(-1);
});
