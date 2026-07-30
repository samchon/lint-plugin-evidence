import cp from "node:child_process";
import fs from "node:fs";
import { finished } from "node:stream/promises";

/** Runs one measured coding-agent process without interpreting engine output. */
export namespace EvidenceBenchmarkAgentProcess {
  const STDIO_DRAIN_GRACE_MS = 1_000;

  /** Exact direct-child outcome and measured spawn-to-exit duration. */
  export interface IResult {
    /** Native exit code, or null when a signal terminated the process. */
    exitCode: number | null;

    /** Native terminating signal, or null after an ordinary process exit. */
    signal: NodeJS.Signals | null;

    /** Direct-child duration from the spawn event through the exit event. */
    elapsedMs: number;

    /** Operating-system identity assigned to the spawned direct child. */
    pid: number;
  }

  /** Runs one direct child while retaining its exact stdout and stderr bytes. */
  export async function run(props: {
    command: string;
    arguments: readonly string[];
    cwd: string;
    environment: NodeJS.ProcessEnv;
    stdin: string;
    stdout: string;
    stderr: string;
    onSpawn?: (pid: number) => void;
  }): Promise<IResult> {
    const stdout = fs.createWriteStream(props.stdout, { flags: "wx" });
    const stderr = fs.createWriteStream(props.stderr, { flags: "wx" });
    const stdoutFinished: Promise<void> = finished(stdout);
    const stderrFinished: Promise<void> = finished(stderr);
    let child: cp.ChildProcessWithoutNullStreams | undefined;
    try {
      child = cp.spawn(props.command, [...props.arguments], {
        cwd: props.cwd,
        env: props.environment,
        shell: false,
        windowsHide: true,
        stdio: "pipe",
      });
      const closePromise: Promise<void> = new Promise((resolve) =>
        child!.once("close", () => resolve()),
      );
      const outcome: Promise<IResult> = new Promise((resolve, reject) => {
        let settled: boolean = false;
        let started: bigint | undefined;
        let pid: number | undefined;
        const fail = (error: unknown): void => {
          if (settled) return;
          settled = true;
          reject(error);
        };
        child!.once("spawn", () => {
          started = process.hrtime.bigint();
          pid = child!.pid;
          if (pid === undefined) {
            fail(
              new Error("Benchmark engine process has no process identity."),
            );
            return;
          }
          try {
            props.onSpawn?.(pid);
          } catch (error) {
            fail(error);
          }
        });
        child!.once("error", fail);
        child!.stdout.once("error", fail);
        child!.stderr.once("error", fail);
        stdout.once("error", fail);
        stderr.once("error", fail);
        child!.stdin.once("error", (error: NodeJS.ErrnoException) => {
          if (error.code !== "EPIPE" && error.code !== "EOF") fail(error);
        });
        child!.once("exit", (exitCode, signal) => {
          if (settled) return;
          if (started === undefined || pid === undefined) {
            fail(new Error("Benchmark engine process exited before spawning."));
            return;
          }
          settled = true;
          resolve({
            exitCode,
            signal,
            elapsedMs: Number(process.hrtime.bigint() - started) / 1_000_000,
            pid,
          });
        });
      });
      child.stdout.pipe(stdout);
      child.stderr.pipe(stderr);
      child.stdin.end(props.stdin, "utf8");

      const result: IResult = await outcome;
      if (!(await completesWithin(closePromise, STDIO_DRAIN_GRACE_MS)))
        forceFinalizePipes(child, stdout, stderr);
      await requireFinished([stdoutFinished, stderrFinished]);
      return result;
    } catch (error) {
      if (
        child !== undefined &&
        child.exitCode === null &&
        child.signalCode === null
      )
        child.kill("SIGKILL");
      if (child === undefined) {
        stdout.end();
        stderr.end();
      } else forceFinalizePipes(child, stdout, stderr);
      const cleanup: PromiseSettledResult<void>[] = await Promise.allSettled([
        stdoutFinished,
        stderrFinished,
      ]);
      const cleanupFailures: unknown[] = cleanup.flatMap((result) =>
        result.status === "rejected" ? [result.reason] : [],
      );
      if (cleanupFailures.length !== 0)
        throw new AggregateError(
          [error, ...cleanupFailures],
          "Benchmark agent process failed and its logs did not finalize cleanly.",
        );
      throw error;
    }
  }

  function completesWithin(
    task: Promise<void>,
    timeoutMs: number,
  ): Promise<boolean> {
    return new Promise((resolve) => {
      let settled: boolean = false;
      const finish = (value: boolean): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(value);
      };
      const timer: NodeJS.Timeout = setTimeout(() => finish(false), timeoutMs);
      task.then(
        () => finish(true),
        () => finish(true),
      );
    });
  }

  function forceFinalizePipes(
    child: cp.ChildProcess,
    stdout: fs.WriteStream,
    stderr: fs.WriteStream,
  ): void {
    child.stdout?.unpipe();
    child.stderr?.unpipe();
    child.stdout?.destroy();
    child.stderr?.destroy();
    stdout.end();
    stderr.end();
  }

  async function requireFinished(
    tasks: readonly Promise<void>[],
  ): Promise<void> {
    const results: PromiseSettledResult<void>[] =
      await Promise.allSettled(tasks);
    const failures: unknown[] = results.flatMap((result) =>
      result.status === "rejected" ? [result.reason] : [],
    );
    if (failures.length !== 0)
      throw new AggregateError(
        failures,
        "Benchmark agent process logs did not finalize.",
      );
  }
}
