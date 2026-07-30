import cp from "node:child_process";
import crypto from "node:crypto";
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
  const WINDOWS_MONITOR_START_TIMEOUT_MS = 5_000;
  const PROCESS_TOKEN_ENVIRONMENT_KEY =
    "EVIDENCE_BENCHMARK_PROCESS_OWNERSHIP_TOKEN";

  interface IWindowsDescendantMonitor {
    seed: (pid: number) => Promise<void>;
    stop: () => Promise<void>;
  }

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
    const processToken: string = crypto.randomUUID();
    let windowsMonitor: IWindowsDescendantMonitor | undefined;
    try {
      windowsMonitor =
        process.platform === "win32"
          ? await startWindowsDescendantMonitor(path.dirname(props.stdout))
          : undefined;
      child = cp.spawn(props.command, [...props.arguments], {
        cwd: props.cwd,
        env: {
          ...props.environment,
          [PROCESS_TOKEN_ENVIRONMENT_KEY]: processToken,
        },
        shell: false,
        windowsHide: true,
        stdio: "pipe",
        detached: process.platform !== "win32",
      });
      if (child.pid === undefined)
        throw new Error("Benchmark engine process has no process identity.");
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
      await windowsMonitor?.seed(child.pid);
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
      await cleanupDescendants(child, props.cwd, processToken, windowsMonitor);
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
        await cleanupDescendants(
          child,
          props.cwd,
          processToken,
          windowsMonitor,
        );
        forceFinalizePipes(child, stdout, stderr);
      } else {
        await windowsMonitor?.stop();
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

  async function startWindowsDescendantMonitor(
    directory: string,
  ): Promise<IWindowsDescendantMonitor> {
    const nonce: string = crypto.randomUUID();
    const files = {
      ready: path.join(directory, `.process-monitor-${nonce}.ready`),
      seed: path.join(directory, `.process-monitor-${nonce}.seed`),
      assigned: path.join(directory, `.process-monitor-${nonce}.assigned`),
      stop: path.join(directory, `.process-monitor-${nonce}.stop`),
      done: path.join(directory, `.process-monitor-${nonce}.done`),
    };
    const decode = (value: string): string =>
      `[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${Buffer.from(value, "utf8").toString("base64")}'))`;
    const interop: string = [
      "using System;",
      "using System.ComponentModel;",
      "using System.Runtime.InteropServices;",
      "public static class EvidenceBenchmarkJob {",
      "  [StructLayout(LayoutKind.Sequential)]",
      "  private struct BasicLimits {",
      "    public long PerProcessUserTimeLimit;",
      "    public long PerJobUserTimeLimit;",
      "    public uint LimitFlags;",
      "    public UIntPtr MinimumWorkingSetSize;",
      "    public UIntPtr MaximumWorkingSetSize;",
      "    public uint ActiveProcessLimit;",
      "    public UIntPtr Affinity;",
      "    public uint PriorityClass;",
      "    public uint SchedulingClass;",
      "  }",
      "  [StructLayout(LayoutKind.Sequential)]",
      "  private struct IoCounters {",
      "    public ulong ReadOperationCount;",
      "    public ulong WriteOperationCount;",
      "    public ulong OtherOperationCount;",
      "    public ulong ReadTransferCount;",
      "    public ulong WriteTransferCount;",
      "    public ulong OtherTransferCount;",
      "  }",
      "  [StructLayout(LayoutKind.Sequential)]",
      "  private struct ExtendedLimits {",
      "    public BasicLimits BasicLimitInformation;",
      "    public IoCounters IoInfo;",
      "    public UIntPtr ProcessMemoryLimit;",
      "    public UIntPtr JobMemoryLimit;",
      "    public UIntPtr PeakProcessMemoryUsed;",
      "    public UIntPtr PeakJobMemoryUsed;",
      "  }",
      '  [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]',
      "  private static extern IntPtr CreateJobObject(IntPtr attributes, string name);",
      '  [DllImport("kernel32.dll", SetLastError = true)]',
      "  private static extern bool SetInformationJobObject(IntPtr job, int informationClass, IntPtr information, uint length);",
      '  [DllImport("kernel32.dll", SetLastError = true)]',
      "  private static extern IntPtr OpenProcess(uint access, bool inheritHandle, uint processId);",
      '  [DllImport("kernel32.dll", SetLastError = true)]',
      "  private static extern bool AssignProcessToJobObject(IntPtr job, IntPtr process);",
      '  [DllImport("kernel32.dll", SetLastError = true)]',
      "  private static extern bool CloseHandle(IntPtr handle);",
      "  public static IntPtr Create() {",
      "    IntPtr job = CreateJobObject(IntPtr.Zero, null);",
      "    if (job == IntPtr.Zero) throw new Win32Exception(Marshal.GetLastWin32Error());",
      "    ExtendedLimits limits = new ExtendedLimits();",
      "    limits.BasicLimitInformation.LimitFlags = 0x00002000;",
      "    int size = Marshal.SizeOf(typeof(ExtendedLimits));",
      "    IntPtr memory = Marshal.AllocHGlobal(size);",
      "    try {",
      "      Marshal.StructureToPtr(limits, memory, false);",
      "      if (!SetInformationJobObject(job, 9, memory, (uint)size)) throw new Win32Exception(Marshal.GetLastWin32Error());",
      "      return job;",
      "    } catch {",
      "      CloseHandle(job);",
      "      throw;",
      "    } finally {",
      "      Marshal.FreeHGlobal(memory);",
      "    }",
      "  }",
      "  public static void Assign(IntPtr job, uint processId) {",
      "    IntPtr process = OpenProcess(0x00000101, false, processId);",
      "    if (process == IntPtr.Zero) throw new Win32Exception(Marshal.GetLastWin32Error());",
      "    try {",
      "      if (!AssignProcessToJobObject(job, process)) throw new Win32Exception(Marshal.GetLastWin32Error());",
      "    } finally {",
      "      CloseHandle(process);",
      "    }",
      "  }",
      "  public static void Close(IntPtr job) {",
      "    if (job != IntPtr.Zero && !CloseHandle(job)) throw new Win32Exception(Marshal.GetLastWin32Error());",
      "  }",
      "}",
    ].join("\n");
    const script: string = [
      "$ErrorActionPreference = 'Stop'",
      `$ready = ${decode(files.ready)}`,
      `$seed = ${decode(files.seed)}`,
      `$assignedFile = ${decode(files.assigned)}`,
      `$stop = ${decode(files.stop)}`,
      `$done = ${decode(files.done)}`,
      `$controllerPid = [uint32]${process.pid}`,
      `$interop = ${decode(interop)}`,
      "Add-Type -TypeDefinition $interop",
      "$job = [EvidenceBenchmarkJob]::Create()",
      "$owned = New-Object 'System.Collections.Generic.HashSet[uint32]'",
      "try {",
      "  [IO.File]::WriteAllText($ready, 'ready')",
      "  while (!(Test-Path -LiteralPath $seed) -and !(Test-Path -LiteralPath $stop) -and $null -ne (Get-Process -Id $controllerPid -ErrorAction SilentlyContinue)) {",
      "    Start-Sleep -Milliseconds 10",
      "  }",
      "  if (Test-Path -LiteralPath $seed) {",
      "    $value = [IO.File]::ReadAllText($seed).Trim()",
      "    $rootPid = [uint32]0",
      "    if (![uint32]::TryParse($value, [ref] $rootPid) -or $rootPid -eq 0) {",
      "      throw 'Benchmark Windows process job received an invalid root PID.'",
      "    }",
      "    [EvidenceBenchmarkJob]::Assign($job, $rootPid)",
      "    [void] $owned.Add($rootPid)",
      "    for ($pass = 0; $pass -lt 3; $pass++) {",
      "      $processes = @(Get-CimInstance Win32_Process)",
      "      do {",
      "        $added = $false",
      "        foreach ($process in $processes) {",
      "          $id = [uint32] $process.ProcessId",
      "          if ($owned.Contains([uint32] $process.ParentProcessId) -and $owned.Add($id)) { $added = $true }",
      "        }",
      "      } while ($added)",
      "      foreach ($id in @($owned)) {",
      "        if ($id -eq $rootPid) { continue }",
      "        if ($null -eq (Get-Process -Id $id -ErrorAction SilentlyContinue)) { continue }",
      "        [EvidenceBenchmarkJob]::Assign($job, $id)",
      "      }",
      "      Start-Sleep -Milliseconds 10",
      "    }",
      "    [IO.File]::WriteAllText($assignedFile, 'assigned')",
      "    while (!(Test-Path -LiteralPath $stop) -and $null -ne (Get-Process -Id $controllerPid -ErrorAction SilentlyContinue)) {",
      "      Start-Sleep -Milliseconds 50",
      "    }",
      "  }",
      "} finally {",
      "  [EvidenceBenchmarkJob]::Close($job)",
      "}",
      "Start-Sleep -Milliseconds 100",
      "[IO.File]::WriteAllText($done, 'done')",
    ].join("\n");
    const encodedScript: string = Buffer.from(script, "utf16le").toString(
      "base64",
    );
    const monitor: cp.ChildProcess = cp.spawn(
      windowsPowerShell(),
      ["-NoProfile", "-NonInteractive", "-EncodedCommand", encodedScript],
      { stdio: ["ignore", "ignore", "pipe"], windowsHide: true },
    );
    const stderr: Buffer[] = [];
    monitor.stderr?.on("data", (chunk: Buffer) => stderr.push(chunk));
    let spawnError: unknown;
    monitor.once("error", (error) => {
      spawnError = error;
    });
    const closePromise: Promise<number | null> = new Promise((resolve) =>
      monitor.once("close", resolve),
    );
    const deadline: number = Date.now() + WINDOWS_MONITOR_START_TIMEOUT_MS;
    while (!fs.existsSync(files.ready)) {
      if (spawnError !== undefined) {
        removeMonitorFiles(files);
        throw spawnError;
      }
      if (monitor.exitCode !== null || Date.now() >= deadline) {
        monitor.kill("SIGKILL");
        removeMonitorFiles(files);
        throw new Error(
          `Benchmark Windows process monitor did not start: ${Buffer.concat(stderr).toString("utf8").trim()}`,
        );
      }
      await delay(25);
    }
    let seeded: boolean = false;
    let stopped: Promise<void> | undefined;
    return {
      seed: async (pid: number): Promise<void> => {
        if (seeded)
          throw new Error(
            "Benchmark Windows process monitor was seeded twice.",
          );
        fs.writeFileSync(files.seed, String(pid), {
          encoding: "utf8",
          flag: "wx",
        });
        seeded = true;
        const assignmentDeadline: number =
          Date.now() + WINDOWS_MONITOR_START_TIMEOUT_MS;
        while (!fs.existsSync(files.assigned)) {
          if (monitor.exitCode !== null || Date.now() >= assignmentDeadline)
            throw new Error(
              `Benchmark Windows process job did not contain the agent: ${Buffer.concat(stderr).toString("utf8").trim()}`,
            );
          await delay(10);
        }
      },
      stop: (): Promise<void> => {
        stopped ??= (async (): Promise<void> => {
          try {
            if (!fs.existsSync(files.stop))
              fs.writeFileSync(files.stop, "stop", {
                encoding: "utf8",
                flag: "wx",
              });
            const closed: boolean = await completesWithin(
              closePromise.then(() => {}),
              WINDOWS_CLEANUP_TIMEOUT_MS,
            );
            if (!closed) {
              monitor.kill("SIGKILL");
              throw new Error("Benchmark Windows process monitor timed out.");
            }
            const status: number | null = await closePromise;
            if (status !== 0 || !fs.existsSync(files.done))
              throw new Error(
                `Benchmark Windows process monitor failed with status ${String(status)}: ${Buffer.concat(stderr).toString("utf8").trim()}`,
              );
          } finally {
            removeMonitorFiles(files);
          }
        })();
        return stopped;
      },
    };
  }

  function removeMonitorFiles(files: {
    ready: string;
    seed: string;
    assigned: string;
    stop: string;
    done: string;
  }): void {
    for (const file of Object.values(files)) fs.rmSync(file, { force: true });
  }

  function delay(milliseconds: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
  }

  function windowsPowerShell(): string {
    const systemRoot: string | undefined = process.env.SystemRoot;
    return systemRoot === undefined
      ? "powershell.exe"
      : path.join(
          systemRoot,
          "System32",
          "WindowsPowerShell",
          "v1.0",
          "powershell.exe",
        );
  }

  async function cleanupDescendants(
    child: cp.ChildProcess,
    workspace: string,
    processToken: string,
    windowsMonitor: IWindowsDescendantMonitor | undefined,
  ): Promise<void> {
    if (process.platform !== "win32") {
      killProcessTree(child);
      await cleanupPosixWorkspaceProcesses(workspace, processToken);
      return;
    }
    if (windowsMonitor === undefined)
      throw new Error("Benchmark Windows process monitor is missing.");
    await windowsMonitor.stop();
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
    await new Promise<void>((resolve) => {
      let cleanup: cp.ChildProcess;
      try {
        cleanup = cp.spawn(
          windowsPowerShell(),
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
    processToken: string,
  ): Promise<void> {
    const normalizedWorkspace: string = path.resolve(workspace);
    const listing: string = await new Promise((resolve, reject) => {
      let child: cp.ChildProcessWithoutNullStreams;
      try {
        const arguments_: string[] =
          process.platform === "darwin"
            ? ["-A", "-E", "-ww", "-o", "pid=,command="]
            : ["eww", "-eo", "pid=,args="];
        child = cp.spawn("ps", arguments_, {
          stdio: "pipe",
        });
      } catch (error) {
        reject(error);
        return;
      }
      const stdout: Buffer[] = [];
      const stderr: Buffer[] = [];
      child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
      child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
      child.once("error", reject);
      child.once("close", (status) => {
        if (status !== 0) {
          reject(
            new Error(
              `Unable to inspect benchmark POSIX descendants with status ${String(status)}: ${Buffer.concat(stderr).toString("utf8").trim()}`,
            ),
          );
          return;
        }
        resolve(Buffer.concat(stdout).toString("utf8"));
      });
    });
    const token: string = `${PROCESS_TOKEN_ENVIRONMENT_KEY}=${processToken}`;
    for (const line of listing.split(/\r?\n/)) {
      const match: RegExpExecArray | null = /^\s*(\d+)\s+(.*)$/.exec(line);
      if (
        match === null ||
        Number(match[1]) === process.pid ||
        (!match[2]!.includes(normalizedWorkspace) && !match[2]!.includes(token))
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
