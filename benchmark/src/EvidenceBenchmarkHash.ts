import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import type { IEvidenceBenchmarkMaterialization } from "./structures/IEvidenceBenchmarkMaterialization.ts";

/** Computes portable file, object, and tree identities for benchmark inputs. */
export namespace EvidenceBenchmarkHash {
  /**
   * Versioned aggregate tree identity used by every benchmark manifest.
   *
   * Each NFC POSIX relative path is encoded as UTF-8 and sorted by its raw
   * bytes. The digest input repeats `path || NUL || exact bytes || NUL`.
   */
  export const TREE_ALGORITHM = "sha256-posix-path-nul-bytes-v1" as const;

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
      .sort(([left], [right]) => compareUtf8Path(left, right))
      .map(
        ([relative, content]): IEvidenceBenchmarkMaterialization.ITreeEntry => {
          validatePortablePath(relative);
          return {
            path: relative,
            bytes: content.byteLength,
            sha256: bytes(content),
          };
        },
      );
  }

  /** Returns one aggregate SHA-256 over exact paths and file bytes. */
  export function tree(files: ReadonlyMap<string, Uint8Array>): string {
    const hash: crypto.Hash = crypto.createHash("sha256");
    for (const [relative, content] of [...files.entries()].sort(
      ([left], [right]) => compareUtf8Path(left, right),
    )) {
      validatePortablePath(relative);
      hash.update(Buffer.from(relative, "utf8"));
      hash.update(Buffer.from([0]));
      hash.update(content);
      hash.update(Buffer.from([0]));
    }
    return hash.digest("hex");
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
      .sort((left, right) => compareUtf8Path(left.name, right.name));
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
        .sort(([left], [right]) => compareUtf8Path(left, right))
        .map(([key, value]) => [key, sortValue(value)]),
    );
  }

  function compareUtf8Path(left: string, right: string): number {
    return Buffer.compare(
      Buffer.from(left, "utf8"),
      Buffer.from(right, "utf8"),
    );
  }

  function validatePortablePath(relative: string): void {
    const segments: string[] = relative.split("/");
    if (
      relative.length === 0 ||
      relative.includes("\\") ||
      relative.includes("\0") ||
      relative.startsWith("/") ||
      path.win32.isAbsolute(relative) ||
      relative.normalize("NFC") !== relative ||
      segments.some(
        (segment: string): boolean =>
          segment.length === 0 || segment === "." || segment === "..",
      )
    )
      throw new Error(
        `Benchmark tree path must be an NFC POSIX relative path: ${JSON.stringify(relative)}.`,
      );
  }
}
