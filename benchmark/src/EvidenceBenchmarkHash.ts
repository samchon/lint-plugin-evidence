import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import type { IEvidenceBenchmarkMaterialization } from "./structures/IEvidenceBenchmarkMaterialization.ts";

/** Computes portable file, object, and tree identities for benchmark inputs. */
export namespace EvidenceBenchmarkHash {
  /** Returns a hexadecimal SHA-256 identity for one byte sequence. */
  export function bytes(input: Uint8Array | string): string {
    return crypto.createHash("sha256").update(input).digest("hex");
  }

  /** Returns an npm-compatible SHA-512 SRI identity for one byte sequence. */
  export function sri(input: Uint8Array): string {
    return `sha512-${crypto.createHash("sha512").update(input).digest("base64")}`;
  }

  /** Returns a hexadecimal SHA-256 identity for one file's exact bytes. */
  export function file(location: string): string {
    return bytes(fs.readFileSync(location));
  }

  /**
   * Produces the stable path and byte ledger for an in-memory file tree.
   *
   * Paths are sorted by their portable spelling before hashing, so directory
   * enumeration order and host separators cannot change the result.
   */
  export function entries(
    files: ReadonlyMap<string, Uint8Array>,
  ): IEvidenceBenchmarkMaterialization.ITreeEntry[] {
    return [...files.entries()]
      .sort(([left], [right]) => left.localeCompare(right, "en"))
      .map(
        ([
          relative,
          content,
        ]): IEvidenceBenchmarkMaterialization.ITreeEntry => ({
          path: relative,
          bytes: content.byteLength,
          sha256: bytes(content),
        }),
      );
  }

  /** Returns one aggregate SHA-256 over a stable tree ledger. */
  export function tree(files: ReadonlyMap<string, Uint8Array>): string {
    return bytes(`${JSON.stringify(entries(files))}\n`);
  }

  /** Returns one aggregate SHA-256 over a canonical JSON-compatible value. */
  export function object(input: unknown): string {
    return bytes(`${JSON.stringify(sortValue(input))}\n`);
  }

  /**
   * Reads one regular-file tree with portable paths and deterministic ordering.
   *
   * Symbolic links and non-file entries are rejected because their targets and
   * semantics can change after the input hash has been recorded.
   */
  export function directory(root: string): Map<string, Uint8Array> {
    const files: Map<string, Uint8Array> = new Map();
    collect(root, "", files);
    return files;
  }

  function collect(
    root: string,
    relative: string,
    files: Map<string, Uint8Array>,
  ): void {
    const directory: string = path.join(root, relative);
    const entries: fs.Dirent[] = fs
      .readdirSync(directory, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name, "en"));
    for (const entry of entries) {
      const child: string =
        relative.length === 0
          ? entry.name
          : path.posix.join(relative.replaceAll("\\", "/"), entry.name);
      const location: string = path.join(root, ...child.split("/"));
      if (entry.isSymbolicLink())
        throw new Error(
          `Benchmark input cannot contain a symbolic link: ${child}`,
        );
      if (entry.isDirectory()) collect(root, child, files);
      else if (entry.isFile()) files.set(child, fs.readFileSync(location));
      else
        throw new Error(
          `Benchmark input must contain only files and directories: ${child}`,
        );
    }
  }

  function sortValue(input: unknown): unknown {
    if (Array.isArray(input)) return input.map(sortValue);
    if (typeof input !== "object" || input === null) return input;
    return Object.fromEntries(
      Object.entries(input)
        .sort(([left], [right]) => left.localeCompare(right, "en"))
        .map(([key, value]) => [key, sortValue(value)]),
    );
  }
}
