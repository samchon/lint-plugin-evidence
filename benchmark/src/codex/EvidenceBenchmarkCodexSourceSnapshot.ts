import fs from "node:fs";
import path from "node:path";

import { EvidenceBenchmarkCodexCheckpoint } from "./EvidenceBenchmarkCodexCheckpoint.ts";
import { EvidenceBenchmarkCodexValue } from "./EvidenceBenchmarkCodexValue.ts";

/**
 * Builds a deterministic, Git-trackable authored-source snapshot while
 * recording every excluded ephemeral root.
 */
export namespace EvidenceBenchmarkCodexSourceSnapshot {
  /** Frozen generated-template source-retention policy revision. */
  export const RULESET_VERSION = 1;

  /** One retained file or symlink in canonical POSIX order. */
  export interface IEntry {
    /** NFC-normalized workspace-relative POSIX path. */
    path: string;

    /** Retained filesystem kind. */
    kind: "file" | "symlink";

    /** Normalized executable bit. */
    executable: boolean;

    /** Exact retained byte length. */
    byteLength: number;

    /** SHA-256 of file bytes or symlink target bytes. */
    contentSha256: string;
  }

  /** Deterministic source snapshot manifest. */
  export interface IManifest {
    /** Manifest schema version. */
    schemaVersion: 1;

    /** RFC 8785 tree digest algorithm. */
    algorithm: "sha256(rfc8785(sorted-nfc-posix-source-entries))";

    /** Frozen retention ruleset revision. */
    rulesetVersion: 1;

    /** SHA-256 of the canonical retention rule declarations. */
    rulesetSha256: string;

    /** Canonical retained entries. */
    entries: IEntry[];

    /** Excluded roots and files with stable reasons. */
    exclusions: Array<{
      /** Workspace-relative POSIX path. */
      path: string;

      /** Stable exclusion reason. */
      reason: "dependency" | "build" | "cache" | "runtime" | "vcs";

      /** Number of descendant filesystem entries beneath the excluded root. */
      descendantCount: number;

      /** Exact aggregate bytes represented by the excluded tree. */
      byteLength: number;

      /** Deterministic digest of excluded relative paths, kinds, and bytes. */
      treeSha256: string;
    }>;

    /** SHA-256 of canonical retained entries only. */
    sourceSnapshotSha256: string;

    /** RFC 8785 SHA-256 of every preceding field. */
    manifestSha256: string;
  }

  /** Copies retained source bytes and writes a sibling exclusion manifest. */
  export async function create(
    sourceRoot: string,
    targetRoot: string,
    manifestPath: string,
  ): Promise<IManifest> {
    if (await exists(targetRoot))
      throw new Error(`source snapshot target already exists: ${targetRoot}`);
    await fs.promises.mkdir(targetRoot, { recursive: true });
    const entries: IEntry[] = [];
    const exclusions: IManifest["exclusions"] = [];
    await copyDirectory(
      path.resolve(sourceRoot),
      path.resolve(targetRoot),
      "",
      entries,
      exclusions,
    );
    entries.sort(comparePath);
    exclusions.sort(comparePath);
    const sourceSnapshotSha256 = EvidenceBenchmarkCodexValue.sha256(
      EvidenceBenchmarkCodexValue.canonicalJson(entries),
    );
    const unsigned = {
      schemaVersion: 1 as const,
      algorithm: "sha256(rfc8785(sorted-nfc-posix-source-entries))" as const,
      rulesetVersion: RULESET_VERSION as 1,
      rulesetSha256: rulesetSha256(),
      entries,
      exclusions,
      sourceSnapshotSha256,
    };
    const manifest: IManifest = {
      ...unsigned,
      manifestSha256: EvidenceBenchmarkCodexValue.sha256(
        EvidenceBenchmarkCodexValue.canonicalJson(unsigned),
      ),
    };
    await EvidenceBenchmarkCodexCheckpoint.write(manifestPath, manifest);
    return manifest;
  }

  /** Recomputes and validates a retained source snapshot without modifying it. */
  export async function verify(
    root: string,
    manifest: IManifest,
  ): Promise<void> {
    const entries = await tree(root);
    const digest = EvidenceBenchmarkCodexValue.sha256(
      EvidenceBenchmarkCodexValue.canonicalJson(entries),
    );
    const { manifestSha256: _ignored, ...unsigned } = manifest;
    if (
      digest !== manifest.sourceSnapshotSha256 ||
      EvidenceBenchmarkCodexValue.canonicalJson(entries) !==
        EvidenceBenchmarkCodexValue.canonicalJson(manifest.entries) ||
      EvidenceBenchmarkCodexValue.sha256(
        EvidenceBenchmarkCodexValue.canonicalJson(unsigned),
      ) !== manifest.manifestSha256
    )
      throw new Error("retained source snapshot does not match its seal");
  }

  async function copyDirectory(
    sourceRoot: string,
    targetRoot: string,
    relativeDirectory: string,
    entries: IEntry[],
    exclusions: IManifest["exclusions"],
  ): Promise<void> {
    const children = await fs.promises.readdir(
      path.join(sourceRoot, relativeDirectory),
      { withFileTypes: true },
    );
    children.sort((left, right): number =>
      left.name < right.name ? -1 : left.name > right.name ? 1 : 0,
    );
    for (const child of children) {
      const relative = path
        .join(relativeDirectory, child.name)
        .split(path.sep)
        .join("/")
        .normalize("NFC");
      const reason = exclusion(relative, child);
      if (reason !== null) {
        exclusions.push({
          path: relative,
          reason,
          ...(await excludedTreeFacts(
            path.join(sourceRoot, ...relative.split("/")),
          )),
        });
        continue;
      }
      const source = path.join(sourceRoot, ...relative.split("/"));
      const target = path.join(targetRoot, ...relative.split("/"));
      if (child.isDirectory()) {
        await fs.promises.mkdir(target, { recursive: true });
        await copyDirectory(
          sourceRoot,
          targetRoot,
          relative,
          entries,
          exclusions,
        );
        continue;
      }
      await fs.promises.mkdir(path.dirname(target), { recursive: true });
      const stat = await fs.promises.lstat(source);
      const bytes = child.isSymbolicLink()
        ? Buffer.from(await fs.promises.readlink(source), "utf8")
        : await fs.promises.readFile(source);
      if (child.isSymbolicLink()) {
        const link = bytes.toString("utf8");
        if (path.isAbsolute(link))
          throw new Error(`source symlink must be relative: ${relative}`);
        const resolved = path.resolve(path.dirname(source), link);
        const rootRelative = path.relative(sourceRoot, resolved);
        if (
          rootRelative === ".." ||
          rootRelative.startsWith(`..${path.sep}`) ||
          path.isAbsolute(rootRelative)
        )
          throw new Error(`source symlink escapes workspace: ${relative}`);
        await fs.promises.symlink(link, target);
      } else
        await fs.promises.writeFile(target, bytes, {
          flag: "wx",
          mode: (stat.mode & 0o111) !== 0 ? 0o755 : 0o644,
        });
      entries.push({
        path: relative,
        kind: child.isSymbolicLink() ? "symlink" : "file",
        executable: (stat.mode & 0o111) !== 0,
        byteLength: bytes.length,
        contentSha256: EvidenceBenchmarkCodexValue.sha256(bytes),
      });
    }
  }

  async function tree(root: string): Promise<IEntry[]> {
    const entries: IEntry[] = [];
    const visit = async (directory: string): Promise<void> => {
      const children = await fs.promises.readdir(directory, {
        withFileTypes: true,
      });
      children.sort((left, right): number =>
        left.name < right.name ? -1 : left.name > right.name ? 1 : 0,
      );
      for (const child of children) {
        const target = path.join(directory, child.name);
        if (child.isDirectory()) {
          await visit(target);
          continue;
        }
        const relative = path
          .relative(root, target)
          .split(path.sep)
          .join("/")
          .normalize("NFC");
        const stat = await fs.promises.lstat(target);
        const bytes = child.isSymbolicLink()
          ? Buffer.from(await fs.promises.readlink(target), "utf8")
          : await fs.promises.readFile(target);
        entries.push({
          path: relative,
          kind: child.isSymbolicLink() ? "symlink" : "file",
          executable: (stat.mode & 0o111) !== 0,
          byteLength: bytes.length,
          contentSha256: EvidenceBenchmarkCodexValue.sha256(bytes),
        });
      }
    };
    await visit(root);
    entries.sort(comparePath);
    return entries;
  }

  function exclusion(
    relative: string,
    entry: fs.Dirent,
  ): IManifest["exclusions"][number]["reason"] | null {
    const segments = relative.split("/");
    if (segments.includes(".git")) return "vcs";
    if (segments.includes("node_modules")) return "dependency";
    if (
      [
        "packages/api/lib",
        "packages/backend/bin",
        "packages/backend/lib",
        "packages/frontend/dist",
      ].some(
        (root): boolean => relative === root || relative.startsWith(`${root}/`),
      )
    )
      return "build";
    if (
      segments.some((segment) =>
        ["build", ".next", "coverage"].includes(segment),
      )
    )
      return "build";
    if (
      relative === "packages/backend/src/prisma" ||
      relative.startsWith("packages/backend/src/prisma/")
    )
      return "build";
    if (
      segments.some((segment) =>
        [
          ".cache",
          ".turbo",
          ".vite",
          ".work",
          "playwright-report",
          "test-results",
        ].includes(segment),
      )
    )
      return "cache";
    const name = entry.name.toLowerCase();
    if (name.endsWith(".tsbuildinfo")) return "build";
    if (
      name === ".env" ||
      (name.startsWith(".env.") && name !== ".env.example") ||
      /\.(?:sqlite|sqlite3|db)(?:-(?:journal|shm|wal))?$/i.test(name) ||
      /\.(?:pid|sock|tmp|temp)$/i.test(name)
    )
      return "runtime";
    return null;
  }

  function rulesetSha256(): string {
    return EvidenceBenchmarkCodexValue.sha256(
      EvidenceBenchmarkCodexValue.canonicalJson({
        version: RULESET_VERSION,
        vcsSegments: [".git"],
        dependencySegments: ["node_modules"],
        buildSegments: ["build", ".next", "coverage"],
        generatedRoots: [
          "packages/api/lib",
          "packages/backend/bin",
          "packages/backend/lib",
          "packages/backend/src/prisma",
          "packages/frontend/dist",
        ],
        cacheSegments: [
          ".cache",
          ".turbo",
          ".vite",
          ".work",
          "playwright-report",
          "test-results",
        ],
        buildSuffixes: [".tsbuildinfo"],
        runtimeNames: [".env"],
        runtimePrefixesExcept: {
          ".env.": [".env.example"],
        },
        runtimePatterns: [
          "\\.(sqlite|sqlite3|db)(-(journal|shm|wal))?$",
          "\\.(pid|sock|tmp|temp)$",
        ],
        symlinkPolicy: "relative-and-contained",
      }),
    );
  }

  async function excludedTreeFacts(target: string): Promise<{
    descendantCount: number;
    byteLength: number;
    treeSha256: string;
  }> {
    const rootStat = await fs.promises.lstat(target);
    const facts: Array<{
      path: string;
      kind: "directory" | "file" | "symlink";
      byteLength: number;
      sha256: string;
    }> = [];
    const visit = async (
      current: string,
      relative: string,
      includeCurrent: boolean,
    ): Promise<void> => {
      const stat = await fs.promises.lstat(current);
      if (stat.isDirectory()) {
        if (includeCurrent)
          facts.push({
            path: relative,
            kind: "directory",
            byteLength: 0,
            sha256: EvidenceBenchmarkCodexValue.sha256(""),
          });
        const children = await fs.promises.readdir(current, {
          withFileTypes: true,
        });
        children.sort((left, right): number =>
          left.name.localeCompare(right.name),
        );
        for (const child of children)
          await visit(
            path.join(current, child.name),
            relative === "" ? child.name : `${relative}/${child.name}`,
            true,
          );
        return;
      }
      const bytes = stat.isSymbolicLink()
        ? Buffer.from(await fs.promises.readlink(current), "utf8")
        : await fs.promises.readFile(current);
      facts.push({
        path: relative,
        kind: stat.isSymbolicLink() ? "symlink" : "file",
        byteLength: bytes.length,
        sha256: EvidenceBenchmarkCodexValue.sha256(bytes),
      });
    };
    await visit(target, "", false);
    facts.sort(comparePath);
    return {
      descendantCount: rootStat.isDirectory() ? facts.length : 0,
      byteLength: facts.reduce(
        (sum, entry): number => sum + entry.byteLength,
        0,
      ),
      treeSha256: EvidenceBenchmarkCodexValue.sha256(
        EvidenceBenchmarkCodexValue.canonicalJson(facts),
      ),
    };
  }

  function comparePath(
    left: { path: string },
    right: { path: string },
  ): number {
    return left.path < right.path ? -1 : left.path > right.path ? 1 : 0;
  }

  async function exists(target: string): Promise<boolean> {
    return fs.promises
      .lstat(target)
      .then((): boolean => true)
      .catch((error: unknown): boolean => {
        if (
          EvidenceBenchmarkCodexValue.isRecord(error) &&
          error.code === "ENOENT"
        )
          return false;
        throw error;
      });
  }
}
