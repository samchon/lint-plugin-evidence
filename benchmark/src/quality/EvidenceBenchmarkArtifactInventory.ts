import fs from "node:fs";
import path from "node:path";

import { EvidenceBenchmarkHash } from "../EvidenceBenchmarkHash.ts";
import type { IEvidenceBenchmarkQualityGate } from "../structures/IEvidenceBenchmarkQualityGate.ts";
import { EvidenceBenchmarkQualityInput } from "./EvidenceBenchmarkQualityInput.ts";

/**
 * Inventories authored artifacts without treating findings as automatic
 * defects.
 */
export namespace EvidenceBenchmarkArtifactInventory {
  const IGNORED_DIRECTORIES: ReadonlySet<string> = new Set([
    ".git",
    ".next",
    ".turbo",
    "bin",
    "build",
    "coverage",
    "dist",
    "lib",
    "node_modules",
    "playwright-report",
    "test-results",
  ]);
  const TEXT_EXTENSIONS: ReadonlySet<string> = new Set([
    ".cjs",
    ".css",
    ".cts",
    ".html",
    ".js",
    ".json",
    ".jsx",
    ".md",
    ".mjs",
    ".mts",
    ".prisma",
    ".scss",
    ".sql",
    ".ts",
    ".tsx",
    ".yaml",
    ".yml",
  ]);
  const SOURCE_EXTENSIONS: ReadonlySet<string> = new Set([
    ".cjs",
    ".cts",
    ".js",
    ".jsx",
    ".mjs",
    ".mts",
    ".prisma",
    ".sql",
    ".ts",
    ".tsx",
  ]);

  interface IFindingPattern {
    category: IEvidenceBenchmarkQualityGate.IInventoryFinding["category"];
    pattern: RegExp;
  }

  const FINDING_PATTERNS: readonly IFindingPattern[] = [
    { category: "todo", pattern: /\bTODO\b/giu },
    { category: "fixme", pattern: /\bFIXME\b/giu },
    {
      category: "not_implemented",
      pattern:
        /\b(?:not[\s_-]*implemented|unimplemented)\b|throw\s+new\s+Error\s*\(\s*["'`]not implemented/giu,
    },
    {
      category: "placeholder",
      pattern:
        /\b(?:lorem ipsum|coming soon|placeholder(?: text)?|scaffold landing page)\b/giu,
    },
    {
      category: "skipped_test",
      pattern:
        /\b(?:describe|it|test)\s*\.\s*(?:skip|todo)\s*\(|\bx(?:describe|it)\s*\(/gu,
    },
    {
      category: "focused_test",
      pattern:
        /\b(?:describe|it|test)\s*\.\s*only\s*\(|\bf(?:describe|it)\s*\(/gu,
    },
  ];
  const DISABLED_GATE_PATTERNS: readonly RegExp[] = [
    /(?:^|[;&|]\s*)exit\s+0(?:\s|$)/u,
    /\|\|\s*true(?:\s|$)/u,
    /--passWithNoTests\b/u,
    /\b(?:skip|disable)[\s:_-]*(?:lint|test|build|e2e)\b/iu,
  ];

  /** Reads the authored tree and records exact, reproducible findings. */
  export function inspect(
    workspace: string,
    input: EvidenceBenchmarkQualityInput.IBound,
  ): IEvidenceBenchmarkQualityGate.IInventory {
    EvidenceBenchmarkQualityInput.validate(input);
    const files: Map<string, Uint8Array> = authoredFiles(workspace);
    const workspaceSourceTreeSha256: string = treeSha256(files);
    if (workspaceSourceTreeSha256 !== input.provenance.snapshotRawTree.sha256)
      throw new Error(
        "Inventory workspace differs from the bound source snapshot.",
      );
    const findings: IEvidenceBenchmarkQualityGate.IInventoryFinding[] = [];
    let sourceFiles: number = 0;
    let testFiles: number = 0;
    for (const [relative, bytes] of files) {
      const extension: string = path.posix.extname(relative).toLowerCase();
      if (SOURCE_EXTENSIONS.has(extension)) ++sourceFiles;
      if (isTest(relative)) ++testFiles;
      if (!TEXT_EXTENSIONS.has(extension) || !isText(bytes)) continue;
      const content: string = Buffer.from(bytes).toString("utf8");
      for (const pattern of FINDING_PATTERNS)
        appendMatches(findings, relative, content, pattern);
      if (path.posix.basename(relative) === "package.json")
        appendDisabledScripts(findings, relative, content);
    }
    findings.sort(compareFinding);
    return {
      schemaVersion: 1,
      input: input.provenance,
      workspaceSourceTreeSha256,
      files: files.size,
      authoredBytes: [...files.values()].reduce(
        (sum, content) => sum + content.byteLength,
        0,
      ),
      sourceFiles,
      testFiles,
      findings,
    };
  }

  /** Returns the exact authored tree used by coverage and mutation producers. */
  export function authoredFiles(workspace: string): Map<string, Uint8Array> {
    const root: string = path.resolve(workspace);
    if (!fs.statSync(root).isDirectory())
      throw new Error(`Quality workspace is not a directory: ${root}.`);
    const files: Map<string, Uint8Array> = new Map();
    collect(root, "", files);
    return new Map([...files.entries()].sort(([a], [b]) => compareUtf8(a, b)));
  }

  /** Hashes `path NUL exact-bytes NUL` in raw UTF-8 path order. */
  export function treeSha256(files: ReadonlyMap<string, Uint8Array>): string {
    return EvidenceBenchmarkHash.tree(files);
  }

  /** Compares portable paths by their raw UTF-8 bytes. */
  export function compareUtf8(left: string, right: string): number {
    return Buffer.compare(
      Buffer.from(left, "utf8"),
      Buffer.from(right, "utf8"),
    );
  }

  function collect(
    root: string,
    relative: string,
    output: Map<string, Uint8Array>,
  ): void {
    const directory: string = path.join(root, ...relative.split("/"));
    const entries: fs.Dirent[] = fs
      .readdirSync(directory, { withFileTypes: true })
      .sort((a, b) => compareUtf8(a.name, b.name));
    for (const entry of entries) {
      if (IGNORED_DIRECTORIES.has(entry.name)) continue;
      const child: string =
        relative.length === 0 ? entry.name : `${relative}/${entry.name}`;
      const location: string = path.join(root, ...child.split("/"));
      if (entry.isSymbolicLink())
        throw new Error(`Authored quality tree contains a symlink: ${child}.`);
      if (entry.isDirectory()) collect(root, child, output);
      else if (entry.isFile()) output.set(child, fs.readFileSync(location));
      else if (!entry.isFile())
        throw new Error(`Unsupported authored tree entry: ${child}.`);
    }
  }

  function appendMatches(
    findings: IEvidenceBenchmarkQualityGate.IInventoryFinding[],
    relative: string,
    content: string,
    definition: IFindingPattern,
  ): void {
    for (const match of content.matchAll(definition.pattern)) {
      const index: number = match.index;
      const position = locate(content, index);
      const lineEnd: number = content.indexOf("\n", index);
      const excerpt: string = content
        .slice(
          content.lastIndexOf("\n", index - 1) + 1,
          lineEnd === -1 ? content.length : lineEnd,
        )
        .trim();
      findings.push({
        category: definition.category,
        path: relative,
        line: position.line,
        column: position.column,
        excerptSha256: EvidenceBenchmarkHash.bytes(excerpt),
      });
    }
  }

  function appendDisabledScripts(
    findings: IEvidenceBenchmarkQualityGate.IInventoryFinding[],
    relative: string,
    content: string,
  ): void {
    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      return;
    }
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      !("scripts" in parsed) ||
      typeof parsed.scripts !== "object" ||
      parsed.scripts === null
    )
      return;
    for (const [name, command] of Object.entries(parsed.scripts))
      if (
        typeof command === "string" &&
        DISABLED_GATE_PATTERNS.some((pattern) => pattern.test(command))
      ) {
        const needle: string = JSON.stringify(name);
        const index: number = content.indexOf(needle);
        const position = locate(content, Math.max(0, index));
        findings.push({
          category: "disabled_gate",
          path: relative,
          line: position.line,
          column: position.column,
          excerptSha256: EvidenceBenchmarkHash.bytes(`${name}:${command}`),
        });
      }
  }

  function locate(
    content: string,
    index: number,
  ): { line: number; column: number } {
    const prefix: string = content.slice(0, index);
    const lines: string[] = prefix.split("\n");
    return {
      line: lines.length,
      column: (lines.at(-1)?.length ?? 0) + 1,
    };
  }

  function compareFinding(
    left: IEvidenceBenchmarkQualityGate.IInventoryFinding,
    right: IEvidenceBenchmarkQualityGate.IInventoryFinding,
  ): number {
    return (
      compareUtf8(left.path, right.path) ||
      left.line - right.line ||
      left.column - right.column ||
      compareUtf8(left.category, right.category)
    );
  }

  function isTest(relative: string): boolean {
    return (
      /(?:^|\/)(?:test|tests|__tests__)(?:\/|$)/u.test(relative) ||
      /\.(?:spec|test)\.[cm]?[jt]sx?$/u.test(relative)
    );
  }

  function isText(content: Uint8Array): boolean {
    return !content.includes(0);
  }
}
