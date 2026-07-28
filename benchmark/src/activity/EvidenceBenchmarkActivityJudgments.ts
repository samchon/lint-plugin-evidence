import { EvidenceBenchmarkActivityCanonical } from "./EvidenceBenchmarkActivityCanonical.ts";
import { EvidenceBenchmarkActivityCodebook } from "./EvidenceBenchmarkActivityCodebook.ts";
import { EvidenceBenchmarkActivityExecutions } from "./EvidenceBenchmarkActivityExecutions.ts";
import { EvidenceBenchmarkActivityObservations } from "./EvidenceBenchmarkActivityObservations.ts";
import type { IEvidenceBenchmarkActivity } from "./IEvidenceBenchmarkActivity.ts";

/** Local semantic admission for two isolated raters and one fresh adjudicator. */
export namespace EvidenceBenchmarkActivityJudgments {
  /** Locally admitted rating with mechanically extracted event citations. */
  export interface IRating {
    /** Restricted provider-facing rating row. */
    source: IEvidenceBenchmarkActivity.IProviderRating;

    /** Unique maximum-probability primary category. */
    primary: IEvidenceBenchmarkActivity.PrimaryActivity;

    /** Rater-selected citations admitted against the sealed event allowlist. */
    evidenceEventIds: readonly string[];
  }

  /** Locally admitted artifact indexed by exact response ID. */
  export interface IAdmittedRater {
    /** Complete provenance wrapper admitted by local invariants. */
    artifact: IEvidenceBenchmarkActivity.IRaterArtifact;

    /** One locally admitted rating per exact response. */
    ratings: ReadonlyMap<string, IRating>;
  }

  /** Admits one isolated rater artifact against exact observations. */
  export function admitRater(
    observations: IEvidenceBenchmarkActivity.IObservations,
    artifact: IEvidenceBenchmarkActivity.IRaterArtifact,
    evidence: IEvidenceBenchmarkActivity.IModelExecutionEvidence,
  ): IAdmittedRater {
    const assignment: IEvidenceBenchmarkActivity.IRaterAssignment =
      artifact.assignment;
    sameBinding(observations.binding, assignment.binding);
    if (
      artifact.schemaVersion !== 1 ||
      assignment.schemaVersion !== 1 ||
      assignment.issuer !== "runner" ||
      artifact.providerOutput.schemaVersion !== 1 ||
      artifact.providerOutput.role !== "activity_rater"
    )
      throw new Error("Activity rater artifact has an unsupported schema.");
    if (
      artifact.providerOutput.runId !== observations.binding.runId ||
      artifact.providerOutput.blockId !== observations.binding.blockId
    )
      throw new Error(
        "Activity rater output is bound to another run or block.",
      );
    if (
      artifact.providerOutput.status !== "completed" ||
      assignment.raterId.length === 0 ||
      assignment.threadId.length === 0 ||
      assignment.sessionId.length === 0 ||
      assignment.model !== "gpt-5.6-terra" ||
      assignment.effort !== "high" ||
      !/^[a-f0-9]{64}$/.test(assignment.processProvenanceSha256) ||
      !Number.isFinite(Date.parse(assignment.issuedAtUtc))
    )
      throw new Error("Activity rater must complete with full provenance.");
    if (
      assignment.otherRaterOutputVisible !== false ||
      assignment.aggregateArmResultsVisible !== false
    )
      throw new Error("Activity rater isolation was not preserved.");
    const expectedTurn: string =
      assignment.turnClass === "activity-rater-a"
        ? "activity-rater-a"
        : "activity-rater-b";
    if (assignment.turnClass !== expectedTurn)
      throw new Error("Activity rater turn class is invalid.");
    assignmentHashes(observations, assignment, artifact.assignmentSha256);
    exactSelfHashes(artifact);
    EvidenceBenchmarkActivityExecutions.admit(
      observations.binding,
      artifact.execution,
      evidence,
      {
        assignmentSha256: assignment.assignmentSha256,
        agentRole: assignment.turnClass,
        sessionId: assignment.sessionId,
        threadId: assignment.threadId,
        providerOutputSha256: artifact.providerOutputSha256,
        processProvenanceSha256: assignment.processProvenanceSha256,
      },
    );
    const allowed: Set<string> = uniqueNonempty(
      assignment.allowedEvidenceEventIds,
      "allowedEvidenceEventIds",
    );
    exactSet(
      assignment.allowedEvidenceEventIds,
      new Set(observations.eventIds),
      "assignment evidence event IDs",
    );
    const responseIds: Set<string> = new Set(
      observations.responses.map((response) => response.responseId),
    );
    exactSet(
      artifact.providerOutput.responseIds,
      responseIds,
      "provider response IDs",
    );
    exactSet(assignment.responseIds, responseIds, "assignment response IDs");
    const result: Map<string, IRating> = new Map();
    for (const rating of artifact.providerOutput.ratings) {
      if (!responseIds.has(rating.responseId))
        throw new Error(`Rating names unknown response ${rating.responseId}.`);
      if (result.has(rating.responseId))
        throw new Error(`Rating repeats response ${rating.responseId}.`);
      const primary: IEvidenceBenchmarkActivity.PrimaryActivity = probability(
        rating.probabilityBasisPoints,
      );
      mechanisms(rating.secondaryMechanisms);
      if (
        !EvidenceBenchmarkActivityCodebook.CAUSAL_ROLES.includes(
          rating.causalRole,
        )
      )
        throw new Error(`Unknown causal role for ${rating.responseId}.`);
      if (
        !Number.isFinite(rating.confidence) ||
        rating.confidence < 0 ||
        rating.confidence >= 1
      )
        throw new Error(
          `${rating.responseId} semantic confidence must be in [0, 1).`,
        );
      if (rating.rationale.length === 0)
        throw new Error(`${rating.responseId} lacks a rationale.`);
      causalConsistency(rating, primary);
      const evidenceEventIds: readonly string[] = citations(rating.rationale);
      for (const eventId of evidenceEventIds)
        if (!allowed.has(eventId))
          throw new Error(
            `${rating.responseId} cites event outside its sealed evidence window.`,
          );
      result.set(rating.responseId, {
        source: rating,
        primary,
        evidenceEventIds,
      });
    }
    if (result.size !== responseIds.size)
      throw new Error("Activity rater omitted an exact response.");
    return { artifact, ratings: result };
  }

  /** Proves the two rater turns used distinct identities, threads, and sessions. */
  export function independent(
    left: IAdmittedRater,
    right: IAdmittedRater,
  ): void {
    if (
      left.artifact.assignment.turnClass === right.artifact.assignment.turnClass
    )
      throw new Error("Independent raters must use different turn classes.");
    for (const field of ["raterId", "threadId", "sessionId"] as const)
      if (left.artifact.assignment[field] === right.artifact.assignment[field])
        throw new Error(`Independent raters share ${field}.`);
    EvidenceBenchmarkActivityExecutions.independent([
      left.artifact.execution,
      right.artifact.execution,
    ]);
    if (
      [...left.artifact.assignment.allowedEvidenceEventIds]
        .sort()
        .join("\0") !==
      [...right.artifact.assignment.allowedEvidenceEventIds].sort().join("\0")
    )
      throw new Error(
        "Independent raters received different evidence windows.",
      );
  }

  /** Deterministically constructs the queue before adjudicator execution. */
  export function queue(
    observations: IEvidenceBenchmarkActivity.IObservations,
    left: IAdmittedRater,
    right: IAdmittedRater,
  ): IEvidenceBenchmarkActivity.IAdjudicationQueueEntry[] {
    independent(left, right);
    const exactTotal: number = observations.responses.reduce(
      (sum, response) => sum + (response.usage?.totalTokens ?? 0),
      0,
    );
    return observations.responses.flatMap((response) => {
      const a: IRating = required(left, response.responseId);
      const b: IRating = required(right, response.responseId);
      const reasons: IEvidenceBenchmarkActivity.IAdjudicationQueueEntry["reasons"][number][] =
        [];
      if (a.primary !== b.primary) reasons.push("primary_disagreement");
      if (a.source.causalRole !== b.source.causalRole)
        reasons.push("causal_role_disagreement");
      if (
        [...a.source.secondaryMechanisms].sort().join("\0") !==
        [...b.source.secondaryMechanisms].sort().join("\0")
      )
        reasons.push("mechanism_disagreement");
      if (a.source.confidence < 0.7 || b.source.confidence < 0.7)
        reasons.push("low_confidence");
      if (
        peak(a.source.probabilityBasisPoints) < 7_000 ||
        peak(b.source.probabilityBasisPoints) < 7_000
      )
        reasons.push("low_peak_probability");
      if (
        a.source.probabilityBasisPoints.residual_unclassified > 0 ||
        b.source.probabilityBasisPoints.residual_unclassified > 0
      )
        reasons.push("residual_probability");
      if (a.evidenceEventIds.length === 0 || b.evidenceEventIds.length === 0)
        reasons.push("missing_evidence_reference");
      if (
        exactTotal > 0 &&
        response.usage !== null &&
        response.usage.totalTokens * 10_000 >= exactTotal * 100
      )
        reasons.push("high_token_influence");
      return reasons.length === 0
        ? []
        : [{ responseId: response.responseId, reasons }];
    });
  }

  /** Admits an optional fresh adjudicator against the immutable queue. */
  export function admitAdjudicator(
    observations: IEvidenceBenchmarkActivity.IObservations,
    raters: readonly [IAdmittedRater, IAdmittedRater],
    entries: readonly IEvidenceBenchmarkActivity.IAdjudicationQueueEntry[],
    artifact: IEvidenceBenchmarkActivity.IAdjudicatorArtifact,
    evidence: IEvidenceBenchmarkActivity.IModelExecutionEvidence,
  ): ReadonlyMap<
    string,
    IEvidenceBenchmarkActivity.IProviderAdjudicationDecision
  > {
    const assignment: IEvidenceBenchmarkActivity.IAdjudicatorAssignment =
      artifact.assignment;
    sameBinding(observations.binding, assignment.binding);
    independent(raters[0], raters[1]);
    for (const identity of [
      assignment.adjudicatorId,
      assignment.threadId,
      assignment.sessionId,
    ])
      if (
        identity.length === 0 ||
        identity === raters[0].artifact.assignment.raterId ||
        identity === raters[1].artifact.assignment.raterId ||
        identity === raters[0].artifact.assignment.threadId ||
        identity === raters[1].artifact.assignment.threadId ||
        identity === raters[0].artifact.assignment.sessionId ||
        identity === raters[1].artifact.assignment.sessionId
      )
        throw new Error("Activity adjudicator is not fresh.");
    if (
      assignment.raterArtifactSha256[0] !== raters[0].artifact.artifactSha256 ||
      assignment.raterArtifactSha256[1] !== raters[1].artifact.artifactSha256
    )
      throw new Error("Adjudicator does not bind both exact rater artifacts.");
    if (
      assignment.schemaVersion !== 1 ||
      assignment.issuer !== "runner" ||
      !/^[a-f0-9]{64}$/.test(assignment.processProvenanceSha256) ||
      !Number.isFinite(Date.parse(assignment.issuedAtUtc)) ||
      artifact.providerOutput.schemaVersion !== 1 ||
      artifact.providerOutput.role !== "llm_adjudicator" ||
      artifact.providerOutput.population !== "activity" ||
      artifact.providerOutput.subject !== observations.binding.subject ||
      artifact.providerOutput.phase !== observations.binding.milestone ||
      assignment.model !== "gpt-5.6-terra" ||
      assignment.effort !== "high" ||
      artifact.providerOutput.status !== "completed"
    )
      throw new Error("Activity adjudicator output did not complete.");
    const queueSha256: string =
      EvidenceBenchmarkActivityCanonical.object(entries);
    const sealedInputsSha256: string =
      EvidenceBenchmarkActivityCanonical.object({
        observationSha256: observations.observationSha256,
        raterArtifactSha256: assignment.raterArtifactSha256,
        queueSha256,
        codebookSha256: observations.binding.codebookSha256,
        parentCoreSealSha256: observations.binding.parentCoreSealSha256,
      });
    if (
      artifact.providerOutput.queueSha256 !== queueSha256 ||
      artifact.providerOutput.sealedInputsSha256 !== sealedInputsSha256 ||
      assignment.observationSha256 !== observations.observationSha256 ||
      assignment.queueSha256 !== queueSha256 ||
      assignment.sealedInputsSha256 !== sealedInputsSha256
    )
      throw new Error(
        "Adjudicator input digests differ from the sealed queue.",
      );
    exactAdjudicatorHashes(artifact);
    EvidenceBenchmarkActivityExecutions.admit(
      observations.binding,
      artifact.execution,
      evidence,
      {
        assignmentSha256: assignment.assignmentSha256,
        agentRole: "activity-adjudicator",
        sessionId: assignment.sessionId,
        threadId: assignment.threadId,
        providerOutputSha256: artifact.providerOutputSha256,
        processProvenanceSha256: assignment.processProvenanceSha256,
      },
    );
    EvidenceBenchmarkActivityExecutions.independent([
      raters[0].artifact.execution,
      raters[1].artifact.execution,
      artifact.execution,
    ]);
    const expected: Set<string> = new Set(
      entries.map((entry) => entry.responseId),
    );
    const result: Map<
      string,
      IEvidenceBenchmarkActivity.IProviderAdjudicationDecision
    > = new Map();
    const allowed: Set<string> = new Set([
      ...raters[0].artifact.assignment.allowedEvidenceEventIds,
      ...raters[1].artifact.assignment.allowedEvidenceEventIds,
    ]);
    exactSet(
      assignment.allowedEvidenceEventIds,
      allowed,
      "adjudicator evidence event IDs",
    );
    for (const decision of artifact.providerOutput.decisions) {
      if (!expected.has(decision.itemId) || result.has(decision.itemId))
        throw new Error(
          `Adjudicator decision set is not the frozen activity queue.`,
        );
      if (
        !["rater_a", "rater_b", "unresolved"].includes(decision.decision) ||
        !Number.isFinite(decision.confidence) ||
        decision.confidence < 0 ||
        decision.confidence >= 1 ||
        decision.rationale.length === 0
      )
        throw new Error(`Invalid adjudicator decision for ${decision.itemId}.`);
      const evidence: readonly string[] = citations(decision.rationale);
      if (evidence.length === 0)
        throw new Error(
          `Adjudicator decision ${decision.itemId} lacks an event citation.`,
        );
      for (const eventId of evidence)
        if (!allowed.has(eventId))
          throw new Error(
            `Adjudicator cites event outside both sealed evidence windows.`,
          );
      result.set(decision.itemId, decision);
    }
    if (result.size !== expected.size)
      throw new Error("Adjudicator omitted a queued activity response.");
    return result;
  }

  /** Returns the mechanically derived primary for one admitted rating. */
  export function probability(
    input: IEvidenceBenchmarkActivity.ProbabilityBasisPoints,
  ): IEvidenceBenchmarkActivity.PrimaryActivity {
    const keys: string[] = Object.keys(input);
    if (
      keys.length !==
        EvidenceBenchmarkActivityCodebook.PRIMARY_ACTIVITIES.length ||
      EvidenceBenchmarkActivityCodebook.PRIMARY_ACTIVITIES.some(
        (category) => !Object.hasOwn(input, category),
      )
    )
      throw new Error("Activity probability vector has the wrong code set.");
    let total: number = 0;
    let maximum: number = -1;
    let selected: IEvidenceBenchmarkActivity.PrimaryActivity[] = [];
    for (const category of EvidenceBenchmarkActivityCodebook.PRIMARY_ACTIVITIES) {
      const value: number = input[category];
      if (!Number.isInteger(value) || value < 0 || value > 10_000)
        throw new Error(`Invalid basis points for ${category}.`);
      total += value;
      if (value > maximum) {
        maximum = value;
        selected = [category];
      } else if (value === maximum) selected.push(category);
    }
    if (total !== 10_000)
      throw new Error("Activity probability basis points must sum to 10,000.");
    if (selected.length !== 1)
      throw new Error("Activity rating must have one unambiguous primary.");
    return selected[0]!;
  }

  /** Extracts explicit rater-selected event citations from a rationale. */
  export function citations(input: string): readonly string[] {
    const matches: string[] = [];
    for (const match of input.matchAll(/\[\[event:([^\]\r\n]+)\]\]/g))
      if (!matches.includes(match[1]!)) matches.push(match[1]!);
    return matches;
  }

  function causalConsistency(
    rating: IEvidenceBenchmarkActivity.IProviderRating,
    primary: IEvidenceBenchmarkActivity.PrimaryActivity,
  ): void {
    const mechanisms: Set<IEvidenceBenchmarkActivity.SecondaryMechanism> =
      new Set(rating.secondaryMechanisms);
    const required: IEvidenceBenchmarkActivity.SecondaryMechanism | null =
      rating.causalRole === "direct_method_burden"
        ? "direct_method_campaign"
        : rating.causalRole === "induced_method_burden"
          ? "induced_method_campaign"
          : rating.causalRole === "quality_producing_fix"
            ? "quality_producing_fix"
            : rating.causalRole === "shared"
              ? "shared_product_work"
              : null;
    if (required !== null && !mechanisms.has(required))
      throw new Error(
        `${rating.responseId} causal role lacks ${required} mechanism.`,
      );
    if (
      (primary === "residual_unclassified") !==
      (rating.causalRole === "residual")
    )
      throw new Error(
        `${rating.responseId} residual primary and causal role disagree.`,
      );
  }

  function mechanisms(
    input: readonly IEvidenceBenchmarkActivity.SecondaryMechanism[],
  ): void {
    if (new Set(input).size !== input.length)
      throw new Error("Activity rating repeats a secondary mechanism.");
    for (const mechanism of input)
      if (
        !EvidenceBenchmarkActivityCodebook.SECONDARY_MECHANISMS.includes(
          mechanism,
        )
      )
        throw new Error(`Unknown secondary mechanism: ${mechanism}`);
  }

  function sameBinding(
    expected: IEvidenceBenchmarkActivity.IBinding,
    actual: IEvidenceBenchmarkActivity.IBinding,
  ): void {
    EvidenceBenchmarkActivityObservations.binding(actual);
    if (
      EvidenceBenchmarkActivityCanonical.stringify(expected) !==
      EvidenceBenchmarkActivityCanonical.stringify(actual)
    )
      throw new Error("Activity artifact immutable binding differs.");
  }

  function exactSelfHashes(
    artifact: IEvidenceBenchmarkActivity.IRaterArtifact,
  ): void {
    if (artifact.assignmentSha256 !== artifact.assignment.assignmentSha256)
      throw new Error("Activity rater assignment identity differs.");
    if (
      artifact.providerOutputSha256 !==
      EvidenceBenchmarkActivityCanonical.object(artifact.providerOutput)
    )
      throw new Error("Activity rater provider output digest differs.");
    const { artifactSha256: _ignored, ...body } = artifact;
    if (
      artifact.artifactSha256 !==
      EvidenceBenchmarkActivityCanonical.object(body)
    )
      throw new Error("Activity rater artifact digest differs.");
  }

  function exactAdjudicatorHashes(
    artifact: IEvidenceBenchmarkActivity.IAdjudicatorArtifact,
  ): void {
    const { assignmentSha256: _assignmentIgnored, ...assignmentBody } =
      artifact.assignment;
    if (
      artifact.assignmentSha256 !== artifact.assignment.assignmentSha256 ||
      artifact.assignment.assignmentSha256 !==
        EvidenceBenchmarkActivityCanonical.object(assignmentBody)
    )
      throw new Error("Activity adjudicator assignment digest differs.");
    if (
      artifact.providerOutputSha256 !==
      EvidenceBenchmarkActivityCanonical.object(artifact.providerOutput)
    )
      throw new Error("Activity adjudicator provider output digest differs.");
    const { artifactSha256: _ignored, ...body } = artifact;
    if (
      artifact.artifactSha256 !==
      EvidenceBenchmarkActivityCanonical.object(body)
    )
      throw new Error("Activity adjudicator artifact digest differs.");
  }

  function assignmentHashes(
    observations: IEvidenceBenchmarkActivity.IObservations,
    assignment: IEvidenceBenchmarkActivity.IRaterAssignment,
    artifactAssignmentSha256: string,
  ): void {
    const { assignmentSha256: _ignored, ...body } = assignment;
    const assignmentSha256: string =
      EvidenceBenchmarkActivityCanonical.object(body);
    const sealedInputsSha256: string =
      EvidenceBenchmarkActivityCanonical.object({
        binding: observations.binding,
        observationSha256: observations.observationSha256,
        codebookSha256: observations.binding.codebookSha256,
        responseIds: observations.responses.map((row) => row.responseId),
        allowedEvidenceEventIds: assignment.allowedEvidenceEventIds,
        turnClass: assignment.turnClass,
      });
    if (
      assignment.assignmentSha256 !== assignmentSha256 ||
      artifactAssignmentSha256 !== assignmentSha256 ||
      assignment.observationSha256 !== observations.observationSha256 ||
      assignment.codebookSha256 !== observations.binding.codebookSha256 ||
      assignment.sealedInputsSha256 !== sealedInputsSha256
    )
      throw new Error(
        "Activity rater assignment is not sealed to observations.",
      );
  }

  function exactSet(
    input: readonly string[],
    expected: ReadonlySet<string>,
    label: string,
  ): void {
    const actual: Set<string> = uniqueNonempty(input, label);
    if (
      actual.size !== expected.size ||
      [...expected].some((value) => !actual.has(value))
    )
      throw new Error(`${label} differ from exact observation responses.`);
  }

  function uniqueNonempty(
    input: readonly string[],
    label: string,
  ): Set<string> {
    if (input.some((value) => typeof value !== "string" || value.length === 0))
      throw new Error(`${label} must contain non-empty strings.`);
    const result: Set<string> = new Set(input);
    if (result.size !== input.length)
      throw new Error(`${label} contains a duplicate.`);
    return result;
  }

  function required(input: IAdmittedRater, responseId: string): IRating {
    const result: IRating | undefined = input.ratings.get(responseId);
    if (result === undefined)
      throw new Error(`Rater omitted response ${responseId}.`);
    return result;
  }

  function peak(
    input: IEvidenceBenchmarkActivity.ProbabilityBasisPoints,
  ): number {
    return Math.max(
      ...EvidenceBenchmarkActivityCodebook.PRIMARY_ACTIVITIES.map(
        (category) => input[category],
      ),
    );
  }
}
