import cp from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { finished } from "node:stream/promises";

import { EvidenceBenchmarkEngine } from "./EvidenceBenchmarkEngine.ts";

/** Owns one measured coding-agent process and every descendant it starts. */
export namespace EvidenceBenchmarkAgentProcess {
  const STDIO_DRAIN_GRACE_MS = 1_000;
  const DESCENDANT_CLEANUP_GRACE_MS = 3_000;
  const CODEX_TERMINAL_EXIT_GRACE_MS = 5_000;
  const WINDOWS_CLEANUP_TIMEOUT_MS = 5_000;

  /** Retained process outcome returned only after owned descendants are gone. */
  export interface IResult {
    /** Semantic process status; terminal-triggered Codex cleanup is successful. */
    status: number | null;

    /** Direct agent-process duration, excluding descendant pipe cleanup. */
    elapsedMs: number;

    /** Records that Codex required forced cleanup after its native terminal. */
    nativeTerminalCleanup?: true;
  }

  /** Runs one agent turn while retaining exact native stdout and stderr. */
  export async function run(props: {
    command: string;
    arguments: readonly string[];
    cwd: string;
    environment: NodeJS.ProcessEnv;
    engine: EvidenceBenchmarkEngine.Name;
    stdin: string;
    stdout: string;
    stderr: string;
    onStdout: (chunk: Buffer) => void;
  }): Promise<IResult> {
    const stdout = fs.createWriteStream(props.stdout, { flags: "wx" });
    const stderr = fs.createWriteStream(props.stderr, { flags: "wx" });
    const stdoutFinished: Promise<void> = finished(stdout);
    const stderrFinished: Promise<void> = finished(stderr);
    let child: cp.ChildProcessWithoutNullStreams | undefined;
    let terminalExitTimer: NodeJS.Timeout | undefined;
    let nativeTerminalCleanup: true | undefined;
    try {
      child = cp.spawn(props.command, [...props.arguments], {
        cwd: props.cwd,
        env: props.environment,
        shell: false,
        windowsHide: true,
        stdio: "pipe",
        detached: process.platform !== "win32",
      });
      const closePromise: Promise<void> = new Promise((resolve) =>
        child!.once("close", () => resolve()),
      );
      const outcome = new Promise<{
        started: bigint;
        stopped: bigint;
        status: number | null;
      }>((resolve, reject) => {
        let started: bigint | undefined;
        child!.once("spawn", () => {
          started = process.hrtime.bigint();
        });
        child!.once("error", reject);
        child!.once("exit", (status) => {
          if (started === undefined)
            reject(
              new Error("Benchmark engine process exited before spawning."),
            );
          else
            resolve({
              started,
              stopped: process.hrtime.bigint(),
              status,
            });
        });
      });
      let codexBuffer: string = "";
      child.stdout.on("error", () => {});
      child.stdout.on("data", (chunk: Buffer) => {
        props.onStdout(chunk);
        if (props.engine !== "codex") return;
        codexBuffer += chunk.toString("utf8");
        const lines: string[] = codexBuffer.split(/\r?\n/);
        codexBuffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!isCodexTerminal(line)) continue;
          if (terminalExitTimer !== undefined) clearTimeout(terminalExitTimer);
          terminalExitTimer = setTimeout(() => {
            if (child!.exitCode !== null || child!.signalCode !== null) return;
            nativeTerminalCleanup = true;
            killProcessTree(child!);
          }, CODEX_TERMINAL_EXIT_GRACE_MS);
        }
      });
      child.stderr.on("error", () => {});
      child.stdout.pipe(stdout);
      child.stderr.pipe(stderr);
      child.stdin.once("error", () => {});
      child.stdin.end(props.stdin, "utf8");

      const result = await outcome;
      if (terminalExitTimer !== undefined) {
        clearTimeout(terminalExitTimer);
        terminalExitTimer = undefined;
      }
      const drained: boolean = await completesWithin(
        closePromise,
        STDIO_DRAIN_GRACE_MS,
      );
      await cleanupDescendants(child, props.cwd);
      if (
        !drained &&
        !(await completesWithin(closePromise, DESCENDANT_CLEANUP_GRACE_MS))
      )
        forceFinalizePipes(child, stdout, stderr);
      await requireFinished([stdoutFinished, stderrFinished]);
      return {
        status: nativeTerminalCleanup === true ? 0 : result.status,
        elapsedMs: Number(result.stopped - result.started) / 1_000_000,
        ...(nativeTerminalCleanup === true ? { nativeTerminalCleanup } : {}),
      };
    } catch (error) {
      if (terminalExitTimer !== undefined) clearTimeout(terminalExitTimer);
      if (child !== undefined) {
        killProcessTree(child);
        await cleanupDescendants(child, props.cwd);
        forceFinalizePipes(child, stdout, stderr);
      } else {
        stdout.end();
        stderr.end();
      }
      await Promise.allSettled([stdoutFinished, stderrFinished]);
      throw error;
    }
  }

  function isCodexTerminal(line: string): boolean {
    try {
      const event: unknown = JSON.parse(line);
      return (
        typeof event === "object" &&
        event !== null &&
        "type" in event &&
        event.type === "turn.completed"
      );
    } catch {
      return false;
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

  async function cleanupDescendants(
    child: cp.ChildProcess,
    workspace: string,
  ): Promise<void> {
    if (process.platform !== "win32") {
      killProcessTree(child);
      await cleanupPosixWorkspaceProcesses(workspace);
      return;
    }
    const encodedWorkspace: string = Buffer.from(
      path.resolve(workspace),
      "utf8",
    ).toString("base64");
    const script: string = [
      `$workspace = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${encodedWorkspace}')).Replace('\\', '/')`,
      "$comparison = [StringComparison]::OrdinalIgnoreCase",
      "Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |",
      "  Where-Object { $_.ProcessId -ne $PID -and $_.CommandLine -and $_.CommandLine.Replace('\\', '/').IndexOf($workspace, $comparison) -ge 0 } |",
      "  ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }",
    ].join("\n");
    const encodedScript: string = Buffer.from(script, "utf16le").toString(
      "base64",
    );
    const systemRoot: string | undefined = process.env.SystemRoot;
    const powershell: string =
      systemRoot === undefined
        ? "powershell.exe"
        : path.join(
            systemRoot,
            "System32",
            "WindowsPowerShell",
            "v1.0",
            "powershell.exe",
          );
    await new Promise<void>((resolve) => {
      let cleanup: cp.ChildProcess;
      try {
        cleanup = cp.spawn(
          powershell,
          ["-NoProfile", "-NonInteractive", "-EncodedCommand", encodedScript],
          { stdio: "ignore", windowsHide: true },
        );
      } catch {
        resolve();
        return;
      }
      let settled: boolean = false;
      const finish = (): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve();
      };
      const timer: NodeJS.Timeout = setTimeout(() => {
        cleanup.kill("SIGKILL");
        finish();
      }, WINDOWS_CLEANUP_TIMEOUT_MS);
      cleanup.once("error", finish);
      cleanup.once("close", finish);
    });
  }

  async function cleanupPosixWorkspaceProcesses(
    workspace: string,
  ): Promise<void> {
    const normalizedWorkspace: string = path.resolve(workspace);
    const listing: string = await new Promise((resolve) => {
      let child: cp.ChildProcessWithoutNullStreams;
      try {
        child = cp.spawn("ps", ["-eo", "pid=,args="], {
          stdio: "pipe",
        });
      } catch {
        resolve("");
        return;
      }
      const stdout: Buffer[] = [];
      child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
      child.once("error", () => resolve(""));
      child.once("close", () =>
        resolve(Buffer.concat(stdout).toString("utf8")),
      );
    });
    for (const line of listing.split(/\r?\n/)) {
      const match: RegExpExecArray | null = /^\s*(\d+)\s+(.*)$/.exec(line);
      if (
        match === null ||
        Number(match[1]) === process.pid ||
        !match[2]!.includes(normalizedWorkspace)
      )
        continue;
      try {
        process.kill(Number(match[1]), "SIGKILL");
      } catch {}
    }
  }

  function killProcessTree(child: cp.ChildProcess): void {
    const pid: number | undefined = child.pid;
    if (pid === undefined) {
      child.kill("SIGKILL");
      return;
    }
    if (process.platform === "win32") {
      let cleanup: cp.ChildProcess;
      try {
        cleanup = cp.spawn("taskkill", ["/pid", String(pid), "/T", "/F"], {
          stdio: "ignore",
          windowsHide: true,
        });
      } catch {
        child.kill("SIGKILL");
        return;
      }
      cleanup.once("error", () => child!.kill("SIGKILL"));
      cleanup.once("close", () => {
        if (child.exitCode === null && child.signalCode === null)
          child.kill("SIGKILL");
      });
      return;
    }
    try {
      process.kill(-pid, "SIGKILL");
    } catch {
      child.kill("SIGKILL");
    }
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
