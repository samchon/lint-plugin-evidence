import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { finished } from "node:stream/promises";

import type { IEvidenceBenchmarkCodexRecord } from "../structures/IEvidenceBenchmarkCodexRecord.ts";
import type { IEvidenceBenchmarkCodexRun } from "../structures/IEvidenceBenchmarkCodexRun.ts";
import { EvidenceBenchmarkCodexLog } from "./EvidenceBenchmarkCodexLog.ts";
import { EvidenceBenchmarkCodexValue } from "./EvidenceBenchmarkCodexValue.ts";

/** Executes shell-free build and test gates independently of the measured agent. */
export class EvidenceBenchmarkCodexGateRunner {
  /**
   * Creates an independent gate runner.
   *
   * @param outputDirectory Absolute run record directory.
   * @param log Semantic event ledger shared with the Codex controller.
   */
  public constructor(
    private readonly outputDirectory: string,
    private readonly log: EvidenceBenchmarkCodexLog,
  ) {}

  /** Runs every configured gate once and preserves stdout and stderr separately. */
  public async run(
    gates: readonly IEvidenceBenchmarkCodexRun.IGate[],
    attempt: number,
  ): Promise<IEvidenceBenchmarkCodexRecord.IGateResult[]> {
    const results: IEvidenceBenchmarkCodexRecord.IGateResult[] = [];
    for (const gate of gates) results.push(await this.execute(gate, attempt));
    return results;
  }

  private async execute(
    gate: IEvidenceBenchmarkCodexRun.IGate,
    attempt: number,
  ): Promise<IEvidenceBenchmarkCodexRecord.IGateResult> {
    EvidenceBenchmarkCodexValue.assertDirectExecutable(
      gate.command,
      `gate ${gate.name} command`,
    );
    const directory = path.join(this.outputDirectory, "gates");
    await fs.promises.mkdir(directory, { recursive: true });
    const stem = `${String(attempt).padStart(2, "0")}-${gate.name.replace(
      /[^A-Za-z0-9._-]+/g,
      "-",
    )}`;
    const stdoutPath = path.join(directory, `${stem}.stdout.log`);
    const stderrPath = path.join(directory, `${stem}.stderr.log`);
    const stdout = fs.createWriteStream(stdoutPath, { flags: "wx" });
    const stderr = fs.createWriteStream(stderrPath, { flags: "wx" });
    const startedAtUtc = new Date().toISOString();
    const started = process.hrtime.bigint();
    await this.log.recordEvent(
      "gate_started",
      {
        attempt,
        name: gate.name,
        kind: gate.kind,
        command: gate.command,
        arguments: [...gate.arguments],
        cwd: gate.cwd,
      },
      { actor: "gate", phase: "gate" },
    );
    const child = spawn(gate.command, [...gate.arguments], {
      cwd: gate.cwd,
      env: { ...process.env, ...gate.environment },
      detached: process.platform !== "win32",
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    child.stdout.pipe(stdout);
    child.stderr.pipe(stderr);
    let timedOut = false;
    const timer = setTimeout((): void => {
      timedOut = true;
      void EvidenceBenchmarkCodexGateRunner.killTree(child.pid);
    }, gate.timeoutMs);
    timer.unref();
    const exit = await new Promise<{
      code: number | null;
      signal: NodeJS.Signals | null;
    }>((resolve, reject): void => {
      child.once("error", reject);
      child.once("close", (code, signal): void => resolve({ code, signal }));
    }).finally((): void => clearTimeout(timer));
    await Promise.all([finished(stdout), finished(stderr)]);
    const result: IEvidenceBenchmarkCodexRecord.IGateResult = {
      name: gate.name,
      kind: gate.kind,
      startedAtUtc,
      completedAtUtc: new Date().toISOString(),
      durationMs: Number(process.hrtime.bigint() - started) / 1_000_000,
      exitCode: exit.code,
      signal: exit.signal,
      timedOut,
      stdoutPath,
      stderrPath,
    };
    await this.log.recordEvent(
      "gate_completed",
      {
        attempt,
        name: gate.name,
        kind: gate.kind,
        durationMs: result.durationMs,
        exitCode: result.exitCode,
        signal: result.signal,
        timedOut,
      },
      { actor: "gate", phase: "gate" },
    );
    return result;
  }

  private static async killTree(pid: number | undefined): Promise<void> {
    if (pid === undefined) return;
    if (process.platform === "win32") {
      await new Promise<void>((resolve): void => {
        const killer = spawn("taskkill", ["/pid", String(pid), "/t", "/f"], {
          shell: false,
          stdio: "ignore",
          windowsHide: true,
        });
        killer.once("error", (): void => resolve());
        killer.once("close", (): void => resolve());
      });
      return;
    }
    try {
      process.kill(-pid, "SIGTERM");
    } catch {
      return;
    }
  }
}
