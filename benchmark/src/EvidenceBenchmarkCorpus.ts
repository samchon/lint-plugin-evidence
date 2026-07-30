import fs from "node:fs";

import { EvidenceBenchmarkHash } from "./EvidenceBenchmarkHash.ts";

/** Snapshots one complete user-owned benchmark requirement tree. */
export namespace EvidenceBenchmarkCorpus {
  /** Exact user-owned paths, bytes, and aggregate identity. */
  export interface IResult {
    /** Every regular file, preserving its relative path and exact source bytes. */
    files: ReadonlyMap<string, Uint8Array>;

    /** Aggregate identity over every relative path and exact byte sequence. */
    treeSha256: string;
  }

  /**
   * Reads a subject directory without interpreting any user-owned content.
   *
   * File names, extensions, encodings, nesting, and contents are opaque. The
   * shared tree reader rejects symbolic links and non-file entries while
   * preserving every regular file byte-for-byte.
   */
  export function read(root: string): IResult {
    if (!fs.existsSync(root) || !fs.statSync(root).isDirectory())
      throw new Error(`Benchmark requirement corpus is missing: ${root}.`);
    const files: Map<string, Uint8Array> =
      EvidenceBenchmarkHash.directory(root);
    return {
      files,
      treeSha256: EvidenceBenchmarkHash.tree(files),
    };
  }
}
