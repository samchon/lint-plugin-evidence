import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { EvidenceBenchmarkAtomic } from "./EvidenceBenchmarkAtomic.ts";
import { EvidenceBenchmarkCorpus } from "./EvidenceBenchmarkCorpus.ts";
import { EvidenceBenchmarkHash } from "./EvidenceBenchmarkHash.ts";
import { EvidenceBenchmarkJson } from "./EvidenceBenchmarkJson.ts";
import { EvidenceBenchmarkProcess } from "./EvidenceBenchmarkProcess.ts";
import { EvidenceBenchmarkTemplate } from "./EvidenceBenchmarkTemplate.ts";
import type { IEvidenceBenchmarkMaterialization } from "./structures/IEvidenceBenchmarkMaterialization.ts";

/** Atomically materializes one benchmark workspace and immutable input ledger. */
export namespace EvidenceBenchmarkMaterializer {
  /**
   * Builds one cell below a sibling staging directory and publishes it once.
   *
   * Requirements enter the workspace and an out-of-workspace immutable copy in
   * the same rename. Evidence receives the packed archive as a relative file
   * dependency; plain records the same identity without receiving its bytes.
   */
  export async function materialize(
    request: IEvidenceBenchmarkMaterialization.IRequest,
  ): Promise<IEvidenceBenchmarkMaterialization> {
    const repository: string = path.resolve(request.repository);
    const output: string = path.resolve(request.output);
    const parent: string = path.dirname(output);
    if (output === path.parse(output).root)
      throw new Error(
        "Benchmark materialization output cannot be a filesystem root.",
      );
    if (fs.existsSync(output))
      throw new Error(
        `Benchmark materialization refuses to overwrite an existing cell: ${output}.`,
      );
    fs.mkdirSync(parent, { recursive: true });
    const stage: string = path.join(
      parent,
      `.${path.basename(output)}.${process.pid}.${crypto.randomUUID()}.tmp`,
    );
    fs.mkdirSync(stage, { recursive: false });
    try {
      const composition: EvidenceBenchmarkTemplate.IComposition =
        EvidenceBenchmarkTemplate.compose({
          template: path.join(repository, "benchmark", "template"),
          arm: request.arm,
          variables: request.variables,
        });
      const workspaceFiles: Map<string, Uint8Array> = new Map(
        composition.files,
      );
      const corpus: EvidenceBenchmarkCorpus.IResult =
        EvidenceBenchmarkCorpus.read(
          path.join(repository, "benchmark", "requirements", request.project),
        );
      const requirementFiles: ReadonlyMap<string, Uint8Array> = corpus.files;
      for (const [relative, content] of requirementFiles) {
        const workspacePath: string = path.posix.join(
          "docs",
          "analysis",
          relative,
        );
        if (workspaceFiles.has(workspacePath))
          throw new Error(
            `Requirement materialization collides with a template path: ${workspacePath}.`,
          );
        workspaceFiles.set(workspacePath, content);
      }

      const archiveBytes: Buffer = fs.readFileSync(request.artifact.archive);
      if (EvidenceBenchmarkHash.bytes(archiveBytes) !== request.artifact.sha256)
        throw new Error(
          `Prepared evidence archive drifted after provenance was recorded: ${request.artifact.archive}.`,
        );
      const relativeArchive: string | undefined =
        request.arm === "evidence"
          ? `.benchmark-deps/e-${request.artifact.sha256.slice(0, 12)}.tgz`
          : undefined;
      if (relativeArchive !== undefined) {
        workspaceFiles.set(relativeArchive, archiveBytes);
        injectEvidenceDependency(
          workspaceFiles,
          request.artifact.name,
          relativeArchive,
        );
      }
      EvidenceBenchmarkTemplate.validate(workspaceFiles);

      const workspaceTreeSha256: string =
        EvidenceBenchmarkHash.tree(workspaceFiles);
      const requirementsTreeSha256: string =
        EvidenceBenchmarkHash.tree(requirementFiles);
      const caches = {
        pnpm: path.join(output, "cache", "pnpm-store"),
        ttsc: path.join(output, "cache", "ttsc"),
        go: path.join(output, "cache", "go-build"),
        toolchain: path.join(output, "cache", "toolchain-bin"),
      };
      const manifestRecord: IEvidenceBenchmarkMaterialization.IManifest = {
        schemaVersion: 2,
        treeAlgorithm: EvidenceBenchmarkHash.TREE_ALGORITHM,
        project: request.project,
        arm: request.arm,
        materializedAt: new Date().toISOString(),
        variables: Object.fromEntries(
          Object.entries(request.variables).sort(([left], [right]) =>
            left.localeCompare(right, "en"),
          ),
        ),
        baseTreeSha256: composition.baseTreeSha256,
        armTreeSha256: composition.armTreeSha256,
        requirementsTreeSha256,
        workspaceTreeSha256,
        inputSha256: EvidenceBenchmarkHash.object({
          treeAlgorithm: EvidenceBenchmarkHash.TREE_ALGORITHM,
          project: request.project,
          arm: request.arm,
          variables: request.variables,
          base: composition.baseTreeSha256,
          overlay: composition.armTreeSha256,
          requirements: requirementsTreeSha256,
          product: request.artifact.sha256,
          workspace: workspaceTreeSha256,
        }),
        workspaceFiles: EvidenceBenchmarkHash.entries(workspaceFiles),
        requirementFiles: EvidenceBenchmarkHash.entries(requirementFiles),
        corpus: {
          documents: corpus.documents,
          h2: corpus.h2,
          h3: corpus.h3,
          atomicAcceptanceClauses: corpus.atomicAcceptanceClauses,
          contextCriteria: corpus.contextCriteria,
          inventory: corpus.inventory,
        },
        artifact: {
          name: request.artifact.name,
          version: request.artifact.version,
          sha256: request.artifact.sha256,
          payloadSha256: request.artifact.payloadSha256,
          sourceCommit: request.artifact.sourceCommit,
          ...(relativeArchive === undefined ? {} : { relativeArchive }),
        },
        caches,
      };
      const environment: NodeJS.ProcessEnv = {
        ...process.env,
        npm_config_store_dir: caches.pnpm,
        TTSC_CACHE_DIR: caches.ttsc,
        TTSC_GO_CACHE_DIR: caches.go,
        GOCACHE: caches.go,
        GOTMPDIR: path.join(output, "cache", "go-tmp"),
      };
      const stageToolchain: string = path.join(stage, "cache", "toolchain-bin");
      EvidenceBenchmarkProcess.pinEnvironment(environment, stageToolchain);

      writeTree(path.join(stage, "workspace"), workspaceFiles);
      writeTree(path.join(stage, "inputs", "requirements"), requirementFiles);
      fs.writeFileSync(
        path.join(stage, "materialization.json"),
        `${JSON.stringify(manifestRecord, null, 2)}\n`,
        { encoding: "utf8", flag: "wx" },
      );
      await EvidenceBenchmarkAtomic.publish(stage, output);
      environment.PATH = (environment.PATH ?? "")
        .split(path.delimiter)
        .map((entry) => (entry === stageToolchain ? caches.toolchain : entry))
        .join(path.delimiter);
      return {
        root: output,
        workspace: path.join(output, "workspace"),
        immutableInputs: path.join(output, "inputs", "requirements"),
        manifest: path.join(output, "materialization.json"),
        workspaceTreeSha256,
        environment,
      };
    } catch (error) {
      removeExactStage(stage, parent);
      throw error;
    }
  }

  function injectEvidenceDependency(
    files: Map<string, Uint8Array>,
    packageName: string,
    relativeArchive: string,
  ): void {
    const manifestBytes: Uint8Array | undefined = files.get("package.json");
    if (manifestBytes === undefined)
      throw new Error(
        "Benchmark base template must provide package.json before evidence injection.",
      );
    const manifest: unknown = EvidenceBenchmarkJson.parse(
      Buffer.from(manifestBytes).toString("utf8"),
      "benchmark template package.json",
    );
    if (!isObject(manifest))
      throw new Error(
        "Benchmark template package.json must contain an object.",
      );
    const current: unknown = manifest.devDependencies;
    if (current !== undefined && !isObject(current))
      throw new Error(
        "Benchmark template package.json devDependencies must be an object.",
      );
    const dependencies: Record<string, unknown> = {
      ...(isObject(current) ? current : {}),
    };
    if (dependencies[packageName] !== undefined)
      throw new Error(
        `Benchmark template already declares ${packageName}; package injection must own that dependency.`,
      );
    dependencies[packageName] = `file:${relativeArchive}`;
    manifest.devDependencies = Object.fromEntries(
      Object.entries(dependencies).sort(([left], [right]) =>
        left.localeCompare(right, "en"),
      ),
    );
    files.set(
      "package.json",
      Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, "utf8"),
    );
  }

  function writeTree(
    root: string,
    files: ReadonlyMap<string, Uint8Array>,
  ): void {
    fs.mkdirSync(root, { recursive: true });
    for (const [relative, content] of [...files.entries()].sort(
      ([left], [right]) => left.localeCompare(right, "en"),
    )) {
      const location: string = path.join(root, ...relative.split("/"));
      const resolved: string = path.resolve(location);
      const relation: string = path.relative(root, resolved);
      if (
        relation.length === 0 ||
        relation === ".." ||
        relation.startsWith(`..${path.sep}`) ||
        path.isAbsolute(relation)
      )
        throw new Error(
          `Benchmark materialization path escapes its owned root: ${relative}.`,
        );
      fs.mkdirSync(path.dirname(location), { recursive: true });
      fs.writeFileSync(location, content, { flag: "wx" });
    }
  }

  function removeExactStage(stage: string, parent: string): void {
    const resolvedStage: string = path.resolve(stage);
    const relation: string = path.relative(path.resolve(parent), resolvedStage);
    if (
      relation.length === 0 ||
      relation === ".." ||
      relation.startsWith(`..${path.sep}`) ||
      path.isAbsolute(relation)
    )
      throw new Error(
        `Refusing to clean a benchmark staging path outside its parent: ${stage}.`,
      );
    fs.rmSync(resolvedStage, { recursive: true, force: true });
  }

  function isObject(input: unknown): input is Record<string, unknown> {
    return typeof input === "object" && input !== null && !Array.isArray(input);
  }
}
