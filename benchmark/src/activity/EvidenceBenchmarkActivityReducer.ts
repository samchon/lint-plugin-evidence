import { EvidenceBenchmarkActivityCanonical } from "./EvidenceBenchmarkActivityCanonical.ts";
import { EvidenceBenchmarkActivityCodebook } from "./EvidenceBenchmarkActivityCodebook.ts";
import {
  EvidenceBenchmarkActivityJudgments,
  type EvidenceBenchmarkActivityJudgments as Judgments,
} from "./EvidenceBenchmarkActivityJudgments.ts";
import { EvidenceBenchmarkActivityObservations } from "./EvidenceBenchmarkActivityObservations.ts";
import type { IEvidenceBenchmarkActivity } from "./IEvidenceBenchmarkActivity.ts";

/** Deterministically combines exact observations with isolated AI judgments. */
export namespace EvidenceBenchmarkActivityReducer {
  /** Complete reducer request; adjudication may be absent but never synthesized. */
  export interface IInput {
    /** Exact core-bound observations. */
    observations: IEvidenceBenchmarkActivity.IObservations;

    /** Ordered independent rater artifacts. */
    raters: readonly [
      IEvidenceBenchmarkActivity.IRaterArtifact,
      IEvidenceBenchmarkActivity.IRaterArtifact,
    ];

    /** Exact runner evidence for both rater executions. */
    raterEvidence: readonly [
      IEvidenceBenchmarkActivity.IModelExecutionEvidence,
      IEvidenceBenchmarkActivity.IModelExecutionEvidence,
    ];

    /** Optional fresh adjudicator artifact for the deterministic queue. */
    adjudicator?: IEvidenceBenchmarkActivity.IAdjudicatorArtifact;

    /** Exact runner evidence for the optional adjudicator execution. */
    adjudicatorEvidence?: IEvidenceBenchmarkActivity.IModelExecutionEvidence;
  }

  interface IResolution {
    primary: IEvidenceBenchmarkActivity.PrimaryActivity;
    causalRole: IEvidenceBenchmarkActivity.CausalRole;
    point: IEvidenceBenchmarkActivity.ProbabilityBasisPoints;
    lower: IEvidenceBenchmarkActivity.ProbabilityBasisPoints;
    upper: IEvidenceBenchmarkActivity.ProbabilityBasisPoints;
    unresolved: boolean;
  }

  interface IInterval {
    start: bigint;
    end: bigint;
    responseId: string | null;
    primary: IEvidenceBenchmarkActivity.PrimaryActivity;
    causalRole: IEvidenceBenchmarkActivity.CausalRole;
    point: IEvidenceBenchmarkActivity.ProbabilityBasisPoints;
    lower: IEvidenceBenchmarkActivity.ProbabilityBasisPoints;
    upper: IEvidenceBenchmarkActivity.ProbabilityBasisPoints;
  }

  /** Produces an integrity-bound report without upgrading estimates to facts. */
  export function reduce(input: IInput): IEvidenceBenchmarkActivity.IReport {
    verifyObservationHash(input.observations);
    const left: Judgments.IAdmittedRater =
      EvidenceBenchmarkActivityJudgments.admitRater(
        input.observations,
        input.raters[0],
        input.raterEvidence[0],
      );
    const right: Judgments.IAdmittedRater =
      EvidenceBenchmarkActivityJudgments.admitRater(
        input.observations,
        input.raters[1],
        input.raterEvidence[1],
      );
    EvidenceBenchmarkActivityJudgments.independent(left, right);
    const queue: IEvidenceBenchmarkActivity.IAdjudicationQueueEntry[] =
      EvidenceBenchmarkActivityJudgments.queue(input.observations, left, right);
    const decisions: ReadonlyMap<
      string,
      IEvidenceBenchmarkActivity.IProviderAdjudicationDecision
    > =
      input.adjudicator === undefined
        ? new Map()
        : input.adjudicatorEvidence === undefined
          ? (() => {
              throw new Error(
                "Activity adjudicator lacks exact execution evidence.",
              );
            })()
          : EvidenceBenchmarkActivityJudgments.admitAdjudicator(
              input.observations,
              [left, right],
              queue,
              input.adjudicator,
              input.adjudicatorEvidence,
            );
    const queued: Set<string> = new Set(queue.map((entry) => entry.responseId));
    const resolutions: Map<string, IResolution> = new Map();
    for (const response of input.observations.responses)
      resolutions.set(
        response.responseId,
        resolve(
          response.responseId,
          left,
          right,
          queued.has(response.responseId),
          decisions.get(response.responseId),
        ),
      );
    const exactTotal: IEvidenceBenchmarkActivity.ITokenVector = zeroVector();
    const whole: Map<
      IEvidenceBenchmarkActivity.PrimaryActivity,
      IEvidenceBenchmarkActivity.ITokenVector
    > = vectorTable();
    const point: Map<IEvidenceBenchmarkActivity.PrimaryActivity, Numerator> =
      numeratorTable();
    const lower: Map<IEvidenceBenchmarkActivity.PrimaryActivity, Numerator> =
      numeratorTable();
    const upper: Map<IEvidenceBenchmarkActivity.PrimaryActivity, Numerator> =
      numeratorTable();
    const burdenWhole: Map<
      IEvidenceBenchmarkActivity.CausalRole,
      IEvidenceBenchmarkActivity.ITokenVector
    > = roleVectorTable();
    const burdenPoint: Map<IEvidenceBenchmarkActivity.CausalRole, Numerator> =
      roleNumeratorTable();
    const unresolvedResponseIds: string[] = [];
    let hasNullUsage: boolean =
      !input.observations.sourceExactUsageComplete ||
      !input.observations.sourceEventCaptureComplete ||
      !input.observations.sourceEventChainClosed ||
      !input.observations.sourceActivityCaptureComplete ||
      !input.observations.sourceActivityLedgerClosed;
    for (const response of input.observations.responses) {
      const resolution: IResolution = requiredResolution(
        resolutions,
        response.responseId,
      );
      if (resolution.unresolved)
        unresolvedResponseIds.push(response.responseId);
      if (response.usage === null) {
        hasNullUsage = true;
        continue;
      }
      const vector: IEvidenceBenchmarkActivity.ITokenVector =
        EvidenceBenchmarkActivityObservations.tokenVector(response.usage);
      addVector(exactTotal, vector);
      addVector(whole.get(resolution.primary)!, vector);
      addWeighted(point, vector, resolution.point);
      addWeighted(lower, vector, resolution.lower);
      addWeighted(upper, vector, resolution.upper);
      addVector(burdenWhole.get(resolution.causalRole)!, vector);
      addNumerator(
        burdenPoint.get(resolution.causalRole)!,
        weighted(vector, 10_000),
      );
    }
    const timing: Timing = time(input.observations, resolutions);
    const exactTokenReconciled: boolean =
      equalVector(exactTotal, sumVectors([...whole.values()])) &&
      equalNumerator(
        weighted(exactTotal, 10_000),
        sumNumerators([...point.values()]),
      );
    if (!exactTokenReconciled)
      throw new Error("Activity token allocation does not reconcile.");
    const tokenAllocations: IEvidenceBenchmarkActivity.ITokenAllocation[] =
      EvidenceBenchmarkActivityCodebook.PRIMARY_ACTIVITIES.map((primary) => ({
        primary,
        wholeResponseExact: whole.get(primary)!,
        estimatedPoint: serialize(point.get(primary)!),
        estimatedLower: serialize(lower.get(primary)!),
        estimatedUpper: serialize(upper.get(primary)!),
      }));
    const burdenAllocations: IEvidenceBenchmarkActivity.IBurdenAllocation[] =
      EvidenceBenchmarkActivityCodebook.CAUSAL_ROLES.map((causalRole) => ({
        causalRole,
        exactWholeResponseTokens: burdenWhole.get(causalRole)!,
        estimatedPointTokens: serialize(burdenPoint.get(causalRole)!),
        estimatedPointActivityNsNumerator: timing.roleActivity
          .get(causalRole)!
          .toString(),
        estimatedDenominator: 10_000,
      }));
    const semanticIncomplete: boolean =
      unresolvedResponseIds.length !== 0 ||
      (queue.length !== 0 && input.adjudicator === undefined);
    const body = {
      schemaVersion: 1 as const,
      binding: input.observations.binding,
      observationSha256: input.observations.observationSha256,
      raterArtifactSha256: [
        input.raters[0].artifactSha256,
        input.raters[1].artifactSha256,
      ] as const,
      adjudicationArtifactSha256: input.adjudicator?.artifactSha256 ?? null,
      exactMeasurementStatus:
        hasNullUsage || timing.censoredObservationIds.length !== 0
          ? ("right_censored" as const)
          : ("complete" as const),
      semanticAttributionStatus: semanticIncomplete
        ? ("incomplete" as const)
        : ("complete" as const),
      semanticQuantitiesAreEstimates: true as const,
      exactTotal,
      tokenAllocations,
      timeAllocations: timing.allocations,
      pairwiseOverlap: timing.overlap,
      burdenAllocations,
      raterAgreement: agreement(input.observations, left, right),
      adjudicationQueue: queue,
      unresolvedResponseIds,
      censoredObservationIds: timing.censoredObservationIds,
      wallTimeNs: timing.wall.toString(),
      coveredUnionWallNs: timing.coveredUnion.toString(),
      residualWallNs: timing.residualUnion.toString(),
      exactTokenReconciled,
      exclusiveWallReconciled: timing.exclusiveReconciled,
    };
    return {
      ...body,
      reportSha256: EvidenceBenchmarkActivityCanonical.object(body),
    };
  }

  interface Timing {
    wall: bigint;
    coveredUnion: bigint;
    residualUnion: bigint;
    allocations: IEvidenceBenchmarkActivity.ITimeAllocation[];
    overlap: IEvidenceBenchmarkActivity.ITimeOverlap[];
    roleActivity: Map<IEvidenceBenchmarkActivity.CausalRole, bigint>;
    censoredObservationIds: string[];
    exclusiveReconciled: boolean;
  }

  function time(
    observations: IEvidenceBenchmarkActivity.IObservations,
    resolutions: ReadonlyMap<string, IResolution>,
  ): Timing {
    const wallStart: bigint = BigInt(observations.wall.startedMonotonicNs);
    const wallEnd: bigint = BigInt(observations.wall.completedMonotonicNs);
    const intervals: IInterval[] = [];
    const censoredObservationIds: string[] = [];
    const sourceActivity: Map<
      IEvidenceBenchmarkActivity.PrimaryActivity,
      number
    > = new Map(
      EvidenceBenchmarkActivityCodebook.PRIMARY_ACTIVITIES.map((category) => [
        category,
        0,
      ]),
    );
    const roleActivity: Map<IEvidenceBenchmarkActivity.CausalRole, bigint> =
      new Map(
        EvidenceBenchmarkActivityCodebook.CAUSAL_ROLES.map((role) => [
          role,
          0n,
        ]),
      );
    const weightedPoint: Map<
      IEvidenceBenchmarkActivity.PrimaryActivity,
      bigint
    > = bigintCategoryTable();
    const weightedLower: Map<
      IEvidenceBenchmarkActivity.PrimaryActivity,
      bigint
    > = bigintCategoryTable();
    const weightedUpper: Map<
      IEvidenceBenchmarkActivity.PrimaryActivity,
      bigint
    > = bigintCategoryTable();
    for (const item of observations.items) {
      const resolution: IResolution =
        item.linkage === "ordered_epoch" && item.linkedResponseId !== null
          ? requiredResolution(resolutions, item.linkedResponseId)
          : residualResolution();
      if (item.sourceDurationMs !== null)
        sourceActivity.set(
          resolution.primary,
          sourceActivity.get(resolution.primary)! + item.sourceDurationMs,
        );
      if (
        item.startedReceiptMonotonicNs === null ||
        item.completedReceiptMonotonicNs === null
      ) {
        censoredObservationIds.push(item.observationId);
        continue;
      }
      const interval: IInterval = {
        start: BigInt(item.startedReceiptMonotonicNs),
        end: BigInt(item.completedReceiptMonotonicNs),
        responseId: item.linkedResponseId,
        primary: resolution.primary,
        causalRole: resolution.causalRole,
        point: resolution.point,
        lower: resolution.lower,
        upper: resolution.upper,
      };
      intervals.push(interval);
      const duration: bigint = interval.end - interval.start;
      for (const category of EvidenceBenchmarkActivityCodebook.PRIMARY_ACTIVITIES) {
        weightedPoint.set(
          category,
          weightedPoint.get(category)! +
            duration * BigInt(interval.point[category]),
        );
        weightedLower.set(
          category,
          weightedLower.get(category)! +
            duration * BigInt(interval.lower[category]),
        );
        weightedUpper.set(
          category,
          weightedUpper.get(category)! +
            duration * BigInt(interval.upper[category]),
        );
      }
      roleActivity.set(
        interval.causalRole,
        roleActivity.get(interval.causalRole)! + duration * 10_000n,
      );
    }
    const endpoints: bigint[] = [
      wallStart,
      wallEnd,
      ...intervals.flatMap((interval) => [interval.start, interval.end]),
    ];
    const sorted: bigint[] = [...new Set(endpoints.map(String))]
      .map(BigInt)
      .sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
    const unions: Map<IEvidenceBenchmarkActivity.PrimaryActivity, bigint> =
      bigintCategoryTable();
    const exclusive: Map<IEvidenceBenchmarkActivity.PrimaryActivity, bigint> =
      bigintCategoryTable();
    const overlaps: Map<string, bigint> = new Map();
    let coveredUnion: bigint = 0n;
    for (let index: number = 0; index + 1 < sorted.length; ++index) {
      const start: bigint = sorted[index]!;
      const end: bigint = sorted[index + 1]!;
      if (start < wallStart || end > wallEnd || end <= start) continue;
      const active: Set<IEvidenceBenchmarkActivity.PrimaryActivity> = new Set(
        intervals
          .filter((interval) => interval.start < end && interval.end > start)
          .map((interval) => interval.primary),
      );
      if (active.size === 0) active.add("residual_unclassified");
      else coveredUnion += end - start;
      const categories: IEvidenceBenchmarkActivity.PrimaryActivity[] =
        EvidenceBenchmarkActivityCodebook.PRIMARY_ACTIVITIES.filter(
          (category) => active.has(category),
        );
      const duration: bigint = end - start;
      for (const category of categories)
        unions.set(category, unions.get(category)! + duration);
      const quotient: bigint = duration / BigInt(categories.length);
      let remainder: bigint = duration % BigInt(categories.length);
      for (const category of categories) {
        const share: bigint = quotient + (remainder > 0n ? 1n : 0n);
        if (remainder > 0n) --remainder;
        exclusive.set(category, exclusive.get(category)! + share);
      }
      for (let left: number = 0; left < categories.length; ++left)
        for (let right: number = left + 1; right < categories.length; ++right) {
          const key: string = `${categories[left]}\0${categories[right]}`;
          overlaps.set(key, (overlaps.get(key) ?? 0n) + duration);
        }
    }
    const wall: bigint = wallEnd - wallStart;
    const exclusiveReconciled: boolean =
      [...exclusive.values()].reduce((sum, value) => sum + value, 0n) === wall;
    if (!exclusiveReconciled)
      throw new Error("Exclusive-equivalent activity wall does not reconcile.");
    const allocations: IEvidenceBenchmarkActivity.ITimeAllocation[] =
      EvidenceBenchmarkActivityCodebook.PRIMARY_ACTIVITIES.map((primary) => ({
        primary,
        categoryUnionWallNs: unions.get(primary)!.toString(),
        sourceActivityTimeMs: sourceActivity.get(primary)!,
        exclusiveEquivalentWallNs: exclusive.get(primary)!.toString(),
        estimatedPointActivityNsNumerator: weightedPoint
          .get(primary)!
          .toString(),
        estimatedLowerActivityNsNumerator: weightedLower
          .get(primary)!
          .toString(),
        estimatedUpperActivityNsNumerator: weightedUpper
          .get(primary)!
          .toString(),
        estimatedDenominator: 10_000,
      }));
    const overlap: IEvidenceBenchmarkActivity.ITimeOverlap[] = [...overlaps]
      .sort(([left], [right]) => compareUtf8(left, right))
      .map(([key, overlapWallNs]) => {
        const [left, right] = key.split("\0") as [
          IEvidenceBenchmarkActivity.PrimaryActivity,
          IEvidenceBenchmarkActivity.PrimaryActivity,
        ];
        return { left, right, overlapWallNs: overlapWallNs.toString() };
      });
    return {
      wall,
      coveredUnion,
      residualUnion: unions.get("residual_unclassified")!,
      allocations,
      overlap,
      roleActivity,
      censoredObservationIds,
      exclusiveReconciled,
    };
  }

  function resolve(
    responseId: string,
    left: Judgments.IAdmittedRater,
    right: Judgments.IAdmittedRater,
    queued: boolean,
    decision:
      IEvidenceBenchmarkActivity.IProviderAdjudicationDecision | undefined,
  ): IResolution {
    const a: Judgments.IRating = left.ratings.get(responseId)!;
    const b: Judgments.IRating = right.ratings.get(responseId)!;
    const lower: IEvidenceBenchmarkActivity.ProbabilityBasisPoints = extrema(
      a.source.probabilityBasisPoints,
      b.source.probabilityBasisPoints,
      Math.min,
    );
    const upper: IEvidenceBenchmarkActivity.ProbabilityBasisPoints = extrema(
      a.source.probabilityBasisPoints,
      b.source.probabilityBasisPoints,
      Math.max,
    );
    if (!queued && decision === undefined)
      return {
        primary: a.primary,
        causalRole: a.source.causalRole,
        point: midpoint(
          a.source.probabilityBasisPoints,
          b.source.probabilityBasisPoints,
        ),
        lower,
        upper,
        unresolved: false,
      };
    if (decision?.decision === "rater_a")
      return {
        primary: a.primary,
        causalRole: a.source.causalRole,
        point: a.source.probabilityBasisPoints,
        lower,
        upper,
        unresolved: false,
      };
    if (decision?.decision === "rater_b")
      return {
        primary: b.primary,
        causalRole: b.source.causalRole,
        point: b.source.probabilityBasisPoints,
        lower,
        upper,
        unresolved: false,
      };
    return {
      primary: "residual_unclassified",
      causalRole: "residual",
      point: midpoint(
        a.source.probabilityBasisPoints,
        b.source.probabilityBasisPoints,
      ),
      lower,
      upper,
      unresolved: true,
    };
  }

  function residualResolution(): IResolution {
    const residual: IEvidenceBenchmarkActivity.ProbabilityBasisPoints =
      Object.fromEntries(
        EvidenceBenchmarkActivityCodebook.PRIMARY_ACTIVITIES.map((category) => [
          category,
          category === "residual_unclassified" ? 10_000 : 0,
        ]),
      ) as unknown as IEvidenceBenchmarkActivity.ProbabilityBasisPoints;
    return {
      primary: "residual_unclassified",
      causalRole: "residual",
      point: residual,
      lower: residual,
      upper: residual,
      unresolved: true,
    };
  }

  function agreement(
    observations: IEvidenceBenchmarkActivity.IObservations,
    left: Judgments.IAdmittedRater,
    right: Judgments.IAdmittedRater,
  ): IEvidenceBenchmarkActivity.IAgreement {
    const count: number = observations.responses.length;
    if (count === 0)
      throw new Error("Rater agreement requires at least one response.");
    const leftMarginal: Map<
      IEvidenceBenchmarkActivity.PrimaryActivity,
      number
    > = new Map(
      EvidenceBenchmarkActivityCodebook.PRIMARY_ACTIVITIES.map((category) => [
        category,
        0,
      ]),
    );
    const rightMarginal: Map<
      IEvidenceBenchmarkActivity.PrimaryActivity,
      number
    > = new Map(
      EvidenceBenchmarkActivityCodebook.PRIMARY_ACTIVITIES.map((category) => [
        category,
        0,
      ]),
    );
    let primaryMatches: number = 0;
    let causalMatches: number = 0;
    let jaccardTotal: number = 0;
    let divergenceTotal: number = 0;
    for (const response of observations.responses) {
      const a: Judgments.IRating = left.ratings.get(response.responseId)!;
      const b: Judgments.IRating = right.ratings.get(response.responseId)!;
      leftMarginal.set(a.primary, leftMarginal.get(a.primary)! + 1);
      rightMarginal.set(b.primary, rightMarginal.get(b.primary)! + 1);
      if (a.primary === b.primary) ++primaryMatches;
      if (a.source.causalRole === b.source.causalRole) ++causalMatches;
      const aMechanisms: Set<string> = new Set(a.source.secondaryMechanisms);
      const bMechanisms: Set<string> = new Set(b.source.secondaryMechanisms);
      const union: Set<string> = new Set([...aMechanisms, ...bMechanisms]);
      const intersection: number = [...aMechanisms].filter((value) =>
        bMechanisms.has(value),
      ).length;
      jaccardTotal += union.size === 0 ? 1 : intersection / union.size;
      divergenceTotal += jensenShannon(
        a.source.probabilityBasisPoints,
        b.source.probabilityBasisPoints,
      );
    }
    const observed: number = primaryMatches / count;
    const expected: number =
      EvidenceBenchmarkActivityCodebook.PRIMARY_ACTIVITIES.reduce(
        (sum, category) =>
          sum +
          (leftMarginal.get(category)! / count) *
            (rightMarginal.get(category)! / count),
        0,
      );
    return {
      responseCount: count,
      primaryObservedAgreement: observed,
      primaryCohenKappa:
        Math.abs(1 - expected) < Number.EPSILON
          ? null
          : (observed - expected) / (1 - expected),
      causalRoleAgreement: causalMatches / count,
      meanSecondaryMechanismJaccard: jaccardTotal / count,
      meanProbabilityJensenShannonBits: divergenceTotal / count,
    };
  }

  function jensenShannon(
    left: IEvidenceBenchmarkActivity.ProbabilityBasisPoints,
    right: IEvidenceBenchmarkActivity.ProbabilityBasisPoints,
  ): number {
    let result: number = 0;
    for (const category of EvidenceBenchmarkActivityCodebook.PRIMARY_ACTIVITIES) {
      const a: number = left[category] / 10_000;
      const b: number = right[category] / 10_000;
      const midpoint: number = (a + b) / 2;
      if (a > 0) result += 0.5 * a * Math.log2(a / midpoint);
      if (b > 0) result += 0.5 * b * Math.log2(b / midpoint);
    }
    return result;
  }

  function midpoint(
    left: IEvidenceBenchmarkActivity.ProbabilityBasisPoints,
    right: IEvidenceBenchmarkActivity.ProbabilityBasisPoints,
  ): IEvidenceBenchmarkActivity.ProbabilityBasisPoints {
    const values: Record<string, number> = {};
    const odd: IEvidenceBenchmarkActivity.PrimaryActivity[] = [];
    let total: number = 0;
    for (const category of EvidenceBenchmarkActivityCodebook.PRIMARY_ACTIVITIES) {
      const sum: number = left[category] + right[category];
      values[category] = Math.floor(sum / 2);
      total += values[category]!;
      if (sum % 2 !== 0) odd.push(category);
    }
    let missing: number = 10_000 - total;
    for (const category of odd) {
      if (missing === 0) break;
      values[category]! += 1;
      --missing;
    }
    if (missing !== 0)
      throw new Error("Rater midpoint probability did not reconcile.");
    return values as unknown as IEvidenceBenchmarkActivity.ProbabilityBasisPoints;
  }

  function extrema(
    left: IEvidenceBenchmarkActivity.ProbabilityBasisPoints,
    right: IEvidenceBenchmarkActivity.ProbabilityBasisPoints,
    operation: (left: number, right: number) => number,
  ): IEvidenceBenchmarkActivity.ProbabilityBasisPoints {
    return Object.fromEntries(
      EvidenceBenchmarkActivityCodebook.PRIMARY_ACTIVITIES.map((category) => [
        category,
        operation(left[category], right[category]),
      ]),
    ) as unknown as IEvidenceBenchmarkActivity.ProbabilityBasisPoints;
  }

  type Numerator = Record<
    keyof IEvidenceBenchmarkActivity.ITokenVector,
    bigint
  >;

  const TOKEN_FIELDS = [
    "inputTokens",
    "cachedInputTokens",
    "cacheWriteInputTokens",
    "normalizedNonCachedInputTokens",
    "outputTokens",
    "reasoningOutputTokens",
    "totalTokens",
  ] as const satisfies readonly (keyof IEvidenceBenchmarkActivity.ITokenVector)[];

  function zeroVector(): IEvidenceBenchmarkActivity.ITokenVector {
    return {
      inputTokens: 0,
      cachedInputTokens: 0,
      cacheWriteInputTokens: 0,
      normalizedNonCachedInputTokens: 0,
      outputTokens: 0,
      reasoningOutputTokens: 0,
      totalTokens: 0,
    };
  }

  function zeroNumerator(): Numerator {
    return {
      inputTokens: 0n,
      cachedInputTokens: 0n,
      cacheWriteInputTokens: 0n,
      normalizedNonCachedInputTokens: 0n,
      outputTokens: 0n,
      reasoningOutputTokens: 0n,
      totalTokens: 0n,
    };
  }

  function vectorTable(): Map<
    IEvidenceBenchmarkActivity.PrimaryActivity,
    IEvidenceBenchmarkActivity.ITokenVector
  > {
    return new Map(
      EvidenceBenchmarkActivityCodebook.PRIMARY_ACTIVITIES.map((category) => [
        category,
        zeroVector(),
      ]),
    );
  }

  function numeratorTable(): Map<
    IEvidenceBenchmarkActivity.PrimaryActivity,
    Numerator
  > {
    return new Map(
      EvidenceBenchmarkActivityCodebook.PRIMARY_ACTIVITIES.map((category) => [
        category,
        zeroNumerator(),
      ]),
    );
  }

  function roleVectorTable(): Map<
    IEvidenceBenchmarkActivity.CausalRole,
    IEvidenceBenchmarkActivity.ITokenVector
  > {
    return new Map(
      EvidenceBenchmarkActivityCodebook.CAUSAL_ROLES.map((role) => [
        role,
        zeroVector(),
      ]),
    );
  }

  function roleNumeratorTable(): Map<
    IEvidenceBenchmarkActivity.CausalRole,
    Numerator
  > {
    return new Map(
      EvidenceBenchmarkActivityCodebook.CAUSAL_ROLES.map((role) => [
        role,
        zeroNumerator(),
      ]),
    );
  }

  function bigintCategoryTable(): Map<
    IEvidenceBenchmarkActivity.PrimaryActivity,
    bigint
  > {
    return new Map(
      EvidenceBenchmarkActivityCodebook.PRIMARY_ACTIVITIES.map((category) => [
        category,
        0n,
      ]),
    );
  }

  function addVector(
    target: IEvidenceBenchmarkActivity.ITokenVector,
    value: IEvidenceBenchmarkActivity.ITokenVector,
  ): void {
    for (const field of TOKEN_FIELDS) target[field] += value[field];
  }

  function sumVectors(
    vectors: readonly IEvidenceBenchmarkActivity.ITokenVector[],
  ): IEvidenceBenchmarkActivity.ITokenVector {
    const result: IEvidenceBenchmarkActivity.ITokenVector = zeroVector();
    vectors.forEach((vector) => addVector(result, vector));
    return result;
  }

  function equalVector(
    left: IEvidenceBenchmarkActivity.ITokenVector,
    right: IEvidenceBenchmarkActivity.ITokenVector,
  ): boolean {
    return TOKEN_FIELDS.every((field) => left[field] === right[field]);
  }

  function weighted(
    vector: IEvidenceBenchmarkActivity.ITokenVector,
    basisPoints: number,
  ): Numerator {
    const result: Numerator = zeroNumerator();
    for (const field of TOKEN_FIELDS)
      result[field] = BigInt(vector[field]) * BigInt(basisPoints);
    return result;
  }

  function addWeighted(
    table: Map<IEvidenceBenchmarkActivity.PrimaryActivity, Numerator>,
    vector: IEvidenceBenchmarkActivity.ITokenVector,
    probabilities: IEvidenceBenchmarkActivity.ProbabilityBasisPoints,
  ): void {
    for (const category of EvidenceBenchmarkActivityCodebook.PRIMARY_ACTIVITIES)
      addNumerator(
        table.get(category)!,
        weighted(vector, probabilities[category]),
      );
  }

  function addNumerator(target: Numerator, value: Numerator): void {
    for (const field of TOKEN_FIELDS) target[field] += value[field];
  }

  function sumNumerators(values: readonly Numerator[]): Numerator {
    const result: Numerator = zeroNumerator();
    values.forEach((value) => addNumerator(result, value));
    return result;
  }

  function equalNumerator(left: Numerator, right: Numerator): boolean {
    return TOKEN_FIELDS.every((field) => left[field] === right[field]);
  }

  function serialize(
    input: Numerator,
  ): IEvidenceBenchmarkActivity.IWeightedTokenVector {
    return {
      denominator: 10_000,
      inputTokensNumerator: input.inputTokens.toString(),
      cachedInputTokensNumerator: input.cachedInputTokens.toString(),
      cacheWriteInputTokensNumerator: input.cacheWriteInputTokens.toString(),
      normalizedNonCachedInputTokensNumerator:
        input.normalizedNonCachedInputTokens.toString(),
      outputTokensNumerator: input.outputTokens.toString(),
      reasoningOutputTokensNumerator: input.reasoningOutputTokens.toString(),
      totalTokensNumerator: input.totalTokens.toString(),
    };
  }

  function requiredResolution(
    input: ReadonlyMap<string, IResolution>,
    responseId: string,
  ): IResolution {
    const result: IResolution | undefined = input.get(responseId);
    if (result === undefined)
      throw new Error(`No semantic resolution for response ${responseId}.`);
    return result;
  }

  function verifyObservationHash(
    input: IEvidenceBenchmarkActivity.IObservations,
  ): void {
    const { observationSha256: _ignored, ...body } = input;
    if (
      input.observationSha256 !==
      EvidenceBenchmarkActivityCanonical.object(body)
    )
      throw new Error("Activity observation artifact digest differs.");
  }

  function compareUtf8(left: string, right: string): number {
    return Buffer.compare(
      Buffer.from(left, "utf8"),
      Buffer.from(right, "utf8"),
    );
  }
}
