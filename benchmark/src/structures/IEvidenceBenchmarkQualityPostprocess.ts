import type { IEvidenceBenchmarkQualityGrade } from "./IEvidenceBenchmarkQualityGrade.ts";

/** Contracts for immutable grading postprocess publication. */
export namespace IEvidenceBenchmarkQualityPostprocess {
  /** One phase artifact retained by digest. */
  export interface IPhase {
    /** Immutable source milestone. */
    phase: IEvidenceBenchmarkQualityGrade.Phase;

    /** Relative phase artifact path inside the postprocess directory. */
    artifactPath: string;

    /** SHA-256 of exact phase artifact bytes. */
    artifactSha256: string;

    /** Runner-owned blind input manifest digest. */
    gradingInputManifestSha256: string;

    /** Post-grade observed neutral tree digest. */
    postGradeBundleSha256: string;

    /** First independent grade digest. */
    firstGradeSha256: string;

    /** Second independent grade digest. */
    secondGradeSha256: string;

    /** Inter-rater comparison digest. */
    comparisonSha256: string;

    /** Fresh third-LLM consensus digest. */
    adjudicationSha256: string;

    /** Deterministic collector-input manifest digest. */
    deterministicInputsSha256: string;

    /** Secondary blind-review consensus digest. */
    secondaryReviewSha256: string;
  }

  /** Immutable postprocess seal joined to one terminal core. */
  export interface ISeal {
    /** Postprocess seal format version. */
    schemaVersion: 1;

    /** Exact measured run identifier. */
    runId: string;

    /** Measured application subject. */
    subject: IEvidenceBenchmarkQualityGrade.Subject;

    /** Terminal generation outcome. */
    generationStatus: "completed" | "failed" | "interrupted" | "safety_limit";

    /** SHA-256 of the immutable core seal exact bytes. */
    coreSealSha256: string;

    /** Safety-stop evidence digest, present only for safety_limit. */
    safetyStopSha256: string | null;

    /** Reached phase artifacts in milestone order. */
    phases: IPhase[];

    /** Whether every required completed-run phase and consensus exists. */
    requiredQualityComplete: boolean;

    /** UTC seal timestamp. */
    sealedAtUtc: string;

    /** Canonical seal digest excluding this field. */
    sealSha256: string;
  }
}
