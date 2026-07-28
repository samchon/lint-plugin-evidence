import fs from "node:fs";
import path from "node:path";

import type { IEvidenceBenchmarkCodexRecord } from "../structures/IEvidenceBenchmarkCodexRecord.ts";
import type { IEvidenceBenchmarkCodexRun } from "../structures/IEvidenceBenchmarkCodexRun.ts";
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
  private readonly orphanManifestPath: string;
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
    this.orphanManifestPath = path.join(
      this.logsDirectory,
      "orphan.segments.jsonl",
    );
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
    const orphanSegments = await this.restoreTransportLedger();
    await this.restoreRunnerEventChain();
    for (const segment of orphanSegments)
      await this.recordEvent(
        "raw_orphan_preserved",
        { orphanRef: segment },
        { phase: "reconciliation", actor: "auditor" },
      );
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
      if (context.rawRef !== undefined)
        await this.validateRawReference(context.rawRef);
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
      EvidenceBenchmarkCodexLog.validateRunnerEvent(event);
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

  /** Snapshots exact byte and hash heads after flushing every queued append. */
  public async streamHeads(): Promise<IEvidenceBenchmarkCodexRun.IStreamHeads> {
    await this.flush();
    const read = async (target: string): Promise<Buffer> =>
      fs.promises.readFile(target).catch((error: unknown): Buffer => {
        if (
          EvidenceBenchmarkCodexValue.isRecord(error) &&
          error.code === "ENOENT"
        )
          return Buffer.alloc(0);
        throw error;
      });
    const [client, server, stderr, envelope, event] = await Promise.all([
      read(this.rawPaths.client),
      read(this.rawPaths.server),
      read(this.rawPaths.stderr),
      read(this.envelopePath),
      read(this.runnerEventPath),
    ]);
    return {
      raw: {
        client: {
          byteLength: client.length,
          sha256: EvidenceBenchmarkCodexValue.sha256(client),
        },
        server: {
          byteLength: server.length,
          sha256: EvidenceBenchmarkCodexValue.sha256(server),
        },
        stderr: {
          byteLength: stderr.length,
          sha256: EvidenceBenchmarkCodexValue.sha256(stderr),
        },
      },
      envelope: {
        lastSequence: this.envelopeSequence,
        byteLength: envelope.length,
        sha256: EvidenceBenchmarkCodexValue.sha256(envelope),
      },
      event: {
        lastSequence: this.runnerEventSequence,
        lastEventSha256: this.previousEventSha256,
        byteLength: event.length,
        sha256: EvidenceBenchmarkCodexValue.sha256(event),
      },
    };
  }

  /** Returns every crash-tail segment preserved across this run lineage. */
  public async orphanSegments(): Promise<
    IEvidenceBenchmarkCodexRecord.IOrphanSegment[]
  > {
    let source = "";
    try {
      source = await fs.promises.readFile(this.orphanManifestPath, "utf8");
    } catch (error) {
      if (
        EvidenceBenchmarkCodexValue.isRecord(error) &&
        error.code === "ENOENT"
      )
        return [];
      throw error;
    }
    if (source.length !== 0 && !source.endsWith("\n"))
      throw new Error("orphan segment ledger has an incomplete tail");
    return source
      .split("\n")
      .slice(0, -1)
      .filter((line): boolean => line.trim().length !== 0)
      .map(
        (line): IEvidenceBenchmarkCodexRecord.IOrphanSegment =>
          JSON.parse(line) as IEvidenceBenchmarkCodexRecord.IOrphanSegment,
      );
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
      EvidenceBenchmarkCodexLog.validateRunnerEvent(parsed);
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
      if (parsed.rawRef !== null)
        await this.validateRawReference(
          parsed.rawRef as unknown as IEvidenceBenchmarkCodexRecord.IRawReference,
        );
      previous = eventSha256;
    }
    this.runnerEventSequence = sequence;
    this.previousEventSha256 = previous;
  }

  private async restoreTransportLedger(): Promise<
    IEvidenceBenchmarkCodexRecord.IOrphanSegment[]
  > {
    const existingOrphans = await this.orphanSegments();
    const recoveredSequence = this.envelopeSequence;
    let source = "";
    try {
      source = await fs.promises.readFile(this.envelopePath, "utf8");
    } catch (error) {
      if (
        !EvidenceBenchmarkCodexValue.isRecord(error) ||
        error.code !== "ENOENT"
      )
        throw error;
    }
    if (source.length !== 0 && !source.endsWith("\n"))
      throw new Error("transport envelope ledger has an incomplete tail");
    const expectedOffsets: Record<
      IEvidenceBenchmarkCodexRecord.Direction,
      number
    > = { client: 0, server: 0, stderr: 0 };
    const rawBuffers = Object.fromEntries(
      await Promise.all(
        (["client", "server", "stderr"] as const).map(
          async (direction): Promise<[string, Buffer]> => [
            direction,
            await fs.promises
              .readFile(this.rawPaths[direction])
              .catch((error: unknown): Buffer => {
                if (
                  EvidenceBenchmarkCodexValue.isRecord(error) &&
                  error.code === "ENOENT"
                )
                  return Buffer.alloc(0);
                throw error;
              }),
          ],
        ),
      ),
    ) as Record<IEvidenceBenchmarkCodexRecord.Direction, Buffer>;
    let sequence = 0;
    for (const line of source.split("\n").slice(0, -1)) {
      if (line.trim().length === 0) continue;
      const input: unknown = JSON.parse(line);
      if (!EvidenceBenchmarkCodexValue.isRecord(input))
        throw new Error("transport envelope must be an object");
      const direction = input.direction;
      if (
        direction !== "client" &&
        direction !== "server" &&
        direction !== "stderr"
      )
        throw new Error("transport envelope direction is invalid");
      const envelope =
        input as unknown as IEvidenceBenchmarkCodexRecord.IEnvelope;
      if (
        envelope.sequence !== ++sequence ||
        envelope.rawFile !== path.basename(this.rawPaths[direction]) ||
        envelope.byteOffset !== expectedOffsets[direction] ||
        !Number.isSafeInteger(envelope.byteLength) ||
        envelope.byteLength < 0 ||
        typeof envelope.sha256 !== "string" ||
        envelope.sha256.length !== 64
      )
        throw new Error(
          `transport envelope is invalid at sequence ${sequence}`,
        );
      expectedOffsets[direction] += envelope.byteLength;
      const raw = rawBuffers[direction];
      const bytes = raw.subarray(
        envelope.byteOffset,
        envelope.byteOffset + envelope.byteLength,
      );
      if (
        bytes.length !== envelope.byteLength ||
        EvidenceBenchmarkCodexValue.sha256(bytes) !== envelope.sha256
      )
        throw new Error(
          `transport raw bytes do not match envelope ${sequence}`,
        );
    }
    if (recoveredSequence > sequence)
      throw new Error(
        `checkpoint sequence ${recoveredSequence} exceeds durable envelope ${sequence}`,
      );
    const orphanSegments: IEvidenceBenchmarkCodexRecord.IOrphanSegment[] = [];
    for (const direction of ["client", "server", "stderr"] as const) {
      const target = this.rawPaths[direction];
      const size = rawBuffers[direction].length;
      if (size < expectedOffsets[direction])
        throw new Error(`${direction} raw stream is shorter than its ledger`);
      const orphanBytes = size - expectedOffsets[direction];
      if (orphanBytes !== 0) {
        const bytes = rawBuffers[direction].subarray(
          expectedOffsets[direction],
        );
        const sha256 = EvidenceBenchmarkCodexValue.sha256(bytes);
        const preservedPath = path
          .join(
            "orphans",
            `${direction}.${expectedOffsets[direction]}.${sha256}.bin`,
          )
          .split(path.sep)
          .join("/");
        const preservedTarget = path.join(
          this.logsDirectory,
          ...preservedPath.split("/"),
        );
        await fs.promises.mkdir(path.dirname(preservedTarget), {
          recursive: true,
        });
        const existingBytes = await fs.promises
          .readFile(preservedTarget)
          .catch((error: unknown): Buffer | undefined => {
            if (
              EvidenceBenchmarkCodexValue.isRecord(error) &&
              error.code === "ENOENT"
            )
              return undefined;
            throw error;
          });
        if (existingBytes === undefined) {
          const handle = await fs.promises.open(preservedTarget, "wx");
          try {
            await handle.writeFile(bytes);
            await handle.sync();
          } finally {
            await handle.close();
          }
        } else if (EvidenceBenchmarkCodexValue.sha256(existingBytes) !== sha256)
          throw new Error("preserved orphan segment bytes changed");
        const segment: IEvidenceBenchmarkCodexRecord.IOrphanSegment = {
          direction,
          sourcePath: path.basename(target),
          byteOffset: expectedOffsets[direction],
          byteLength: bytes.length,
          sha256,
          preservedPath,
          capturedAtUtc: new Date().toISOString(),
        };
        const alreadyRecorded = existingOrphans.some(
          (existing): boolean =>
            existing.direction === segment.direction &&
            existing.byteOffset === segment.byteOffset &&
            existing.byteLength === segment.byteLength &&
            existing.sha256 === segment.sha256 &&
            existing.preservedPath === segment.preservedPath,
        );
        if (!alreadyRecorded) {
          await EvidenceBenchmarkCodexCheckpoint.append(
            this.orphanManifestPath,
            segment,
          );
        }
        orphanSegments.push(segment);
        await fs.promises.truncate(target, expectedOffsets[direction]);
      }
      this.offsets[direction] = expectedOffsets[direction];
    }
    this.envelopeSequence = sequence;
    return orphanSegments;
  }

  private async validateRawReference(
    reference: IEvidenceBenchmarkCodexRecord.IRawReference,
  ): Promise<void> {
    if (
      reference.direction !== "client" &&
      reference.direction !== "server" &&
      reference.direction !== "stderr"
    )
      throw new Error("runner event rawRef direction is invalid");
    const expectedPath = path.basename(this.rawPaths[reference.direction]);
    if (
      reference.path !== expectedPath ||
      !Number.isSafeInteger(reference.byteOffset) ||
      reference.byteOffset < 0 ||
      !Number.isSafeInteger(reference.byteLength) ||
      reference.byteLength < 0 ||
      typeof reference.sha256 !== "string" ||
      reference.sha256.length !== 64
    )
      throw new Error("runner event rawRef is invalid");
    const raw = await fs.promises.readFile(this.rawPaths[reference.direction]);
    const bytes = raw.subarray(
      reference.byteOffset,
      reference.byteOffset + reference.byteLength,
    );
    if (
      bytes.length !== reference.byteLength ||
      EvidenceBenchmarkCodexValue.sha256(bytes) !== reference.sha256
    )
      throw new Error("runner event rawRef does not match exact raw bytes");
  }

  private static validateRunnerEvent(input: unknown): void {
    if (!EvidenceBenchmarkCodexValue.isRecord(input))
      throw new Error("runner event must be an object");
    const expectedKeys = [
      "actor",
      "eventSha256",
      "monotonicNs",
      "payload",
      "phase",
      "previousEventSha256",
      "rawRef",
      "runId",
      "seq",
      "type",
      "utc",
    ];
    if (
      EvidenceBenchmarkCodexValue.canonicalJson(Object.keys(input).sort()) !==
      EvidenceBenchmarkCodexValue.canonicalJson(expectedKeys)
    )
      throw new Error("runner event fields do not match the frozen schema");
    if (
      typeof input.runId !== "string" ||
      !Number.isSafeInteger(input.seq) ||
      typeof input.utc !== "string" ||
      typeof input.monotonicNs !== "string" ||
      typeof input.phase !== "string" ||
      typeof input.actor !== "string" ||
      typeof input.type !== "string" ||
      !EvidenceBenchmarkCodexValue.isRecord(input.payload) ||
      typeof input.previousEventSha256 !== "string" ||
      input.previousEventSha256.length !== 64 ||
      typeof input.eventSha256 !== "string" ||
      input.eventSha256.length !== 64 ||
      (input.rawRef !== null &&
        !EvidenceBenchmarkCodexValue.isRecord(input.rawRef))
    )
      throw new Error("runner event does not satisfy the frozen schema");
    EvidenceBenchmarkCodexValue.canonicalJson(input.payload);
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
