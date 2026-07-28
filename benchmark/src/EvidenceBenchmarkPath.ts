import path from "node:path";

/** Validates canonical repository-relative POSIX paths without aliases. */
export namespace EvidenceBenchmarkPath {
  /** Returns one exact canonical relative path or fails closed. */
  export function relative(input: string, label: string): string {
    if (
      typeof input !== "string" ||
      input.length === 0 ||
      input !== input.normalize("NFC") ||
      input === "." ||
      input.includes("\\") ||
      input.startsWith("/") ||
      input.endsWith("/") ||
      /^[A-Za-z]:/.test(input)
    )
      throw new Error(
        `Benchmark ${label} must be a canonical repository-relative POSIX path: ${String(input)}.`,
      );
    const segments: string[] = input.split("/");
    if (
      segments.some(
        (segment) =>
          segment.length === 0 ||
          segment === "." ||
          segment === ".." ||
          !/^[A-Za-z0-9._-]+$/.test(segment),
      )
    )
      throw new Error(
        `Benchmark ${label} contains a non-canonical path segment: ${input}.`,
      );
    return input;
  }

  /** Resolves a canonical relative path and proves repository containment. */
  export function resolve(
    repository: string,
    input: string,
    label: string,
  ): string {
    const relativePath: string = relative(input, label);
    const root: string = path.resolve(repository);
    const output: string = path.resolve(root, ...relativePath.split("/"));
    if (output === root || !output.startsWith(`${root}${path.sep}`))
      throw new Error(
        `Benchmark ${label} escapes its repository: ${relativePath}.`,
      );
    return output;
  }
}
