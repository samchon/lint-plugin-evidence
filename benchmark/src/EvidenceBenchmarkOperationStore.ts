import fs from "node:fs";
import path from "node:path";

import { EvidenceBenchmarkDurability } from "./EvidenceBenchmarkDurability.ts";
import { EvidenceBenchmarkHash } from "./EvidenceBenchmarkHash.ts";
import { EvidenceBenchmarkJson } from "./EvidenceBenchmarkJson.ts";
import type { IEvidenceBenchmarkOperation } from "./structures/IEvidenceBenchmarkOperation.ts";
import type { IEvidenceBenchmarkOperationAdapter } from "./structures/IEvidenceBenchmarkOperationAdapter.ts";

/** Persists chained state, events, abort requests, and terminal outer seals. */
export namespace EvidenceBenchmarkOperationStore {
  const ZERO_SHA256 = "0".repeat(64);

  /** Initializes one prepared run without overwriting prior operation records. */
  export function initialize(
    cell: IEvidenceBenchmarkOperation.ICell,
    now: Date,
  ): void {
    const directory: string = operations(cell);
    fs.mkdirSync(directory, { recursive: false });
    appendState(cell, {
      schemaVersion: 1,
      sequence: 1,
      runId: cell.runId,
      status: "prepared",
      updatedAtUtc: now.toISOString(),
      controllerPid: null,
      terminalReason: null,
      terminalSubtype: null,
      previousSha256: ZERO_SHA256,
    });
    append(cell, "prepared", {}, now);
    syncDirectory(directory);
  }

  /**
   * Reads the effective durable state.
   *
   * A valid terminal seal wins over a preceding running snapshot so a crash
   * between those two writes remains observable and idempotently recoverable.
   */
  export function readState(
    cell: IEvidenceBenchmarkOperation.ICell,
  ): IEvidenceBenchmarkOperation.IState {
    const state: IEvidenceBenchmarkOperation.IState = readStateLedger(cell);
    const terminal: IEvidenceBenchmarkOperation.ITerminal | null =
      readTerminal(cell);
    if (terminal === null) return state;
    if (
      !["running", terminal.status].includes(state.status) ||
      (state.status === terminal.status &&
        state.terminalReason !== terminal.reason)
    )
      throw new Error(
        `Benchmark terminal seal conflicts with state for ${cell.runId}.`,
      );
    if (state.status === terminal.status) return state;
    const content = {
      schemaVersion: 1 as const,
      sequence: state.sequence + 1,
      runId: cell.runId,
      status: terminal.status,
      updatedAtUtc: terminal.sealedAtUtc,
      controllerPid: null,
      terminalReason: terminal.reason,
      terminalSubtype: terminal.subtype,
      previousSha256: state.stateSha256,
    };
    return {
      ...content,
      stateSha256: EvidenceBenchmarkHash.object(content),
    };
  }

  /** Transitions a run through an explicitly admitted append-only state edge. */
  export function transition(
    cell: IEvidenceBenchmarkOperation.ICell,
    expected: readonly IEvidenceBenchmarkOperation.Status[],
    status: IEvidenceBenchmarkOperation.Status,
    reason: string | null,
    subtype: IEvidenceBenchmarkOperation.TerminalSubtype | null,
    controllerPid: number | null,
    now: Date,
  ): IEvidenceBenchmarkOperation.IState {
    const current: IEvidenceBenchmarkOperation.IState = readStateLedger(cell);
    if (!expected.includes(current.status))
      throw new Error(
        `Benchmark run ${cell.runId} cannot transition ${current.status} -> ${status}.`,
      );
    if (
      (["completed", "failed", "interrupted"].includes(status) &&
        (reason === null || reason.trim().length === 0)) ||
      (!["completed", "failed", "interrupted"].includes(status) &&
        (reason !== null || subtype !== null)) ||
      (["completed", "failed", "interrupted"].includes(status) &&
        !validTerminalSubtype(status, subtype)) ||
      (status === "running" &&
        (!Number.isInteger(controllerPid) || controllerPid! < 1)) ||
      (status !== "running" && controllerPid !== null)
    )
      throw new Error(
        `Benchmark state payload is invalid for ${cell.runId}/${status}.`,
      );
    const next = {
      schemaVersion: 1 as const,
      sequence: current.sequence + 1,
      runId: cell.runId,
      status,
      updatedAtUtc: now.toISOString(),
      controllerPid,
      terminalReason: reason,
      terminalSubtype: subtype,
      previousSha256: current.stateSha256,
    };
    return appendState(cell, next);
  }

  /** Appends one fsynced hash-chained orchestration event. */
  export function append(
    cell: IEvidenceBenchmarkOperation.ICell,
    kind: IEvidenceBenchmarkOperation.IEvent["kind"],
    detail: Readonly<Record<string, unknown>>,
    now: Date,
  ): IEvidenceBenchmarkOperation.IEvent {
    const existing: IEvidenceBenchmarkOperation.IEvent[] = readEvents(cell);
    const previous: IEvidenceBenchmarkOperation.IEvent | undefined =
      existing[existing.length - 1];
    const content = {
      sequence: (previous?.sequence ?? 0) + 1,
      runId: cell.runId,
      atUtc: now.toISOString(),
      previousSha256: previous?.eventSha256 ?? ZERO_SHA256,
      kind,
      detail,
    };
    const event: IEvidenceBenchmarkOperation.IEvent = {
      ...content,
      eventSha256: EvidenceBenchmarkHash.object(content),
    };
    appendLine(eventsPath(cell), event);
    return event;
  }

  /** Writes a cooperative abort request exactly once and fsyncs its directory. */
  export function requestAbort(
    cell: IEvidenceBenchmarkOperation.ICell,
    reason: string,
    subtype: IEvidenceBenchmarkOperation.IAbortRequest["subtype"],
    blockStopSha256: string | null,
    now: Date,
  ): IEvidenceBenchmarkOperation.IAbortRequest {
    const normalized: string = reason.trim();
    if (normalized.length === 0)
      throw new Error("Benchmark abort reason must not be empty.");
    const request: IEvidenceBenchmarkOperation.IAbortRequest = {
      schemaVersion: 1,
      runId: cell.runId,
      reason: normalized,
      subtype,
      blockStopSha256,
      requestedAtUtc: now.toISOString(),
    };
    const location: string = abortPath(cell, subtype);
    if (fs.existsSync(location)) {
      const existing: unknown = EvidenceBenchmarkJson.parse(
        fs.readFileSync(location, "utf8"),
        location,
      );
      if (
        isObject(existing) &&
        existing.schemaVersion === 1 &&
        existing.runId === request.runId &&
        existing.reason === request.reason &&
        existing.subtype === request.subtype &&
        existing.blockStopSha256 === request.blockStopSha256 &&
        typeof existing.requestedAtUtc === "string"
      )
        return existing as unknown as IEvidenceBenchmarkOperation.IAbortRequest;
      throw new Error(
        `Benchmark abort request already exists with different bytes: ${cell.runId}/${subtype}.`,
      );
    }
    EvidenceBenchmarkDurability.writeOnce(
      location,
      `${JSON.stringify(request, null, 2)}\n`,
    );
    return request;
  }

  /** Reads a pending abort request, returning null before one exists. */
  export function readAbort(
    cell: IEvidenceBenchmarkOperation.ICell,
  ): IEvidenceBenchmarkOperation.IAbortRequest | null {
    const location: string = fs.existsSync(abortPath(cell, "safety_limit"))
      ? abortPath(cell, "safety_limit")
      : abortPath(cell, "operator_abort");
    if (!fs.existsSync(location)) return null;
    const parsed: unknown = EvidenceBenchmarkJson.parse(
      fs.readFileSync(location, "utf8"),
      location,
    );
    if (
      !isObject(parsed) ||
      parsed.schemaVersion !== 1 ||
      parsed.runId !== cell.runId ||
      typeof parsed.reason !== "string" ||
      parsed.reason.trim().length === 0 ||
      typeof parsed.subtype !== "string" ||
      !["operator_abort", "liveness_loss", "safety_limit"].includes(
        parsed.subtype,
      ) ||
      !(
        ((parsed.subtype === "operator_abort" ||
          parsed.subtype === "liveness_loss") &&
          parsed.blockStopSha256 === null) ||
        (parsed.subtype === "safety_limit" &&
          typeof parsed.blockStopSha256 === "string" &&
          /^[0-9a-f]{64}$/i.test(parsed.blockStopSha256))
      ) ||
      typeof parsed.requestedAtUtc !== "string" ||
      !Number.isFinite(Date.parse(parsed.requestedAtUtc))
    )
      throw new Error(`Invalid abort request for ${cell.runId}.`);
    return parsed as unknown as IEvidenceBenchmarkOperation.IAbortRequest;
  }

  /**
   * Seals one terminal result idempotently and advances the state ledger.
   *
   * The runner record must remain inside its cell and its terminal checkpoint
   * must agree with the facade result before the outer record can close.
   */
  export function seal(
    cell: IEvidenceBenchmarkOperation.ICell,
    result: IEvidenceBenchmarkOperationAdapter.ITerminalResult,
    now: Date,
  ): IEvidenceBenchmarkOperation.ITerminal {
    validateRunnerResult(cell, result);
    const terminal: IEvidenceBenchmarkOperation.ITerminal = {
      schemaVersion: 1,
      runId: cell.runId,
      status: result.status,
      reason: result.reason,
      subtype: result.subtype,
      sealedAtUtc: now.toISOString(),
      runnerRecord: path.resolve(result.runnerRecord),
      runnerTerminal: path.resolve(result.runnerTerminal),
      runnerTerminalSha256: EvidenceBenchmarkHash.file(result.runnerTerminal),
      blockStopSha256: result.blockStopSha256,
    };
    const existing: IEvidenceBenchmarkOperation.ITerminal | null =
      readTerminal(cell);
    if (existing === null) {
      EvidenceBenchmarkDurability.writeOnce(
        terminalPath(cell),
        `${JSON.stringify(terminal, null, 2)}\n`,
      );
    } else if (
      existing.status !== terminal.status ||
      existing.reason !== terminal.reason ||
      existing.subtype !== terminal.subtype ||
      existing.runnerRecord !== terminal.runnerRecord ||
      existing.runnerTerminal !== terminal.runnerTerminal ||
      existing.runnerTerminalSha256 !== terminal.runnerTerminalSha256 ||
      existing.blockStopSha256 !== terminal.blockStopSha256
    )
      throw new Error(
        `Benchmark terminal reseal conflicts with ${cell.runId}.`,
      );
    const current: IEvidenceBenchmarkOperation.IState = readStateLedger(cell);
    if (current.status === "running")
      transition(
        cell,
        ["running"],
        result.status,
        result.reason,
        result.subtype,
        null,
        new Date(existing?.sealedAtUtc ?? terminal.sealedAtUtc),
      );
    else if (
      current.status !== result.status ||
      current.terminalReason !== result.reason ||
      current.terminalSubtype !== result.subtype
    )
      throw new Error(`Benchmark terminal state conflicts with ${cell.runId}.`);
    if (existing === null)
      append(
        cell,
        "terminal-sealed",
        { status: result.status, reason: result.reason },
        now,
      );
    return existing ?? terminal;
  }

  /** Reads and validates an outer terminal seal when one exists. */
  export function readTerminal(
    cell: IEvidenceBenchmarkOperation.ICell,
  ): IEvidenceBenchmarkOperation.ITerminal | null {
    const location: string = terminalPath(cell);
    if (!fs.existsSync(location)) return null;
    const parsed: unknown = EvidenceBenchmarkJson.parse(
      fs.readFileSync(location, "utf8"),
      location,
    );
    if (
      !isObject(parsed) ||
      parsed.schemaVersion !== 1 ||
      parsed.runId !== cell.runId ||
      typeof parsed.status !== "string" ||
      !["completed", "failed", "interrupted"].includes(parsed.status) ||
      typeof parsed.reason !== "string" ||
      parsed.reason.trim().length === 0 ||
      typeof parsed.subtype !== "string" ||
      ![
        "completed",
        "runner_failure",
        "integrity_failure",
        "operator_abort",
        "liveness_loss",
        "safety_limit",
      ].includes(parsed.subtype) ||
      !validTerminalSubtype(
        parsed.status as IEvidenceBenchmarkOperation.ITerminal["status"],
        parsed.subtype as IEvidenceBenchmarkOperation.TerminalSubtype,
      ) ||
      typeof parsed.sealedAtUtc !== "string" ||
      !Number.isFinite(Date.parse(parsed.sealedAtUtc)) ||
      typeof parsed.runnerRecord !== "string" ||
      typeof parsed.runnerTerminal !== "string" ||
      typeof parsed.runnerTerminalSha256 !== "string" ||
      !/^[0-9a-f]{64}$/i.test(parsed.runnerTerminalSha256) ||
      !(
        (parsed.subtype === "safety_limit" &&
          typeof parsed.blockStopSha256 === "string" &&
          /^[0-9a-f]{64}$/i.test(parsed.blockStopSha256)) ||
        (parsed.subtype !== "safety_limit" && parsed.blockStopSha256 === null)
      )
    )
      throw new Error(`Invalid benchmark terminal seal for ${cell.runId}.`);
    const terminal = parsed as unknown as IEvidenceBenchmarkOperation.ITerminal;
    validateContained(cell.root, terminal.runnerRecord, "runner record");
    validateContained(
      terminal.runnerRecord,
      terminal.runnerTerminal,
      "runner terminal",
    );
    if (
      !fs.existsSync(terminal.runnerTerminal) ||
      EvidenceBenchmarkHash.file(terminal.runnerTerminal) !==
        terminal.runnerTerminalSha256
    )
      throw new Error(
        `Benchmark runner terminal drifted after sealing: ${cell.runId}.`,
      );
    return terminal;
  }

  /** Returns the operation directory inside one materialized cell root. */
  export function operations(cell: IEvidenceBenchmarkOperation.ICell): string {
    return path.join(cell.root, "operations");
  }

  /** Returns the exclusive controller lock path for one run. */
  export function lockPath(cell: IEvidenceBenchmarkOperation.ICell): string {
    return path.join(operations(cell), "controller.lock.json");
  }

  /** Returns the immutable terminal outer-seal path for one run. */
  export function terminalPath(
    cell: IEvidenceBenchmarkOperation.ICell,
  ): string {
    return path.join(operations(cell), "terminal.json");
  }

  function statePath(cell: IEvidenceBenchmarkOperation.ICell): string {
    return path.join(operations(cell), "state.jsonl");
  }

  function eventsPath(cell: IEvidenceBenchmarkOperation.ICell): string {
    return path.join(operations(cell), "events.jsonl");
  }

  function abortPath(
    cell: IEvidenceBenchmarkOperation.ICell,
    subtype: IEvidenceBenchmarkOperation.IAbortRequest["subtype"],
  ): string {
    return path.join(
      operations(cell),
      subtype === "safety_limit"
        ? "safety-abort-request.json"
        : "abort-request.json",
    );
  }

  function appendState(
    cell: IEvidenceBenchmarkOperation.ICell,
    content: Omit<IEvidenceBenchmarkOperation.IState, "stateSha256">,
  ): IEvidenceBenchmarkOperation.IState {
    const state: IEvidenceBenchmarkOperation.IState = {
      ...content,
      stateSha256: EvidenceBenchmarkHash.object(content),
    };
    appendLine(statePath(cell), state);
    return state;
  }

  function readStateLedger(
    cell: IEvidenceBenchmarkOperation.ICell,
  ): IEvidenceBenchmarkOperation.IState {
    const states: IEvidenceBenchmarkOperation.IState[] = readLines(
      statePath(cell),
    ) as IEvidenceBenchmarkOperation.IState[];
    if (states.length === 0)
      throw new Error(`Benchmark state ledger is empty: ${cell.runId}.`);
    let previous: string = ZERO_SHA256;
    for (const [index, state] of states.entries()) {
      const { stateSha256, ...content } = state;
      if (
        state.schemaVersion !== 1 ||
        state.sequence !== index + 1 ||
        state.runId !== cell.runId ||
        !["prepared", "running", "completed", "failed", "interrupted"].includes(
          state.status,
        ) ||
        typeof state.updatedAtUtc !== "string" ||
        !Number.isFinite(Date.parse(state.updatedAtUtc)) ||
        state.previousSha256 !== previous ||
        !/^[0-9a-f]{64}$/i.test(stateSha256) ||
        EvidenceBenchmarkHash.object(content) !== stateSha256 ||
        !validStatePayload(state)
      )
        throw new Error(
          `Invalid benchmark state chain at ${cell.runId}#${index + 1}.`,
        );
      previous = stateSha256;
    }
    return states[states.length - 1]!;
  }

  function readEvents(
    cell: IEvidenceBenchmarkOperation.ICell,
  ): IEvidenceBenchmarkOperation.IEvent[] {
    const location: string = eventsPath(cell);
    if (!fs.existsSync(location)) return [];
    const events: IEvidenceBenchmarkOperation.IEvent[] = readLines(
      location,
    ) as IEvidenceBenchmarkOperation.IEvent[];
    let previous: string = ZERO_SHA256;
    for (const [index, event] of events.entries()) {
      const { eventSha256, ...content } = event;
      if (
        event.sequence !== index + 1 ||
        event.runId !== cell.runId ||
        typeof event.atUtc !== "string" ||
        !Number.isFinite(Date.parse(event.atUtc)) ||
        event.previousSha256 !== previous ||
        typeof event.kind !== "string" ||
        ![
          "prepared",
          "lock-acquired",
          "started",
          "abort-requested",
          "terminal-sealed",
          "lock-released",
          "stale-lock-taken-over",
        ].includes(event.kind) ||
        !isObject(event.detail) ||
        EvidenceBenchmarkHash.object(content) !== eventSha256
      )
        throw new Error(
          `Invalid benchmark event chain at ${cell.runId}#${index + 1}.`,
        );
      previous = eventSha256;
    }
    return events;
  }

  function validateRunnerResult(
    cell: IEvidenceBenchmarkOperation.ICell,
    result: IEvidenceBenchmarkOperationAdapter.ITerminalResult,
  ): void {
    if (
      !["completed", "failed", "interrupted"].includes(result.status) ||
      result.reason.trim().length === 0 ||
      !validTerminalSubtype(result.status, result.subtype) ||
      !(
        (result.subtype === "safety_limit" &&
          typeof result.blockStopSha256 === "string" &&
          /^[0-9a-f]{64}$/i.test(result.blockStopSha256)) ||
        (result.subtype !== "safety_limit" && result.blockStopSha256 === null)
      )
    )
      throw new Error(`Runner returned an invalid terminal for ${cell.runId}.`);
    validateContained(cell.root, result.runnerRecord, "runner record");
    validateContained(
      result.runnerRecord,
      result.runnerTerminal,
      "runner terminal",
    );
    if (
      !fs.existsSync(result.runnerTerminal) ||
      !fs.statSync(result.runnerTerminal).isFile()
    )
      throw new Error(
        `Runner terminal summary is missing for ${cell.runId}: ${result.runnerTerminal}.`,
      );
    const parsed: unknown = EvidenceBenchmarkJson.parse(
      fs.readFileSync(result.runnerTerminal, "utf8"),
      result.runnerTerminal,
    );
    if (
      !isObject(parsed) ||
      parsed.status !== result.status ||
      (parsed.phase !== undefined && parsed.phase !== "terminal") ||
      (isObject(parsed.terminal) &&
        typeof parsed.terminal.reason === "string" &&
        parsed.terminal.reason !== result.reason) ||
      (isObject(parsed.terminal) &&
        typeof parsed.terminal.subtype === "string" &&
        parsed.terminal.subtype !== result.subtype) ||
      (isObject(parsed.terminal) &&
        typeof parsed.terminal.blockStopSha256 === "string" &&
        parsed.terminal.blockStopSha256 !== result.blockStopSha256) ||
      (typeof parsed.runId === "string" && parsed.runId !== cell.runId)
    )
      throw new Error(`Runner terminal summary disagrees with ${cell.runId}.`);
  }

  function validStatePayload(
    state: IEvidenceBenchmarkOperation.IState,
  ): boolean {
    const terminal: boolean = ["completed", "failed", "interrupted"].includes(
      state.status,
    );
    return (
      (state.status === "running"
        ? Number.isInteger(state.controllerPid) && state.controllerPid! > 0
        : state.controllerPid === null) &&
      (terminal
        ? typeof state.terminalReason === "string" &&
          state.terminalReason.trim().length !== 0 &&
          validTerminalSubtype(state.status, state.terminalSubtype)
        : state.terminalReason === null && state.terminalSubtype === null)
    );
  }

  function validTerminalSubtype(
    status: IEvidenceBenchmarkOperation.Status,
    subtype: IEvidenceBenchmarkOperation.TerminalSubtype | null,
  ): boolean {
    if (status === "completed") return subtype === "completed";
    if (status === "failed")
      return subtype === "runner_failure" || subtype === "integrity_failure";
    if (status === "interrupted")
      return (
        subtype === "operator_abort" ||
        subtype === "liveness_loss" ||
        subtype === "safety_limit"
      );
    return subtype === null;
  }

  function validateContained(
    owner: string,
    candidate: string,
    label: string,
  ): void {
    if (!path.isAbsolute(candidate))
      throw new Error(`Benchmark ${label} must be absolute: ${candidate}.`);
    const relation: string = path.relative(
      path.resolve(owner),
      path.resolve(candidate),
    );
    if (
      relation.length === 0 &&
      path.resolve(owner) !== path.resolve(candidate)
    )
      throw new Error(`Benchmark ${label} containment is ambiguous.`);
    if (
      relation === ".." ||
      relation.startsWith(`..${path.sep}`) ||
      path.isAbsolute(relation)
    )
      throw new Error(
        `Benchmark ${label} escapes its owned directory: ${candidate}.`,
      );
  }

  function appendLine(location: string, value: unknown): void {
    const handle: number = fs.openSync(location, "a");
    try {
      fs.writeSync(handle, `${JSON.stringify(value)}\n`, undefined, "utf8");
      fs.fsyncSync(handle);
    } finally {
      fs.closeSync(handle);
    }
    syncDirectory(path.dirname(location));
  }

  function readLines(location: string): unknown[] {
    return fs
      .readFileSync(location, "utf8")
      .split("\n")
      .filter((line) => line.length !== 0)
      .map((line, index) =>
        EvidenceBenchmarkJson.parse(line, `${location} line ${index + 1}`),
      );
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
