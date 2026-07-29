import { spawn, spawnSync } from "node:child_process";
import type {
  ChildProcessWithoutNullStreams,
  SpawnSyncReturns,
} from "node:child_process";
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
      throw failure(command, options, result);
    return result;
  }

  /** Runs one short deterministic gate synchronously without a command shell. */
  export function runSync(
    command: string,
    arguments_: readonly string[],
    options: IOptions,
  ): IResult {
    const started: bigint = process.hrtime.bigint();
    const child: SpawnSyncReturns<string> = spawnSync(command, arguments_, {
      cwd: options.cwd,
      env: options.env ?? process.env,
      shell: false,
      windowsHide: true,
      encoding: "utf8",
      stdio: "pipe",
    });
    if (child.error !== undefined) throw child.error;
    const result: IResult = {
      status: child.status,
      stdout: child.stdout ?? "",
      stderr: child.stderr ?? "",
      elapsedMs: Number(process.hrtime.bigint() - started) / 1_000_000,
    };
    if (result.status !== 0 && options.allowFailure !== true)
      throw failure(command, options, result);
    return result;
  }

  /** Runs the benchmark-pinned pnpm through Corepack without a command shell. */
  export function pnpm(
    arguments_: readonly string[],
    options: IOptions,
  ): Promise<IResult> {
    const selector: string = `pnpm@${PNPM_VERSION}`;
    return run(
      process.execPath,
      [corepackEntrypoint(), selector, ...arguments_],
      options,
    );
  }

  /**
   * Prepends a cell-owned pnpm launcher for lifecycle and agent subprocesses.
   *
   * Top-level harness calls bypass a shell through {@link pnpm}; generated
   * package scripts necessarily use the platform shell, so their PATH receives
   * this exact-version launcher instead of a machine-global pnpm.
   */
  export function pinEnvironment(
    environment: NodeJS.ProcessEnv,
    root: string,
  ): void {
    fs.mkdirSync(root, { recursive: true });
    const currentPath: string = environment.PATH ?? process.env.PATH ?? "";
    let launcher: string;
    let content: string;
    if (process.platform === "win32") {
      launcher = path.join(root, "pnpm.cmd");
      content = [
        "@ECHO OFF",
        `"${process.execPath}" "${corepackEntrypoint()}" "pnpm@${PNPM_VERSION}" %*`,
        "",
      ].join("\r\n");
    } else {
      launcher = path.join(root, "pnpm");
      content = [
        "#!/bin/sh",
        `exec ${shellQuote(process.execPath)} ${shellQuote(corepackEntrypoint())} ${shellQuote(`pnpm@${PNPM_VERSION}`)} "$@"`,
        "",
      ].join("\n");
    }
    if (fs.existsSync(launcher)) {
      if (fs.readFileSync(launcher, "utf8") !== content)
        throw new Error(
          `Pinned pnpm launcher content drifted after creation: ${launcher}.`,
        );
    } else
      fs.writeFileSync(launcher, content, {
        encoding: "utf8",
        flag: "wx",
        ...(process.platform === "win32" ? {} : { mode: 0o755 }),
      });
    environment.PATH = [
      root,
      ...currentPath
        .split(path.delimiter)
        .filter((entry) => entry.length !== 0 && entry !== root),
    ].join(path.delimiter);
  }

  function shellQuote(input: string): string {
    return `'${input.replaceAll("'", "'\\''")}'`;
  }

  /** Returns the exact Corepack program dispatched through the active Node.js. */
  export function corepackEntrypoint(): string {
    const executableRoot: string = path.dirname(process.execPath);
    const candidates: readonly string[] = [
      path.join(
        executableRoot,
        "node_modules",
        "corepack",
        "dist",
        "corepack.js",
      ),
      path.resolve(
        executableRoot,
        "..",
        "lib",
        "node_modules",
        "corepack",
        "dist",
        "corepack.js",
      ),
    ];
    for (const candidate of candidates) {
      const stat: fs.Stats | undefined = fs.lstatSync(candidate, {
        throwIfNoEntry: false,
      });
      if (stat?.isFile() && !stat.isSymbolicLink())
        return fs.realpathSync(candidate);
    }
    throw new Error(
      `Pinned pnpm requires an exact Corepack entrypoint from ${process.execPath}: ${candidates.join(", ")}.`,
    );
  }

  function failure(command: string, options: IOptions, result: IResult): Error {
    return new Error(
      [
        `${options.label ?? command} failed with status ${String(result.status)}.`,
        result.stderr.trim(),
        result.stdout.trim(),
      ]
        .filter((part) => part.length !== 0)
        .join("\n"),
    );
  }
}
