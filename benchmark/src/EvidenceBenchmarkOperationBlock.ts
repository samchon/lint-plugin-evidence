import fs from "node:fs";
import path from "node:path";

import { EvidenceBenchmarkDurability } from "./EvidenceBenchmarkDurability.ts";
import { EvidenceBenchmarkHash } from "./EvidenceBenchmarkHash.ts";
import { EvidenceBenchmarkJson } from "./EvidenceBenchmarkJson.ts";
import type { IEvidenceBenchmarkOperation } from "./structures/IEvidenceBenchmarkOperation.ts";

/** Persists block execution safety, aggregate samples, and shared stop seals. */
export namespace EvidenceBenchmarkOperationBlock {
  const CADENCE_MS = 1_000;
  const ZERO_SHA256 = "0".repeat(64);

  /** Derives and writes the outer absolute deadline exactly once. */
  export function launch(
    plan: IEvidenceBenchmarkOperation.IPlan,
    now: Date,
    monotonicNs: bigint,
  ): IEvidenceBenchmarkOperation.IBlockExecutionSafety {
    const location: string = executionPath(plan);
    const existing: IEvidenceBenchmarkOperation.IBlockExecutionSafety | null =
      readExecution(plan);
    if (existing !== null) return existing;
    const content = {
      schemaVersion: 1 as const,
      blockId: plan.blockId,
      planSha256: plan.planSha256,
      maximumBlockDurationMs: plan.safety.maximumBlockDurationMs,
      launchedAtUtc: now.toISOString(),
      launchedAtMonotonicNs: monotonicNs.toString(),
      hardDeadlineUtc: new Date(
        now.getTime() + plan.safety.maximumBlockDurationMs,
      ).toISOString(),
    };
    const record: IEvidenceBenchmarkOperation.IBlockExecutionSafety = {
      ...content,
      executionSafetySha256: EvidenceBenchmarkHash.object(content),
    };
    EvidenceBenchmarkDurability.writeOnce(
      location,
      `${JSON.stringify(record, null, 2)}\n`,
    );
    return record;
  }

  /** Reads and verifies the write-once outer deadline derivation. */
  export function readExecution(
    plan: IEvidenceBenchmarkOperation.IPlan,
  ): IEvidenceBenchmarkOperation.IBlockExecutionSafety | null {
    const location: string = executionPath(plan);
    if (!fs.existsSync(location)) return null;
    const parsed: unknown = EvidenceBenchmarkJson.parse(
      fs.readFileSync(location, "utf8"),
      location,
    );
    if (!isObject(parsed))
      throw new Error(`Invalid block execution safety: ${location}.`);
    const record =
      parsed as unknown as IEvidenceBenchmarkOperation.IBlockExecutionSafety;
    const { executionSafetySha256, ...content } = record;
    if (
      record.schemaVersion !== 1 ||
      record.blockId !== plan.blockId ||
      record.planSha256 !== plan.planSha256 ||
      record.maximumBlockDurationMs !== plan.safety.maximumBlockDurationMs ||
      !Number.isFinite(Date.parse(record.launchedAtUtc)) ||
      !/^[0-9]+$/.test(record.launchedAtMonotonicNs) ||
      Date.parse(record.hardDeadlineUtc) !==
        Date.parse(record.launchedAtUtc) + record.maximumBlockDurationMs ||
      EvidenceBenchmarkHash.object(content) !== executionSafetySha256
    )
      throw new Error(`Block execution safety drifted for ${plan.blockId}.`);
    return record;
  }

  /** Appends one hash-chained outer telemetry and token aggregate sample. */
  export function sample(
    plan: IEvidenceBenchmarkOperation.IPlan,
    input: EvidenceBenchmarkOperationBlock.ISampleInput,
  ): IEvidenceBenchmarkOperation.IBlockSample {
    validateObservations(plan, input.observations);
    const previous: IEvidenceBenchmarkOperation.IBlockSample | undefined =
      readSamples(plan).at(-1);
    const observations: IEvidenceBenchmarkOperation.IObservation[] =
      mergeObservations(previous?.observations ?? [], input.observations);
    validateObservations(plan, observations);
    if (previous !== undefined)
      validateMonotonicObservations(previous.observations, observations);
    const elapsedNs: bigint =
      previous === undefined
        ? 0n
        : input.monotonicNs - BigInt(previous.monotonicNs);
    const droppedSamples: number =
      previous === undefined
        ? 0
        : Math.max(
            0,
            Math.floor(Number(elapsedNs) / 1_000_000 / CADENCE_MS) - 1,
          );
    const content = {
      sequence: (previous?.sequence ?? 0) + 1,
      blockId: plan.blockId,
      atUtc: input.atUtc.toISOString(),
      monotonicNs: input.monotonicNs.toString(),
      samplerElapsedMs: input.samplerElapsedMs,
      droppedSamples,
      host: input.host,
      observations: [...observations].sort((left, right) =>
        ordinal(left.runId, right.runId),
      ),
      observedBlockTotalTokens: aggregateTokens(observations),
      previousSha256: previous?.sampleSha256 ?? ZERO_SHA256,
    };
    const sample: IEvidenceBenchmarkOperation.IBlockSample = {
      ...content,
      sampleSha256: EvidenceBenchmarkHash.object(content),
    };
    appendLine(samplesPath(plan), sample);
    return sample;
  }

  /** Writes one immutable shared safety stop or verifies its prior equivalent. */
  export function stop(
    plan: IEvidenceBenchmarkOperation.IPlan,
    input: EvidenceBenchmarkOperationBlock.IStopInput,
  ): IEvidenceBenchmarkOperation.IBlockStop {
    const existing: IEvidenceBenchmarkOperation.IBlockStop | null =
      readStop(plan);
    if (existing !== null) return existing;
    validateObservations(plan, input.observations);
    const content = {
      schemaVersion: 1 as const,
      blockId: plan.blockId,
      boundary: input.boundary,
      limit: input.limit,
      observedBlockTotalTokens: aggregateTokens(input.observations),
      observations: [...input.observations].sort((left, right) =>
        ordinal(left.runId, right.runId),
      ),
      missingObservationRunIds: plan.cells
        .map((cell) => cell.runId)
        .filter(
          (runId) =>
            !input.observations.some(
              (observation) => observation.runId === runId,
            ),
        )
        .sort(ordinal),
      usageLowerBound: true as const,
      observedAtUtc: input.observedAtUtc.toISOString(),
      hardCeilingGuaranteed: false as const,
    };
    const stop: IEvidenceBenchmarkOperation.IBlockStop = {
      ...content,
      blockStopSha256: EvidenceBenchmarkHash.object(content),
    };
    EvidenceBenchmarkDurability.writeOnce(
      stopPath(plan),
      `${JSON.stringify(stop, null, 2)}\n`,
    );
    return stop;
  }

  /** Reads and verifies one immutable shared stop when it exists. */
  export function readStop(
    plan: IEvidenceBenchmarkOperation.IPlan,
  ): IEvidenceBenchmarkOperation.IBlockStop | null {
    const location: string = stopPath(plan);
    if (!fs.existsSync(location)) return null;
    const parsed: unknown = EvidenceBenchmarkJson.parse(
      fs.readFileSync(location, "utf8"),
      location,
    );
    if (!isObject(parsed))
      throw new Error(`Invalid benchmark block stop: ${location}.`);
    const stop: IEvidenceBenchmarkOperation.IBlockStop =
      parsed as unknown as IEvidenceBenchmarkOperation.IBlockStop;
    const { blockStopSha256, ...content } = stop;
    if (
      stop.schemaVersion !== 1 ||
      stop.blockId !== plan.blockId ||
      ![
        "maximum_observed_block_total_tokens",
        "hard_deadline",
        "safety_monitor_failure",
      ].includes(stop.boundary) ||
      !Number.isFinite(Date.parse(stop.observedAtUtc)) ||
      stop.usageLowerBound !== true ||
      !Array.isArray(stop.missingObservationRunIds) ||
      JSON.stringify(stop.missingObservationRunIds) !==
        JSON.stringify(
          plan.cells
            .map((cell) => cell.runId)
            .filter(
              (runId) =>
                !stop.observations.some(
                  (observation) => observation.runId === runId,
                ),
            )
            .sort(ordinal),
        ) ||
      stop.hardCeilingGuaranteed !== false ||
      aggregateTokens(stop.observations) !== stop.observedBlockTotalTokens ||
      EvidenceBenchmarkHash.object(content) !== blockStopSha256
    )
      throw new Error(`Benchmark block stop drifted for ${plan.blockId}.`);
    validateObservations(plan, stop.observations);
    return stop;
  }

  /** Reads and verifies the append-only aggregate sample ledger. */
  export function readSamples(
    plan: IEvidenceBenchmarkOperation.IPlan,
  ): IEvidenceBenchmarkOperation.IBlockSample[] {
    const location: string = samplesPath(plan);
    if (!fs.existsSync(location)) return [];
    const samples: IEvidenceBenchmarkOperation.IBlockSample[] = fs
      .readFileSync(location, "utf8")
      .split("\n")
      .filter((line) => line.length !== 0)
      .map(
        (line, index) =>
          EvidenceBenchmarkJson.parse(
            line,
            `${location} line ${index + 1}`,
          ) as IEvidenceBenchmarkOperation.IBlockSample,
      );
    let previous: string = ZERO_SHA256;
    for (const [index, sample] of samples.entries()) {
      const { sampleSha256, ...content } = sample;
      if (
        sample.sequence !== index + 1 ||
        sample.blockId !== plan.blockId ||
        sample.previousSha256 !== previous ||
        !Number.isFinite(Date.parse(sample.atUtc)) ||
        !/^[0-9]+$/.test(sample.monotonicNs) ||
        sample.samplerElapsedMs < 0 ||
        !Number.isInteger(sample.droppedSamples) ||
        sample.droppedSamples < 0 ||
        aggregateTokens(sample.observations) !==
          sample.observedBlockTotalTokens ||
        EvidenceBenchmarkHash.object(content) !== sampleSha256
      )
        throw new Error(
          `Invalid block sample chain at ${plan.blockId}#${index + 1}.`,
        );
      validateObservations(plan, sample.observations);
      if (index !== 0)
        validateMonotonicObservations(
          samples[index - 1]!.observations,
          sample.observations,
        );
      previous = sampleSha256;
    }
    return samples;
  }

  /** Returns the durable latest-by-cell observation aggregate. */
  export function latest(
    plan: IEvidenceBenchmarkOperation.IPlan,
  ): IEvidenceBenchmarkOperation.IObservation[] {
    return readSamples(plan).at(-1)?.observations ?? [];
  }

  /** Returns the run-owned block operations directory. */
  export function directory(plan: IEvidenceBenchmarkOperation.IPlan): string {
    const roots: Set<string> = new Set(
      plan.cells.map((cell) => path.dirname(path.dirname(cell.root))),
    );
    if (roots.size !== 1)
      throw new Error(`Benchmark block ${plan.blockId} has aliased roots.`);
    return path.join([...roots][0]!, "operations");
  }

  /** Inputs for one block sample append. */
  export interface ISampleInput {
    /** UTC sample timestamp. */
    atUtc: Date;

    /** Monotonic sample timestamp. */
    monotonicNs: bigint;

    /** Sampling operation duration in milliseconds. */
    samplerElapsedMs: number;

    /** Host diagnostic point. */
    host: IEvidenceBenchmarkOperation.IBlockSample["host"];

    /** Current runner observations. */
    observations: IEvidenceBenchmarkOperation.IObservation[];
  }

  /** Inputs for one shared block-stop decision. */
  export interface IStopInput {
    /** Triggering safety boundary. */
    boundary: IEvidenceBenchmarkOperation.IBlockStop["boundary"];

    /** Frozen or diagnostic boundary value. */
    limit: number | string;

    /** Last durable observations. */
    observations: IEvidenceBenchmarkOperation.IObservation[];

    /** UTC decision timestamp. */
    observedAtUtc: Date;
  }

  function executionPath(plan: IEvidenceBenchmarkOperation.IPlan): string {
    return path.join(directory(plan), "block-execution-safety.json");
  }

  function samplesPath(plan: IEvidenceBenchmarkOperation.IPlan): string {
    return path.join(directory(plan), "samples.jsonl");
  }

  function stopPath(plan: IEvidenceBenchmarkOperation.IPlan): string {
    return path.join(directory(plan), "block-stop.json");
  }

  function aggregateTokens(
    observations: readonly IEvidenceBenchmarkOperation.IObservation[],
  ): number {
    const responses: Map<string, number> = new Map();
    for (const observation of observations)
      for (const response of observation.responses) {
        const existing: number | undefined = responses.get(response.responseId);
        if (existing !== undefined && existing !== response.totalTokens)
          throw new Error(
            `Response ${response.responseId} has conflicting token totals across cells.`,
          );
        responses.set(response.responseId, response.totalTokens);
      }
    return [...responses.values()].reduce(
      (sum, totalTokens) => sum + totalTokens,
      0,
    );
  }

  function validateObservations(
    plan: IEvidenceBenchmarkOperation.IPlan,
    observations: readonly IEvidenceBenchmarkOperation.IObservation[],
  ): void {
    const runIds: Set<string> = new Set(plan.cells.map((cell) => cell.runId));
    const observedRuns: Set<string> = new Set();
    for (const observation of observations) {
      if (
        !runIds.has(observation.runId) ||
        observedRuns.has(observation.runId) ||
        !Number.isInteger(observation.observedTotalTokens) ||
        observation.observedTotalTokens < 0 ||
        typeof observation.usageLowerBound !== "boolean" ||
        !/^[0-9a-f]{64}$/i.test(observation.checkpointSha256) ||
        !Array.isArray(observation.responses)
      )
        throw new Error(`Invalid block observation for ${observation.runId}.`);
      observedRuns.add(observation.runId);
      const responseIds: Set<string> = new Set();
      let total: number = 0;
      for (const response of observation.responses) {
        if (
          typeof response.responseId !== "string" ||
          response.responseId.length === 0 ||
          responseIds.has(response.responseId) ||
          !Number.isInteger(response.totalTokens) ||
          response.totalTokens < 0
        )
          throw new Error(
            `Invalid response observation for ${observation.runId}.`,
          );
        responseIds.add(response.responseId);
        total += response.totalTokens;
      }
      if (total !== observation.observedTotalTokens)
        throw new Error(
          `Observation token total disagrees for ${observation.runId}.`,
        );
    }
    aggregateTokens(observations);
  }

  function validateMonotonicObservations(
    previous: readonly IEvidenceBenchmarkOperation.IObservation[],
    current: readonly IEvidenceBenchmarkOperation.IObservation[],
  ): void {
    const currentByRun: Map<string, IEvidenceBenchmarkOperation.IObservation> =
      new Map(current.map((observation) => [observation.runId, observation]));
    for (const prior of previous) {
      const next: IEvidenceBenchmarkOperation.IObservation | undefined =
        currentByRun.get(prior.runId);
      if (next === undefined)
        throw new Error(`Runner observation disappeared for ${prior.runId}.`);
      const nextResponses: Map<string, number> = new Map(
        next.responses.map((response) => [
          response.responseId,
          response.totalTokens,
        ]),
      );
      if (
        prior.responses.some(
          (response) =>
            nextResponses.get(response.responseId) !== response.totalTokens,
        )
      )
        throw new Error(`Runner observation regressed for ${prior.runId}.`);
    }
  }

  function mergeObservations(
    previous: readonly IEvidenceBenchmarkOperation.IObservation[],
    current: readonly IEvidenceBenchmarkOperation.IObservation[],
  ): IEvidenceBenchmarkOperation.IObservation[] {
    const merged: Map<string, IEvidenceBenchmarkOperation.IObservation> =
      new Map(previous.map((observation) => [observation.runId, observation]));
    for (const observation of current) {
      const prior: IEvidenceBenchmarkOperation.IObservation | undefined =
        merged.get(observation.runId);
      if (prior !== undefined)
        validateMonotonicObservations([prior], [observation]);
      merged.set(observation.runId, observation);
    }
    return [...merged.values()].sort((left, right) =>
      ordinal(left.runId, right.runId),
    );
  }

  function appendLine(location: string, value: unknown): void {
    fs.mkdirSync(path.dirname(location), { recursive: true });
    const handle: number = fs.openSync(location, "a");
    try {
      fs.writeSync(handle, `${JSON.stringify(value)}\n`, undefined, "utf8");
      fs.fsyncSync(handle);
    } finally {
      fs.closeSync(handle);
    }
  }

  function ordinal(left: string, right: string): number {
    return left < right ? -1 : left > right ? 1 : 0;
  }

  function isObject(input: unknown): input is Record<string, unknown> {
    return typeof input === "object" && input !== null && !Array.isArray(input);
  }
}
