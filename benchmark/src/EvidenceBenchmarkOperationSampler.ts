import os from "node:os";

import type { IEvidenceBenchmarkOperation } from "./structures/IEvidenceBenchmarkOperation.ts";
import type { IEvidenceBenchmarkOperationSampler } from "./structures/IEvidenceBenchmarkOperationSampler.ts";

/** Node host sampler with explicit nulls for unsupported platform counters. */
export class EvidenceBenchmarkOperationSampler implements IEvidenceBenchmarkOperationSampler {
  /** Captures cumulative CPU and memory diagnostics at one fixed cadence. */
  public sample(): IEvidenceBenchmarkOperation.IBlockSample["host"] {
    const cpus: os.CpuInfo[] = os.cpus();
    const cpuIdleMs: number = cpus.reduce(
      (sum, cpu) => sum + cpu.times.idle,
      0,
    );
    const cpuBusyMs: number = cpus.reduce(
      (sum, cpu) =>
        sum + cpu.times.user + cpu.times.nice + cpu.times.sys + cpu.times.irq,
      0,
    );
    return {
      platform: `${process.platform}-${process.arch}`,
      cpuCount: cpus.length,
      cpuIdleMs,
      cpuBusyMs,
      totalMemoryBytes: os.totalmem(),
      freeMemoryBytes: os.freemem(),
      loadAverage1m: process.platform === "win32" ? null : os.loadavg()[0]!,
      diskFreeBytes: null,
    };
  }
}
