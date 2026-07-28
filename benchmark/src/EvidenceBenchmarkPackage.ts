import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";

import * as tar from "tar";
import type { ReadEntry } from "tar";

import { EvidenceBenchmarkHash } from "./EvidenceBenchmarkHash.ts";
import { EvidenceBenchmarkJson } from "./EvidenceBenchmarkJson.ts";
import { EvidenceBenchmarkProcess } from "./EvidenceBenchmarkProcess.ts";
import type { IEvidenceBenchmarkPackageArtifact } from "./structures/IEvidenceBenchmarkPackageArtifact.ts";

/** Builds, verifies, and smokes one release-shaped evidence package archive. */
export namespace EvidenceBenchmarkPackage {
  const PACKAGE_NAME = "@samchon/lint-plugin-evidence";
  const memo: Map<
    string,
    Promise<IEvidenceBenchmarkPackageArtifact>
  > = new Map();

  /**
   * Packs one clean source snapshot once and publishes a verified run artifact.
   *
   * Calls for the same repository, commit, and output share one promise. A
   * cross-process lock protects the package's mutable prepack output while pnpm
   * builds, and the output appears only after payload and native bridge smoke.
   */
  export function prepare(
    request: IEvidenceBenchmarkPackageArtifact.IRequest,
  ): Promise<IEvidenceBenchmarkPackageArtifact> {
    const key: string = [
      path.resolve(request.repository),
      request.expectedCommit,
      path.resolve(request.output),
    ].join("\0");
    const existing: Promise<IEvidenceBenchmarkPackageArtifact> | undefined =
      memo.get(key);
    if (existing !== undefined) return existing;
    const pending: Promise<IEvidenceBenchmarkPackageArtifact> =
      prepareUncached(request);
    memo.set(key, pending);
    pending.catch(() => memo.delete(key));
    return pending;
  }

  async function prepareUncached(
    request: IEvidenceBenchmarkPackageArtifact.IRequest,
  ): Promise<IEvidenceBenchmarkPackageArtifact> {
    const repository: string = path.resolve(request.repository);
    const output: string = path.resolve(request.output);
    const parent: string = path.dirname(output);
    if (output === path.parse(output).root)
      throw new Error("Evidence package output cannot be a filesystem root.");
    if (fs.existsSync(output))
      throw new Error(
        `Evidence package preparation refuses to overwrite: ${output}.`,
      );
    fs.mkdirSync(parent, { recursive: true });
    const temporary: string = fs.mkdtempSync(
      path.join(parent, `.${path.basename(output)}.${process.pid}.`),
    );
    const releaseLock: IReleaseLock = await acquireReleaseLock(repository);
    try {
      await assertSourceSnapshot(
        repository,
        request.expectedCommit,
        "before pack",
      );
      const packageDirectory: string = path.join(
        repository,
        "packages",
        "evidence",
      );
      const packDirectory: string = path.join(temporary, "pack");
      fs.mkdirSync(packDirectory, { recursive: true });
      const packed = await EvidenceBenchmarkProcess.pnpm(
        ["pack", "--pack-destination", packDirectory],
        {
          cwd: packageDirectory,
          label: "evidence package pack",
        },
      );
      const archives: string[] = fs
        .readdirSync(packDirectory)
        .filter((file) => file.endsWith(".tgz"))
        .sort();
      if (archives.length !== 1)
        throw new Error(
          `pnpm pack must emit exactly one tgz, received ${JSON.stringify(archives)}.`,
        );
      const packedArchive: string = path.join(packDirectory, archives[0]!);
      const archiveBytes: Buffer = fs.readFileSync(packedArchive);
      if (archiveBytes.byteLength === 0)
        throw new Error("pnpm pack emitted an empty evidence archive.");
      const sha256: string = EvidenceBenchmarkHash.bytes(archiveBytes);
      const validated: IValidatedPayload = await validatePayload({
        archive: packedArchive,
        extraction: path.join(temporary, "extracted"),
        packageSource: packageDirectory,
      });
      const smoke: ISmokeResult = await smokeConsumer({
        archive: packedArchive,
        root: path.join(temporary, "smoke"),
      });
      await assertSourceSnapshot(
        repository,
        request.expectedCommit,
        "after pack and smoke",
      );

      const publish: string = path.join(temporary, "publish");
      fs.mkdirSync(publish, { recursive: false });
      const archiveName: string = `e-${sha256.slice(0, 12)}.tgz`;
      const finalArchive: string = path.join(output, archiveName);
      fs.copyFileSync(packedArchive, path.join(publish, archiveName));
      const artifact: IEvidenceBenchmarkPackageArtifact = {
        archive: finalArchive,
        name: validated.name,
        version: validated.version,
        bytes: archiveBytes.byteLength,
        sha256,
        sri: EvidenceBenchmarkHash.sri(archiveBytes),
        payloadSha256: validated.payloadSha256,
        sourceCommit: request.expectedCommit,
        sourceLockSha256: EvidenceBenchmarkHash.file(
          path.join(repository, "pnpm-lock.yaml"),
        ),
        preparedAt: new Date().toISOString(),
        packElapsedMs: packed.elapsedMs,
        smokeInstallElapsedMs: smoke.installElapsedMs,
        smokeCheckElapsedMs: smoke.checkElapsedMs,
        pnpmVersion: smoke.pnpmVersion,
        nodeVersion: process.version,
        platform: process.platform,
        architecture: process.arch,
      };
      fs.writeFileSync(
        path.join(publish, "provenance.json"),
        `${JSON.stringify(artifact, null, 2)}\n`,
        { encoding: "utf8", flag: "wx" },
      );
      fs.renameSync(publish, output);
      removeOwnedTemporary(temporary, parent);
      return artifact;
    } catch (error) {
      removeOwnedTemporary(temporary, parent);
      throw error;
    } finally {
      await releaseLock.release();
    }
  }

  interface IValidatedPayload {
    name: string;
    version: string;
    payloadSha256: string;
  }

  async function validatePayload(props: {
    archive: string;
    extraction: string;
    packageSource: string;
  }): Promise<IValidatedPayload> {
    await validateTarEntries(props.archive);
    fs.mkdirSync(props.extraction, { recursive: true });
    await tar.x({ cwd: props.extraction, file: props.archive, strict: true });
    const root: string = path.join(props.extraction, "package");
    if (!fs.existsSync(root) || !fs.statSync(root).isDirectory())
      throw new Error("Evidence archive has no package root directory.");
    const files: Map<string, Uint8Array> =
      EvidenceBenchmarkHash.directory(root);
    for (const required of [
      "LICENSE",
      "README.md",
      "lib/index.d.ts",
      "lib/index.js",
      "package.json",
    ])
      if (!files.has(required))
        throw new Error(`Evidence archive is missing ${required}.`);
    for (const forbidden of files.keys())
      if (
        forbidden === "go.mod" ||
        forbidden.startsWith("build/") ||
        forbidden.startsWith("src/") ||
        forbidden.endsWith("_test.go")
      )
        throw new Error(
          `Evidence archive contains forbidden payload: ${forbidden}.`,
        );

    const manifest: unknown = EvidenceBenchmarkJson.parse(
      Buffer.from(files.get("package.json")!).toString("utf8"),
      "packed package/package.json",
    );
    if (!isObject(manifest))
      throw new Error("Packed evidence package manifest must be an object.");
    if (manifest.name !== PACKAGE_NAME || typeof manifest.version !== "string")
      throw new Error(
        `Packed evidence identity is wrong: ${String(manifest.name)}@${String(manifest.version)}.`,
      );
    if (manifest.main !== "lib/index.js")
      throw new Error(
        `Packed evidence main must be lib/index.js, received ${String(manifest.main)}.`,
      );
    const exportsField: unknown = manifest.exports;
    const rootExport: unknown = isObject(exportsField)
      ? exportsField["."]
      : undefined;
    if (
      !isObject(rootExport) ||
      rootExport.types !== "./lib/index.d.ts" ||
      rootExport.default !== "./lib/index.js"
    )
      throw new Error(
        "Packed evidence exports must expose ./lib/index.d.ts and ./lib/index.js.",
      );
    assertResolvedDependencyProtocols(manifest);
    assertNativePayload(props.packageSource, files);
    return {
      name: PACKAGE_NAME,
      version: manifest.version,
      payloadSha256: EvidenceBenchmarkHash.tree(files),
    };
  }

  async function validateTarEntries(archive: string): Promise<void> {
    const failures: string[] = [];
    await tar.t({
      file: archive,
      strict: true,
      onReadEntry: (entry: ReadEntry): void => {
        const relative: string = entry.path.replaceAll("\\", "/");
        if (
          relative.startsWith("/") ||
          relative === ".." ||
          relative.startsWith("../") ||
          path.posix.normalize(relative) !== relative
        )
          failures.push(`unsafe archive path ${entry.path}`);
        if (
          entry.type !== "File" &&
          entry.type !== "Directory" &&
          entry.type !== "OldFile" &&
          entry.type !== "ContiguousFile"
        )
          failures.push(
            `unsupported archive entry ${entry.type} ${entry.path}`,
          );
        entry.resume();
      },
    });
    if (failures.length !== 0)
      throw new Error(
        `Evidence archive entry validation failed:\n${failures.join("\n")}`,
      );
  }

  function assertResolvedDependencyProtocols(
    manifest: Record<string, unknown>,
  ): void {
    for (const section of [
      "dependencies",
      "devDependencies",
      "optionalDependencies",
      "peerDependencies",
    ]) {
      const dependencies: unknown = manifest[section];
      if (dependencies === undefined) continue;
      if (!isObject(dependencies))
        throw new Error(`Packed manifest ${section} must be an object.`);
      for (const [name, value] of Object.entries(dependencies))
        if (
          typeof value !== "string" ||
          value.startsWith("catalog:") ||
          value.startsWith("workspace:")
        )
          throw new Error(
            `Packed manifest dependency ${section}.${name} is unresolved: ${String(value)}.`,
          );
    }
  }

  function assertNativePayload(
    packageSource: string,
    packed: ReadonlyMap<string, Uint8Array>,
  ): void {
    const nativeRoot: string = path.join(packageSource, "native");
    const expected: Map<string, Uint8Array> = new Map(
      [...EvidenceBenchmarkHash.directory(nativeRoot)]
        .filter(
          ([relative]) =>
            relative.endsWith(".go") && !relative.endsWith("_test.go"),
        )
        .map(([relative, content]) => [`native/${relative}`, content]),
    );
    const actual: Map<string, Uint8Array> = new Map(
      [...packed].filter(([relative]) => relative.startsWith("native/")),
    );
    const expectedEntries = EvidenceBenchmarkHash.entries(expected);
    const actualEntries = EvidenceBenchmarkHash.entries(actual);
    if (JSON.stringify(expectedEntries) !== JSON.stringify(actualEntries))
      throw new Error(
        "Packed native Go payload does not exactly match the production source set.",
      );
  }

  interface ISmokeResult {
    installElapsedMs: number;
    checkElapsedMs: number;
    pnpmVersion: string;
  }

  async function smokeConsumer(props: {
    archive: string;
    root: string;
  }): Promise<ISmokeResult> {
    fs.mkdirSync(props.root, { recursive: true });
    const localArchive: string = path.join(props.root, "evidence.tgz");
    fs.copyFileSync(props.archive, localArchive);
    writeSmokeFiles(props.root);
    const cache: string = path.join(props.root, "cache");
    const environment: NodeJS.ProcessEnv = {
      ...process.env,
      npm_config_store_dir: path.join(cache, "pnpm"),
      TTSC_CACHE_DIR: path.join(cache, "ttsc"),
      TTSC_GO_CACHE_DIR: path.join(cache, "go-build"),
      GOCACHE: path.join(cache, "go-build"),
      GOTMPDIR: path.join(cache, "go-tmp"),
    };
    EvidenceBenchmarkProcess.pinEnvironment(
      environment,
      path.join(cache, "toolchain-bin"),
    );
    for (const variable of [
      "npm_config_store_dir",
      "TTSC_CACHE_DIR",
      "TTSC_GO_CACHE_DIR",
      "GOCACHE",
      "GOTMPDIR",
    ])
      fs.mkdirSync(environment[variable]!, { recursive: true });

    const pnpm = await EvidenceBenchmarkProcess.pnpm(["--version"], {
      cwd: props.root,
      env: environment,
      label: "package smoke pnpm version",
    });
    if (pnpm.stdout.trim() !== EvidenceBenchmarkProcess.PNPM_VERSION)
      throw new Error(
        `Package smoke requires pnpm ${EvidenceBenchmarkProcess.PNPM_VERSION}, received ${pnpm.stdout.trim()}.`,
      );
    const install = await EvidenceBenchmarkProcess.pnpm(
      ["install", "--no-frozen-lockfile"],
      {
        cwd: props.root,
        env: environment,
        label: "package smoke install",
      },
    );
    const descriptor = await EvidenceBenchmarkProcess.run(
      "node",
      [
        "--input-type=module",
        "--eval",
        [
          `const module = await import(${JSON.stringify(PACKAGE_NAME)});`,
          "const plugin = module.evidence;",
          "if (!plugin || !import.meta.resolve) process.exit(2);",
          "if (!plugin.source || !plugin.source.endsWith('native')) process.exit(3);",
          "console.log(plugin.meta.name, plugin.meta.version, plugin.rules.join(','));",
        ].join(" "),
      ],
      {
        cwd: props.root,
        env: environment,
        label: "package smoke descriptor",
      },
    );
    if (
      !descriptor.stdout.includes(PACKAGE_NAME) ||
      !descriptor.stdout.includes("graph,singular,documented,todo")
    )
      throw new Error(
        `Packed descriptor did not expose the expected identity and rules:\n${descriptor.stdout}`,
      );

    const failing = await EvidenceBenchmarkProcess.pnpm(
      ["exec", "ttsc", "--noEmit"],
      {
        cwd: props.root,
        env: environment,
        label: "package smoke violating native check",
        allowFailure: true,
      },
    );
    const failingOutput: string = `${failing.stderr}\n${failing.stdout}`;
    if (
      failing.status === 0 ||
      !failingOutput.includes("package smoke debt") ||
      !failingOutput.includes("Unrealized '@todo'")
    )
      throw new Error(
        `Packed native rule did not report the smoke violation:\n${failingOutput}`,
      );
    const markdownSource: string = path.join(props.root, "src", "markdown.ts");
    fs.writeFileSync(
      markdownSource,
      fs
        .readFileSync(markdownSource, "utf8")
        .replace(" * @todo package smoke debt\n", ""),
      "utf8",
    );
    const passing = await EvidenceBenchmarkProcess.pnpm(
      ["exec", "ttsc", "--noEmit"],
      {
        cwd: props.root,
        env: environment,
        label: "package smoke repaired native and bridge check",
      },
    );
    return {
      installElapsedMs: install.elapsedMs,
      checkElapsedMs: failing.elapsedMs + passing.elapsedMs,
      pnpmVersion: EvidenceBenchmarkProcess.PNPM_VERSION,
    };
  }

  function writeSmokeFiles(root: string): void {
    const files: Record<string, string> = {
      "package.json": `${JSON.stringify(
        {
          private: true,
          name: "evidence-package-smoke",
          version: "0.0.0",
          type: "module",
          packageManager: "pnpm@10.10.0",
          devDependencies: {
            [PACKAGE_NAME]: "file:./evidence.tgz",
            "@ttsc/lint": "0.23.0",
            ttsc: "0.23.0",
            typescript: "7.0.2",
          },
        },
        null,
        2,
      )}\n`,
      "pnpm-workspace.yaml": 'packages:\n  - "."\n',
      "tsconfig.json": `${JSON.stringify(
        {
          compilerOptions: {
            target: "esnext",
            module: "nodenext",
            moduleResolution: "nodenext",
            strict: true,
            noEmit: true,
            plugins: [{ transform: "@ttsc/lint" }],
          },
          include: ["src", "lint.config.ts"],
        },
        null,
        2,
      )}\n`,
      "lint.config.ts": smokeLintConfig(),
      "docs/analysis/requirements.md": [
        "# Requirements",
        "",
        "## Package smoke {#package-smoke}",
        "",
        "The packaged graph must load every bridge.",
        "",
      ].join("\n"),
      "prisma/schema.prisma": [
        "datasource db {",
        '  provider = "postgresql"',
        "}",
        "",
        "model SmokeRecord {",
        "  id String @id @db.Uuid",
        "}",
        "",
      ].join("\n"),
      "api/swagger.yaml": [
        'swagger: "2.0"',
        "info:",
        "  title: Package smoke",
        '  version: "1.0.0"',
        "paths:",
        "  /smoke:",
        "    post:",
        "      operationId: smoke.create",
        "      responses:",
        '        "201":',
        "          description: Created",
        "",
      ].join("\n"),
      "src/markdown.ts": [
        "/**",
        " * @evidence docs/analysis/requirements.md#package-smoke Implements the package smoke requirement.",
        " * @todo package smoke debt",
        " */",
        "export interface IMarkdownSmoke {}",
        "",
      ].join("\n"),
      "src/prisma.ts": [
        "/** @evidence prisma:SmokeRecord Exposes the smoke persistence model. */",
        "export interface IPrismaSmoke {}",
        "",
      ].join("\n"),
      "src/swagger.ts": [
        "/** @evidence POST:/smoke Implements the packed Swagger operation. */",
        "export interface ISwaggerSmoke {}",
        "",
      ].join("\n"),
    };
    for (const [relative, content] of Object.entries(files)) {
      const location: string = path.join(root, ...relative.split("/"));
      fs.mkdirSync(path.dirname(location), { recursive: true });
      fs.writeFileSync(location, content, { encoding: "utf8", flag: "wx" });
    }
  }

  function smokeLintConfig(): string {
    return [
      'import type { ITtscLintConfig } from "@ttsc/lint";',
      `import { evidence, type IEvidenceGraphConfig } from "${PACKAGE_NAME}";`,
      "",
      "const graph: IEvidenceGraphConfig = {",
      "  claims: [",
      "    {",
      '      type: "typescript",',
      '      files: ["src/markdown.ts"],',
      '      symbol: "type",',
      "      reference: {",
      '        type: "markdown",',
      '        files: ["docs/analysis/*.md"],',
      '        symbol: "h2",',
      "      },",
      "    },",
      "    {",
      '      type: "typescript",',
      '      files: ["src/prisma.ts"],',
      '      symbol: "type",',
      "      reference: {",
      '        type: "prisma",',
      '        files: ["prisma/*.prisma"],',
      '        symbol: "model",',
      "      },",
      "    },",
      "    {",
      '      type: "typescript",',
      '      files: ["src/swagger.ts"],',
      '      symbol: "type",',
      "      reference: {",
      '        type: "swagger",',
      '        file: "api/swagger.yaml",',
      "      },",
      "    },",
      "  ],",
      "};",
      "",
      "export default {",
      "  plugins: { evidence },",
      "  rules: {",
      '    "evidence/graph": ["error", graph],',
      '    "evidence/todo": "error",',
      "  },",
      "} satisfies ITtscLintConfig;",
      "",
    ].join("\n");
  }

  interface IReleaseLock {
    release: () => Promise<void>;
  }

  async function acquireReleaseLock(repository: string): Promise<IReleaseLock> {
    const lock: string = path.join(
      os.tmpdir(),
      `evidence-benchmark-pack-${EvidenceBenchmarkHash.bytes(path.resolve(repository)).slice(0, 24)}.lock`,
    );
    const deadline: number = Date.now() + 30 * 60 * 1_000;
    for (;;) {
      try {
        const handle: fs.promises.FileHandle = await fs.promises.open(
          lock,
          "wx",
        );
        await handle.writeFile(
          `${JSON.stringify({
            pid: process.pid,
            repository: path.resolve(repository),
            createdAt: new Date().toISOString(),
          })}\n`,
          "utf8",
        );
        return {
          release: async (): Promise<void> => {
            await handle.close();
            await fs.promises.rm(lock, { force: true });
          },
        };
      } catch (error) {
        if (!isNodeError(error, "EEXIST")) throw error;
      }
      if (Date.now() >= deadline) {
        const owner: string = fs.existsSync(lock)
          ? fs.readFileSync(lock, "utf8").trim()
          : "owner disappeared before inspection";
        throw new Error(
          `Timed out waiting for evidence package lock ${lock}. Confirm the recorded process is dead before removing it. Owner: ${owner}`,
        );
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  async function assertSourceSnapshot(
    repository: string,
    expectedCommit: string,
    phase: string,
  ): Promise<void> {
    const revision = await EvidenceBenchmarkProcess.run(
      "git",
      ["rev-parse", "HEAD"],
      { cwd: repository, label: `source revision ${phase}` },
    );
    if (revision.stdout.trim() !== expectedCommit)
      throw new Error(
        `Evidence package source moved ${phase}: expected ${expectedCommit}, received ${revision.stdout.trim()}.`,
      );
    const status = await EvidenceBenchmarkProcess.run(
      "git",
      ["status", "--porcelain=v1", "--untracked-files=all"],
      { cwd: repository, label: `source cleanliness ${phase}` },
    );
    if (status.stdout.trim().length !== 0)
      throw new Error(
        `Evidence package source must be clean ${phase}:\n${status.stdout.trim()}`,
      );
  }

  function removeOwnedTemporary(temporary: string, parent: string): void {
    if (!fs.existsSync(temporary)) return;
    const resolved: string = path.resolve(temporary);
    const relation: string = path.relative(path.resolve(parent), resolved);
    if (
      relation.length === 0 ||
      relation === ".." ||
      relation.startsWith(`..${path.sep}`) ||
      path.isAbsolute(relation)
    )
      throw new Error(
        `Refusing to clean package temporary root outside its parent: ${temporary}.`,
      );
    fs.rmSync(resolved, { recursive: true, force: true });
  }

  function isNodeError(error: unknown, code: string): boolean {
    return (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === code
    );
  }

  function isObject(input: unknown): input is Record<string, unknown> {
    return typeof input === "object" && input !== null && !Array.isArray(input);
  }
}
