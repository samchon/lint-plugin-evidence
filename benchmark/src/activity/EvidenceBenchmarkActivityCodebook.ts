import { EvidenceBenchmarkActivityCanonical } from "./EvidenceBenchmarkActivityCanonical.ts";
import type { IEvidenceBenchmarkActivity } from "./IEvidenceBenchmarkActivity.ts";

/** Frozen semantic labels and queue rules used by every activity rater. */
export namespace EvidenceBenchmarkActivityCodebook {
  /** Pre-registered primary codes in stable report order. */
  export const PRIMARY_ACTIVITIES = [
    "requirements_reading",
    "method_reading",
    "planning_inventory",
    "implementation",
    "deterministic_feedback",
    "ordinary_remediation",
    "completion_audit",
    "phase2_discovery",
    "phase2_fix",
    "grading",
    "residual_unclassified",
  ] as const satisfies readonly IEvidenceBenchmarkActivity.PrimaryActivity[];

  /** Method mechanisms in stable report order. */
  export const SECONDARY_MECHANISMS = [
    "direct_method_campaign",
    "induced_method_campaign",
    "quality_producing_fix",
    "shared_product_work",
  ] as const satisfies readonly IEvidenceBenchmarkActivity.SecondaryMechanism[];

  /** Causal roles in stable report order. */
  export const CAUSAL_ROLES = [
    "shared",
    "direct_method_burden",
    "induced_method_burden",
    "quality_producing_fix",
    "residual",
  ] as const satisfies readonly IEvidenceBenchmarkActivity.CausalRole[];

  /** Exact frozen codebook object sent to both raters and the adjudicator. */
  export const VALUE = {
    schemaVersion: 1,
    primaryActivities: PRIMARY_ACTIVITIES,
    secondaryMechanisms: SECONDARY_MECHANISMS,
    causalRoles: CAUSAL_ROLES,
    probabilityDenominator: 10_000,
    exactByteDigestAlgorithm: "sha256(exact-bytes)",
    canonicalObjectDigestAlgorithm: "sha256(utf8-bytewise-key-order-json-lf)",
    semanticConfidenceMaximumExclusive: 1,
    adjudication: {
      lowConfidenceBelow: 0.7,
      lowPeakProbabilityBelowBasisPoints: 7_000,
      highInfluenceProviderTokenShareBasisPoints: 100,
      evidenceMarkerPattern: "[[event:<event-id>]]",
    },
    rules: [
      "phase is determined before semantic purpose",
      "arm identity alone never determines a method mechanism",
      "raters never estimate tokens or duration",
      "semantic labels are estimates even when their source counters are exact",
      "unresolvable or weakly evidenced work remains residual",
      "direct procedure burden is separate from induced discovery and remediation",
      "exclusive wall integer remainders follow frozen primary code order",
    ],
  } as const;

  /** SHA-256 identity stored in every observation, rating, and report. */
  export const SHA256 = EvidenceBenchmarkActivityCanonical.object(VALUE);
}
