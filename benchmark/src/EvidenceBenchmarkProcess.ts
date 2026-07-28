import { spawn } from "node:child_process";
import type { ChildProcessWithoutNullStreams } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

/** Runs exact benchmark setup commands while retaining output and wall time. */
export namespace EvidenceBenchmarkProcess {
  /** Exact pnpm release used for packing, setup, and generated projects. */
  export const PNPM_VERSION = "10.10.0";

  /** Captured process outcome used by setup provenance and smoke assertions. */
  export interface IResult {
    /** Process exit status; null means the operating system terminated it. */
    status: number | null;

    /** Captured standard output decoded as UTF-8. */
    stdout: string;

    /** Captured standard error decoded as UTF-8. */
    stderr: string;

    /** Monotonic wall-clock milliseconds from spawn through close. */
    elapsedMs: number;
  }

  /** Options controlling one direct executable invocation. */
  export interface IOptions {
    /** Absolute working directory that owns dependency and config resolution. */
    cwd: string;

    /** Effective child environment, defaulting to the current environment. */
    env?: NodeJS.ProcessEnv;

    /** Human-readable command role included in a thrown failure. */
    label?: string;

    /** Whether a non-zero status is returned instead of throwing. */
    allowFailure?: boolean;
  }

  /**
   * Runs one executable with argument boundaries preserved.
   *
   * The process never crosses a command shell, so JavaScript snippets, paths,
   * and future agent-provided text cannot be re-tokenized by cmd.exe.
   */
  export async function run(
    command: string,
    arguments_: readonly string[],
    options: IOptions,
  ): Promise<IResult> {
    const started: bigint = process.hrtime.bigint();
    const child: ChildProcessWithoutNullStreams = spawn(command, arguments_, {
      cwd: options.cwd,
      env: options.env ?? process.env,
      shell: false,
      windowsHide: true,
      stdio: "pipe",
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
    const status: number | null = await new Promise((resolve, reject) => {
      child.once("error", reject);
      child.once("close", resolve);
    });
    const result: IResult = {
      status,
      stdout: Buffer.concat(stdout).toString("utf8"),
      stderr: Buffer.concat(stderr).toString("utf8"),
      elapsedMs: Number(process.hrtime.bigint() - started) / 1_000_000,
    };
    if (status !== 0 && options.allowFailure !== true)
      throw new Error(
        [
          `${options.label ?? command} failed with status ${String(status)}.`,
          result.stderr.trim(),
          result.stdout.trim(),
        ]
          .filter((part) => part.length !== 0)
          .join("\n"),
      );
    return result;
  }

  /** Runs the benchmark-pinned pnpm through Corepack without a command shell. */
  export function pnpm(
    arguments_: readonly string[],
    options: IOptions,
  ): Promise<IResult> {
    const selector: string = `pnpm@${PNPM_VERSION}`;
    if (process.platform !== "win32")
      return run("corepack", [selector, ...arguments_], options);
    const entrypoint: string = path.join(
      path.dirname(process.execPath),
      "node_modules",
      "corepack",
      "dist",
      "corepack.js",
    );
    if (!fs.existsSync(entrypoint))
      throw new Error(
        `Pinned pnpm requires the Corepack entrypoint beside Node.js: ${entrypoint}.`,
      );
    return run(
      process.execPath,
      [entrypoint, selector, ...arguments_],
      options,
    );
  }
}
