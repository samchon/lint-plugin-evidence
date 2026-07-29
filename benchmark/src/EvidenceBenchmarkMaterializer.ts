import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { EvidenceBenchmarkAtomic } from "./EvidenceBenchmarkAtomic.ts";
import { EvidenceBenchmarkCorpus } from "./EvidenceBenchmarkCorpus.ts";
import { EvidenceBenchmarkHash } from "./EvidenceBenchmarkHash.ts";
import { EvidenceBenchmarkLintBaseline } from "./EvidenceBenchmarkLintBaseline.ts";
import { EvidenceBenchmarkPath } from "./EvidenceBenchmarkPath.ts";
import { EvidenceBenchmarkProcess } from "./EvidenceBenchmarkProcess.ts";
import { EvidenceBenchmarkProject } from "./EvidenceBenchmarkProject.ts";
import { EvidenceBenchmarkTemplate } from "./EvidenceBenchmarkTemplate.ts";
import type { IEvidenceBenchmarkMaterialization } from "./structures/IEvidenceBenchmarkMaterialization.ts";

/** Atomically materializes one benchmark workspace and immutable input ledger. */
export namespace EvidenceBenchmarkMaterializer {
  /** Returns the only cache authority layout admitted for one cell root. */
  export function cacheLayout(
    root: string,
  ): IEvidenceBenchmarkMaterialization.IManifest["caches"] {
    const output: string = path.resolve(root);
    const workspaceCache: string = path.join(
      output,
      "workspace",
      ".benchmark-cache",
    );
    return {
      home: path.join(output, "cache", "home"),
      corepack: path.join(output, "cache", "corepack"),
      pnpm: path.join(workspaceCache, "pnpm-store"),
      ttsc: path.join(workspaceCache, "ttsc"),
      go: path.join(workspaceCache, "go-build"),
      goModules: path.join(workspaceCache, "go-modules"),
      goPath: path.join(workspaceCache, "go-path"),
      playwright: path.join(workspaceCache, "playwright"),
      temp: path.join(workspaceCache, "tmp"),
      toolchain: path.join(output, "cache", "toolchain-bin"),
    };
  }

  /** Rejects cache authority that drifted outside the canonical cell layout. */
  export function assertCacheLayout(
    root: string,
    input: unknown,
  ): asserts input is IEvidenceBenchmarkMaterialization.IManifest["caches"] {
    if (typeof input !== "object" || input === null || Array.isArray(input))
      throw new Error("Benchmark materialization has no cache authority map.");
    const actual = input as Record<string, unknown>;
    const expected = cacheLayout(root);
    const expectedKeys: readonly string[] = Object.keys(expected).sort();
    if (
      JSON.stringify(Object.keys(actual).sort()) !==
      JSON.stringify(expectedKeys)
    )
      throw new Error(
        "Benchmark materialization cache authority inventory drifted.",
      );
    for (const key of expectedKeys) {
      const value: unknown = actual[key];
      const canonical: string = expected[key as keyof typeof expected];
      if (
        typeof value !== "string" ||
        path.resolve(value) !== path.resolve(canonical)
      )
        throw new Error(
          `Benchmark materialization cache authority drifted: ${key}.`,
        );
      EvidenceBenchmarkPath.assertInside(root, value, `benchmark cache ${key}`);
    }
  }

  /**
   * Returns the minimal host environment needed by portable child processes.
   *
   * Benchmark children do not inherit arbitrary compiler, package-manager,
   * runtime, loader, or repository configuration from the operator shell.
   */
  export function hostEnvironment(): NodeJS.ProcessEnv {
    const exact: ReadonlyMap<string, string> = new Map(
      [
        "ALL_PROXY",
        "APPDATA",
        "CI",
        "CODEX_API_KEY",
        "COLORTERM",
        "COMSPEC",
        "GITHUB_ACTIONS",
        "HOME",
        "HOMEDRIVE",
        "HOMEPATH",
        "HTTP_PROXY",
        "HTTPS_PROXY",
        "LANG",
        "LOCALAPPDATA",
        "NO_PROXY",
        "NODE_EXTRA_CA_CERTS",
        "NUMBER_OF_PROCESSORS",
        "OPENAI_API_KEY",
        "OS",
        "PATHEXT",
        "PROGRAMDATA",
        "ProgramFiles",
        "ProgramFiles(x86)",
        "ProgramW6432",
        "RUNNER_ARCH",
        "RUNNER_OS",
        "SHELL",
        "SSL_CERT_DIR",
        "SSL_CERT_FILE",
        "SystemRoot",
        "TERM",
        "TZ",
        "USER",
        "USERDOMAIN",
        "USERNAME",
        "USERPROFILE",
        "WINDIR",
      ].map((key) => [key.toLowerCase(), key] as const),
    );
    const output: NodeJS.ProcessEnv = {};
    for (const [key, value] of Object.entries(process.env)) {
      const normalized: string = key.toLowerCase();
      const canonical: string | undefined = exact.get(normalized);
      if (canonical !== undefined) output[canonical] = value;
      else if (normalized.startsWith("lc_")) output[key] = value;
    }
    output.PATH = process.env.PATH ?? process.env.Path ?? "";
    return output;
  }

  /**
   * Removes model credentials and credential-bearing proxy variables before
   * executing workspace-authored lifecycle or gate code.
   */
  export function untrustedEnvironment(
    source: NodeJS.ProcessEnv,
  ): NodeJS.ProcessEnv {
    const forbidden: ReadonlySet<string> = new Set(
      [
        "ALL_PROXY",
        "CODEX_API_KEY",
        "HTTP_PROXY",
        "HTTPS_PROXY",
        "NODE_EXTRA_CA_CERTS",
        "NO_PROXY",
        "OPENAI_API_KEY",
        "SSL_CERT_DIR",
        "SSL_CERT_FILE",
      ].map((key) => key.toLowerCase()),
    );
    return Object.fromEntries(
      Object.entries(source).filter(
        ([key]) => forbidden.has(key.toLowerCase()) === false,
      ),
    );
  }

  /** Returns the empty cell-owned npm config after verifying its exact bytes. */
  export function npmConfig(root: string): string {
    return emptyConfiguration(root, "npmrc", "package-manager");
  }

  /** Returns the empty cell-owned Git config after verifying its exact bytes. */
  export function gitConfig(root: string): string {
    return emptyConfiguration(root, "gitconfig", "Git");
  }

  function emptyConfiguration(
    root: string,
    name: string,
    label: string,
  ): string {
    const location: string = path.join(root, "inputs", name);
    const stat: fs.Stats | undefined = fs.lstatSync(location, {
      throwIfNoEntry: false,
    });
    if (
      !stat?.isFile() ||
      stat.isSymbolicLink() ||
      fs.readFileSync(location).byteLength !== 0
    )
      throw new Error(
        `Benchmark cell does not retain its empty ${label} config.`,
      );
    return location;
  }

  /** Rejects any drift in the measured workspace's frozen requirement copy. */
  export function assertRequirementsRestored(
    workspace: string,
    root: string,
  ): void {
    const manifest = JSON.parse(
      fs.readFileSync(path.join(root, "materialization.json"), "utf8"),
    ) as Omit<IEvidenceBenchmarkMaterialization.IManifest, "schemaVersion"> & {
      schemaVersion: unknown;
    };
    const analysis: string = path.join(workspace, "docs", "analysis");
    const stat: fs.Stats | undefined = fs.lstatSync(analysis, {
      throwIfNoEntry: false,
    });
    if (
      manifest.schemaVersion !== 7 ||
      !stat?.isDirectory() ||
      stat.isSymbolicLink()
    )
      throw new Error(
        "Benchmark workspace does not retain its frozen requirement directory.",
      );
    const files: ReadonlyMap<string, Uint8Array> =
      EvidenceBenchmarkHash.directory(analysis);
    if (
      EvidenceBenchmarkHash.tree(files) !== manifest.requirementsTreeSha256 ||
      EvidenceBenchmarkHash.object(EvidenceBenchmarkHash.entries(files)) !==
        EvidenceBenchmarkHash.object(manifest.requirementFiles)
    )
      throw new Error(
        "Benchmark workspace requirement copy was not restored to its frozen input.",
      );
  }

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
    const started: bigint = process.hrtime.bigint();
    const repository: string = path.resolve(request.repository);
    const project: IEvidenceBenchmarkMaterialization.Project =
      EvidenceBenchmarkProject.requireCorpus(repository, request.project);
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
    EvidenceBenchmarkPath.assertSymlinkFree(parent, "materialization parent");
    fs.mkdirSync(parent, { recursive: true });
    EvidenceBenchmarkPath.assertDirectory(parent, "materialization parent");
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
          path.join(repository, "benchmark", "requirements", project),
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
      const lintBaselines: readonly IEvidenceBenchmarkMaterialization.ILintConfigBaseline[] =
        EvidenceBenchmarkLintBaseline.capture(workspaceFiles, request.arm);

      const workspaceTreeSha256: string =
        EvidenceBenchmarkHash.tree(workspaceFiles);
      const requirementsTreeSha256: string =
        EvidenceBenchmarkHash.tree(requirementFiles);
      const caches = cacheLayout(output);
      const manifestRecord: IEvidenceBenchmarkMaterialization.IManifest = {
        schemaVersion: 7,
        treeAlgorithm: EvidenceBenchmarkHash.TREE_ALGORITHM,
        project,
        arm: request.arm,
        elapsedMs: 0,
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
          project,
          arm: request.arm,
          variables: request.variables,
          base: composition.baseTreeSha256,
          overlay: composition.armTreeSha256,
          requirements: requirementsTreeSha256,
          product: request.artifact.sha256,
          workspace: workspaceTreeSha256,
          lintBaselines,
          caches,
        }),
        workspaceFiles: EvidenceBenchmarkHash.entries(workspaceFiles),
        requirementFiles: EvidenceBenchmarkHash.entries(requirementFiles),
        lintBaselines,
        corpus: {
          documents: corpus.documents,
          h2: corpus.h2,
          h3: corpus.h3,
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
        ...hostEnvironment(),
        HOME: caches.home,
        USERPROFILE: caches.home,
        APPDATA: path.join(caches.home, "appdata", "roaming"),
        LOCALAPPDATA: path.join(caches.home, "appdata", "local"),
        XDG_CACHE_HOME: path.join(caches.home, ".cache"),
        XDG_CONFIG_HOME: path.join(caches.home, ".config"),
        COREPACK_HOME: caches.corepack,
        TTSC_CACHE_DIR: caches.ttsc,
        TTSC_GO_CACHE_DIR: caches.go,
        GOCACHE: caches.go,
        GOENV: "off",
        GOMODCACHE: caches.goModules,
        GOPATH: caches.goPath,
        GOTMPDIR: path.join(caches.temp, "go"),
        PLAYWRIGHT_BROWSERS_PATH: caches.playwright,
        TMPDIR: caches.temp,
        TEMP: caches.temp,
        TMP: caches.temp,
      };
      for (const key of Object.keys(environment))
        if (key.toLowerCase().startsWith("npm_config_"))
          delete environment[key];
      environment.npm_config_store_dir = caches.pnpm;
      environment.npm_config_userconfig = path.join(output, "inputs", "npmrc");
      environment.npm_config_globalconfig = path.join(
        output,
        "inputs",
        "npmrc",
      );
      environment.GIT_CONFIG_NOSYSTEM = "1";
      environment.GIT_CONFIG_GLOBAL = path.join(output, "inputs", "gitconfig");
      // Nestia owns this flag only inside its private config-loader child.
      // An inherited value would disable Evidence rules in ordinary Programs.
      delete environment.NESTIA_SDK_TRANSFORM;
      const stageToolchain: string = path.join(stage, "cache", "toolchain-bin");
      EvidenceBenchmarkProcess.pinEnvironment(environment, stageToolchain);

      writeTree(path.join(stage, "workspace"), workspaceFiles);
      writeTree(path.join(stage, "inputs", "requirements"), requirementFiles);
      fs.writeFileSync(path.join(stage, "inputs", "npmrc"), "", {
        encoding: "utf8",
        flag: "wx",
      });
      fs.writeFileSync(path.join(stage, "inputs", "gitconfig"), "", {
        encoding: "utf8",
        flag: "wx",
      });
      manifestRecord.elapsedMs =
        Number(process.hrtime.bigint() - started) / 1_000_000;
      fs.writeFileSync(
        path.join(stage, "materialization.json"),
        `${JSON.stringify(manifestRecord, null, 2)}\n`,
        { encoding: "utf8", flag: "wx" },
      );
      EvidenceBenchmarkPath.assertDirectory(parent, "materialization parent");
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
        lintBaselines,
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
    const manifest: unknown = JSON.parse(
      Buffer.from(manifestBytes).toString("utf8"),
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
