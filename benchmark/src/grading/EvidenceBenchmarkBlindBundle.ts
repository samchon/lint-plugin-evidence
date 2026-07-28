import fs from "node:fs";
import path from "node:path";

import { EvidenceBenchmarkHash } from "../EvidenceBenchmarkHash.ts";
import { EvidenceBenchmarkProtocolValidator } from "../EvidenceBenchmarkProtocolValidator.ts";
import type { IEvidenceBenchmarkQualityGrade } from "../structures/IEvidenceBenchmarkQualityGrade.ts";
import { EvidenceBenchmarkQualityArtifacts } from "./EvidenceBenchmarkQualityArtifacts.ts";

/**
 * Reopens runner-owned blind bundles and proves their bytes before and after
 * grading.
 */
export namespace EvidenceBenchmarkBlindBundle {
  const SHA256 = /^[a-f0-9]{64}$/;

  /** Validated runner-owned grading input. */
  export interface IResult {
    /** Globally unique measured run identity. */
    runId: string;

    /** Immutable source milestone. */
    phase: IEvidenceBenchmarkQualityGrade.Phase;

    /** Random identity unrelated to arm or run naming. */
    bundleId: string;

    /** Versioned algorithm used by every aggregate raw-tree identity. */
    treeAlgorithm: "sha256-posix-path-nul-bytes-v1";

    /** Exact pre-run materialization/run manifest byte digest. */
    runManifestSha256: string;

    /** Exact selected-subject requirement raw-tree digest. */
    requirementsRawTreeSha256: string;

    /** Exact source snapshot raw-tree digest before stripping. */
    sourceSnapshotRawTreeSha256: string;

    /** Exact neutral bundle raw-tree digest. */
    bundleRawTreeSha256: string;

    /** Canonical manifest digest. */
    manifestSha256: string;

    /** Exact neutral bundle-transform manifest byte digest. */
    bundleManifestSha256: string;

    /** Absolute runtime bundle root, never persisted in a public report. */
    bundleRoot: string;

    /** Exact source snapshot scale. */
    rawScale: {
      /** Retained source file count. */
      fileCount: number;

      /** Retained source aggregate bytes. */
      byteLength: number;
    };

    /** Exact neutral bundle scale. */
    blindScale: {
      /** Neutral bundle file count. */
      fileCount: number;

      /** Neutral bundle aggregate bytes. */
      byteLength: number;
    };

    /** Exact stripper implementation provenance digest. */
    stripperProvenanceSha256: string;
  }

  /** Reads one exact runner grading input and verifies every manifest claim. */
  export function read(
    recordDirectory: string,
    phase: IEvidenceBenchmarkQualityGrade.Phase,
    protocolRoot: string = path.resolve(
      import.meta.dirname,
      "..",
      "..",
      "protocol",
    ),
  ): IResult {
    const gradingRoot: string = path.join(
      path.resolve(recordDirectory),
      "grading",
      "input",
    );
    const phaseRoot: string = path.join(gradingRoot, phase);
    const manifestPath: string = path.join(gradingRoot, "manifest.json");
    const manifestText: string = fs.readFileSync(manifestPath, "utf8");
    const manifest = EvidenceBenchmarkProtocolValidator.validateText<
      Record<string, unknown>
    >(
      protocolRoot,
      "grading-input-manifest.schema.json",
      manifestText,
      "aggregate grading input manifest",
    );
    EvidenceBenchmarkQualityArtifacts.validateGradingInput(
      manifest,
      text(manifest.runId, "grading input run id"),
    );
    const bundleManifestPath: string = path.join(
      phaseRoot,
      "bundle-manifest.json",
    );
    const bundleManifestText: string = fs.readFileSync(
      bundleManifestPath,
      "utf8",
    );
    const bundleManifest = EvidenceBenchmarkProtocolValidator.validateText<
      Record<string, unknown>
    >(
      protocolRoot,
      "bundle-manifest.schema.json",
      bundleManifestText,
      `${phase} bundle transform manifest`,
    );
    EvidenceBenchmarkQualityArtifacts.validateBundle(bundleManifest);
    const phasePrefix: string = phase === "t_done" ? "tDone" : "tDry";
    const sourceTree = rawTree(
      manifest[`${phasePrefix}SourceRawTree`],
      `${phase} source raw tree`,
    );
    const bundleTree = rawTree(
      manifest[`${phasePrefix}BundleRawTree`],
      `${phase} bundle raw tree`,
    );
    const bundleInputTree = rawTree(
      bundleManifest.inputSnapshotRawTree,
      `${phase} bundle input raw tree`,
    );
    const bundleOutputTree = rawTree(
      bundleManifest.outputRawTree,
      `${phase} bundle output raw tree`,
    );
    const bundleRequirementsTree = rawTree(
      bundleManifest.requirementsRawTree,
      `${phase} bundle requirements raw tree`,
    );
    if (
      sourceTree.sha256 !== bundleInputTree.sha256 ||
      bundleTree.sha256 !== bundleOutputTree.sha256 ||
      bundleRequirementsTree.sha256 !== manifest.requirementsRawTreeSha256
    )
      throw new Error(
        `${phase} aggregate grading input and bundle transform disagree.`,
      );
    const sourceRoot: string = path.join(phaseRoot, "source");
    const bundleRoot: string = path.join(phaseRoot, "bundle");
    const sourceObserved = tree(sourceRoot);
    const bundleObserved = tree(bundleRoot);
    if (
      sourceObserved.sha256 !== sourceTree.sha256 ||
      bundleObserved.sha256 !== bundleTree.sha256
    )
      throw new Error(
        `${phase} source or blind bundle bytes disagree with its manifest.`,
      );
    const second = tree(bundleRoot);
    if (
      second.sha256 !== bundleObserved.sha256 ||
      second.fileCount !== bundleObserved.fileCount ||
      second.byteLength !== bundleObserved.byteLength
    )
      throw new Error(`${phase} blind bundle changed during admission.`);
    return {
      runId: manifest.runId as string,
      phase,
      bundleId: bundleManifest.bundleId as string,
      treeAlgorithm: EvidenceBenchmarkHash.TREE_ALGORITHM,
      runManifestSha256: manifest.runManifestSha256 as string,
      requirementsRawTreeSha256: manifest.requirementsRawTreeSha256 as string,
      sourceSnapshotRawTreeSha256: sourceTree.sha256,
      bundleRawTreeSha256: bundleTree.sha256,
      manifestSha256: EvidenceBenchmarkHash.bytes(manifestText),
      bundleManifestSha256: EvidenceBenchmarkHash.bytes(bundleManifestText),
      bundleRoot,
      rawScale: {
        fileCount: sourceObserved.fileCount,
        byteLength: sourceObserved.byteLength,
      },
      blindScale: {
        fileCount: bundleObserved.fileCount,
        byteLength: bundleObserved.byteLength,
      },
      stripperProvenanceSha256: bundleManifest.transformSourceSha256 as string,
    };
  }

  /** Rehashes a bundle after grader shutdown and rejects any mutation. */
  export function verifyAfterGrade(input: IResult): void {
    const observed = tree(input.bundleRoot);
    if (
      observed.sha256 !== input.bundleRawTreeSha256 ||
      observed.fileCount !== input.blindScale.fileCount ||
      observed.byteLength !== input.blindScale.byteLength
    )
      throw new Error(`${input.phase} blind bundle changed during grading.`);
  }

  /** Returns the same canonical tree digest used by runner bundle manifests. */
  export function rawTreeSha256(root: string): string {
    return tree(root).sha256;
  }

  function tree(root: string): {
    sha256: string;
    fileCount: number;
    byteLength: number;
  } {
    const files: Map<string, Uint8Array> = EvidenceBenchmarkHash.directory(
      path.resolve(root),
    );
    return {
      sha256: EvidenceBenchmarkHash.tree(files),
      fileCount: files.size,
      byteLength: [...files.values()].reduce(
        (sum, bytes) => sum + bytes.byteLength,
        0,
      ),
    };
  }

  function rawTree(
    input: unknown,
    label: string,
  ): { algorithmId: string; sha256: string } {
    const value: Record<string, unknown> = object(input, label);
    if (
      value.algorithmId !== EvidenceBenchmarkHash.TREE_ALGORITHM ||
      !sha(value.sha256)
    )
      throw new Error(`${label} is invalid.`);
    return {
      algorithmId: value.algorithmId,
      sha256: value.sha256,
    };
  }

  function object(input: unknown, label: string): Record<string, unknown> {
    if (typeof input !== "object" || input === null || Array.isArray(input))
      throw new Error(`${label} must be a JSON object.`);
    return input as Record<string, unknown>;
  }

  function sha(input: unknown): input is string {
    return typeof input === "string" && SHA256.test(input);
  }

  function text(input: unknown, label: string): string {
    if (
      typeof input !== "string" ||
      input.length === 0 ||
      input !== input.trim()
    )
      throw new Error(`${label} is invalid.`);
    return input;
  }
}
