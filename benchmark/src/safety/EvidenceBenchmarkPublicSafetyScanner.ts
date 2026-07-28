import fs from "node:fs";
import { fileURLToPath } from "node:url";

import { EvidenceBenchmarkHash } from "../EvidenceBenchmarkHash.ts";
import { EvidenceBenchmarkProtocolValidator } from "../EvidenceBenchmarkProtocolValidator.ts";

/** Scans retained run bytes without altering evidence before public promotion. */
export namespace EvidenceBenchmarkPublicSafetyScanner {
  /** Publication-blocking sensitive-data classes. */
  export type Category =
    | "credential"
    | "account_identifier"
    | "private_quota"
    | "high_confidence_host_identifier";

  /** Inputs for one exact retained-tree scan. */
  export interface IRequest {
    /** Absolute repository root containing the frozen scanner rules. */
    repoRoot: string;

    /** Measured run identifier. */
    runId: string;

    /** Immutable generation-core seal digest. */
    parentCoreSealSha256: string;

    /** Exact retained run-record file tree. */
    files: ReadonlyMap<string, Uint8Array>;

    /** UTC time at which scanning completed. */
    scannedAtUtc: string;
  }

  /** One content-free location and digest for sensitive evidence. */
  export interface IFinding {
    /** Sensitive-data category assigned by the versioned rule. */
    category: Category;

    /** Retained run-relative file path. */
    path: string;

    /** Inclusive byte offset within the retained file. */
    byteOffset: number;

    /** Exact number of matched bytes. */
    byteLength: number;

    /** SHA-256 of the exact matched bytes, never their public content. */
    evidenceSha256: string;

    /** Rule confidence used to separate automatic and manual boundaries. */
    confidence: number;
  }

  /** Local scan result consumed by postprocess and public promotion. */
  export interface IResult {
    /** Scan artifact schema version. */
    schemaVersion: 1;

    /** Measured run identifier. */
    runId: string;

    /** Immutable generation-core seal digest. */
    parentCoreSealSha256: string;

    /** Exact scanner implementation and rules identity. */
    scanner: {
      version: string;
      implementationPath: string;
      implementationSha256: string;
      rulesPath: string;
      rulesSha256: string;
    };

    /** Algorithm-qualified raw identity of the scanned retained tree. */
    scannedRunRecordRawTree: {
      algorithmId: typeof EvidenceBenchmarkHash.TREE_ALGORITHM;
      sha256: string;
    };

    /** Digest of the exact ordered file inventory. */
    scannedFileSetSha256: string;

    /** Number of exact retained files scanned. */
    scannedFileCount: number;

    /** Total bytes across the exact scanned file set. */
    scannedBytes: number;

    /** Exact identities of raw transport logs within the file set. */
    rawLogDigests: Array<{
      path: string;
      bytes: number;
      sha256: string;
    }>;

    /** Findings sufficiently specific to block publication automatically. */
    highConfidenceFindings: IFinding[];

    /** Lower-confidence matches requiring review without deleting evidence. */
    manualReviewCandidates: IFinding[];

    /** Whether lower-confidence candidates require review. */
    manualReviewStatus: "not_required" | "pending";

    /** Required treatment of sensitive raw evidence. */
    rawEvidenceDisposition: "retained_local_censored_from_publication";

    /** Whether latest, demo, and public Git promotion may proceed. */
    publicPromotionAllowed: boolean;

    /** UTC time at which scanning completed. */
    scannedAtUtc: string;
  }

  interface IRule {
    id: string;
    category: Category;
    pattern: string;
    flags: string;
  }

  interface IRules {
    schemaVersion: 1;
    scannerVersion: string;
    highConfidence: IRule[];
    manualReview: IRule[];
  }

  const IMPLEMENTATION_PATH =
    "benchmark/src/safety/EvidenceBenchmarkPublicSafetyScanner.ts";
  const RULES_PATH = "benchmark/protocol/public-safety-rules.json";

  /** Returns a local scan record; findings never rewrite retained source bytes. */
  export function scan(request: IRequest): IResult {
    const rulesLocation = `${request.repoRoot}/${RULES_PATH}`;
    const rulesBytes: Buffer = fs.readFileSync(rulesLocation);
    const rules = parseRules(
      EvidenceBenchmarkProtocolValidator.parse(
        new TextDecoder("utf-8", { fatal: true }).decode(rulesBytes),
        rulesLocation,
      ),
    );
    const implementationBytes: Buffer = fs.readFileSync(
      fileURLToPath(import.meta.url),
    );
    const highConfidenceFindings: IFinding[] = collect(
      request.files,
      rules.highConfidence,
      1,
    );
    const manualReviewCandidates: IFinding[] = collect(
      request.files,
      rules.manualReview,
      0.5,
    );
    const entries = EvidenceBenchmarkHash.entries(request.files);
    const rawLogDigests = entries
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
    return {
      schemaVersion: 1,
      runId: request.runId,
      parentCoreSealSha256: request.parentCoreSealSha256,
      scanner: {
        version: rules.scannerVersion,
        implementationPath: IMPLEMENTATION_PATH,
        implementationSha256: EvidenceBenchmarkHash.bytes(implementationBytes),
        rulesPath: RULES_PATH,
        rulesSha256: EvidenceBenchmarkHash.bytes(rulesBytes),
      },
      scannedRunRecordRawTree: {
        algorithmId: EvidenceBenchmarkHash.TREE_ALGORITHM,
        sha256: EvidenceBenchmarkHash.tree(request.files),
      },
      scannedFileSetSha256: EvidenceBenchmarkHash.object(entries),
      scannedFileCount: entries.length,
      scannedBytes: entries.reduce((sum, entry) => sum + entry.bytes, 0),
      rawLogDigests,
      highConfidenceFindings,
      manualReviewCandidates,
      manualReviewStatus:
        manualReviewCandidates.length === 0 ? "not_required" : "pending",
      rawEvidenceDisposition: "retained_local_censored_from_publication",
      publicPromotionAllowed:
        highConfidenceFindings.length === 0 &&
        manualReviewCandidates.length === 0,
      scannedAtUtc: request.scannedAtUtc,
    };
  }

  function collect(
    files: ReadonlyMap<string, Uint8Array>,
    rules: readonly IRule[],
    confidence: number,
  ): IFinding[] {
    const findings: IFinding[] = [];
    for (const [filePath, bytes] of files) {
      let source: string;
      try {
        source = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      } catch {
        continue;
      }
      for (const rule of rules) {
        const expression = new RegExp(rule.pattern, rule.flags);
        for (const match of source.matchAll(expression)) {
          const matched: string = match[0];
          const byteOffset: number = Buffer.byteLength(
            source.slice(0, match.index),
            "utf8",
          );
          const matchedBytes: Buffer = Buffer.from(matched, "utf8");
          findings.push({
            category: rule.category,
            path: filePath,
            byteOffset,
            byteLength: matchedBytes.byteLength,
            evidenceSha256: EvidenceBenchmarkHash.bytes(matchedBytes),
            confidence,
          });
        }
      }
    }
    return findings;
  }

  function parseRules(input: unknown): IRules {
    if (typeof input !== "object" || input === null || Array.isArray(input))
      throw new Error("Public-safety rules must be an object.");
    const rules = input as Record<string, unknown>;
    if (
      rules.schemaVersion !== 1 ||
      typeof rules.scannerVersion !== "string" ||
      !Array.isArray(rules.highConfidence) ||
      !Array.isArray(rules.manualReview)
    )
      throw new Error("Public-safety rules are invalid.");
    const parse = (value: unknown): IRule => {
      if (typeof value !== "object" || value === null || Array.isArray(value))
        throw new Error("Public-safety rule must be an object.");
      const rule = value as Record<string, unknown>;
      if (
        typeof rule.id !== "string" ||
        ![
          "credential",
          "account_identifier",
          "private_quota",
          "high_confidence_host_identifier",
        ].includes(rule.category as string) ||
        typeof rule.pattern !== "string" ||
        typeof rule.flags !== "string"
      )
        throw new Error("Public-safety rule fields are invalid.");
      new RegExp(rule.pattern, rule.flags);
      return rule as unknown as IRule;
    };
    return {
      schemaVersion: 1,
      scannerVersion: rules.scannerVersion,
      highConfidence: rules.highConfidence.map(parse),
      manualReview: rules.manualReview.map(parse),
    };
  }
}
