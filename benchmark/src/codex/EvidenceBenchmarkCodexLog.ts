import fs from "node:fs";
import path from "node:path";

import type { IEvidenceBenchmarkCodexRecord } from "../structures/IEvidenceBenchmarkCodexRecord.ts";
import { EvidenceBenchmarkCodexCheckpoint } from "./EvidenceBenchmarkCodexCheckpoint.ts";
import { EvidenceBenchmarkCodexValue } from "./EvidenceBenchmarkCodexValue.ts";

/**
 * Backpressure-aware append-only byte and semantic ledgers for one app-server
 * process lineage.
 */
export class EvidenceBenchmarkCodexLog {
  private readonly runId: string;
  private readonly logsDirectory: string;
  private readonly envelopePath: string;
  private readonly runnerEventPath: string;
  private readonly rawPaths: Record<
    IEvidenceBenchmarkCodexRecord.Direction,
    string
  >;
  private readonly offsets: Record<
    IEvidenceBenchmarkCodexRecord.Direction,
    number
  > = { client: 0, server: 0, stderr: 0 };
  private envelopeSequence: number;
  private runnerEventSequence: number = 0;
  private previousEventSha256: string = "0".repeat(64);
  private operation: Promise<void> = Promise.resolve();

  /**
   * Creates a writer whose sequence continues from a recovered checkpoint.
   *
   * @param outputDirectory Absolute run record directory.
   * @param recoveredSequence Last committed transport sequence, or zero.
   */
  public constructor(
    outputDirectory: string,
    recoveredSequence: number,
    runId: string = path.basename(outputDirectory),
  ) {
    this.runId = runId;
    this.logsDirectory = path.join(outputDirectory, "logs");
    this.envelopePath = path.join(
      this.logsDirectory,
      "transport.envelopes.jsonl",
    );
    this.runnerEventPath = path.join(this.logsDirectory, "runner.events.jsonl");
    this.rawPaths = {
      client: path.join(this.logsDirectory, "client.raw.jsonl"),
      server: path.join(this.logsDirectory, "server.raw.jsonl"),
      stderr: path.join(this.logsDirectory, "stderr.raw.log"),
    };
    this.envelopeSequence = recoveredSequence;
  }

  /** Initializes directories and existing-file offsets before streams attach. */
  public async open(): Promise<void> {
    await fs.promises.mkdir(this.logsDirectory, { recursive: true });
    for (const direction of ["client", "server", "stderr"] as const) {
      const stat = await fs.promises
        .stat(this.rawPaths[direction])
        .catch((error: unknown): undefined => {
          if (
            EvidenceBenchmarkCodexValue.isRecord(error) &&
            error.code === "ENOENT"
          )
            return undefined;
          throw error;
        });
      this.offsets[direction] = stat?.size ?? 0;
    }
    await this.restoreRunnerEventChain();
  }

  /**
   * Persists exact bytes before appending their independently verifiable
   * envelope.
   */
  public async recordRaw(
    direction: IEvidenceBenchmarkCodexRecord.Direction,
    chunk: Uint8Array,
  ): Promise<IEvidenceBenchmarkCodexRecord.IEnvelope> {
    let resolveEnvelope:
      ((value: IEvidenceBenchmarkCodexRecord.IEnvelope) => void) | undefined;
    let rejectEnvelope: ((reason: unknown) => void) | undefined;
    const result = new Promise<IEvidenceBenchmarkCodexRecord.IEnvelope>(
      (resolve, reject): void => {
        resolveEnvelope = resolve;
        rejectEnvelope = reject;
      },
    );
    this.operation = this.operation.then(async (): Promise<void> => {
      const bytes = Buffer.from(chunk);
      const envelope: IEvidenceBenchmarkCodexRecord.IEnvelope = {
        sequence: ++this.envelopeSequence,
        direction,
        receivedAtUtc: new Date().toISOString(),
        monotonicNanoseconds: process.hrtime.bigint().toString(),
        rawFile: path.basename(this.rawPaths[direction]),
        byteOffset: this.offsets[direction],
        byteLength: bytes.length,
        sha256: EvidenceBenchmarkCodexValue.sha256(bytes),
      };
      const raw = await fs.promises.open(this.rawPaths[direction], "a");
      try {
        await raw.write(bytes);
        await raw.sync();
      } finally {
        await raw.close();
      }
      this.offsets[direction] += bytes.length;
      await EvidenceBenchmarkCodexCheckpoint.append(
        this.envelopePath,
        envelope,
      );
      resolveEnvelope?.(envelope);
    });
    this.operation.catch((error: unknown): void => rejectEnvelope?.(error));
    return result;
  }

  /** Appends a machine-readable controller event beside the raw transport. */
  public async recordEvent(
    type: string,
    payload: Readonly<Record<string, unknown>>,
    context: EvidenceBenchmarkCodexLog.IEventContext = {},
  ): Promise<IEvidenceBenchmarkCodexRecord.IRunnerEvent> {
    let resolveEvent:
      ((value: IEvidenceBenchmarkCodexRecord.IRunnerEvent) => void) | undefined;
    let rejectEvent: ((reason: unknown) => void) | undefined;
    const result = new Promise<IEvidenceBenchmarkCodexRecord.IRunnerEvent>(
      (resolve, reject): void => {
        resolveEvent = resolve;
        rejectEvent = reject;
      },
    );
    this.operation = this.operation.then(async (): Promise<void> => {
      const unsigned = {
        runId: this.runId,
        seq: ++this.runnerEventSequence,
        utc: new Date().toISOString(),
        monotonicNs: process.hrtime.bigint().toString(),
        phase: context.phase ?? ("agent" as const),
        actor: context.actor ?? ("runner" as const),
        type,
        payload,
        rawRef: context.rawRef ?? null,
        previousEventSha256: this.previousEventSha256,
      };
      const event: IEvidenceBenchmarkCodexRecord.IRunnerEvent = {
        ...unsigned,
        eventSha256: EvidenceBenchmarkCodexValue.sha256(
          EvidenceBenchmarkCodexValue.canonicalJson(unsigned),
        ),
      };
      await EvidenceBenchmarkCodexCheckpoint.append(
        this.runnerEventPath,
        event,
      );
      this.previousEventSha256 = event.eventSha256;
      resolveEvent?.(event);
    });
    this.operation.catch((error: unknown): void => rejectEvent?.(error));
    return result;
  }

  /** Waits until every queued byte, envelope, and semantic event is durable. */
  public async flush(): Promise<void> {
    await this.operation;
  }

  /** Returns the last allocated raw transport sequence for checkpointing. */
  public lastEnvelopeSequence(): number {
    return this.envelopeSequence;
  }

  /** Returns an absolute raw stream path for parsing and final reconciliation. */
  public rawPath(direction: IEvidenceBenchmarkCodexRecord.Direction): string {
    return this.rawPaths[direction];
  }

  private async restoreRunnerEventChain(): Promise<void> {
    let source: string;
    try {
      source = await fs.promises.readFile(this.runnerEventPath, "utf8");
    } catch (error) {
      if (
        EvidenceBenchmarkCodexValue.isRecord(error) &&
        error.code === "ENOENT"
      )
        return;
      throw error;
    }
    const lines = source.split("\n");
    if (lines[lines.length - 1] !== "")
      throw new Error("runner event ledger has an incomplete trailing line");
    let previous = "0".repeat(64);
    let sequence = 0;
    for (const line of lines.slice(0, -1)) {
      if (line.trim().length === 0) continue;
      const parsed: unknown = JSON.parse(line);
      if (!EvidenceBenchmarkCodexValue.isRecord(parsed))
        throw new Error("runner event must be a JSON object");
      if (parsed.runId !== this.runId)
        throw new Error("runner event runId does not match the resumed run");
      if (parsed.seq !== ++sequence)
        throw new Error(`runner event sequence breaks at ${sequence}`);
      if (parsed.previousEventSha256 !== previous)
        throw new Error(`runner event hash chain breaks at ${sequence}`);
      const eventSha256 = EvidenceBenchmarkCodexValue.string(
        parsed.eventSha256,
        `runner event ${sequence}.eventSha256`,
      );
      const { eventSha256: _ignored, ...unsigned } = parsed;
      const expected = EvidenceBenchmarkCodexValue.sha256(
        EvidenceBenchmarkCodexValue.canonicalJson(unsigned),
      );
      if (eventSha256 !== expected)
        throw new Error(`runner event hash is invalid at ${sequence}`);
      previous = eventSha256;
    }
    this.runnerEventSequence = sequence;
    this.previousEventSha256 = previous;
  }
}

/** Event context accepted by {@link EvidenceBenchmarkCodexLog.recordEvent}. */
export namespace EvidenceBenchmarkCodexLog {
  /** Optional semantic metadata layered over one append-only event. */
  export interface IEventContext {
    /** Measurement phase; defaults to agent work. */
    phase?: IEvidenceBenchmarkCodexRecord.Phase;

    /** Event producer; defaults to the runner. */
    actor?: IEvidenceBenchmarkCodexRecord.Actor;

    /** Exact raw byte reference when the event derives from transport input. */
    rawRef?: IEvidenceBenchmarkCodexRecord.IRawReference;
  }
}
