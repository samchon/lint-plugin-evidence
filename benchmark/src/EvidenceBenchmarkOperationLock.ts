import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { EvidenceBenchmarkDurability } from "./EvidenceBenchmarkDurability.ts";
import { EvidenceBenchmarkJson } from "./EvidenceBenchmarkJson.ts";
import { EvidenceBenchmarkOperationStore } from "./EvidenceBenchmarkOperationStore.ts";
import type { IEvidenceBenchmarkOperation } from "./structures/IEvidenceBenchmarkOperation.ts";

/** Owns immutable per-run locks and owner-specific append-only heartbeats. */
export namespace EvidenceBenchmarkOperationLock {
  /** Maximum heartbeat age admitted as live on the owning host. */
  export const STALE_AFTER_MS = 10_000;

  /** Live lock handle retained by one controller process. */
  export interface IHandle {
    /** Persisted lock identity owned by this handle. */
    lock: IEvidenceBenchmarkOperation.ILock;

    /** First durable heartbeat error, or null while writes remain healthy. */
    failure: () => Error | null;

    /** Stops heartbeat writes and removes only this exact owned lock. */
    release: () => void;
  }

  /** Acquires a new exclusive lock and begins append-only heartbeats. */
  export function acquire(
    cell: IEvidenceBenchmarkOperation.ICell,
    now: () => Date,
  ): IHandle {
    const location: string = EvidenceBenchmarkOperationStore.lockPath(cell);
    const ownerId: string = crypto.randomUUID();
    const heartbeat: string = path.join(
      EvidenceBenchmarkOperationStore.operations(cell),
      `heartbeat.${ownerId}.jsonl`,
    );
    const lock: IEvidenceBenchmarkOperation.ILock = {
      schemaVersion: 1,
      runId: cell.runId,
      pid: process.pid,
      hostname: os.hostname(),
      ownerId,
      heartbeat,
      acquiredAtUtc: now().toISOString(),
      heartbeatAtUtc: now().toISOString(),
    };
    EvidenceBenchmarkDurability.writeOnce(
      location,
      `${JSON.stringify(lock, null, 2)}\n`,
    );
    syncDirectory(path.dirname(location));
    let failure: Error | null = null;
    let sequence: number = 0;
    const beat = (): void => {
      try {
        const current: IEvidenceBenchmarkOperation.ILock | null = read(cell);
        if (current?.ownerId !== lock.ownerId)
          throw new Error(
            `Benchmark heartbeat lost lock ownership: ${cell.runId}.`,
          );
        lock.heartbeatAtUtc = now().toISOString();
        appendHeartbeat(lock, ++sequence);
      } catch (error) {
        failure = error instanceof Error ? error : new Error(String(error));
      }
    };
    beat();
    const timer: NodeJS.Timeout = setInterval(() => {
      if (failure === null) beat();
    }, 1_000);
    timer.unref();
    return {
      lock,
      failure: (): Error | null => failure,
      release: (): void => {
        clearInterval(timer);
        const current: IEvidenceBenchmarkOperation.ILock | null = read(cell);
        if (current?.ownerId !== lock.ownerId)
          throw new Error(
            `Benchmark lock ownership changed before release: ${cell.runId}.`,
          );
        fs.unlinkSync(location);
        syncDirectory(path.dirname(location));
      },
    };
  }

  /** Reads and validates a persisted immutable lock. */
  export function read(
    cell: IEvidenceBenchmarkOperation.ICell,
  ): IEvidenceBenchmarkOperation.ILock | null {
    const location: string = EvidenceBenchmarkOperationStore.lockPath(cell);
    if (!fs.existsSync(location)) return null;
    const parsed: unknown = EvidenceBenchmarkJson.parse(
      fs.readFileSync(location, "utf8"),
      location,
    );
    if (
      !isObject(parsed) ||
      parsed.schemaVersion !== 1 ||
      parsed.runId !== cell.runId ||
      typeof parsed.pid !== "number" ||
      !Number.isInteger(parsed.pid) ||
      parsed.pid < 1 ||
      typeof parsed.hostname !== "string" ||
      parsed.hostname.length === 0 ||
      typeof parsed.ownerId !== "string" ||
      parsed.ownerId.length === 0 ||
      typeof parsed.heartbeat !== "string" ||
      !path.isAbsolute(parsed.heartbeat) ||
      path.dirname(parsed.heartbeat) !==
        EvidenceBenchmarkOperationStore.operations(cell) ||
      typeof parsed.acquiredAtUtc !== "string" ||
      !Number.isFinite(Date.parse(parsed.acquiredAtUtc)) ||
      typeof parsed.heartbeatAtUtc !== "string" ||
      !Number.isFinite(Date.parse(parsed.heartbeatAtUtc))
    )
      throw new Error(`Invalid benchmark controller lock: ${location}.`);
    return parsed as unknown as IEvidenceBenchmarkOperation.ILock;
  }

  /** Derives conservative liveness and heartbeat age from one run lock. */
  export function inspect(
    cell: IEvidenceBenchmarkOperation.ICell,
    now: Date,
  ): {
    liveness: IEvidenceBenchmarkOperation.Liveness;
    heartbeatAgeMs: number | null;
  } {
    const lock: IEvidenceBenchmarkOperation.ILock | null = read(cell);
    if (lock === null) return { liveness: "unlocked", heartbeatAgeMs: null };
    const last: IHeartbeat | null = readHeartbeat(lock);
    const timestamp: string = last?.atUtc ?? lock.heartbeatAtUtc;
    const heartbeatAgeMs: number = Math.max(
      0,
      now.getTime() - Date.parse(timestamp),
    );
    if (lock.hostname !== os.hostname())
      return { liveness: "unknown", heartbeatAgeMs };
    if (!processExists(lock.pid)) return { liveness: "stale", heartbeatAgeMs };
    return {
      liveness: heartbeatAgeMs <= STALE_AFTER_MS ? "live" : "unknown",
      heartbeatAgeMs,
    };
  }

  /**
   * Archives one repeatedly proven-stale local lock before taking ownership.
   *
   * The owner id is re-read before and after rename. A live PID with a delayed
   * heartbeat remains unknown and cannot be taken over.
   */
  export function takeOverStale(
    cell: IEvidenceBenchmarkOperation.ICell,
    now: () => Date,
  ): IHandle {
    const before: IEvidenceBenchmarkOperation.ILock | null = read(cell);
    if (before === null || inspect(cell, now()).liveness !== "stale")
      throw new Error(
        `Benchmark run ${cell.runId} does not have a stale local lock.`,
      );
    const confirmed: IEvidenceBenchmarkOperation.ILock | null = read(cell);
    if (
      confirmed?.ownerId !== before.ownerId ||
      inspect(cell, now()).liveness !== "stale"
    )
      throw new Error(
        `Benchmark run ${cell.runId} lock changed during stale admission.`,
      );
    const location: string = EvidenceBenchmarkOperationStore.lockPath(cell);
    const archived: string = path.join(
      EvidenceBenchmarkOperationStore.operations(cell),
      `controller.stale.${Date.now()}.${before.ownerId}.json`,
    );
    fs.renameSync(location, archived);
    const archivedLock: IEvidenceBenchmarkOperation.ILock =
      EvidenceBenchmarkJson.parse(
        fs.readFileSync(archived, "utf8"),
        archived,
      ) as IEvidenceBenchmarkOperation.ILock;
    if (archivedLock.ownerId !== before.ownerId) {
      if (!fs.existsSync(location)) fs.renameSync(archived, location);
      throw new Error(
        `Benchmark run ${cell.runId} lock changed during stale takeover.`,
      );
    }
    syncDirectory(path.dirname(location));
    return acquire(cell, now);
  }

  interface IHeartbeat {
    schemaVersion: 1;
    runId: string;
    ownerId: string;
    sequence: number;
    atUtc: string;
  }

  function appendHeartbeat(
    lock: IEvidenceBenchmarkOperation.ILock,
    sequence: number,
  ): void {
    const heartbeat: IHeartbeat = {
      schemaVersion: 1,
      runId: lock.runId,
      ownerId: lock.ownerId,
      sequence,
      atUtc: lock.heartbeatAtUtc,
    };
    const handle: number = fs.openSync(lock.heartbeat, "a");
    try {
      fs.writeSync(handle, `${JSON.stringify(heartbeat)}\n`, undefined, "utf8");
      fs.fsyncSync(handle);
    } finally {
      fs.closeSync(handle);
    }
  }

  function readHeartbeat(
    lock: IEvidenceBenchmarkOperation.ILock,
  ): IHeartbeat | null {
    if (!fs.existsSync(lock.heartbeat)) return null;
    const lines: string[] = fs
      .readFileSync(lock.heartbeat, "utf8")
      .split("\n")
      .filter((line) => line.length !== 0);
    let previous: number = 0;
    let latest: IHeartbeat | null = null;
    for (const [index, line] of lines.entries()) {
      const parsed: unknown = EvidenceBenchmarkJson.parse(
        line,
        `${lock.heartbeat} line ${index + 1}`,
      );
      if (
        !isObject(parsed) ||
        parsed.schemaVersion !== 1 ||
        parsed.runId !== lock.runId ||
        parsed.ownerId !== lock.ownerId ||
        parsed.sequence !== previous + 1 ||
        typeof parsed.atUtc !== "string" ||
        !Number.isFinite(Date.parse(parsed.atUtc))
      )
        throw new Error(`Invalid benchmark heartbeat chain for ${lock.runId}.`);
      previous = parsed.sequence;
      latest = parsed as unknown as IHeartbeat;
    }
    return latest;
  }

  function processExists(pid: number): boolean {
    try {
      process.kill(pid, 0);
      return true;
    } catch (error) {
      return (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "EPERM"
      );
    }
  }

  function syncDirectory(directory: string): void {
    let handle: number | undefined;
    try {
      handle = fs.openSync(directory, "r");
      fs.fsyncSync(handle);
    } catch (error) {
      if (!(
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        (error.code === "EINVAL" ||
          error.code === "ENOTSUP" ||
          error.code === "EPERM")
      ))
        throw error;
    } finally {
      if (handle !== undefined) fs.closeSync(handle);
    }
  }

  function isObject(input: unknown): input is Record<string, unknown> {
    return typeof input === "object" && input !== null && !Array.isArray(input);
  }
}
