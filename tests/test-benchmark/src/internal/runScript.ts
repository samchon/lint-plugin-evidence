import { spawnSync, type SpawnSyncReturns } from "node:child_process";

import type { IRunResult } from "./IRunResult.ts";
import { pluginCacheDirectory } from "./pluginCacheDirectory.ts";

/**
 * Generous because the FIRST lint of a cache key statically links this plugin's
 * Go into the lint binary, which ttsc itself warns "can take several minutes on
 * a cold Go cache". `tests/test-evidence` allows the same budget.
 */
const DEFAULT_TIMEOUT: number = 1_800_000;

/**
 * Runs one of the workspace's own package scripts and captures what it said.
 *
 * The scripts are the gate. A launched cell never invokes `prisma`, `nestia`,
 * or `ttsc` directly — it runs `pnpm build:prisma`, `pnpm build:sdk`, and `pnpm
 * lint` from a package directory, and the script bodies decide which project,
 * which output path, and which lint configuration each of those reaches.
 * Re-spelling a command here would test a command this repository does not
 * ship.
 *
 * The package manager is invoked through `process.env.npm_execpath` for the
 * same reason `EvidenceBenchmarkWorkspace` does: it is the entry point the
 * launching `pnpm` already resolved, so no shim on PATH has to be assumed.
 */
export const runScript = (props: {
  readonly cwd: string;
  readonly script: string;
  readonly timeout?: number;
  readonly environment?: Readonly<Record<string, string>>;
}): IRunResult => {
  const entrypoint: string | undefined = process.env.npm_execpath;
  if (entrypoint === undefined)
    throw new Error(
      "The benchmark feature suite must be launched through pnpm; EvidenceBenchmarkWorkspace requires the same entry point.",
    );
  const environment: NodeJS.ProcessEnv = { ...process.env };
  // The launching suite's own package identity would otherwise leak into a
  // workspace script and answer for the wrong package.
  for (const name of Object.keys(environment))
    if (
      name.startsWith("npm_package_") ||
      name.startsWith("npm_lifecycle_") ||
      name.toUpperCase() === "EVIDENCE_BENCHMARK_ARCHIVE" ||
      name.toUpperCase() === "INIT_CWD"
    )
      delete environment[name];
  const started: number = Date.now();
  const result: SpawnSyncReturns<string> = spawnSync(
    process.execPath,
    [entrypoint, "run", props.script],
    {
      cwd: props.cwd,
      encoding: "utf8",
      env: {
        ...environment,
        TTSC_CACHE_DIR: pluginCacheDirectory(),
        ...(props.environment ?? {}),
      },
      timeout: props.timeout ?? DEFAULT_TIMEOUT,
      maxBuffer: 64 * 1024 * 1024,
      shell: false,
      windowsHide: true,
    },
  );
  const stdout: string = result.stdout ?? "";
  const stderr: string = result.stderr ?? "";
  return {
    script: props.script,
    cwd: props.cwd,
    status: result.status,
    stdout,
    stderr,
    output: `${stdout}${stderr}`,
    elapsedMs: Date.now() - started,
  };
};
