import fs from "node:fs";
import path from "node:path";

import { EvidenceBenchmarkHash } from "../EvidenceBenchmarkHash.ts";
import type { IEvidenceBenchmarkQualityGrade } from "../structures/IEvidenceBenchmarkQualityGrade.ts";

/**
 * Reopens runner-owned blind bundles and proves their bytes before and after
 * grading.
 */
export namespace EvidenceBenchmarkBlindBundle {
  const SHA256 = /^[a-f0-9]{64}$/;

  /** Validated runner-owned grading input. */
  export interface IResult {
    /** Immutable source milestone. */
    phase: IEvidenceBenchmarkQualityGrade.Phase;

    /** Random identity unrelated to arm or run naming. */
    bundleId: string;

    /** Exact source snapshot tree digest before stripping. */
    sourceSnapshotSha256: string;

    /** Exact neutral bundle tree digest. */
    bundleTreeSha256: string;

    /** Canonical manifest digest. */
    manifestSha256: string;

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
  ): IResult {
    const inputRoot: string = path.join(
      path.resolve(recordDirectory),
      "grading",
      "input",
      phase,
    );
    const manifestPath: string = path.join(inputRoot, "manifest.json");
    const manifest: Record<string, unknown> = object(
      JSON.parse(fs.readFileSync(manifestPath, "utf8")) as unknown,
      `${phase} blind bundle manifest`,
    );
    const expectedFields: string[] = [
      "blindScale",
      "bundleId",
      "bundleTreeSha256",
      "deterministicDoubleHashPassed",
      "leakScanPassed",
      "manifestSha256",
      "phase",
      "postGradeRehashRequired",
      "rawScale",
      "readOnly",
      "relativeBundlePath",
      "schemaVersion",
      "sourceSnapshotSha256",
      "stripperProvenance",
      "stripperProvenanceSha256",
    ];
    if (
      JSON.stringify(Object.keys(manifest).sort()) !==
      JSON.stringify(expectedFields)
    )
      throw new Error(`${phase} blind bundle manifest fields drifted.`);
    const { manifestSha256: manifestDigest, ...unsigned } = manifest;
    if (
      manifest.schemaVersion !== 1 ||
      manifest.phase !== phase ||
      manifest.relativeBundlePath !== "bundle" ||
      manifest.readOnly !== true ||
      manifest.postGradeRehashRequired !== true ||
      manifest.leakScanPassed !== true ||
      manifest.deterministicDoubleHashPassed !== true ||
      !text(manifest.bundleId) ||
      !sha(manifest.sourceSnapshotSha256) ||
      !sha(manifest.bundleTreeSha256) ||
      !sha(manifestDigest) ||
      manifestDigest !== canonicalSha256(unsigned)
    )
      throw new Error(`${phase} blind bundle manifest identity is invalid.`);
    const stripperProvenance: Record<string, unknown> = object(
      manifest.stripperProvenance,
      `${phase} stripper provenance`,
    );
    if (
      !sha(manifest.stripperProvenanceSha256) ||
      manifest.stripperProvenanceSha256 !== canonicalSha256(stripperProvenance)
    )
      throw new Error(`${phase} stripper provenance digest is invalid.`);
    const rawScale = scale(manifest.rawScale, `${phase} raw scale`);
    const blindScale = scale(manifest.blindScale, `${phase} blind scale`);
    const bundleRoot: string = path.join(inputRoot, "bundle");
    const observed = tree(bundleRoot);
    if (
      observed.sha256 !== manifest.bundleTreeSha256 ||
      observed.fileCount !== blindScale.fileCount ||
      observed.byteLength !== blindScale.byteLength
    )
      throw new Error(
        `${phase} blind bundle bytes disagree with its manifest.`,
      );
    const second = tree(bundleRoot);
    if (
      second.sha256 !== observed.sha256 ||
      second.fileCount !== observed.fileCount ||
      second.byteLength !== observed.byteLength
    )
      throw new Error(`${phase} blind bundle changed during admission.`);
    return {
      phase,
      bundleId: manifest.bundleId as string,
      sourceSnapshotSha256: manifest.sourceSnapshotSha256 as string,
      bundleTreeSha256: manifest.bundleTreeSha256 as string,
      manifestSha256: manifestDigest as string,
      bundleRoot,
      rawScale,
      blindScale,
      stripperProvenanceSha256: manifest.stripperProvenanceSha256 as string,
    };
  }

  /** Rehashes a bundle after grader shutdown and rejects any mutation. */
  export function verifyAfterGrade(input: IResult): void {
    const observed = tree(input.bundleRoot);
    if (
      observed.sha256 !== input.bundleTreeSha256 ||
      observed.fileCount !== input.blindScale.fileCount ||
      observed.byteLength !== input.blindScale.byteLength
    )
      throw new Error(`${input.phase} blind bundle changed during grading.`);
  }

  /** Returns the same canonical tree digest used by runner bundle manifests. */
  export function treeSha256(root: string): string {
    return tree(root).sha256;
  }

  function tree(root: string): {
    sha256: string;
    fileCount: number;
    byteLength: number;
  } {
    const absolute: string = path.resolve(root);
    const entries: Array<{
      path: string;
      kind: "file" | "symlink";
      executable: boolean;
      byteLength: number;
      contentSha256: string;
    }> = [];
    const visit = (directory: string): void => {
      const children: fs.Dirent[] = fs
        .readdirSync(directory, { withFileTypes: true })
        .sort((left, right) =>
          Buffer.compare(
            Buffer.from(left.name, "utf8"),
            Buffer.from(right.name, "utf8"),
          ),
        );
      for (const child of children) {
        const target: string = path.join(directory, child.name);
        if (child.isDirectory()) {
          visit(target);
          continue;
        }
        if (!child.isFile() && !child.isSymbolicLink())
          throw new Error(`Blind bundle has unsupported entry: ${target}.`);
        const relative: string = path
          .relative(absolute, target)
          .split(path.sep)
          .join("/")
          .normalize("NFC");
        if (relative.startsWith("../") || path.posix.isAbsolute(relative))
          throw new Error(`Blind bundle path escapes its root: ${relative}.`);
        const stat: fs.Stats = fs.lstatSync(target);
        const bytes: Buffer = child.isSymbolicLink()
          ? Buffer.from(fs.readlinkSync(target), "utf8")
          : fs.readFileSync(target);
        entries.push({
          path: relative,
          kind: child.isSymbolicLink() ? "symlink" : "file",
          executable: (stat.mode & 0o111) !== 0,
          byteLength: bytes.length,
          contentSha256: EvidenceBenchmarkHash.bytes(bytes),
        });
      }
    };
    visit(absolute);
    entries.sort((left, right) =>
      Buffer.compare(
        Buffer.from(left.path, "utf8"),
        Buffer.from(right.path, "utf8"),
      ),
    );
    return {
      sha256: EvidenceBenchmarkHash.bytes(canonicalJson(entries)),
      fileCount: entries.length,
      byteLength: entries.reduce((sum, entry) => sum + entry.byteLength, 0),
    };
  }

  function scale(
    input: unknown,
    label: string,
  ): { fileCount: number; byteLength: number } {
    const value: Record<string, unknown> = object(input, label);
    if (
      JSON.stringify(Object.keys(value).sort()) !==
        JSON.stringify(["byteLength", "fileCount"]) ||
      !integer(value.fileCount) ||
      !integer(value.byteLength)
    )
      throw new Error(`${label} is invalid.`);
    return {
      fileCount: value.fileCount as number,
      byteLength: value.byteLength as number,
    };
  }

  function canonicalSha256(input: unknown): string {
    return EvidenceBenchmarkHash.bytes(canonicalJson(input));
  }

  function canonicalJson(input: unknown): string {
    if (input === null) return "null";
    if (
      typeof input === "boolean" ||
      typeof input === "string" ||
      typeof input === "number"
    ) {
      if (typeof input === "number" && !Number.isFinite(input))
        throw new Error("Canonical JSON forbids non-finite numbers.");
      return JSON.stringify(input);
    }
    if (Array.isArray(input)) return `[${input.map(canonicalJson).join(",")}]`;
    const value: Record<string, unknown> = object(input, "canonical JSON");
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(",")}}`;
  }

  function object(input: unknown, label: string): Record<string, unknown> {
    if (typeof input !== "object" || input === null || Array.isArray(input))
      throw new Error(`${label} must be a JSON object.`);
    return input as Record<string, unknown>;
  }

  function integer(input: unknown): boolean {
    return Number.isSafeInteger(input) && (input as number) >= 0;
  }

  function sha(input: unknown): boolean {
    return typeof input === "string" && SHA256.test(input);
  }

  function text(input: unknown): boolean {
    return (
      typeof input === "string" && input.length !== 0 && input === input.trim()
    );
  }
}
