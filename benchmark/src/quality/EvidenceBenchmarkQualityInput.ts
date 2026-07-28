import { EvidenceBenchmarkHash } from "../EvidenceBenchmarkHash.ts";
import type { IEvidenceBenchmarkQualityGate } from "../structures/IEvidenceBenchmarkQualityGate.ts";

/** Qualifies immutable trees before any quality producer consumes them. */
export namespace EvidenceBenchmarkQualityInput {
  /** In-memory exact trees retained until a producer validates its inputs. */
  export interface IBound {
    /** Serializable identities copied into producer output. */
    provenance: IEvidenceBenchmarkQualityGate.IInputProvenance;
    /** Exact immutable outer run-manifest bytes. */
    runManifestBytes: Uint8Array;
    /** Exact generated project snapshot files. */
    sourceSnapshotFiles: ReadonlyMap<string, Uint8Array>;
    /** Exact frozen subject-requirement files. */
    subjectRequirementFiles: ReadonlyMap<string, Uint8Array>;
  }

  /** Creates provenance only from the canonical versioned tree algorithm. */
  export function create(input: {
    runId: string;
    runManifestBytes: Uint8Array;
    milestone: "t_done" | "t_dry";
    sourceSnapshotFiles: ReadonlyMap<string, Uint8Array>;
    subjectRequirementFiles: ReadonlyMap<string, Uint8Array>;
  }): IBound {
    return {
      provenance: {
        runId: input.runId,
        runManifestSha256: EvidenceBenchmarkHash.bytes(input.runManifestBytes),
        milestone: input.milestone,
        snapshotRawTree: {
          algorithmId: EvidenceBenchmarkHash.TREE_ALGORITHM,
          sha256: EvidenceBenchmarkHash.tree(input.sourceSnapshotFiles),
        },
        subjectRequirementsRawTree: {
          algorithmId: EvidenceBenchmarkHash.TREE_ALGORITHM,
          sha256: EvidenceBenchmarkHash.tree(input.subjectRequirementFiles),
        },
      },
      runManifestBytes: input.runManifestBytes,
      sourceSnapshotFiles: input.sourceSnapshotFiles,
      subjectRequirementFiles: input.subjectRequirementFiles,
    };
  }

  /** Recomputes both trees and rejects unqualified or mismatched identities. */
  export function validate(input: IBound): void {
    validateProvenance(input.provenance);
    if (
      EvidenceBenchmarkHash.bytes(input.runManifestBytes) !==
      input.provenance.runManifestSha256
    )
      throw new Error("Quality input run manifest bytes have drifted.");
    if (
      EvidenceBenchmarkHash.tree(input.sourceSnapshotFiles) !==
      input.provenance.snapshotRawTree.sha256
    )
      throw new Error(
        "Quality input source snapshot raw-byte tree has drifted.",
      );
    if (
      EvidenceBenchmarkHash.tree(input.subjectRequirementFiles) !==
      input.provenance.subjectRequirementsRawTree.sha256
    )
      throw new Error(
        "Quality input subject requirements raw-byte tree has drifted.",
      );
  }

  /** Rejects extra cycle-forming fields and unqualified raw tree digests. */
  export function validateProvenance(
    input: IEvidenceBenchmarkQualityGate.IInputProvenance,
  ): void {
    exactKeys(
      input as unknown as Record<string, unknown>,
      [
        "runId",
        "runManifestSha256",
        "milestone",
        "snapshotRawTree",
        "subjectRequirementsRawTree",
      ],
      "quality input provenance",
    );
    if (typeof input.runId !== "string" || input.runId.trim().length === 0)
      throw new Error("Quality input runId must be a nonblank string.");
    digest(input.runManifestSha256, "quality input run manifest");
    if (input.milestone !== "t_done" && input.milestone !== "t_dry")
      throw new Error("Quality input milestone must be t_done or t_dry.");
    validateRawTree(input.snapshotRawTree, "quality input source snapshot");
    validateRawTree(
      input.subjectRequirementsRawTree,
      "quality input subject requirements",
    );
  }

  /** Validates an unknown algorithm-qualified raw tree digest. */
  export function validateRawTree(
    value: unknown,
    label: string,
  ): asserts value is IEvidenceBenchmarkQualityGate.IRawTreeDigest {
    if (typeof value !== "object" || value === null || Array.isArray(value))
      throw new Error(`${label} must be an object.`);
    const input =
      value as unknown as IEvidenceBenchmarkQualityGate.IRawTreeDigest;
    exactKeys(
      input as unknown as Record<string, unknown>,
      ["algorithmId", "sha256"],
      label,
    );
    if (input.algorithmId !== EvidenceBenchmarkHash.TREE_ALGORITHM)
      throw new Error(
        `${label} algorithm must be ${EvidenceBenchmarkHash.TREE_ALGORITHM}.`,
      );
    digest(input.sha256, `${label} tree`);
  }

  function exactKeys(
    input: Record<string, unknown>,
    keys: readonly string[],
    label: string,
  ): void {
    if (
      JSON.stringify(Object.keys(input).sort()) !==
      JSON.stringify([...keys].sort())
    )
      throw new Error(`${label} fields are not the exact expected set.`);
  }

  function digest(input: string, label: string): void {
    if (!/^[0-9a-f]{64}$/u.test(input))
      throw new Error(`${label} must be a lowercase SHA-256 digest.`);
  }
}
