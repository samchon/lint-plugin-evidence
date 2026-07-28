import fs from "node:fs";
import path from "node:path";

import { EvidenceBenchmarkHash } from "./EvidenceBenchmarkHash.ts";
import { EvidenceBenchmarkJson } from "./EvidenceBenchmarkJson.ts";

/** Strictly admits every tracked benchmark protocol JSON before preparation. */
export namespace EvidenceBenchmarkProtocolAdmission {
  /** Strict protocol inventory retained for plan and launch provenance. */
  export interface IResult {
    /** Number of JSON documents parsed without duplicate keys. */
    jsonFiles: number;

    /** Exact aggregate identity of every protocol file. */
    treeSha256: string;

    /** Versioned raw path and exact-byte tree algorithm. */
    treeAlgorithm: "sha256-posix-path-nul-bytes-v1";
  }

  /** Parses every protocol JSON and proves the duplicate-key guard fixture. */
  export function validate(repository: string): IResult {
    const root: string = path.join(repository, "benchmark", "protocol");
    if (!fs.existsSync(root) || !fs.statSync(root).isDirectory())
      throw new Error(`Benchmark protocol directory is missing: ${root}.`);
    const files: Map<string, Uint8Array> =
      EvidenceBenchmarkHash.directory(root);
    const json: string[] = [...files.keys()]
      .filter((relative) => relative.endsWith(".json"))
      .sort(ordinal);
    if (json.length === 0)
      throw new Error("Benchmark protocol contains no JSON artifacts.");
    for (const relative of json)
      EvidenceBenchmarkJson.parse(
        Buffer.from(files.get(relative)!).toString("utf8"),
        `benchmark/protocol/${relative}`,
      );
    const negative: string[] = [...files.keys()].filter(
      (relative) => path.posix.basename(relative) === "duplicate-key.txt",
    );
    if (negative.length !== 1)
      throw new Error(
        `Benchmark protocol must contain one duplicate-key.txt guard, received ${negative.length}.`,
      );
    let rejected: boolean = false;
    try {
      EvidenceBenchmarkJson.parse(
        Buffer.from(files.get(negative[0]!)!).toString("utf8"),
        `benchmark/protocol/${negative[0]}`,
      );
    } catch (error) {
      rejected =
        error instanceof Error &&
        error.message.includes("duplicate object key");
    }
    if (!rejected)
      throw new Error(
        "Benchmark protocol duplicate-key.txt did not prove strict duplicate rejection.",
      );
    return {
      jsonFiles: json.length,
      treeSha256: EvidenceBenchmarkHash.tree(files),
      treeAlgorithm: EvidenceBenchmarkHash.TREE_ALGORITHM,
    };
  }

  function ordinal(left: string, right: string): number {
    return left < right ? -1 : left > right ? 1 : 0;
  }
}
