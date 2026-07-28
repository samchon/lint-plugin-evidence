import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";

import type { IEvidenceBenchmarkCodexCampaign } from "../structures/IEvidenceBenchmarkCodexCampaign.ts";
import { EvidenceBenchmarkCodexCheckpoint } from "./EvidenceBenchmarkCodexCheckpoint.ts";
import { EvidenceBenchmarkCodexNeutralStripper } from "./EvidenceBenchmarkCodexNeutralStripper.ts";
import { EvidenceBenchmarkCodexValue } from "./EvidenceBenchmarkCodexValue.ts";

/**
 * Materializes arm-neutral, leak-scanned, read-only campaign bundles with
 * deterministic two-pass tree digests.
 */
export class EvidenceBenchmarkCodexNeutralBundle {
  private readonly roots = new Map<string, string>();
  private readonly instanceIds = new Set<string>();
  private readonly stripper: EvidenceBenchmarkCodexNeutralStripper;

  /**
   * Creates a neutral-bundle materializer.
   *
   * @param sourceWorkspace Raw authored workspace.
   * @param bundleDirectory Isolated campaign bundle root.
   */
  public constructor(
    private readonly sourceWorkspace: string,
    private readonly bundleDirectory: string,
  ) {
    this.stripper = new EvidenceBenchmarkCodexNeutralStripper(sourceWorkspace);
  }

  /** Creates one canonical stripped bundle and four equal finder instances. */
  public async materialize(
    round: number,
    authoredStateDigest: string,
  ): Promise<IEvidenceBenchmarkCodexCampaign.IRoundBundle> {
    const roundDirectory = path.join(
      this.bundleDirectory,
      `round-${String(round).padStart(3, "0")}`,
    );
    const canonical = path.join(roundDirectory, "canonical");
    if (await EvidenceBenchmarkCodexNeutralBundle.exists(roundDirectory))
      throw new Error(`neutral bundle round ${round} already exists`);
    await fs.promises.mkdir(canonical, { recursive: true });
    this.stripper.validatePrisma(
      await this.prismaFiles(this.sourceWorkspace),
      "pre-strip",
    );
    await this.copyDirectory(this.sourceWorkspace, canonical, "");
    this.stripper.validatePrisma(
      await this.prismaFiles(canonical),
      "post-strip",
    );
    await this.assertNoLeaks(canonical);
    const first = await EvidenceBenchmarkCodexNeutralBundle.tree(canonical);
    const second = await EvidenceBenchmarkCodexNeutralBundle.tree(canonical);
    if (
      EvidenceBenchmarkCodexValue.canonicalJson(first) !==
      EvidenceBenchmarkCodexValue.canonicalJson(second)
    )
      throw new Error(`neutral bundle round ${round} has unstable tree input`);
    const canonicalBundleSha256 = EvidenceBenchmarkCodexValue.sha256(
      EvidenceBenchmarkCodexValue.canonicalJson(first),
    );
    const stripperProvenance = this.stripper.provenance();
    const stripperProvenanceSha256 = EvidenceBenchmarkCodexValue.sha256(
      EvidenceBenchmarkCodexValue.canonicalJson(stripperProvenance),
    );
    const manifest = {
      schemaVersion: 1,
      round,
      sourceAuthoredDigest: authoredStateDigest,
      stripperProvenance,
      stripperProvenanceSha256,
      entries: first,
    };
    const manifestSha256 = EvidenceBenchmarkCodexValue.sha256(
      EvidenceBenchmarkCodexValue.canonicalJson(manifest),
    );
    await EvidenceBenchmarkCodexCheckpoint.write(
      path.join(roundDirectory, "bundle.manifest.json"),
      { ...manifest, manifestSha256 },
    );
    const assignments: IEvidenceBenchmarkCodexCampaign.FinderAssignment[] = [
      "F1-requirements-database",
      "F2-api-logic",
      "F3-tests",
      "F4-frontend",
    ];
    const instances: IEvidenceBenchmarkCodexCampaign.IBundleInstance[] = [];
    for (const [index, assignmentId] of assignments.entries()) {
      const instanceId = crypto.randomUUID();
      if (this.instanceIds.has(instanceId))
        throw new Error(`neutral bundle instance reused: ${instanceId}`);
      this.instanceIds.add(instanceId);
      const target = path.join(roundDirectory, "instances", assignmentId);
      await fs.promises.mkdir(path.dirname(target), { recursive: true });
      await fs.promises.cp(canonical, target, {
        recursive: true,
        force: false,
        errorOnExist: true,
      });
      const digest = EvidenceBenchmarkCodexValue.sha256(
        EvidenceBenchmarkCodexValue.canonicalJson(
          await EvidenceBenchmarkCodexNeutralBundle.tree(target),
        ),
      );
      if (digest !== canonicalBundleSha256)
        throw new Error(
          `neutral bundle instance ${assignmentId} changed canonical bytes`,
        );
      await EvidenceBenchmarkCodexNeutralBundle.makeReadOnly(target);
      this.roots.set(instanceId, target);
      instances.push({
        assignmentId,
        instanceId,
        bundleSha256: digest,
        readOnly: true,
        priorTranscriptAbsent: true,
        armInformationAbsent: true,
      });
    }
    return {
      round,
      sourceAuthoredDigest: authoredStateDigest,
      bundleId: crypto.randomUUID(),
      manifestSha256,
      stripperProvenanceSha256,
      canonicalBundleSha256,
      instances: instances as [
        IEvidenceBenchmarkCodexCampaign.IBundleInstance,
        IEvidenceBenchmarkCodexCampaign.IBundleInstance,
        IEvidenceBenchmarkCodexCampaign.IBundleInstance,
        IEvidenceBenchmarkCodexCampaign.IBundleInstance,
      ],
    };
  }

  /** Resolves one private instance root without exposing another finder copy. */
  public instanceRoot(instanceId: string): string {
    const root = this.roots.get(instanceId);
    if (root === undefined)
      throw new Error(`unknown neutral bundle instance ${instanceId}`);
    return root;
  }

  private async copyDirectory(
    sourceRoot: string,
    targetRoot: string,
    relativeDirectory: string,
  ): Promise<void> {
    const source = path.join(sourceRoot, relativeDirectory);
    const children = await fs.promises.readdir(source, {
      withFileTypes: true,
    });
    children.sort((left, right): number =>
      left.name < right.name ? -1 : left.name > right.name ? 1 : 0,
    );
    for (const child of children) {
      const relative = path
        .join(relativeDirectory, child.name)
        .split(path.sep)
        .join("/");
      if (EvidenceBenchmarkCodexNeutralBundle.excluded(relative, child))
        continue;
      const input = path.join(sourceRoot, relative);
      const output = path.join(targetRoot, relative);
      if (child.isDirectory()) {
        await fs.promises.mkdir(output, { recursive: true });
        await this.copyDirectory(sourceRoot, targetRoot, relative);
      } else if (child.isSymbolicLink()) {
        const link = await fs.promises.readlink(input);
        const resolved = path.resolve(path.dirname(input), link);
        if (
          path.isAbsolute(link) ||
          !EvidenceBenchmarkCodexNeutralBundle.isInside(
            this.sourceWorkspace,
            resolved,
          )
        )
          throw new Error(`neutral bundle symlink escapes source: ${relative}`);
        await fs.promises.mkdir(path.dirname(output), { recursive: true });
        await fs.promises.symlink(link, output);
      } else if (child.isFile()) {
        await fs.promises.mkdir(path.dirname(output), { recursive: true });
        const bytes = await fs.promises.readFile(input);
        const sanitized = this.stripper.strip(relative, bytes);
        await fs.promises.writeFile(output, sanitized, { flag: "wx" });
      }
    }
  }

  private async assertNoLeaks(root: string): Promise<void> {
    const forbidden = [
      "@evidence",
      "@samchon/lint-plugin-evidence",
      "evidence/graph",
      "evidence/documented",
      "evidence/singular",
      "evidence/todo",
    ].map((value): Buffer => Buffer.from(value, "utf8"));
    for (const entry of await EvidenceBenchmarkCodexNeutralBundle.tree(root)) {
      const target = path.join(root, ...entry.path.split("/"));
      const bytes =
        entry.kind === "symlink"
          ? Buffer.from(await fs.promises.readlink(target), "utf8")
          : await fs.promises.readFile(target);
      const lowered = Buffer.from(
        bytes.toString("latin1").toLowerCase(),
        "latin1",
      );
      if (
        forbidden.some((needle): boolean =>
          lowered.includes(
            Buffer.from(needle.toString("utf8").toLowerCase(), "utf8"),
          ),
        ) ||
        forbidden.some((needle): boolean =>
          Buffer.from(entry.path.toLowerCase(), "utf8").includes(needle),
        )
      )
        throw new Error(
          `arm information leaked into neutral bundle: ${entry.path}`,
        );
    }
  }

  private static excluded(relative: string, entry: fs.Dirent): boolean {
    const segments = relative.split("/");
    if (
      segments.some((segment) =>
        [
          ".git",
          ".agents",
          ".codex",
          ".claude",
          ".work",
          "node_modules",
          "dist",
          "coverage",
          "logs",
        ].includes(segment),
      )
    )
      return true;
    const name = entry.name.toLowerCase();
    return (
      name === "agents.md" ||
      name === "claude.md" ||
      /^lint\.config\.[cm]?[jt]s$/.test(name) ||
      /\.(?:tgz|tar|gz|zip|7z|log)$/.test(name)
    );
  }

  private async prismaFiles(root: string): Promise<Array<[string, string]>> {
    const files: Array<[string, string]> = [];
    const visit = async (
      directory: string,
      relativeDirectory: string,
    ): Promise<void> => {
      const children = await fs.promises.readdir(directory, {
        withFileTypes: true,
      });
      children.sort((left, right): number =>
        left.name < right.name ? -1 : left.name > right.name ? 1 : 0,
      );
      for (const child of children) {
        const relative = path
          .join(relativeDirectory, child.name)
          .split(path.sep)
          .join("/");
        if (EvidenceBenchmarkCodexNeutralBundle.excluded(relative, child))
          continue;
        const target = path.join(directory, child.name);
        if (child.isDirectory()) await visit(target, relative);
        else if (child.isFile() && child.name.endsWith(".prisma"))
          files.push([
            relative,
            new TextDecoder("utf-8", { fatal: true }).decode(
              await fs.promises.readFile(target),
            ),
          ]);
      }
    };
    await visit(root, "");
    return files;
  }

  private static async tree(root: string): Promise<
    Array<{
      path: string;
      kind: "file" | "symlink";
      executable: boolean;
      byteLength: number;
      contentSha256: string;
    }>
  > {
    const output: Array<{
      path: string;
      kind: "file" | "symlink";
      executable: boolean;
      byteLength: number;
      contentSha256: string;
    }> = [];
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
        output.push({
          path: relative,
          kind: child.isSymbolicLink() ? "symlink" : "file",
          executable: (stat.mode & 0o111) !== 0,
          byteLength: bytes.length,
          contentSha256: EvidenceBenchmarkCodexValue.sha256(bytes),
        });
      }
    };
    await visit(root);
    output.sort((left, right): number =>
      left.path < right.path ? -1 : left.path > right.path ? 1 : 0,
    );
    return output;
  }

  private static async makeReadOnly(root: string): Promise<void> {
    const visit = async (directory: string): Promise<void> => {
      const children = await fs.promises.readdir(directory, {
        withFileTypes: true,
      });
      for (const child of children) {
        const target = path.join(directory, child.name);
        if (child.isDirectory()) {
          await visit(target);
          await fs.promises.chmod(target, 0o555);
        } else if (!child.isSymbolicLink()) {
          const stat = await fs.promises.stat(target);
          await fs.promises.chmod(
            target,
            (stat.mode & 0o111) !== 0 ? 0o555 : 0o444,
          );
        }
      }
    };
    await visit(root);
    await fs.promises.chmod(root, 0o555);
  }

  private static async exists(target: string): Promise<boolean> {
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

  private static isInside(root: string, target: string): boolean {
    const relative = path.relative(path.resolve(root), path.resolve(target));
    return (
      relative === "" ||
      (!relative.startsWith(`..${path.sep}`) &&
        relative !== ".." &&
        !path.isAbsolute(relative))
    );
  }
}
