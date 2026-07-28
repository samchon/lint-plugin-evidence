import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { EvidenceBenchmarkDurability } from "../EvidenceBenchmarkDurability.ts";
import { EvidenceBenchmarkHash } from "../EvidenceBenchmarkHash.ts";
import { EvidenceBenchmarkProtocolValidator } from "../EvidenceBenchmarkProtocolValidator.ts";

/** Emits and semantically validates canonical quality protocol artifacts. */
export namespace EvidenceBenchmarkQualityArtifacts {
  const SHA256 = /^[a-f0-9]{64}$/;
  const SURFACES: readonly string[] = [
    "database",
    "api",
    "backend",
    "frontend",
    "integration",
    "test",
    "operations",
    "documentation",
  ];
  const SECONDARY_DIMENSIONS: readonly string[] = [
    "usability",
    "legibility",
    "responsiveness",
    "state_feedback",
    "accessibility",
    "maintainability",
  ];

  /** Exact serialized artifact and its byte digest. */
  export interface IEmission {
    /** LF-terminated UTF-8 JSON text written to the run record. */
    text: string;

    /** SHA-256 of the exact emitted UTF-8 bytes. */
    sha256: string;
  }

  /** Raw artifacts required to verify one fresh adjudicator record. */
  export interface IAdjudicationInputs {
    /** Exact first assembled-grade bytes. */
    graderAGrade: Uint8Array;

    /** Exact second assembled-grade bytes. */
    graderBGrade: Uint8Array;

    /** Exact comparison-queue bytes. */
    comparisonQueue: Uint8Array;

    /** Exact provider-output bytes. */
    providerOutput: Uint8Array;

    /** Exact referenced process-provenance bytes. */
    processProvenance: Uint8Array;

    /** Exact preregistered adjudicator-assignment bytes. */
    assignment: Uint8Array;

    /** Exact app-server raw-event stream index bytes. */
    rawEventStream: Uint8Array;

    /** Exact app-server response usage bytes. */
    usage: Uint8Array;

    /** Exact runner-owned usage report bytes projected by `usage`. */
    coreUsageReport: Uint8Array;

    /** Exact append-only runner event ledger bytes. */
    runnerEventLog: Uint8Array;

    /** Exact append-only app-server stdout bytes. */
    serverRawLog: Uint8Array;
  }

  /** Exact bytes needed to verify one local public-promotion scan. */
  export interface IPublicSafetyInputs {
    /** Exact scanner implementation bytes. */
    scannerSource: Uint8Array;

    /** Exact versioned scanner-rule bytes. */
    rules: Uint8Array;

    /** Exact retained run-record file set scanned before publication. */
    files: ReadonlyMap<string, Uint8Array>;
  }

  /** Validates, serializes, reparses, and revalidates one artifact. */
  export function emit(
    protocolRoot: string,
    schemaRelativePath: string,
    value: unknown,
    label: string = schemaRelativePath,
  ): IEmission {
    EvidenceBenchmarkProtocolValidator.validateValue(
      protocolRoot,
      schemaRelativePath,
      value,
      label,
    );
    const text: string = `${JSON.stringify(value, null, 2)}\n`;
    EvidenceBenchmarkProtocolValidator.validateText(
      protocolRoot,
      schemaRelativePath,
      text,
      `${label} emitted bytes`,
    );
    return {
      text,
      sha256: EvidenceBenchmarkHash.bytes(text),
    };
  }

  /** Atomically writes one already validated canonical artifact. */
  export function write(
    protocolRoot: string,
    schemaRelativePath: string,
    value: unknown,
    target: string,
    label: string = schemaRelativePath,
  ): IEmission {
    const emission: IEmission = emit(
      protocolRoot,
      schemaRelativePath,
      value,
      label,
    );
    const resolved: string = path.resolve(target);
    EvidenceBenchmarkDurability.writeOnce(resolved, emission.text);
    const reopened: Buffer = fs.readFileSync(resolved);
    if (EvidenceBenchmarkHash.bytes(reopened) !== emission.sha256)
      throw new Error(`${label} changed during durable publication.`);
    EvidenceBenchmarkProtocolValidator.validateText(
      protocolRoot,
      schemaRelativePath,
      new TextDecoder("utf-8", { fatal: true }).decode(reopened),
      `${label} durable bytes`,
    );
    return emission;
  }

  /** Proves aggregate v2 ownership and both algorithm-qualified milestones. */
  export function validateGradingInput(
    input: unknown,
    expectedRunId: string,
  ): void {
    const manifest = record(input, "grading input manifest");
    if (
      manifest.schemaVersion !== 2 ||
      manifest.runId !== expectedRunId ||
      Object.hasOwn(manifest, "coreSealSha256") ||
      Object.hasOwn(manifest, "parentCoreSealSha256")
    )
      throw new Error(
        "Grading input must be one aggregate pre-core v2 manifest.",
      );
    for (const field of [
      "tDoneSourceRawTree",
      "tDoneBundleRawTree",
      "tDrySourceRawTree",
      "tDryBundleRawTree",
    ])
      rawTree(manifest[field], `grading input ${field}`);
  }

  /** Proves qualified transform trees, leak closure, and double hashing. */
  export function validateBundle(input: unknown): void {
    const manifest = record(input, "bundle manifest");
    const output = rawTree(manifest.outputRawTree, "bundle output tree");
    const second = rawTree(
      record(manifest.determinismCheck, "bundle determinism")
        .secondOutputRawTree,
      "bundle second output tree",
    );
    rawTree(manifest.inputSnapshotRawTree, "bundle input tree");
    rawTree(manifest.requirementsRawTree, "bundle requirements tree");
    const leak = record(manifest.leakScan, "bundle leak scan");
    const determinism = record(manifest.determinismCheck, "bundle determinism");
    if (
      leak.passed !== true ||
      array(leak.matches, "bundle leak matches").length !== 0 ||
      determinism.passed !== true ||
      output.sha256 !== second.sha256
    )
      throw new Error(
        "Blind bundle must pass an empty leak scan and deterministic double hash.",
      );
  }

  /** Proves direct core ownership and an exact zero-based 50-row partition. */
  export function validatePlan(
    input: unknown,
    parentCoreSealSha256: string,
  ): void {
    const plan = record(input, "grading block plan");
    if (
      plan.parentCoreSealSha256 !== parentCoreSealSha256 ||
      plan.blockSize !== 50
    )
      throw new Error("Grading plan is not bound to the exact parent core.");
    const graders = array(plan.graderAssignments, "grader assignments");
    if (
      graders.length !== 2 ||
      JSON.stringify(
        graders.map((entry) => record(entry, "grader").pseudonym).sort(),
      ) !== JSON.stringify(["blind-grader-a", "blind-grader-b"])
    )
      throw new Error("Grading plan requires both independent graders.");
    const populations = array(plan.populations, "plan populations");
    const populationNames: string[] = [];
    const blockIds: Set<string> = new Set();
    for (const populationInput of populations) {
      const population = record(populationInput, "plan population");
      const name: string = text(population.population, "plan population name");
      populationNames.push(name);
      const blocks = array(population.blocks, `${name} blocks`);
      const ordered: string[] = [];
      for (const [index, blockInput] of blocks.entries()) {
        const block = record(blockInput, `${name} block ${index}`);
        const blockId: string = text(block.blockId, `${name} block id`);
        const criterionIds: string[] = stringArray(
          block.criterionIds,
          `${name} criterion ids`,
        );
        if (
          block.blockIndex !== index ||
          blockIds.has(blockId) ||
          criterionIds.length > 50 ||
          block.criterionIdsSha256 !==
            EvidenceBenchmarkHash.object(criterionIds)
        )
          throw new Error(`${name} grading block partition drifted.`);
        blockIds.add(blockId);
        ordered.push(...criterionIds);
      }
      if (
        ordered.length !== population.catalogCount ||
        new Set(ordered).size !== ordered.length ||
        population.orderedCriterionIdsSha256 !==
          EvidenceBenchmarkHash.object(ordered)
      )
        throw new Error(`${name} grading population is not an exact union.`);
    }
    if (
      new Set(populationNames).size !== populationNames.length ||
      !populationNames.includes("acceptance") ||
      populationNames.some(
        (name) => name !== "acceptance" && name !== "context",
      )
    )
      throw new Error("Grading plan population inventory is invalid.");
  }

  /** Proves a canonical provider/local block exactly closes its plan block. */
  export function validateGradeBlock(
    input: unknown,
    planBlock: unknown,
    expected: {
      gradeId: string;
      bundleId: string;
      subject: string;
      phase: string;
      graderPseudonym: string;
      rubricSha256: string;
      catalogSha256: string;
      population: string;
    },
  ): void {
    const block = record(input, "grade block");
    const planned = record(planBlock, "planned grade block");
    for (const [field, value] of Object.entries(expected))
      if (block[field] !== value)
        throw new Error(`Grade block ${field} does not match its plan.`);
    const criterionIds: string[] = stringArray(
      block.criterionIds,
      "grade block criterion ids",
    );
    if (
      block.blockId !== planned.blockId ||
      block.blockIndex !== planned.blockIndex ||
      JSON.stringify(criterionIds) !== JSON.stringify(planned.criterionIds) ||
      block.status !== "completed" ||
      block.interruption !== null
    )
      throw new Error("Completed grade block does not exactly close its plan.");
    const ratings = array(block.ratings, "grade block ratings");
    if (
      JSON.stringify(
        ratings.map((rating) => record(rating, "rating").criterionId),
      ) !== JSON.stringify(criterionIds)
    )
      throw new Error("Grade block ratings do not match criterion order.");
    for (const rating of ratings) validateRating(rating, false);
  }

  /** Proves final-grade provenance, taxonomy, populations, and summaries. */
  export function validateGrade(
    input: unknown,
    expected: {
      gradingPlanSha256: string;
      parentCoreSealSha256: string;
      sourceResponseIds: readonly string[];
    },
  ): void {
    const grade = record(input, "assembled grade");
    if (
      grade.gradingPlanSha256 !== expected.gradingPlanSha256 ||
      grade.parentCoreSealSha256 !== expected.parentCoreSealSha256 ||
      Object.hasOwn(grade, "armGuess")
    )
      throw new Error(
        "Assembled grade provenance or arm-guess ownership is invalid.",
      );
    const responseIds: string[] = stringArray(
      grade.sourceResponseIds,
      "grade response ids",
    );
    if (
      JSON.stringify(responseIds) !==
        JSON.stringify(expected.sourceResponseIds) ||
      grade.sourceResponseIdsSha256 !==
        EvidenceBenchmarkHash.object(responseIds)
    )
      throw new Error("Assembled grade response provenance drifted.");
    validatePopulation(grade, "acceptance");
    const contextCatalog = grade.contextCatalogSha256;
    if (contextCatalog === null) {
      if (
        grade.contextRatings !== null ||
        grade.contextSummary !== null ||
        grade.contextPopulationCount !== 0
      )
        throw new Error("Absent context population must remain null and zero.");
    } else validatePopulation(grade, "context");
  }

  /** Proves a separate arm guess binds exact already sealed rating bytes. */
  export function validateArmGuess(
    input: unknown,
    sealedRatings: Uint8Array,
  ): void {
    const guess = record(input, "arm guess");
    if (
      guess.sealedRatingsSha256 !== EvidenceBenchmarkHash.bytes(sealedRatings)
    )
      throw new Error("Arm guess does not bind exact sealed rating bytes.");
  }

  /** Proves semantic adjudication retains a full rating for every queue item. */
  export function validateSemanticAdjudication(
    input: unknown,
    queueCriterionIds: readonly string[],
  ): void {
    const adjudication = record(input, "semantic adjudication");
    if (
      adjudication.population !== "acceptance" &&
      adjudication.population !== "context"
    )
      throw new Error("Semantic adjudication has the wrong population.");
    const decisions = array(adjudication.decisions, "adjudication decisions");
    if (
      JSON.stringify(
        decisions.map((entry) => record(entry, "decision").itemId),
      ) !== JSON.stringify(queueCriterionIds)
    )
      throw new Error("Adjudication decisions do not exactly close the queue.");
    for (const inputDecision of decisions) {
      const decision = record(inputDecision, "adjudication decision");
      const rating = record(
        decision.semanticRating,
        "adjudicated semantic rating",
      );
      if (
        decision.decision !== "semantic_consensus" ||
        decision.itemId !== rating.criterionId
      )
        throw new Error("Adjudication decision lost semantic identity.");
      validateRating(rating, false);
    }
  }

  /** Recomputes every byte edge and rejects reused adjudicator identity. */
  export function validateAdjudicationRecord(
    protocolRoot: string,
    input: unknown,
    artifacts: IAdjudicationInputs,
  ): void {
    const recordValue = record(input, "adjudication record");
    const decode = (bytes: Uint8Array, label: string): string => {
      try {
        return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      } catch {
        throw new Error(`${label} is not valid UTF-8.`);
      }
    };
    const processValue = EvidenceBenchmarkProtocolValidator.validateText<
      Record<string, unknown>
    >(
      protocolRoot,
      "adjudicator-process-provenance.schema.json",
      decode(artifacts.processProvenance, "adjudicator process provenance"),
      "adjudicator process provenance",
    );
    const assignment = EvidenceBenchmarkProtocolValidator.validateText<
      Record<string, unknown>
    >(
      protocolRoot,
      "adjudicator-assignment.schema.json",
      decode(artifacts.assignment, "adjudicator assignment"),
      "adjudicator assignment",
    );
    const eventStream = EvidenceBenchmarkProtocolValidator.validateText<
      Record<string, unknown>
    >(
      protocolRoot,
      "adjudicator-event-stream.schema.json",
      decode(artifacts.rawEventStream, "adjudicator event stream"),
      "adjudicator event stream",
    );
    const usage = EvidenceBenchmarkProtocolValidator.validateText<
      Record<string, unknown>
    >(
      protocolRoot,
      "adjudicator-usage.schema.json",
      decode(artifacts.usage, "adjudicator usage"),
      "adjudicator usage",
    );
    const processSchema: Buffer = fs.readFileSync(
      path.join(
        path.resolve(protocolRoot),
        "schema",
        "adjudicator-process-provenance.schema.json",
      ),
    );
    EvidenceBenchmarkProtocolValidator.validateText(
      protocolRoot,
      "adjudication-provider.schema.json",
      decode(artifacts.providerOutput, "adjudicator provider output"),
      "adjudicator provider output",
    );
    const runnerEvents: Record<string, unknown>[] = parseJsonLines(
      artifacts.runnerEventLog,
      "adjudicator runner event log",
    );
    for (const [index, event] of runnerEvents.entries())
      EvidenceBenchmarkProtocolValidator.validateValue(
        protocolRoot,
        "event.schema.json",
        event,
        `adjudicator runner event ${index + 1}`,
      );
    validateRunnerEventChain(runnerEvents);
    const runnerEventSha256: string = EvidenceBenchmarkHash.bytes(
      artifacts.runnerEventLog,
    );
    const serverRawLogSha256: string = EvidenceBenchmarkHash.bytes(
      artifacts.serverRawLog,
    );
    const coreUsageReport = record(
      EvidenceBenchmarkProtocolValidator.parse(
        decode(artifacts.coreUsageReport, "adjudicator core usage report"),
        "adjudicator core usage report",
      ),
      "adjudicator core usage report",
    );
    const gradeA = record(recordValue.graderAIdentity, "grader A identity");
    const gradeB = record(recordValue.graderBIdentity, "grader B identity");
    const driftedByteEdges: string[] = [
      [
        "grader-a",
        recordValue.graderAGradeSha256,
        EvidenceBenchmarkHash.bytes(artifacts.graderAGrade),
      ],
      [
        "grader-b",
        recordValue.graderBGradeSha256,
        EvidenceBenchmarkHash.bytes(artifacts.graderBGrade),
      ],
      [
        "comparison-queue",
        recordValue.comparisonQueueSha256,
        EvidenceBenchmarkHash.bytes(artifacts.comparisonQueue),
      ],
      [
        "provider-output",
        recordValue.providerOutputSha256,
        EvidenceBenchmarkHash.bytes(artifacts.providerOutput),
      ],
      [
        "process-provenance",
        recordValue.processProvenanceSha256,
        EvidenceBenchmarkHash.bytes(artifacts.processProvenance),
      ],
      [
        "process-schema",
        recordValue.processProvenanceSchemaSha256,
        EvidenceBenchmarkHash.bytes(processSchema),
      ],
      [
        "assignment",
        recordValue.assignmentSha256,
        EvidenceBenchmarkHash.bytes(artifacts.assignment),
      ],
      [
        "raw-event-stream",
        recordValue.rawEventStreamSha256,
        EvidenceBenchmarkHash.bytes(artifacts.rawEventStream),
      ],
      [
        "usage",
        recordValue.usageSha256,
        EvidenceBenchmarkHash.bytes(artifacts.usage),
      ],
      [
        "process-runner-event-log",
        processValue.runnerEventLogSha256,
        runnerEventSha256,
      ],
      [
        "event-stream-runner-event-log",
        eventStream.runnerEventLogSha256,
        runnerEventSha256,
      ],
      [
        "event-stream-server-raw-log",
        eventStream.serverRawLogSha256,
        serverRawLogSha256,
      ],
      [
        "core-usage-report",
        usage.sourceUsageReportSha256,
        EvidenceBenchmarkHash.bytes(artifacts.coreUsageReport),
      ],
    ]
      .filter(([, observed, expected]) => observed !== expected)
      .map(([label]) => label as string);
    if (driftedByteEdges.length !== 0)
      throw new Error(
        `Adjudication record byte provenance drifted: ${driftedByteEdges.join(", ")}.`,
      );
    const sealed: string = labeledHash([
      ["grade-a", artifacts.graderAGrade],
      ["grade-b", artifacts.graderBGrade],
      ["comparison-queue", artifacts.comparisonQueue],
    ]);
    if (
      recordValue.sealedInputsSha256 !== sealed ||
      recordValue.recomputedSealedInputsSha256 !== sealed
    )
      throw new Error("Adjudication sealed-input digest was not recomputed.");
    for (const field of [
      "parentCoreSealSha256",
      "provider",
      "modelId",
      "reasoningEffort",
      "codexVersion",
      "authClass",
      "serviceTierClass",
      "serviceTierSymbolic",
      "requestedServiceTier",
      "serviceTierRequestMode",
      "effectiveServiceTier",
      "assignmentId",
      "assignmentPath",
      "assignmentSha256",
      "threadId",
      "sessionId",
      "agentId",
      "responseIds",
      "processNonce",
      "pid",
      "transportSessionId",
      "startedAtMonotonicNs",
      "executableSha256",
      "runnerEventLogSha256",
      "rawEventStreamPath",
      "rawEventStreamSha256",
      "usagePath",
      "usageSha256",
      "providerOutputSha256",
    ])
      if (
        JSON.stringify(recordValue[field]) !==
        JSON.stringify(processValue[field])
      )
        throw new Error(`Adjudication process field ${field} drifted.`);
    for (const field of [
      "parentCoreSealSha256",
      "provider",
      "modelId",
      "reasoningEffort",
      "codexVersion",
      "authClass",
      "serviceTierClass",
      "serviceTierSymbolic",
      "requestedServiceTier",
      "serviceTierRequestMode",
      "assignmentId",
    ])
      if (
        JSON.stringify(processValue[field]) !==
          JSON.stringify(assignment[field]) ||
        JSON.stringify(recordValue[field]) !== JSON.stringify(assignment[field])
      )
        throw new Error(`Adjudicator assignment field ${field} drifted.`);
    if (
      processValue.threadId !== eventStream.threadId ||
      processValue.sessionId !== eventStream.sessionId ||
      processValue.agentId !== eventStream.agentId ||
      JSON.stringify(processValue.responseIds) !==
        JSON.stringify(eventStream.responseIds) ||
      processValue.threadId !== usage.threadId ||
      JSON.stringify(processValue.responseIds) !==
        JSON.stringify(usage.responseIds) ||
      eventStream.usageSha256 !== EvidenceBenchmarkHash.bytes(artifacts.usage)
    )
      throw new Error(
        "Adjudicator event and usage membership drifted from the process.",
      );
    const processStartReference = record(
      processValue.processStartEvent,
      "adjudicator process start reference",
    );
    const processStart = runnerEvent(
      runnerEvents,
      processStartReference,
      "adjudicator process start",
    );
    const processStartPayload = record(
      processStart.payload,
      "adjudicator process start payload",
    );
    const invocation = record(
      processValue.invocation,
      "adjudicator invocation",
    );
    if (
      processStart.type !== "app_server_started" ||
      processStart.actor !== "runner" ||
      processStart.phase !== "setup" ||
      processStart.rawRef !== null ||
      processStart.utc !== processValue.startedAtUtc ||
      processStart.monotonicNs !== processValue.startedAtMonotonicNs ||
      processStartPayload.processNonce !== processValue.processNonce ||
      processStartPayload.pid !== processValue.pid ||
      processStartPayload.transportSessionId !==
        processValue.transportSessionId ||
      processStartPayload.executableSha256 !== processValue.executableSha256 ||
      processStartPayload.command !== invocation.command ||
      JSON.stringify(processStartPayload.arguments) !==
        JSON.stringify(invocation.arguments) ||
      processStartPayload.cwd !== invocation.cwd ||
      processStartPayload.environmentSha256 !== invocation.environmentSha256
    )
      throw new Error(
        "Adjudicator process provenance is not backed by its exact start event.",
      );
    if (
      eventStream.runId !== recordValue.runId ||
      eventStream.transportSessionId !== processValue.transportSessionId
    )
      throw new Error("Adjudicator raw-event stream changed process lineage.");
    const completionInputs = array(
      eventStream.completionEvents,
      "adjudicator completion events",
    );
    const completions = completionInputs.map((entry, index) =>
      validateRawEvent(
        protocolRoot,
        record(entry, `adjudicator completion event ${index}`),
        index,
        runnerEvents,
        artifacts.serverRawLog,
        eventStream,
      ),
    );
    const responseIds: string[] = completions.map((entry) => entry.responseId);
    if (
      JSON.stringify(responseIds) !== JSON.stringify(eventStream.responseIds) ||
      JSON.stringify(responseIds) !== JSON.stringify(processValue.responseIds)
    )
      throw new Error(
        "Adjudicator completion events do not exactly own the response set.",
      );
    for (let index = 1; index < completionInputs.length; ++index)
      if (
        BigInt(
          text(
            record(completionInputs[index], "completion event").monotonicNs,
            "completion monotonic time",
          ),
        ) <=
        BigInt(
          text(
            record(completionInputs[index - 1], "completion event").monotonicNs,
            "prior completion monotonic time",
          ),
        )
      )
        throw new Error("Adjudicator completion event order is not monotonic.");
    const providerEvent = validateRawEvent(
      protocolRoot,
      record(eventStream.providerOutputEvent, "provider output event"),
      completionInputs.length,
      runnerEvents,
      artifacts.serverRawLog,
      eventStream,
    );
    const providerCompletion = completions.find(
      (entry) => entry.responseId === providerEvent.responseId,
    );
    if (
      providerEvent.method !== "item/completed" ||
      providerEvent.structuredOutput !==
        decode(artifacts.providerOutput, "adjudicator provider output") ||
      providerCompletion === undefined ||
      providerCompletion.turnId !== providerEvent.turnId
    )
      throw new Error(
        "Adjudicator provider output is not the final item of its response turn.",
      );
    validateUsageProjection(
      usage,
      coreUsageReport,
      completions,
      artifacts.coreUsageReport,
    );
    const priorResponses: Set<string> = new Set([
      ...stringArray(gradeA.responseIds, "grader A responses"),
      ...stringArray(gradeB.responseIds, "grader B responses"),
    ]);
    if (
      recordValue.assignmentId === gradeA.assignmentId ||
      recordValue.assignmentId === gradeB.assignmentId ||
      recordValue.threadId === gradeA.threadId ||
      recordValue.threadId === gradeB.threadId ||
      recordValue.sessionId === gradeA.sessionId ||
      recordValue.sessionId === gradeB.sessionId ||
      recordValue.agentId === gradeA.agentId ||
      recordValue.agentId === gradeB.agentId ||
      stringArray(recordValue.responseIds, "adjudicator responses").some(
        (responseId) => priorResponses.has(responseId),
      )
    )
      throw new Error("Adjudicator reused a grader identity or response.");
  }

  /** Proves the exact six canonical secondary dimensions on a 1–5 scale. */
  export function validateSecondaryReview(input: unknown): void {
    const review = record(input, "secondary review");
    const ratings = array(review.ratings, "secondary ratings");
    if (
      JSON.stringify(
        ratings.map((entry) => record(entry, "secondary rating").dimension),
      ) !== JSON.stringify(SECONDARY_DIMENSIONS)
    )
      throw new Error(
        "Secondary review dimensions are incomplete or reordered.",
      );
    for (const inputRating of ratings) {
      const rating = record(inputRating, "secondary rating");
      if (
        !Number.isInteger(rating.score) ||
        (rating.score as number) < 1 ||
        (rating.score as number) > 5
      )
        throw new Error("Secondary review score must use the 1–5 scale.");
    }
  }

  /** Rejects impossible inclusive cache, reasoning, or total token counters. */
  export function validateExactUsageCounters(input: unknown): void {
    tokenUsage(input, "exact adjudicator usage");
  }

  /** Proves one milestone owns separate grade, guess, and review artifacts. */
  export function validateQualityPhase(
    input: unknown,
    parentCoreSealSha256: string,
  ): void {
    const phase = record(input, "quality phase");
    if (
      phase.coreSealSha256 !== parentCoreSealSha256 ||
      phase.humanValidationStatus !== "pending" ||
      phase.humanValidatedCompositeClaim !== false ||
      phase.denominatorsSummed !== false
    )
      throw new Error("Quality phase is not bound to the pending parent core.");
    for (const pair of [
      ["graderAGradeSha256", "graderBGradeSha256"],
      ["graderAArmGuessSha256", "graderBArmGuessSha256"],
      ["secondaryReviewASha256", "secondaryReviewBSha256"],
    ] as const)
      if (phase[pair[0]] === phase[pair[1]])
        throw new Error(`Quality phase reused both ${pair[0]} owners.`);
  }

  /** Proves the append-only seal owns both milestones and its own digest. */
  export function validatePostprocessSeal(
    input: unknown,
    parentCoreSealSha256: string,
  ): void {
    const seal = record(input, "postprocess seal");
    const { sealSha256, ...unsigned } = seal;
    if (
      seal.parentCoreSealSha256 !== parentCoreSealSha256 ||
      seal.humanValidationStatus !== "pending" ||
      seal.humanValidatedCompositeClaim !== false ||
      typeof seal.publicPromotionAllowed !== "boolean" ||
      typeof seal.publicSafetyScanSha256 !== "string" ||
      !SHA256.test(seal.publicSafetyScanSha256) ||
      seal.tDoneQualityPhaseSha256 === seal.tDryQualityPhaseSha256 ||
      sealSha256 !== EvidenceBenchmarkHash.object(unsigned)
    )
      throw new Error("Postprocess seal ownership or self digest drifted.");
  }

  /** Recomputes scanner, rules, file-set, raw-log, and finding byte identities. */
  export function validatePublicSafetyScan(
    input: unknown,
    expected: {
      runId: string;
      parentCoreSealSha256: string;
    },
    artifacts: IPublicSafetyInputs,
  ): void {
    const scan = record(input, "public-safety scan");
    const scanner = record(scan.scanner, "public-safety scanner");
    const entries = EvidenceBenchmarkHash.entries(artifacts.files);
    if (
      scan.runId !== expected.runId ||
      scan.parentCoreSealSha256 !== expected.parentCoreSealSha256 ||
      scanner.implementationSha256 !==
        EvidenceBenchmarkHash.bytes(artifacts.scannerSource) ||
      scanner.rulesSha256 !== EvidenceBenchmarkHash.bytes(artifacts.rules) ||
      record(scan.scannedRunRecordRawTree, "public-safety raw tree").sha256 !==
        EvidenceBenchmarkHash.tree(artifacts.files) ||
      scan.scannedFileSetSha256 !== EvidenceBenchmarkHash.object(entries) ||
      scan.scannedFileCount !== entries.length ||
      scan.scannedBytes !== entries.reduce((sum, entry) => sum + entry.bytes, 0)
    )
      throw new Error("Public-safety scanner or exact file set drifted.");
    const expectedLogs = entries
      .filter((entry) =>
        [
          "logs/client.raw.jsonl",
          "logs/server.raw.jsonl",
          "logs/stderr.raw.log",
        ].includes(entry.path),
      )
      .map((entry) => ({
        path: entry.path,
        bytes: entry.bytes,
        sha256: entry.sha256,
      }));
    if (JSON.stringify(scan.rawLogDigests) !== JSON.stringify(expectedLogs))
      throw new Error("Public-safety raw-log digest set drifted.");
    const high = array(
      scan.highConfidenceFindings,
      "public-safety high-confidence findings",
    );
    const manual = array(
      scan.manualReviewCandidates,
      "public-safety manual candidates",
    );
    for (const [kind, findings] of [
      ["high-confidence", high],
      ["manual", manual],
    ] as const)
      for (const inputFinding of findings) {
        const finding = record(inputFinding, `${kind} safety finding`);
        const filePath = text(finding.path, `${kind} safety path`);
        const bytes = artifacts.files.get(filePath);
        const offset = integer(
          finding.byteOffset,
          `${kind} safety byte offset`,
        );
        const length = integer(
          finding.byteLength,
          `${kind} safety byte length`,
        );
        if (
          bytes === undefined ||
          length === 0 ||
          EvidenceBenchmarkHash.bytes(
            bytes.subarray(offset, offset + length),
          ) !== finding.evidenceSha256 ||
          (kind === "high-confidence" &&
            (typeof finding.confidence !== "number" ||
              finding.confidence < 0.9)) ||
          (kind === "manual" &&
            (typeof finding.confidence !== "number" ||
              finding.confidence >= 0.9))
        )
          throw new Error(`${kind} public-safety finding lost exact evidence.`);
      }
    const pending: boolean = manual.length !== 0;
    const allowed: boolean = high.length === 0 && !pending;
    if (
      scan.manualReviewStatus !== (pending ? "pending" : "not_required") ||
      scan.publicPromotionAllowed !== allowed ||
      scan.rawEvidenceDisposition !== "retained_local_censored_from_publication"
    )
      throw new Error("Public-safety promotion boundary is inconsistent.");
  }

  /** Proves final promotion joins one core, postprocess, safety scan, and run. */
  export function validateResultPromotion(
    input: unknown,
    expected: {
      runId: string;
      parentCoreSealSha256: string;
      postprocessSealSha256: string;
      publicSafetyScanSha256: string;
      publicSafetyScanSchemaSha256: string;
      publicSafetyScannerSha256: string;
      publicSafetyRulesSha256: string;
      publicSafetyFileSetSha256: string;
    },
  ): void {
    const promotion = record(input, "result promotion");
    const core = record(promotion.coreSeal, "promotion core");
    const postprocess = record(promotion.postprocess, "promotion postprocess");
    const retained = record(promotion.retainedRun, "promoted retained run");
    const latest = record(promotion.latestPointer, "promoted latest pointer");
    const demo = record(promotion.demoWorkspace, "promoted demo workspace");
    const git = record(promotion.gitRoundTrip, "promotion Git round trip");
    const { manifestSha256, ...unsigned } = promotion;
    const prefix = `benchmark/result/${text(
      promotion.subject,
      "promotion subject",
    )}/${text(promotion.arm, "promotion arm")}`;
    if (
      promotion.runId !== expected.runId ||
      core.coreSealSha256 !== expected.parentCoreSealSha256 ||
      postprocess.parentCoreSealSha256 !== expected.parentCoreSealSha256 ||
      postprocess.postprocessSealSha256 !== expected.postprocessSealSha256 ||
      postprocess.publicSafetyScanSha256 !== expected.publicSafetyScanSha256 ||
      postprocess.publicSafetyScanSchemaSha256 !==
        expected.publicSafetyScanSchemaSha256 ||
      postprocess.publicSafetyScannerSha256 !==
        expected.publicSafetyScannerSha256 ||
      postprocess.publicSafetyRulesSha256 !==
        expected.publicSafetyRulesSha256 ||
      postprocess.publicSafetyFileSetSha256 !==
        expected.publicSafetyFileSetSha256 ||
      postprocess.publicSafetyHighConfidenceFindings !== 0 ||
      !["not_required", "cleared"].includes(
        postprocess.publicSafetyManualReviewStatus as string,
      ) ||
      postprocess.publicPromotionAllowed !== true ||
      retained.path !== `${prefix}/runs/${expected.runId}` ||
      retained.workspacePath !== `${prefix}/runs/${expected.runId}/workspace` ||
      latest.path !== `${prefix}/latest.json` ||
      latest.currentRunId !== expected.runId ||
      demo.path !== `${prefix}/workspace` ||
      git.sourceCoreSealSha256 !== expected.parentCoreSealSha256 ||
      git.cloneCoreSealSha256 !== expected.parentCoreSealSha256 ||
      manifestSha256 !== EvidenceBenchmarkHash.object(unsigned)
    )
      throw new Error(
        "Result promotion does not close its core, safety, or publication edges.",
      );
    const gradeSets = array(postprocess.gradeSets, "promotion grade sets").map(
      (entry) => record(entry, "promotion grade set"),
    );
    if (
      JSON.stringify(gradeSets.map((entry) => entry.milestone).sort()) !==
        JSON.stringify(["t_done", "t_dry"]) ||
      gradeSets.some(
        (entry) => entry.parentCoreSealSha256 !== expected.parentCoreSealSha256,
      )
    )
      throw new Error("Result promotion grade-set ownership drifted.");
  }

  interface IRawEventResult {
    method: "rawResponse/completed" | "item/completed";
    responseId: string;
    turnId: string;
    runnerEventSha256: string;
    monotonicNs: string;
    usage: Record<string, number> | null;
    structuredOutput: string | null;
  }

  function validateRawEvent(
    protocolRoot: string,
    event: Record<string, unknown>,
    expectedSequence: number,
    runnerEvents: readonly Record<string, unknown>[],
    serverRawLog: Uint8Array,
    eventStream: Record<string, unknown>,
  ): IRawEventResult {
    if (event.sequence !== expectedSequence)
      throw new Error("Adjudicator raw-event sequence drifted.");
    const runner = runnerEvent(
      runnerEvents,
      {
        sequence: event.runnerEventSequence,
        eventSha256: event.runnerEventSha256,
        monotonicNs: event.monotonicNs,
      },
      `adjudicator raw event ${expectedSequence}`,
    );
    const rawRef = record(event.rawRef, "adjudicator raw reference");
    if (
      runner.type !== "app_server_frame" ||
      runner.actor !== "app-server" ||
      JSON.stringify(runner.rawRef) !== JSON.stringify(rawRef)
    )
      throw new Error(
        "Adjudicator event does not reference its canonical runner event.",
      );
    const offset = integer(rawRef.byteOffset, "raw event byte offset");
    const length = integer(rawRef.byteLength, "raw event byte length");
    const rawFrame: Uint8Array = serverRawLog.subarray(offset, offset + length);
    if (
      rawFrame.byteLength !== length ||
      rawRef.sha256 !== EvidenceBenchmarkHash.bytes(rawFrame)
    )
      throw new Error(
        "Adjudicator raw reference does not match exact app-server bytes.",
      );
    const frame = record(
      EvidenceBenchmarkProtocolValidator.parse(
        decodeBytes(rawFrame, "adjudicator raw app-server frame"),
        `adjudicator raw app-server frame ${expectedSequence}`,
      ),
      "adjudicator raw app-server frame",
    );
    const method = text(event.method, "adjudicator raw method");
    if (method !== "rawResponse/completed" && method !== "item/completed")
      throw new Error("Adjudicator raw event names a synthetic vendor method.");
    const normalizedMethod: IRawEventResult["method"] = method;
    const expectedSchema: string =
      normalizedMethod === "rawResponse/completed"
        ? "v2/RawResponseCompletedNotification.json"
        : "v2/ItemCompletedNotification.json";
    if (
      frame.method !== normalizedMethod ||
      event.vendorSchemaPath !== expectedSchema
    )
      throw new Error("Adjudicator raw event names a synthetic vendor method.");
    const vendorSchema: Buffer = fs.readFileSync(
      path.join(
        path.resolve(protocolRoot),
        "vendor",
        "codex",
        "0.145.0",
        "app-server-schema-experimental",
        ...expectedSchema.split("/"),
      ),
    );
    if (event.vendorSchemaSha256 !== EvidenceBenchmarkHash.bytes(vendorSchema))
      throw new Error("Adjudicator raw event vendor schema drifted.");
    const params = record(frame.params, "adjudicator app-server params");
    const responseId = text(event.responseId, "adjudicator response id");
    const turnId = text(event.turnId, "adjudicator turn id");
    if (params.threadId !== eventStream.threadId || params.turnId !== turnId)
      throw new Error(
        "Adjudicator raw event thread or turn membership drifted.",
      );
    if (normalizedMethod === "rawResponse/completed") {
      if (
        params.responseId !== responseId ||
        event.structuredOutputJsonPointer !== null
      )
        throw new Error("Adjudicator completion event identity drifted.");
      const usage = tokenUsage(params.usage, `response ${responseId}`);
      return {
        method: normalizedMethod,
        responseId,
        turnId,
        runnerEventSha256: text(
          runner.eventSha256,
          "completion runner event hash",
        ),
        monotonicNs: text(runner.monotonicNs, "completion monotonic time"),
        usage,
        structuredOutput: null,
      };
    }
    const item = record(params.item, "adjudicator final item");
    if (
      event.structuredOutputJsonPointer !== "/params/item/text" ||
      item.type !== "agentMessage" ||
      typeof item.id !== "string" ||
      item.id.length === 0 ||
      typeof item.text !== "string"
    )
      throw new Error(
        "Adjudicator provider output is not a final agentMessage text.",
      );
    return {
      method: normalizedMethod,
      responseId,
      turnId,
      runnerEventSha256: text(runner.eventSha256, "provider runner event hash"),
      monotonicNs: text(runner.monotonicNs, "provider monotonic time"),
      usage: null,
      structuredOutput: item.text,
    };
  }

  function validateUsageProjection(
    usage: Record<string, unknown>,
    report: Record<string, unknown>,
    completions: readonly IRawEventResult[],
    reportBytes: Uint8Array,
  ): void {
    const reportResponses = array(
      report.responses,
      "adjudicator core usage responses",
    );
    const responseIds: string[] = completions.map((entry) => entry.responseId);
    if (
      report.schemaVersion !== 1 ||
      report.exactUsageComplete !== true ||
      array(report.duplicateResponseIds, "adjudicator duplicate responses")
        .length !== 0 ||
      reportResponses.length !== completions.length ||
      JSON.stringify(usage.responseIds) !== JSON.stringify(responseIds) ||
      usage.sourceUsageReportSha256 !==
        EvidenceBenchmarkHash.bytes(reportBytes) ||
      array(usage.duplicateResponseIds, "usage duplicate responses").length !==
        0 ||
      usage.exactUsageComplete !== true ||
      usage.exact !== true
    )
      throw new Error(
        "Adjudicator usage is not an exact canonical core projection.",
      );
    const sum: Record<string, number> = {
      inputTokens: 0,
      cachedInputTokens: 0,
      cacheWriteInputTokens: 0,
      outputTokens: 0,
      reasoningOutputTokens: 0,
      totalTokens: 0,
    };
    for (const completion of completions) {
      const response = reportResponses
        .map((entry) => record(entry, "adjudicator core usage response"))
        .find((entry) => entry.responseId === completion.responseId);
      if (
        response === undefined ||
        response.threadId !== usage.threadId ||
        response.turnId !== completion.turnId ||
        response.rawEventId !== completion.runnerEventSha256 ||
        response.receivedMonotonicNs !== completion.monotonicNs
      )
        throw new Error(
          "Adjudicator usage response lost raw-event membership.",
        );
      const reported = tokenUsage(
        response.usage,
        `core usage ${completion.responseId}`,
      );
      if (JSON.stringify(reported) !== JSON.stringify(completion.usage))
        throw new Error(
          "Adjudicator core usage differs from rawResponse/completed.",
        );
      for (const field of Object.keys(sum))
        sum[field] = (sum[field] ?? 0) + reported[field]!;
    }
    const exactTotal = tokenUsage(
      report.exactTotal,
      "adjudicator core exact total",
    );
    if (
      JSON.stringify(exactTotal) !== JSON.stringify(sum) ||
      Object.entries(sum).some(([field, value]) => usage[field] !== value)
    )
      throw new Error(
        "Adjudicator usage totals were not recomputed from exact raw events.",
      );
  }

  function tokenUsage(input: unknown, label: string): Record<string, number> {
    const value = record(input, label);
    const usage: Record<string, number> = {
      inputTokens: integer(value.inputTokens, `${label} input tokens`),
      cachedInputTokens: integer(
        value.cachedInputTokens,
        `${label} cached input tokens`,
      ),
      cacheWriteInputTokens: integer(
        value.cacheWriteInputTokens ?? 0,
        `${label} cache-write input tokens`,
      ),
      outputTokens: integer(value.outputTokens, `${label} output tokens`),
      reasoningOutputTokens: integer(
        value.reasoningOutputTokens,
        `${label} reasoning output tokens`,
      ),
      totalTokens: integer(value.totalTokens, `${label} total tokens`),
    };
    if (
      usage.cachedInputTokens! + usage.cacheWriteInputTokens! >
        usage.inputTokens! ||
      usage.reasoningOutputTokens! > usage.outputTokens! ||
      usage.totalTokens !== usage.inputTokens! + usage.outputTokens!
    )
      throw new Error(`${label} violates exact token-counter invariants.`);
    return usage;
  }

  function runnerEvent(
    events: readonly Record<string, unknown>[],
    reference: Record<string, unknown>,
    label: string,
  ): Record<string, unknown> {
    const sequence = integer(reference.sequence, `${label} sequence`);
    const event = events[sequence - 1];
    if (
      event === undefined ||
      event.seq !== sequence ||
      event.eventSha256 !== reference.eventSha256 ||
      event.monotonicNs !== reference.monotonicNs
    )
      throw new Error(`${label} is not a member of the exact runner ledger.`);
    return event;
  }

  function parseJsonLines(
    bytes: Uint8Array,
    label: string,
  ): Record<string, unknown>[] {
    const source: string = decodeBytes(bytes, label);
    if (!source.endsWith("\n"))
      throw new Error(`${label} has an incomplete trailing line.`);
    return source
      .slice(0, -1)
      .split("\n")
      .map((line, index) => {
        if (line.length === 0)
          throw new Error(`${label} contains a blank line at ${index + 1}.`);
        return record(
          EvidenceBenchmarkProtocolValidator.parse(
            line,
            `${label}:${index + 1}`,
          ),
          `${label}:${index + 1}`,
        );
      });
  }

  function validateRunnerEventChain(
    events: readonly Record<string, unknown>[],
  ): void {
    let previous: string = "0".repeat(64);
    for (const [index, event] of events.entries()) {
      const { eventSha256, ...unsigned } = event;
      const expected: string = EvidenceBenchmarkHash.bytes(
        canonicalJson(unsigned),
      );
      if (
        event.seq !== index + 1 ||
        event.previousEventSha256 !== previous ||
        eventSha256 !== expected
      )
        throw new Error(
          `Adjudicator runner event chain breaks at ${index + 1}.`,
        );
      previous = text(eventSha256, "runner event hash");
    }
  }

  function canonicalJson(input: unknown): string {
    if (input === null || typeof input !== "object")
      return JSON.stringify(input);
    if (Array.isArray(input))
      return `[${input.map((entry) => canonicalJson(entry)).join(",")}]`;
    return `{${Object.entries(input as Record<string, unknown>)
      .sort(([left], [right]) =>
        Buffer.from(left, "utf8").compare(Buffer.from(right, "utf8")),
      )
      .map(([key, value]) => `${JSON.stringify(key)}:${canonicalJson(value)}`)
      .join(",")}}`;
  }

  function decodeBytes(bytes: Uint8Array, label: string): string {
    try {
      return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      throw new Error(`${label} is not valid UTF-8.`);
    }
  }

  function integer(input: unknown, label: string): number {
    if (!Number.isSafeInteger(input) || (input as number) < 0)
      throw new Error(`${label} must be a non-negative safe integer.`);
    return input as number;
  }

  function validatePopulation(
    grade: Record<string, unknown>,
    population: "acceptance" | "context",
  ): void {
    const prefix: string =
      population === "acceptance" ? "acceptance" : "context";
    const ratings = array(grade[`${prefix}Ratings`], `${population} ratings`);
    const summary = record(grade[`${prefix}Summary`], `${population} summary`);
    if (
      ratings.length !== grade[`${prefix}PopulationCount`] ||
      summary.populationCount !== ratings.length ||
      new Set(ratings.map((entry) => record(entry, "grade rating").criterionId))
        .size !== ratings.length
    )
      throw new Error(`${population} grade population does not reconcile.`);
    for (const rating of ratings) validateRating(rating, true);
    const statusCount = (status: string): number =>
      ratings.filter((entry) => record(entry, "grade rating").status === status)
        .length;
    const notApplicable: number = statusCount("not_applicable");
    const expected: Record<string, number> = {
      populationCount: ratings.length,
      applicable: ratings.length - notApplicable,
      implementedCorrectly: statusCount("implemented_correctly"),
      partial: statusCount("partial"),
      omitted: statusCount("omitted"),
      contradicted: statusCount("contradicted"),
      unverifiable: statusCount("unverifiable"),
      notApplicable,
      testable: ratings.filter(
        (entry) => record(record(entry, "rating").test, "test").testable,
      ).length,
      nonVacuousTested: ratings.filter(
        (entry) => record(record(entry, "rating").test, "test").nonVacuous,
      ).length,
      criticalDefects: ratings.filter(
        (entry) => record(entry, "rating").severity === "critical",
      ).length,
    };
    if (Object.entries(expected).some(([key, value]) => summary[key] !== value))
      throw new Error(`${population} grade summary drifted.`);
  }

  function validateRating(input: unknown, taxonomyRequired: boolean): void {
    const rating = record(input, "semantic rating");
    const surfaces = array(rating.surfaces, "rating surfaces");
    if (
      JSON.stringify(
        surfaces.map((entry) => record(entry, "surface").surface),
      ) !== JSON.stringify(SURFACES)
    )
      throw new Error(
        "Semantic rating must contain each surface exactly once.",
      );
    const test = record(rating.test, "rating test");
    if (
      test.nonVacuous === true &&
      (test.testable !== true ||
        test.exists !== true ||
        test.executed !== true ||
        test.passes !== true ||
        ![test.positive, test.negative, test.boundary].some(
          (entry) => entry === true,
        ))
    )
      throw new Error("Non-vacuous test semantics are inconsistent.");
    if (
      taxonomyRequired &&
      (!Object.hasOwn(rating, "defectClass") ||
        rating.defectClass === undefined)
    )
      throw new Error("Assembled grade is missing post-blind taxonomy.");
  }

  function labeledHash(
    entries: ReadonlyArray<readonly [string, Uint8Array]>,
  ): string {
    const hash = crypto.createHash("sha256");
    for (const [label, bytes] of entries)
      hash.update(label, "ascii").update("\0").update(bytes).update("\0");
    return hash.digest("hex");
  }

  function rawTree(
    input: unknown,
    label: string,
  ): { algorithmId: string; sha256: string } {
    const value = record(input, label);
    if (
      value.algorithmId !== EvidenceBenchmarkHash.TREE_ALGORITHM ||
      typeof value.sha256 !== "string" ||
      !SHA256.test(value.sha256)
    )
      throw new Error(`${label} is not an algorithm-qualified raw tree.`);
    return {
      algorithmId: value.algorithmId,
      sha256: value.sha256,
    };
  }

  function record(input: unknown, label: string): Record<string, unknown> {
    if (typeof input !== "object" || input === null || Array.isArray(input))
      throw new Error(`${label} must be an object.`);
    return input as Record<string, unknown>;
  }

  function array(input: unknown, label: string): unknown[] {
    if (!Array.isArray(input)) throw new Error(`${label} must be an array.`);
    return input;
  }

  function stringArray(input: unknown, label: string): string[] {
    return array(input, label).map((entry, index) =>
      text(entry, `${label} ${index}`),
    );
  }

  function text(input: unknown, label: string): string {
    if (
      typeof input !== "string" ||
      input.length === 0 ||
      input !== input.trim()
    )
      throw new Error(`${label} must be a nonblank string.`);
    return input;
  }
}
