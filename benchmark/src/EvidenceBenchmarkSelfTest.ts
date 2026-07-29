import assert from "node:assert/strict";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";

import * as ts from "typescript-api";

import { EvidenceBenchmarkBaseline } from "./EvidenceBenchmarkBaseline.ts";
import { EvidenceBenchmarkConsumerProof } from "./EvidenceBenchmarkConsumerProof.ts";
import { EvidenceBenchmarkCorpus } from "./EvidenceBenchmarkCorpus.ts";
import { EvidenceBenchmarkHash } from "./EvidenceBenchmarkHash.ts";
import { EvidenceBenchmarkLintBaseline } from "./EvidenceBenchmarkLintBaseline.ts";
import { EvidenceBenchmarkMaterializer } from "./EvidenceBenchmarkMaterializer.ts";
import { EvidenceBenchmarkPackage } from "./EvidenceBenchmarkPackage.ts";
import { EvidenceBenchmarkProcess } from "./EvidenceBenchmarkProcess.ts";
import { EvidenceBenchmarkProject } from "./EvidenceBenchmarkProject.ts";
import { EvidenceBenchmarkPublication } from "./EvidenceBenchmarkPublication.ts";
import { EvidenceBenchmarkRepair } from "./EvidenceBenchmarkRepair.ts";
import { EvidenceBenchmarkRuntime } from "./EvidenceBenchmarkRuntime.ts";
import { EvidenceBenchmarkSandbox } from "./EvidenceBenchmarkSandbox.ts";
import { EvidenceBenchmarkSetup } from "./EvidenceBenchmarkSetup.ts";
import { EvidenceBenchmarkTemplate } from "./EvidenceBenchmarkTemplate.ts";
import { EvidenceBenchmarkTurnLedger } from "./EvidenceBenchmarkTurnLedger.ts";
import type { IEvidenceBenchmarkMaterialization } from "./structures/IEvidenceBenchmarkMaterialization.ts";
import type { IEvidenceBenchmarkPackageArtifact } from "./structures/IEvidenceBenchmarkPackageArtifact.ts";

/** Runs deterministic fixture tests and the optional release-package smoke. */
export namespace EvidenceBenchmarkSelfTest {
  /** Runs all fast tests and, with --package, the clean-tree consumer smoke. */
  export async function main(
    benchmarkRoot: string,
    args: readonly string[],
  ): Promise<void> {
    const repository: string = path.resolve(benchmarkRoot, "..");
    const temporary: string = fs.mkdtempSync(
      path.join(os.tmpdir(), "evidence-benchmark-self-test-"),
    );
    try {
      const fixture: string = path.join(temporary, "fixture");
      createFixture(repository, fixture);
      await testPinnedPnpm(repository);
      await testRuntimeIsolation();
      await testPublicationSafety(temporary);
      await testCommonRepair(temporary);
      await testBaselineFailureCleanup(temporary);
      await testPinnedSetup(temporary);
      await testRepositoryInputs(repository);
      await testRetentionIgnore(repository);
      testHashContract();
      await testMarkdownCorpus(temporary);
      await testComposition(fixture, temporary);
      await testMaterialization(fixture, temporary);
      if (args.includes("--baseline"))
        await testBaseline(repository, temporary);
      if (args.includes("--package")) await testPackage(repository, temporary);
      console.log(
        `Benchmark self-test passed${args.includes("--baseline") ? " with neutral baseline" : ""}${args.includes("--package") ? " with package smoke" : ""}.`,
      );
    } finally {
      fs.rmSync(temporary, { recursive: true, force: true });
    }
  }

  function testHashContract(): void {
    const files: ReadonlyMap<string, Uint8Array> = new Map([
      ["é.txt", Buffer.from("E", "utf8")],
      ["z.txt", Buffer.from("Z", "utf8")],
    ]);
    assert.equal(
      EvidenceBenchmarkHash.TREE_ALGORITHM,
      "sha256-posix-path-nul-bytes-v1",
    );
    assert.equal(
      EvidenceBenchmarkHash.tree(files),
      "681de99007bb676ae125bd5844860c636e4077fa35857ae5f86a5e412fbf099a",
      "tree identity must use raw UTF-8 path order and exact bytes",
    );
    assert.deepEqual(
      EvidenceBenchmarkHash.entries(files).map((entry) => entry.path),
      ["z.txt", "é.txt"],
      "tree ledgers must use the same raw UTF-8 path order",
    );
    assert.throws(
      () =>
        EvidenceBenchmarkHash.tree(
          new Map([["escape/../file.txt", Buffer.from("x", "utf8")]]),
        ),
      /NFC POSIX relative path/,
    );
    assert.throws(
      () =>
        EvidenceBenchmarkHash.tree(
          new Map([["decomposed-e\u0301.txt", Buffer.from("x", "utf8")]]),
        ),
      /NFC POSIX relative path/,
    );
    assert.throws(
      () =>
        EvidenceBenchmarkHash.tree(
          new Map([["C:/absolute.txt", Buffer.from("x", "utf8")]]),
        ),
      /NFC POSIX relative path/,
    );
  }

  async function testRuntimeIsolation(): Promise<void> {
    assert.equal(
      EvidenceBenchmarkProject.parse("free-form-subject"),
      "free-form-subject",
    );
    assert.throws(
      () => EvidenceBenchmarkProject.parse("../escaped"),
      /Invalid benchmark project slug/,
    );
    assert.throws(
      () => EvidenceBenchmarkProject.parse("con"),
      /Invalid benchmark project slug/,
    );
    const assignments: EvidenceBenchmarkRuntime.IAssignment[] = Array.from(
      { length: 8 },
      (_value, slot) => EvidenceBenchmarkRuntime.assign(slot),
    );
    const ports: number[] = assignments.flatMap((assignment) => [
      assignment.apiPort,
      assignment.swaggerPort,
      assignment.viteDevelopmentPort,
      assignment.playwrightPort,
    ]);
    assert.equal(
      new Set(ports).size,
      ports.length,
      "every benchmark cell endpoint must be unique",
    );

    const firstAssignment: EvidenceBenchmarkRuntime.IAssignment =
      assignments[0]!;
    const shifted: EvidenceBenchmarkRuntime.IAssignment =
      EvidenceBenchmarkRuntime.assign(3, 50_000);
    assert.deepEqual(shifted, {
      apiPort: 50_030,
      swaggerPort: 50_031,
      viteDevelopmentPort: 50_032,
      playwrightPort: 50_033,
      apiHost: "http://127.0.0.1:50030",
    });
    assert.throws(
      () => EvidenceBenchmarkRuntime.assign(7, 65_463),
      /ports between 1 and 65535/,
    );
    const environment: NodeJS.ProcessEnv = {
      API_PORT: "37001",
      PLAYWRIGHT_TEST_PORT: "4173",
    };
    EvidenceBenchmarkRuntime.apply(environment, firstAssignment);
    assert.deepEqual(environment, {
      API_PORT: "46000",
      JWT_ACCESS_TTL_SECONDS: "3600",
      JWT_REFRESH_TTL_SECONDS: "2592000",
      JWT_SECRET_KEY: "benchmark-runtime-secret-at-least-32-characters",
      PLAYWRIGHT_TEST_PORT: "46003",
      SWAGGER_PORT: "46001",
      VITE_API_HOST: "http://127.0.0.1:46000",
      VITE_API_SIMULATE: "false",
      VITE_DEV_PORT: "46002",
    });
    assert.deepEqual(
      EvidenceBenchmarkMaterializer.untrustedEnvironment({
        PATH: "safe",
        OPENAI_API_KEY: "secret",
        codex_api_key: "secret",
        HTTPS_PROXY: "https://credential@example.com",
        NODE_EXTRA_CA_CERTS: "/host/private-ca.pem",
        no_proxy: "localhost",
        SSL_CERT_DIR: "/host/certs",
      }),
      { PATH: "safe" },
      "workspace-authored commands must not inherit model or proxy credentials",
    );
    const sandboxArguments: string[] = EvidenceBenchmarkSandbox.argumentsFor(
      {
        workspace: "C:/cell/workspace",
        toolchain: "C:/cell/cache/toolchain-bin",
        corepack: "C:/cell/cache/corepack",
        npmConfig: "C:/cell/inputs/npmrc",
        gitConfig: "C:/cell/inputs/gitconfig",
      },
      process.execPath,
      ["probe.js"],
    );
    assert.equal(sandboxArguments[0], "sandbox");
    assert.deepEqual(sandboxArguments.slice(1, 4), [
      "--permission-profile",
      "benchmark-cell",
      "--include-managed-config",
    ]);
    assert.equal(
      ["windows", "linux", "macos"].some((adapter) =>
        sandboxArguments.includes(adapter),
      ),
      false,
      "Codex sandbox has no platform-adapter positional argument",
    );
    const secondWave = Array.from({ length: 4 }, (_value, slot) =>
      EvidenceBenchmarkRuntime.assign(slot, 51_000),
    );
    const combinedPorts = [...assignments, ...secondWave].flatMap(
      (assignment) => [
        assignment.apiPort,
        assignment.swaggerPort,
        assignment.viteDevelopmentPort,
        assignment.playwrightPort,
      ],
    );
    assert.equal(
      new Set(combinedPorts).size,
      combinedPorts.length,
      "concurrent waves with distinct port bases must not overlap",
    );

    const persisted: string = fs.mkdtempSync(
      path.join(os.tmpdir(), "evidence-benchmark-runtime-"),
    );
    try {
      fs.mkdirSync(path.join(persisted, "packages", "backend"), {
        recursive: true,
      });
      fs.mkdirSync(path.join(persisted, "packages", "frontend"), {
        recursive: true,
      });
      EvidenceBenchmarkRuntime.persist(persisted, secondWave[0]!);
      EvidenceBenchmarkRuntime.assertRestored(persisted, secondWave[0]!);
      assert.match(
        fs.readFileSync(
          path.join(persisted, "packages", "backend", ".env"),
          "utf8",
        ),
        /^API_PORT=51000$/m,
      );
      assert.match(
        fs.readFileSync(
          path.join(persisted, "packages", "frontend", ".env"),
          "utf8",
        ),
        /^PLAYWRIGHT_TEST_PORT=51003$/m,
      );
      const frontendEnvironment: string = path.join(
        persisted,
        "packages",
        "frontend",
        ".env",
      );
      const frontendEnvironmentSource: string = fs.readFileSync(
        frontendEnvironment,
        "utf8",
      );
      fs.appendFileSync(
        frontendEnvironment,
        "export VITE_API_SIMULATE=true\n",
        "utf8",
      );
      assert.throws(
        () =>
          EvidenceBenchmarkRuntime.assertRestored(persisted, secondWave[0]!),
        /duplicates VITE_API_SIMULATE/,
      );
      fs.writeFileSync(frontendEnvironment, frontendEnvironmentSource, "utf8");
      fs.appendFileSync(
        frontendEnvironment,
        "NODE_OPTIONS=--import ./bypass.mjs\n",
        "utf8",
      );
      assert.throws(
        () =>
          EvidenceBenchmarkRuntime.assertRestored(persisted, secondWave[0]!),
        /may not control execution through NODE_OPTIONS/,
      );
      fs.writeFileSync(frontendEnvironment, frontendEnvironmentSource, "utf8");
      fs.appendFileSync(
        frontendEnvironment,
        "NODE_OPTIONS: --import ./bypass.mjs\n",
        "utf8",
      );
      assert.throws(
        () =>
          EvidenceBenchmarkRuntime.assertRestored(persisted, secondWave[0]!),
        /may not control execution through NODE_OPTIONS/,
      );
      fs.writeFileSync(frontendEnvironment, frontendEnvironmentSource, "utf8");
      fs.appendFileSync(
        frontendEnvironment,
        "COREPACK_ENABLE_PROJECT_SPEC=0\n",
        "utf8",
      );
      assert.throws(
        () =>
          EvidenceBenchmarkRuntime.assertRestored(persisted, secondWave[0]!),
        /may not control execution through COREPACK_ENABLE_PROJECT_SPEC/,
      );
      fs.writeFileSync(frontendEnvironment, frontendEnvironmentSource, "utf8");
      fs.appendFileSync(
        frontendEnvironment,
        "vite_api_simulate=true\n",
        "utf8",
      );
      assert.throws(
        () =>
          EvidenceBenchmarkRuntime.assertRestored(persisted, secondWave[0]!),
        /duplicates VITE_API_SIMULATE/,
      );
      fs.writeFileSync(
        frontendEnvironment,
        [
          `VITE_API_HOST=${secondWave[0]!.apiHost}`,
          "VITE_API_SIMULATE=false",
          `VITE_DEV_PORT=${secondWave[0]!.viteDevelopmentPort}`,
          `PLAYWRIGHT_TEST_PORT=${secondWave[0]!.playwrightPort}`,
          "VITE_APPLICATION_ADDITION=allowed",
          "",
        ].join("\n"),
        "utf8",
      );
      EvidenceBenchmarkRuntime.assertRestored(persisted, secondWave[0]!);
    } finally {
      fs.rmSync(persisted, { recursive: true, force: true });
    }

    const blocker: net.Server = net.createServer();
    await new Promise<void>((resolve, reject) => {
      blocker.once("error", reject);
      blocker.listen(
        { host: "127.0.0.1", port: firstAssignment.apiPort, exclusive: true },
        resolve,
      );
    });
    try {
      await expectFailure(
        () => EvidenceBenchmarkRuntime.assertAvailable([firstAssignment]),
        `api port ${firstAssignment.apiPort} is unavailable`,
      );
    } finally {
      await new Promise<void>((resolve, reject) =>
        blocker.close((error) =>
          error === undefined ? resolve() : reject(error),
        ),
      );
    }
    await EvidenceBenchmarkRuntime.assertAvailable(assignments);
  }

  async function testPublicationSafety(temporary: string): Promise<void> {
    const repository: string = path.join(temporary, "publication-repository");
    const runId: string = "0123456789ab-12345678-1234-4123-8123-123456789abc";
    write(
      path.join(
        repository,
        "benchmark",
        "template",
        "base",
        ".github",
        "workflows",
        "ci.yml",
      ),
      "jobs:\n  test:\n    steps:\n      - run: pnpm --filter {{frontendPackageName}} exec playwright install\n",
    );
    const workspace: string = path.join(
      repository,
      "benchmark",
      "result",
      "todo",
      "evidence",
      "runs",
      runId,
      "workspace",
    );
    const workspacePackage = {
      private: true,
      name: "fixture-root",
      scripts: { test: "fixture root test" },
      devDependencies: {
        "@samchon/lint-plugin-evidence": "fixture",
        "@ttsc/lint": "fixture",
        ttsc: "fixture",
        typescript: "fixture",
      },
    };
    write(
      path.join(workspace, "package.json"),
      `${JSON.stringify(workspacePackage)}\n`,
    );
    write(
      path.join(workspace, "packages", "frontend", "package.json"),
      '{"name":"@evidence-benchmark/todo-evidence-frontend","scripts":{"test":"fixture frontend test"}}\n',
    );
    write(
      path.join(workspace, "packages", "api", "package.json"),
      '{"name":"fixture-api","scripts":{"build":"fixture api build"}}\n',
    );
    write(
      path.join(workspace, "packages", "backend", "package.json"),
      '{"name":"fixture-backend","scripts":{"build":"fixture backend build"}}\n',
    );
    write(
      path.join(workspace, "config", "package.json"),
      '{"name":"fixture-config"}\n',
    );
    write(
      path.join(workspace, ".agents", "skills", "fixture", "SKILL.md"),
      "# Fixture skill\n",
    );
    const runtime: EvidenceBenchmarkRuntime.IAssignment =
      EvidenceBenchmarkRuntime.assign(0, 52_000);
    EvidenceBenchmarkRuntime.persist(workspace, runtime);
    const installedPackagesSha256: Record<string, string> = {};
    for (const name of [
      "@ttsc/lint",
      "ttsc",
      "typescript",
      "@samchon/lint-plugin-evidence",
    ]) {
      const packageRoot: string = path.join(
        workspace,
        "node_modules",
        ...name.split("/"),
      );
      write(
        path.join(packageRoot, "package.json"),
        `${JSON.stringify({ name, version: "fixture" })}\n`,
      );
      installedPackagesSha256[`${name}@fixture:${name}`] =
        EvidenceBenchmarkHash.tree(
          EvidenceBenchmarkHash.directory(packageRoot),
        );
    }
    const fixtureLauncher: string = path.join(
      workspace,
      "node_modules",
      ".bin",
      "ttsc",
    );
    write(fixtureLauncher, "fixture ttsc launcher\n");
    const installedLaunchersSha256 = {
      "root/ttsc": EvidenceBenchmarkHash.file(fixtureLauncher),
    };
    const runRoot: string = path.dirname(workspace);
    write(path.join(runRoot, "cache", "corepack", "fixture"), "corepack\n");
    write(
      path.join(runRoot, "setup.json"),
      `${JSON.stringify({
        nodeVersion: process.version,
        nodePlatform: process.platform,
        nodeArchitecture: process.arch,
        nodeExecutableSha256: EvidenceBenchmarkHash.file(process.execPath),
        corepackExecutableSha256: EvidenceBenchmarkHash.file(
          EvidenceBenchmarkProcess.corepackEntrypoint(),
        ),
        corepackHomeSha256: EvidenceBenchmarkHash.tree(
          EvidenceBenchmarkHash.directory(
            path.join(runRoot, "cache", "corepack"),
          ),
        ),
        installedSeedPackages: [
          "@samchon/lint-plugin-evidence",
          "@ttsc/lint",
          "ttsc",
          "typescript",
        ],
        installedPackagesSha256,
        installedPackageResolutions: [
          "@samchon/lint-plugin-evidence",
          "@ttsc/lint",
          "ttsc",
          "typescript",
        ].map((dependency) => ({
          from: "workspace:root",
          dependency,
          to: `${dependency}@fixture:${dependency}`,
        })),
        installedLaunchersSha256,
      })}\n`,
    );
    for (const [
      index,
      relative,
    ] of EvidenceBenchmarkLintBaseline.PATHS.entries())
      write(
        path.join(workspace, ...relative.split("/")),
        [
          ...(relative === EvidenceBenchmarkLintBaseline.PATHS[1] ||
          relative === EvidenceBenchmarkLintBaseline.PATHS[3]
            ? [
                "declare const process: { env: Record<string, string | undefined> };",
                'const isNestiaConfigLoader = process.env.NESTIA_SDK_TRANSFORM === "1";',
              ]
            : []),
          "const graph = {",
          "  claims: [",
          `    { name: "fixture-${index}", type: "typescript", files: ["src/**/*.ts"], symbol: "function", reference: { type: "markdown", files: ["docs/**/*.md"], symbol: "h2" } },`,
          "  ],",
          "};",
          "export default {",
          "  rules: {",
          `    "evidence/graph": ${
            relative === EvidenceBenchmarkLintBaseline.PATHS[1] ||
            relative === EvidenceBenchmarkLintBaseline.PATHS[3]
              ? 'isNestiaConfigLoader ? "off" : ["error", graph]'
              : '["error", graph]'
          },`,
          `    "evidence/documented": ${
            relative === EvidenceBenchmarkLintBaseline.PATHS[1] ||
            relative === EvidenceBenchmarkLintBaseline.PATHS[3]
              ? 'isNestiaConfigLoader ? "off" : "error"'
              : '"error"'
          },`,
          ...(relative === EvidenceBenchmarkLintBaseline.PATHS[2]
            ? []
            : [
                `    "evidence/singular": ${
                  relative === EvidenceBenchmarkLintBaseline.PATHS[1] ||
                  relative === EvidenceBenchmarkLintBaseline.PATHS[3]
                    ? 'isNestiaConfigLoader ? "off" : "error"'
                    : '"error"'
                },`,
              ]),
          `    "evidence/todo": ${
            relative === EvidenceBenchmarkLintBaseline.PATHS[1] ||
            relative === EvidenceBenchmarkLintBaseline.PATHS[3]
              ? 'isNestiaConfigLoader ? "off" : "error"'
              : '"error"'
          },`,
          "  },",
          "};",
          "",
        ].join("\n"),
      );
    for (const program of EvidenceBenchmarkLintBaseline.PROGRAMS)
      write(
        path.join(workspace, ...program.path.split("/")),
        `${JSON.stringify(
          {
            compilerOptions: {
              plugins: [
                {
                  transform: "@ttsc/lint",
                  configFile: program.configFile,
                },
              ],
            },
          },
          null,
          2,
        )}\n`,
      );
    for (const [
      index,
      infrastructure,
    ] of EvidenceBenchmarkLintBaseline.INFRASTRUCTURE.entries())
      write(
        path.join(workspace, ...infrastructure.path.split("/")),
        infrastructure.path === "packages/frontend/vite.config.ts"
          ? [
              'import path from "node:path";',
              "export const config = {",
              '  cacheDir: path.resolve(__dirname, "../../.benchmark-cache/vite"),',
              "};",
              "",
            ].join("\n")
          : `fixture infrastructure ${index}\n`,
      );
    const lintBaselines: readonly IEvidenceBenchmarkMaterialization.ILintConfigBaseline[] =
      EvidenceBenchmarkLintBaseline.captureDirectory(workspace, "evidence");
    const lintRestorationSha256: string =
      EvidenceBenchmarkLintBaseline.digest(lintBaselines);
    const backendLintRestorationSha256: string =
      EvidenceBenchmarkLintBaseline.digest(
        lintBaselines,
        EvidenceBenchmarkLintBaseline.BACKEND_PATHS,
      );
    const infrastructureLintRestorationSha256: string =
      EvidenceBenchmarkLintBaseline.infrastructureDigest(lintBaselines);
    write(path.join(workspace, ".env.example"), "SECRET=\n");
    write(
      path.join(workspace, ".benchmark-deps", "evidence.tgz"),
      "package archive",
    );
    const archiveSha256: string = EvidenceBenchmarkHash.bytes(
      Buffer.from("package archive"),
    );
    for (const relative of [
      "skills-contract.md",
      "backend/start.md",
      "backend/review.md",
      "backend/evidence-final.md",
      "frontend/start.md",
      "frontend/review.md",
      "frontend/evidence-final.md",
      "overall/review.md",
      "overall/evidence-final.md",
    ])
      write(
        path.join(runRoot, "inputs", "instructions", ...relative.split("/")),
        `${relative}\n`,
      );
    write(
      path.join(runRoot, "inputs", "requirements", "requirements.md"),
      "# Requirements\n",
    );
    write(path.join(runRoot, "inputs", "npmrc"), "");
    write(path.join(runRoot, "inputs", "gitconfig"), "");
    write(
      path.join(workspace, "pnpm-lock.yaml"),
      [
        "lockfileVersion: '9.0'",
        "",
        "importers:",
        "",
        "  .:",
        "    devDependencies:",
        "      '@samchon/lint-plugin-evidence':",
        "        specifier: fixture",
        "        version: fixture",
        "      '@ttsc/lint':",
        "        specifier: fixture",
        "        version: fixture",
        "      ttsc:",
        "        specifier: fixture",
        "        version: fixture",
        "      typescript:",
        "        specifier: fixture",
        "        version: fixture",
        "",
        "  config: {}",
        "",
        "  packages/api: {}",
        "",
        "  packages/backend: {}",
        "",
        "  packages/frontend: {}",
        "",
      ].join("\n"),
    );
    write(
      path.join(workspace, "docs", "analysis", "requirements.md"),
      "# Requirements\n",
    );
    const instructionsTreeSha256: string = EvidenceBenchmarkHash.tree(
      EvidenceBenchmarkHash.directory(
        path.join(runRoot, "inputs", "instructions"),
      ),
    );
    const requirementsTreeSha256: string = EvidenceBenchmarkHash.tree(
      EvidenceBenchmarkHash.directory(
        path.join(runRoot, "inputs", "requirements"),
      ),
    );
    const requirementFiles: readonly IEvidenceBenchmarkMaterialization.ITreeEntry[] =
      EvidenceBenchmarkHash.entries(
        EvidenceBenchmarkHash.directory(
          path.join(runRoot, "inputs", "requirements"),
        ),
      );
    const materializationPath: string = path.join(
      runRoot,
      "materialization.json",
    );
    const variables = {
      name: "fixture-root",
      apiPackageName: "fixture-api",
      backendPackageName: "fixture-backend",
      frontendPackageName: "@evidence-benchmark/todo-evidence-frontend",
    };
    const baseTreeSha256: string = EvidenceBenchmarkHash.bytes("fixture base");
    const armTreeSha256: string = EvidenceBenchmarkHash.bytes("fixture arm");
    const workspaceTreeSha256: string =
      EvidenceBenchmarkHash.bytes("fixture workspace");
    const materialization = {
      schemaVersion: 6,
      treeAlgorithm: EvidenceBenchmarkHash.TREE_ALGORITHM,
      project: "todo",
      arm: "evidence",
      variables,
      baseTreeSha256,
      armTreeSha256,
      requirementsTreeSha256,
      workspaceTreeSha256,
      requirementFiles,
      lintBaselines,
      artifact: {
        sourceCommit: "0123456789abcdef0123456789abcdef01234567",
        sha256: archiveSha256,
        relativeArchive: ".benchmark-deps/evidence.tgz",
      },
      inputSha256: EvidenceBenchmarkHash.object({
        treeAlgorithm: EvidenceBenchmarkHash.TREE_ALGORITHM,
        project: "todo",
        arm: "evidence",
        variables,
        base: baseTreeSha256,
        overlay: armTreeSha256,
        requirements: requirementsTreeSha256,
        product: archiveSha256,
        workspace: workspaceTreeSha256,
        lintBaselines,
      }),
    };
    write(materializationPath, `${JSON.stringify(materialization)}\n`);
    const runStatePath: string = path.join(runRoot, "run.json");
    const turnNames = [
      "skills-contract",
      "backend-start",
      "backend-review",
      "backend-final",
      "frontend-start",
      "frontend-review",
      "frontend-final",
      "overall-review",
      "overall-final",
    ] as const;
    const installationProof: string = EvidenceBenchmarkHash.bytes(
      "fixture installation",
    );
    const threadId: string = "fixture-thread";
    write(
      path.join(runRoot, "logs", "skills-contract.stdout.jsonl"),
      `${JSON.stringify({ type: "turn.failed" })}\n{"truncated":`,
    );
    write(
      path.join(runRoot, "logs", "skills-contract.stderr.log"),
      "fixture capacity failure\n",
    );
    for (const name of turnNames) {
      const stem: string =
        name === "skills-contract" ? `${name}.attempt-2` : name;
      write(
        path.join(runRoot, "logs", `${stem}.stdout.jsonl`),
        [
          JSON.stringify({ type: "thread.started", thread_id: threadId }),
          JSON.stringify({
            type: "turn.completed",
            usage: {
              input_tokens: 1,
              cached_input_tokens: 0,
              output_tokens: 1,
              reasoning_output_tokens: 0,
            },
          }),
          "",
        ].join("\n"),
      );
      write(path.join(runRoot, "logs", `${stem}.stderr.log`), "");
    }
    write(
      runStatePath,
      `${JSON.stringify({
        schemaVersion: 9,
        workflow: "backend-first-gated-v2",
        instructionsTreeSha256,
        project: "todo",
        arm: "evidence",
        engine: "codex",
        model: "gpt-5.6-terra",
        effort: "high",
        cliVersion: "codex-cli 0.145.0",
        elapsedMs: 11,
        controllerPid: 1,
        initialWorkspaceTreeSha256:
          EvidenceBenchmarkPublication.workspaceSha256(workspace),
        threadId,
        status: "completed",
        sourceCommit: "0123456789abcdef0123456789abcdef01234567",
        lintBaselines,
        runtime,
        completedWorkspaceTreeSha256:
          EvidenceBenchmarkPublication.workspaceSha256(workspace),
        turns: [
          {
            name: "skills-contract",
            elapsedMs: 2,
            status: 1,
            stdout: "logs/skills-contract.stdout.jsonl",
            stderr: "logs/skills-contract.stderr.log",
            invocation: [
              "codex",
              ...EvidenceBenchmarkTurnLedger.invocationArguments({
                workspace,
                model: "gpt-5.6-terra",
                effort: "high",
                writable: false,
              }),
            ],
            accepted: false,
          },
          ...turnNames.map((name, index) => {
            const stem: string =
              name === "skills-contract" ? `${name}.attempt-2` : name;
            return {
              name,
              elapsedMs: 1,
              status: 0,
              stdout: path.posix.join("logs", `${stem}.stdout.jsonl`),
              stderr: path.posix.join("logs", `${stem}.stderr.log`),
              invocation: [
                "codex",
                ...EvidenceBenchmarkTurnLedger.invocationArguments({
                  workspace,
                  threadId: index === 0 ? undefined : threadId,
                  model: "gpt-5.6-terra",
                  effort: "high",
                  writable: name !== "skills-contract",
                }),
              ],
              accepted: true,
              threadId,
              ...(name === "skills-contract"
                ? {
                    workspaceRestorationSha256:
                      EvidenceBenchmarkPublication.workspaceSha256(workspace),
                  }
                : {}),
              installationReproductionSha256: installationProof,
              lintRestorationSha256:
                name === "skills-contract"
                  ? infrastructureLintRestorationSha256
                  : name.startsWith("backend-")
                    ? backendLintRestorationSha256
                    : lintRestorationSha256,
            };
          }),
        ],
      })}\n`,
    );
    write(
      path.join(runRoot, "benchmark-report.json"),
      `${JSON.stringify({
        schemaVersion: 1,
        status: "accepted",
        project: "todo",
        arm: "evidence",
        runId,
        measurement: {
          totalElapsedMs: 11,
          agentElapsedMs: 11,
          nonAgentElapsedMs: 0,
          attempts: {
            total: 10,
            accepted: 9,
            rejected: 1,
          },
          tokens: {
            input_tokens: 9,
            cached_input_tokens: 0,
            output_tokens: 9,
            reasoning_output_tokens: 0,
          },
          pricingUsdPerMillion: {
            input: 1,
            cachedInput: 0.1,
            output: 2,
          },
          apiEquivalentCostUsd: 27 / 1_000_000,
        },
        gates: {
          build: "passed",
          lint: "passed",
          database: "passed",
          backendTests: "passed",
          frontendTests: "passed",
          runtime: "passed",
        },
        coverage: {
          requirements: { total: 0, covered: 0 },
          tests: { total: 0, covered: 0 },
        },
        implementation: {
          tables: 0,
          apiOperations: 0,
          dtoTypes: 0,
          dtoProperties: 0,
          testFunctions: 0,
        },
        completion: {
          firstClaimTurn: "overall-final",
          honest: true,
        },
        quality: {
          score: 100,
          summary: "Fixture passed the complete publication audit.",
          residualDefects: [],
        },
        frozenInputs: {
          sourceCommit: materialization.artifact.sourceCommit,
          instructionsTreeSha256,
          requirementsTreeSha256,
          completedWorkspaceTreeSha256:
            EvidenceBenchmarkPublication.workspaceSha256(workspace),
        },
        interventions: [],
      })}\n`,
    );
    const checkout: string = path.join(temporary, "publication-results");
    write(path.join(checkout, "README.md"), "# Benchmark results\n");
    const request: EvidenceBenchmarkPublication.IRequest =
      EvidenceBenchmarkPublication.parse([
        "--",
        "--repository",
        "fixture-owner/evidence-benchmark-results",
        "--checkout",
        checkout,
        "--public",
        "todo",
        "evidence",
        runId,
      ]);

    const calls: string[] = [];
    const runner: EvidenceBenchmarkPublication.Runner = async (
      command,
      arguments_,
    ) => {
      calls.push(`${command} ${arguments_.join(" ")}`);
      if (
        command === "gh" &&
        arguments_[0] === "api" &&
        arguments_[1] === "user"
      )
        return processResult(0, "fixture-owner\n");
      if (
        command === "gh" &&
        arguments_[0] === "api" &&
        arguments_[1] === "repos/fixture-owner/evidence-benchmark-results"
      )
        return processResult(0, "public\n");
      if (
        command === "git" &&
        arguments_.join(" ") === "rev-parse --show-toplevel"
      )
        return processResult(0, `${checkout}\n`);
      if (command === "git" && arguments_.join(" ") === "status --porcelain")
        return processResult(0);
      if (command === "git" && arguments_.join(" ") === "branch --show-current")
        return processResult(0, "master\n");
      if (command === "git" && arguments_.join(" ") === "remote get-url origin")
        return processResult(
          0,
          "https://github.com/fixture-owner/evidence-benchmark-results.git\n",
        );
      if (
        command === "git" &&
        arguments_[0] === "diff" &&
        arguments_.includes("--quiet")
      )
        return processResult(1);
      if (command === "git" && arguments_[0] === "add") {
        const leaf: string = path.join(
          checkout,
          "codex",
          "gpt-5.6-terra",
          "todo",
          "evidence",
        );
        assert.ok(
          fs.existsSync(path.join(leaf, ".benchmark-deps", "evidence.tgz")),
          "evidence publication must retain its local package archive",
        );
        for (const runtimePackage of ["backend", "frontend"])
          assert.equal(
            fs.existsSync(path.join(leaf, "packages", runtimePackage, ".env")),
            false,
            `publication staging must exclude the ${runtimePackage} runtime environment`,
          );
        assert.equal(
          fs.existsSync(path.join(leaf, ".github", "workflows")),
          false,
          "consolidated publication must remove nested workflows",
        );
        const published = JSON.parse(
          fs.readFileSync(path.join(leaf, "benchmark.json"), "utf8"),
        ) as {
          status?: unknown;
          completedWorkspaceTreeSha256?: unknown;
        };
        assert.equal(published.status, "accepted");
        assert.equal(
          published.completedWorkspaceTreeSha256,
          EvidenceBenchmarkPublication.workspaceSha256(workspace),
        );
      }
      if (
        command === "git" &&
        arguments_[0] === "rev-parse" &&
        (arguments_[1] === "HEAD" || arguments_[1] === "origin/master")
      )
        return processResult(0, `${"a".repeat(40)}\n`);
      if (
        command === "gh" &&
        arguments_[0] === "api" &&
        arguments_[1] ===
          "repos/fixture-owner/evidence-benchmark-results/commits/master"
      )
        return processResult(0, `${"a".repeat(40)}\n`);
      if (
        command === "gh" &&
        arguments_[0] === "repo" &&
        arguments_[1] === "view"
      )
        return processResult(
          0,
          "https://github.com/fixture-owner/evidence-benchmark-results\n",
        );
      return processResult(0);
    };
    const reproduce: EvidenceBenchmarkPublication.Reproducer = async (
      _workspace,
      _runRoot,
      verifyGates,
    ) => {
      assert.equal(
        verifyGates,
        true,
        "publication must rerun the clean overall terminal gates",
      );
      return installationProof;
    };
    const publish = (
      candidate: EvidenceBenchmarkPublication.Runner,
    ): Promise<EvidenceBenchmarkPublication.IResult> =>
      EvidenceBenchmarkPublication.publish(
        repository,
        request,
        candidate,
        reproduce,
        () => "codex-cli 0.145.0",
      );
    const result: EvidenceBenchmarkPublication.IResult = await publish(runner);
    assert.equal(result.repository, "fixture-owner/evidence-benchmark-results");
    assert.ok(calls.includes("git push origin master"));

    const reportPath: string = path.join(runRoot, "benchmark-report.json");
    const reportFixture = JSON.parse(fs.readFileSync(reportPath, "utf8")) as {
      measurement: { attempts: { total: number } };
    };
    reportFixture.measurement.attempts.total--;
    write(reportPath, `${JSON.stringify(reportFixture)}\n`);
    await expectFailure(() => publish(runner), "attempt total");
    reportFixture.measurement.attempts.total++;
    write(reportPath, `${JSON.stringify(reportFixture)}\n`);

    const forgedState = JSON.parse(fs.readFileSync(runStatePath, "utf8")) as {
      cliVersion: string;
      turns: Array<{
        name: string;
        invocation: string[];
        installationReproductionSha256: string;
      }>;
    };
    forgedState.cliVersion = "forged-cli";
    write(runStatePath, `${JSON.stringify(forgedState)}\n`);
    await expectFailure(
      () => publish(runner),
      "requires the completed todo/evidence run",
    );
    forgedState.cliVersion = "codex-cli 0.145.0";
    write(runStatePath, `${JSON.stringify(forgedState)}\n`);
    const forgedFinal = forgedState.turns.find(
      (turn) => turn.name === "overall-final",
    )!;
    forgedFinal.installationReproductionSha256 = "f".repeat(64);
    write(runStatePath, `${JSON.stringify(forgedState)}\n`);
    await expectFailure(
      () => publish(runner),
      "installation no longer matches the clean overall-final proof",
    );
    forgedFinal.installationReproductionSha256 = installationProof;
    const forgedBackend = forgedState.turns.find(
      (turn) => turn.name === "backend-start",
    )!;
    const modelIndex: number =
      forgedBackend.invocation.indexOf("gpt-5.6-terra");
    assert.ok(modelIndex >= 0);
    forgedBackend.invocation[modelIndex] = "forged-model";
    write(runStatePath, `${JSON.stringify(forgedState)}\n`);
    await expectFailure(
      () => publish(runner),
      "does not retain the exact model, effort, permission, and thread invocation",
    );
    forgedBackend.invocation[modelIndex] = "gpt-5.6-terra";
    write(runStatePath, `${JSON.stringify(forgedState)}\n`);
    const terminalLog: string = path.join(
      runRoot,
      "logs",
      "overall-final.stdout.jsonl",
    );
    const terminalLogSource: string = fs.readFileSync(terminalLog, "utf8");
    write(
      terminalLog,
      terminalLogSource.replace(',"reasoning_output_tokens":0', ""),
    );
    await expectFailure(
      () => publish(runner),
      "has no terminal model-usage proof",
    );
    fs.writeFileSync(terminalLog, terminalLogSource, "utf8");
    write(
      terminalLog,
      `${JSON.stringify({ type: "thread.started", thread_id: threadId })}\n`,
    );
    await expectFailure(
      () => publish(runner),
      "has no terminal model-usage proof",
    );
    fs.writeFileSync(terminalLog, terminalLogSource, "utf8");
    const orphanLog: string = path.join(runRoot, "logs", "orphan.stderr.log");
    write(orphanLog, "unledgered attempt\n");
    await expectFailure(
      () => publish(runner),
      "log inventory does not exactly match",
    );
    fs.rmSync(orphanLog);

    const workspaceRequirement: string = path.join(
      workspace,
      "docs",
      "analysis",
      "requirements.md",
    );
    fs.appendFileSync(workspaceRequirement, "\nweakened\n", "utf8");
    await expectFailure(
      () =>
        publish(async () => {
          throw new Error("mutated requirements reached the process runner");
        }),
      "workspace requirement copy was not restored",
    );
    fs.writeFileSync(workspaceRequirement, "# Requirements\n", "utf8");

    const frontendRuntime: string = path.join(
      workspace,
      "packages",
      "frontend",
      ".env",
    );
    const frontendRuntimeSource: string = fs.readFileSync(
      frontendRuntime,
      "utf8",
    );
    fs.writeFileSync(
      frontendRuntime,
      frontendRuntimeSource.replace(
        "VITE_API_SIMULATE=false",
        "VITE_API_SIMULATE=true",
      ),
      "utf8",
    );
    await expectFailure(
      () =>
        publish(async () => {
          throw new Error("mutated runtime reached the process runner");
        }),
      "runtime environment was not restored",
    );
    fs.writeFileSync(frontendRuntime, frontendRuntimeSource, "utf8");

    write(path.join(workspace, "benchmark.json"), '{"forged":true}\n');
    await expectFailure(
      () =>
        publish(async () => {
          throw new Error("reserved workspace path reached the process runner");
        }),
      "owns reserved publication path: benchmark.json",
    );
    fs.rmSync(path.join(workspace, "benchmark.json"));

    const installedProduct: string = path.join(
      workspace,
      "node_modules",
      "@samchon",
      "lint-plugin-evidence",
      "package.json",
    );
    const installedProductSource: string = fs.readFileSync(
      installedProduct,
      "utf8",
    );
    fs.writeFileSync(installedProduct, `${installedProductSource}\n`, "utf8");
    await expectFailure(
      () =>
        publish(async () => {
          throw new Error(
            "mutated installed product reached the process runner",
          );
        }),
      "installed compiler, command launcher, or measured-product payload was not restored",
    );
    fs.writeFileSync(installedProduct, installedProductSource, "utf8");

    const runState = JSON.parse(fs.readFileSync(runStatePath, "utf8")) as {
      turns: Array<{
        name: string;
        lintRestorationSha256?: string;
      }>;
    };
    const backendStart = runState.turns.find(
      (turn) => turn.name === "backend-start",
    )!;
    delete backendStart.lintRestorationSha256;
    write(runStatePath, `${JSON.stringify(runState)}\n`);
    await expectFailure(
      () =>
        publish(async () => {
          throw new Error("missing backend proof reached the process runner");
        }),
      "backend-start lint restoration proof",
    );
    backendStart.lintRestorationSha256 = backendLintRestorationSha256;
    const backendFinal = runState.turns.find(
      (turn) => turn.name === "backend-final",
    )!;
    delete backendFinal.lintRestorationSha256;
    write(runStatePath, `${JSON.stringify(runState)}\n`);
    await expectFailure(
      () =>
        publish(async () => {
          throw new Error("missing backend proof reached the process runner");
        }),
      "backend-final lint restoration proof",
    );
    backendFinal.lintRestorationSha256 = backendLintRestorationSha256;
    const frontendFinal = runState.turns.find(
      (turn) => turn.name === "frontend-final",
    )!;
    frontendFinal.lintRestorationSha256 = "wrong-proof";
    write(runStatePath, `${JSON.stringify(runState)}\n`);
    await expectFailure(
      () =>
        publish(async () => {
          throw new Error("wrong frontend proof reached the process runner");
        }),
      "frontend-final lint restoration proof",
    );
    frontendFinal.lintRestorationSha256 = lintRestorationSha256;
    write(runStatePath, `${JSON.stringify(runState)}\n`);
    const overallFinal = runState.turns.find(
      (turn) => turn.name === "overall-final",
    )!;
    delete overallFinal.lintRestorationSha256;
    write(runStatePath, `${JSON.stringify(runState)}\n`);
    await expectFailure(
      () =>
        publish(async () => {
          throw new Error("missing overall proof reached the process runner");
        }),
      "overall-final lint restoration proof",
    );
    overallFinal.lintRestorationSha256 = lintRestorationSha256;
    write(runStatePath, `${JSON.stringify(runState)}\n`);

    const secondTurn = runState.turns[1]!;
    const thirdTurn = runState.turns[2]!;
    runState.turns[1] = thirdTurn;
    runState.turns[2] = secondTurn;
    await expectFailure(
      () =>
        EvidenceBenchmarkTurnLedger.assertAcceptedOrder(
          runState.turns as EvidenceBenchmarkTurnLedger.ITurn[],
          true,
        ),
      "canonical instruction prefix",
    );
    write(runStatePath, `${JSON.stringify(runState)}\n`);
    await expectFailure(
      () =>
        publish(async () => {
          throw new Error("swapped turn order reached the process runner");
        }),
      "canonical instruction prefix",
    );
    runState.turns[1] = secondTurn;
    runState.turns[2] = thirdTurn;
    write(runStatePath, `${JSON.stringify(runState)}\n`);

    materialization.artifact.relativeArchive = ".benchmark-deps/../outside.tgz";
    write(materializationPath, `${JSON.stringify(materialization)}\n`);
    await expectFailure(
      () =>
        publish(async () => {
          throw new Error("unsafe archive path reached the process runner");
        }),
      "unsafe product archive path",
    );
    materialization.artifact.relativeArchive = ".benchmark-deps/evidence.tgz";
    write(materializationPath, `${JSON.stringify(materialization)}\n`);

    write(
      path.join(workspace, "package.json"),
      `${JSON.stringify({ ...workspacePackage, private: false })}\n`,
    );
    await expectFailure(
      () =>
        publish(async () => {
          throw new Error("mutated workspace reached the process runner");
        }),
      "workspace failed identity verification",
    );
    write(
      path.join(workspace, "package.json"),
      `${JSON.stringify(workspacePackage)}\n`,
    );

    await expectFailure(
      () =>
        publish(async (command, arguments_) =>
          command === "gh" &&
          arguments_[0] === "api" &&
          arguments_[1] === "user"
            ? processResult(0, "different-owner\n")
            : processResult(0),
        ),
      "authenticated GitHub login is different-owner",
    );

    let rolledBack: boolean = false;
    await expectFailure(
      () =>
        publish(async (command, arguments_) => {
          if (
            command === "gh" &&
            arguments_[0] === "api" &&
            arguments_[1] === "user"
          )
            return processResult(0, "fixture-owner\n");
          if (
            command === "gh" &&
            arguments_[0] === "api" &&
            arguments_[1] === "repos/fixture-owner/evidence-benchmark-results"
          )
            return processResult(0, "public\n");
          if (
            command === "git" &&
            arguments_.join(" ") === "rev-parse --show-toplevel"
          )
            return processResult(0, `${checkout}\n`);
          if (
            command === "git" &&
            arguments_.join(" ") === "status --porcelain"
          )
            return processResult(0);
          if (
            command === "git" &&
            arguments_.join(" ") === "branch --show-current"
          )
            return processResult(0, "master\n");
          if (
            command === "git" &&
            arguments_.join(" ") === "remote get-url origin"
          )
            return processResult(
              0,
              "https://github.com/fixture-owner/evidence-benchmark-results.git\n",
            );
          if (
            command === "git" &&
            arguments_[0] === "diff" &&
            arguments_.includes("--quiet")
          )
            return processResult(1);
          if (
            command === "gh" &&
            arguments_[0] === "repo" &&
            arguments_[1] === "view"
          )
            return processResult(
              0,
              "https://github.com/fixture-owner/evidence-benchmark-results\n",
            );
          if (
            command === "git" &&
            arguments_[0] === "rev-parse" &&
            (arguments_[1] === "HEAD" || arguments_[1] === "origin/master")
          )
            return processResult(0, `${"a".repeat(40)}\n`);
          if (command === "git" && arguments_[0] === "push")
            throw new Error("simulated publication push failure");
          if (command === "git" && arguments_[0] === "reset") rolledBack = true;
          return processResult(0);
        }),
      "simulated publication push failure",
    );
    assert.equal(
      rolledBack,
      true,
      "a failed result commit must be rolled back locally",
    );
  }

  async function testCommonRepair(temporary: string): Promise<void> {
    const repository: string = path.join(temporary, "repair-repository");
    const runId: string = "abcdef012345-12345678-1234-4123-8123-123456789abc";
    const patch: string = path.join(
      repository,
      "benchmark",
      ".work",
      "repairs",
      "common.patch",
    );
    write(
      patch,
      [
        "diff --git a/shared.txt b/shared.txt",
        "--- a/shared.txt",
        "+++ b/shared.txt",
        "@@ -1 +1 @@",
        "-before",
        "+after",
        "",
      ].join("\n"),
    );
    for (const arm of ["evidence", "plain"] as const)
      await createRepairCell(repository, runId, "todo", arm, "interrupted");
    const result: EvidenceBenchmarkRepair.IResult =
      await EvidenceBenchmarkRepair.apply(
        repository,
        EvidenceBenchmarkRepair.parse([
          "--",
          "--patch",
          "benchmark/.work/repairs/common.patch",
          runId,
          "todo",
        ]),
      );
    assert.equal(result.kind, "operator-intervention");
    assert.deepEqual(result.cells, ["todo/evidence", "todo/plain"]);
    for (const arm of ["evidence", "plain"] as const) {
      const root: string = path.join(
        repository,
        "benchmark",
        "result",
        "todo",
        arm,
        "runs",
        runId,
      );
      assert.equal(
        fs
          .readFileSync(path.join(root, "workspace", "shared.txt"), "utf8")
          .replaceAll("\r\n", "\n"),
        "after\n",
      );
      assert.ok(
        fs.existsSync(
          path.join(root, "interventions", `${result.patchSha256}.json`),
        ),
      );
    }
    await expectFailure(
      () =>
        EvidenceBenchmarkRepair.apply(
          repository,
          EvidenceBenchmarkRepair.parse([
            "--patch",
            "benchmark/.work/repairs/common.patch",
            runId,
            "todo",
          ]),
        ),
      "already applied",
    );

    const forbiddenPatch: string = path.join(
      repository,
      "benchmark",
      ".work",
      "repairs",
      "requirements.patch",
    );
    write(
      forbiddenPatch,
      [
        "diff --git a/docs/analysis/requirements.md b/docs/analysis/requirements.md",
        "--- a/docs/analysis/requirements.md",
        "+++ b/docs/analysis/requirements.md",
        "@@ -1 +1 @@",
        "-before",
        "+after",
        "",
      ].join("\n"),
    );
    await expectFailure(
      () =>
        EvidenceBenchmarkRepair.apply(
          repository,
          EvidenceBenchmarkRepair.parse([
            "--patch",
            "benchmark/.work/repairs/requirements.patch",
            runId,
            "todo",
          ]),
        ),
      "forbidden target",
    );

    const dependencyPatch: string = path.join(
      repository,
      "benchmark",
      ".work",
      "repairs",
      "dependency.patch",
    );
    write(
      dependencyPatch,
      [
        "diff --git a/packages/backend/node_modules/example.txt b/packages/backend/node_modules/example.txt",
        "new file mode 100644",
        "--- /dev/null",
        "+++ b/packages/backend/node_modules/example.txt",
        "@@ -0,0 +1 @@",
        "+forbidden",
        "",
      ].join("\n"),
    );
    await expectFailure(
      () =>
        EvidenceBenchmarkRepair.apply(
          repository,
          EvidenceBenchmarkRepair.parse([
            "--patch",
            "benchmark/.work/repairs/dependency.patch",
            runId,
            "todo",
          ]),
        ),
      "forbidden target",
    );
    const cachePatch: string = path.join(
      repository,
      "benchmark",
      ".work",
      "repairs",
      "cache.patch",
    );
    write(
      cachePatch,
      [
        "diff --git a/.BENCHMARK-CACHE/pnpm-store/bypass b/.BENCHMARK-CACHE/pnpm-store/bypass",
        "new file mode 100644",
        "--- /dev/null",
        "+++ b/.BENCHMARK-CACHE/pnpm-store/bypass",
        "@@ -0,0 +1 @@",
        "+forbidden",
        "",
      ].join("\n"),
    );
    await expectFailure(
      () =>
        EvidenceBenchmarkRepair.apply(
          repository,
          EvidenceBenchmarkRepair.parse([
            "--patch",
            "benchmark/.work/repairs/cache.patch",
            runId,
            "todo",
          ]),
        ),
      "forbidden target",
    );

    for (const arm of ["evidence", "plain"] as const)
      await createRepairCell(
        repository,
        runId,
        "reddit",
        arm,
        arm === "evidence" ? "running" : "interrupted",
      );
    await expectFailure(
      () =>
        EvidenceBenchmarkRepair.apply(
          repository,
          EvidenceBenchmarkRepair.parse([
            "--patch",
            "benchmark/.work/repairs/common.patch",
            runId,
            "reddit",
          ]),
        ),
      "paused reddit/evidence",
    );
  }

  async function createRepairCell(
    repository: string,
    runId: string,
    project: IEvidenceBenchmarkMaterialization.Project,
    arm: IEvidenceBenchmarkMaterialization.Arm,
    status: "running" | "interrupted",
  ): Promise<void> {
    const root: string = path.join(
      repository,
      "benchmark",
      "result",
      project,
      arm,
      "runs",
      runId,
    );
    const workspace: string = path.join(root, "workspace");
    write(path.join(workspace, "shared.txt"), "before\n");
    write(
      path.join(root, "run.json"),
      `${JSON.stringify({
        project,
        arm,
        status,
        sourceCommit: "0123456789abcdef",
        turns: [{ name: "backend-start", status: 1 }],
      })}\n`,
    );
    await EvidenceBenchmarkProcess.run("git", ["init", "-b", "benchmark"], {
      cwd: workspace,
      label: `${project}/${arm} repair fixture initialization`,
    });
  }

  function processResult(
    status: number | null,
    stdout: string = "",
    stderr: string = "",
  ): EvidenceBenchmarkProcess.IResult {
    return { status, stdout, stderr, elapsedMs: 0 };
  }

  async function testBaselineFailureCleanup(temporary: string): Promise<void> {
    const output: string = path.join(temporary, "failed-neutral-baseline");
    await expectFailure(
      () =>
        EvidenceBenchmarkBaseline.prepare({
          repository: path.join(temporary, "missing-repository"),
          output,
        }),
      "Neutral scaffold admission failed",
    );
    assert.equal(
      fs.existsSync(output),
      false,
      "failed neutral admission must not publish an output directory",
    );
    assert.deepEqual(
      fs
        .readdirSync(temporary)
        .filter((entry) => entry.startsWith(".failed-neutral-baseline.")),
      [],
      "failed neutral admission must remove its staging directory",
    );
  }

  async function testComposition(
    fixture: string,
    temporary: string,
  ): Promise<void> {
    const variables: IEvidenceBenchmarkMaterialization.IVariables =
      benchmarkVariables("self-test");
    const first: EvidenceBenchmarkTemplate.IComposition =
      EvidenceBenchmarkTemplate.compose({
        template: path.join(fixture, "benchmark", "template"),
        arm: "evidence",
        variables,
      });
    const second: EvidenceBenchmarkTemplate.IComposition =
      EvidenceBenchmarkTemplate.compose({
        template: path.join(fixture, "benchmark", "template"),
        arm: "evidence",
        variables,
      });
    assert.equal(
      EvidenceBenchmarkHash.tree(first.files),
      EvidenceBenchmarkHash.tree(second.files),
      "identical template inputs must produce identical bytes",
    );
    assert.doesNotMatch(
      Buffer.from(first.files.get("AGENTS.md")!).toString("utf8"),
      /\{\{base\}\}|benchmark-template-splice/,
    );
    await expectFailure(
      () =>
        EvidenceBenchmarkTemplate.compose({
          template: path.join(fixture, "benchmark", "template"),
          arm: "evidence",
          variables: {
            name: variables.name,
            apiPackageName: variables.apiPackageName,
            backendPackageName: variables.backendPackageName,
          } as IEvidenceBenchmarkMaterialization.IVariables,
        }),
      "missing=frontendPackageName",
    );
    await expectFailure(
      () =>
        EvidenceBenchmarkTemplate.compose({
          template: path.join(fixture, "benchmark", "template"),
          arm: "evidence",
          variables: {
            ...variables,
            unknownPackageName: "@self-test/unknown",
          } as IEvidenceBenchmarkMaterialization.IVariables,
        }),
      "unknown=unknownPackageName",
    );
    await expectFailure(
      () =>
        EvidenceBenchmarkTemplate.compose({
          template: path.join(fixture, "benchmark", "template"),
          arm: "evidence",
          variables: {
            ...variables,
            backendPackageName: "@Self-Test/backend",
          },
        }),
      "backendPackageName is not a valid npm package name",
    );
    await expectFailure(
      () =>
        EvidenceBenchmarkTemplate.compose({
          template: path.join(fixture, "benchmark", "template"),
          arm: "evidence",
          variables: {
            ...variables,
            frontendPackageName: variables.backendPackageName,
          },
        }),
      "backendPackageName and frontendPackageName",
    );

    const collision: string = path.join(temporary, "collision");
    fs.cpSync(fixture, collision, { recursive: true });
    write(
      path.join(collision, "benchmark/template/plain/CLAUDE.md"),
      "@AGENTS.md\n",
    );
    write(
      path.join(collision, "benchmark/template/evidence/CLAUDE.md"),
      "@AGENTS.md\n",
    );
    await expectFailure(
      () =>
        EvidenceBenchmarkTemplate.compose({
          template: path.join(collision, "benchmark", "template"),
          arm: "plain",
          variables,
        }),
      "requires exactly one splice comment",
    );

    const extra: string = path.join(temporary, "extra-overlay-path");
    fs.cpSync(fixture, extra, { recursive: true });
    write(
      path.join(
        extra,
        "benchmark/template/plain/.agents/skills/review/extra.md",
      ),
      "# Extra\n",
    );
    await expectFailure(
      () =>
        EvidenceBenchmarkTemplate.compose({
          template: path.join(extra, "benchmark", "template"),
          arm: "evidence",
          variables,
        }),
      "evidence and plain overlay path sets differ",
    );

    const unauthorizedShared: string = path.join(
      temporary,
      "unauthorized-shared-overlay-path",
    );
    fs.cpSync(fixture, unauthorizedShared, { recursive: true });
    for (const arm of ["evidence", "plain"])
      write(
        path.join(
          unauthorizedShared,
          "benchmark",
          "template",
          arm,
          "packages/backend/src/providers/ArmSpecificProvider.ts",
        ),
        `export const ARM = ${JSON.stringify(arm)};\n`,
      );
    await expectFailure(
      () =>
        EvidenceBenchmarkTemplate.compose({
          template: path.join(unauthorizedShared, "benchmark", "template"),
          arm: "evidence",
          variables,
        }),
      "plain overlay and authorized treatment surface path sets differ",
    );

    const missing: string = path.join(temporary, "missing-overlay-path");
    fs.cpSync(fixture, missing, { recursive: true });
    fs.rmSync(
      path.join(
        missing,
        "benchmark/template/plain/.agents/skills/review/SKILL.md",
      ),
    );
    await expectFailure(
      () =>
        EvidenceBenchmarkTemplate.compose({
          template: path.join(missing, "benchmark", "template"),
          arm: "plain",
          variables,
        }),
      "plain template is missing required paths",
    );

    const missingCarrier: string = path.join(
      temporary,
      "missing-exclusion-carrier",
    );
    fs.cpSync(fixture, missingCarrier, { recursive: true });
    fs.rmSync(
      path.join(
        missingCarrier,
        "benchmark/template/base/packages/backend/prisma/schema/exclude.schema",
      ),
    );
    await expectFailure(
      () =>
        EvidenceBenchmarkTemplate.compose({
          template: path.join(missingCarrier, "benchmark", "template"),
          arm: "evidence",
          variables,
        }),
      "base template is missing required paths: packages/backend/prisma/schema/exclude.schema",
    );

    const replacementDrift: string = path.join(temporary, "replacement-drift");
    fs.cpSync(fixture, replacementDrift, { recursive: true });
    fs.appendFileSync(
      path.join(
        replacementDrift,
        "benchmark/template/plain/packages/api/lint.config.ts",
      ),
      "\n<!-- benchmark-template-splice: base-body -->\n{{base}}\n",
      "utf8",
    );
    await expectFailure(
      () =>
        EvidenceBenchmarkTemplate.compose({
          template: path.join(replacementDrift, "benchmark", "template"),
          arm: "evidence",
          variables,
        }),
      "must contain no splice marker or token",
    );

    const malformed: string = path.join(temporary, "malformed");
    fs.cpSync(fixture, malformed, { recursive: true });
    fs.appendFileSync(
      path.join(malformed, "benchmark/template/evidence/AGENTS.md"),
      "\n{{base}}\n",
      "utf8",
    );
    await expectFailure(
      () =>
        EvidenceBenchmarkTemplate.compose({
          template: path.join(malformed, "benchmark", "template"),
          arm: "evidence",
          variables,
        }),
      "exactly one splice comment",
    );

    const invalidFrontmatter: Map<string, Uint8Array> = new Map(first.files);
    invalidFrontmatter.set(
      ".agents/skills/bad/SKILL.md",
      Buffer.from(
        "---\nname: wrong\ndescription: Invalid fixture.\n---\n# Bad\n",
      ),
    );
    await expectFailure(
      () => EvidenceBenchmarkTemplate.validate(invalidFrontmatter),
      "requires frontmatter name bad",
    );
    const invalidHeading: Map<string, Uint8Array> = new Map(first.files);
    invalidHeading.set("docs/bad.md", Buffer.from("# First\n\n# Second\n"));
    await expectFailure(
      () => EvidenceBenchmarkTemplate.validate(invalidHeading),
      "exactly one level-one heading",
    );
    const invalidLink: Map<string, Uint8Array> = new Map(first.files);
    invalidLink.set(
      "docs/bad.md",
      Buffer.from("# Bad\n\n[Missing](missing.md)\n"),
    );
    await expectFailure(
      () => EvidenceBenchmarkTemplate.validate(invalidLink),
      "link target is missing",
    );
    const invalidPath: Map<string, Uint8Array> = new Map(first.files);
    invalidPath.set("CON.md", Buffer.from("# Bad\n"));
    await expectFailure(
      () => EvidenceBenchmarkTemplate.validate(invalidPath),
      "not portable to Windows",
    );
    const fenced: Map<string, Uint8Array> = new Map(first.files);
    fenced.set(
      "docs/fenced-markdown.md",
      Buffer.from(
        [
          "# Visible",
          "",
          "````md",
          "# Hidden by four backticks",
          "```",
          "[Missing](missing.md)",
          "~~~",
          "````",
          "",
          "~~~~",
          "# Hidden by four tildes",
          "```",
          "~~~",
          "[Missing](also-missing.md)",
          "~~~~",
          "",
        ].join("\n"),
      ),
    );
    EvidenceBenchmarkTemplate.validate(fenced);
  }

  async function testRepositoryInputs(repository: string): Promise<void> {
    const prompts: string = path.join(repository, "benchmark", "prompts");
    assert.deepEqual(
      fs
        .readdirSync(prompts, { withFileTypes: true })
        .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
        .map((entry) => entry.name)
        .sort(),
      ["goal.md", "instruction.md", "review.md"],
      "prompt root must contain exactly the three common user turns",
    );
    for (const arm of ["evidence", "plain"])
      assert.ok(
        fs.existsSync(path.join(prompts, arm, "final.md")),
        `${arm} final user turn is missing`,
      );

    const instructions: string = path.join(
      repository,
      "benchmark",
      "instructions",
    );
    assert.deepEqual(
      fs
        .readdirSync(instructions, { withFileTypes: true })
        .map((entry) => entry.name)
        .sort(),
      ["backend", "frontend", "overall", "skills-contract.md"],
      "backend-first instructions must contain the contract and three phase directories",
    );
    const skillsContract: string = fs.readFileSync(
      path.join(instructions, "skills-contract.md"),
      "utf8",
    );
    assert.match(
      skillsContract,
      /Before implementation, generation, project commands, or file edits:[\s\S]+Read `AGENTS\.md` in full\.[\s\S]+Enumerate every `\.agents\/skills\/\*\*\/SKILL\.md` file[\s\S]+read each one in full[\s\S]+Follow them without deviation\.[\s\S]+Never silently omit, replace, weaken, or reinterpret a skill rule\./,
      "the first frozen turn must establish the complete skills contract",
    );
    assert.match(
      skillsContract,
      /Do not start development work in this turn\./,
      "the skills-contract turn must finish before development",
    );
    assert.match(
      skillsContract,
      /Use goal mode for this /,
      "skills-contract.md must activate a bounded stage goal",
    );
    const commandLine: string = fs.readFileSync(
      path.join(
        repository,
        "benchmark",
        "src",
        "EvidenceBenchmarkCommandLine.ts",
      ),
      "utf8",
    );
    assert.match(
      commandLine,
      /return \[\s*\{ name: "skills-contract", relative: "skills-contract\.md" \},\s*\{ name: "backend-start"/,
      "the skills contract must be the first frozen runner turn",
    );
    assert.match(
      commandLine,
      /const instructionSets:[\s\S]+readInstructionSets\(repository\)[\s\S]+instructions: instructionSets\[arm\]/,
      "one immutable instruction snapshot per arm must be shared by every selected cell",
    );
    assert.match(
      commandLine,
      /EvidenceBenchmarkTurnLedger\.assertAcceptedOrder\(state\.turns\)/,
      "resume admission must use the shared accepted-turn validator",
    );
    assert.match(
      commandLine,
      /processAlive\(state\.controllerPid\)[\s\S]+stopOrphanedModels\(state\.turns, workspace\)[\s\S]+state\.status === "running"[\s\S]+state\.controllerPid = process\.pid/,
      "a dead controller must be taken over only after its owned model processes are handled",
    );
    assert.match(
      commandLine,
      /const turn: ITurn = \{[\s\S]+accepted: false[\s\S]+props\.retain\(turn\)[\s\S]+const child = spawn[\s\S]+setInterval\(retain, 1_000\)/,
      "the active attempt ledger must be retained before spawn and refreshed while the model runs",
    );
    assert.match(
      commandLine,
      /fs\.fsyncSync\(descriptor\)[\s\S]+fs\.renameSync\(temporary, target\)/,
      "run state updates must fsync a replacement before atomic rename",
    );
    assert.doesNotMatch(
      commandLine,
      /fs\.rmSync\(target,[\s\S]{0,80}fs\.renameSync\(temporary, target\)/,
      "run state updates must not delete the canonical file before rename",
    );
    assert.match(
      commandLine,
      /props\.arm === "plain"[\s\S]+EvidenceBenchmarkLintBaseline\.assertRestored\([\s\S]+props\.baselines/,
      "every Plain turn must preserve its frozen lint policies and Program routing",
    );
    assert.match(
      commandLine,
      /function resumeEnvironment[\s\S]+delete environment\.NESTIA_SDK_TRANSFORM/,
      "resume must clear Nestia's loader-only rule bypass",
    );
    assert.match(
      commandLine,
      /EvidenceBenchmarkTurnLedger\.invocationArguments\([\s\S]+model: MODEL[\s\S]+effort: EFFORT/,
      "measured Codex must receive a clean networked workspace-only permission profile",
    );
    const turnLedgerSource: string = fs.readFileSync(
      path.join(
        repository,
        "benchmark",
        "src",
        "EvidenceBenchmarkTurnLedger.ts",
      ),
      "utf8",
    );
    const sandboxSource: string = fs.readFileSync(
      path.join(repository, "benchmark", "src", "EvidenceBenchmarkSandbox.ts"),
      "utf8",
    );
    const writableInvocation: string = JSON.stringify(
      EvidenceBenchmarkTurnLedger.invocationArguments({
        workspace: repository,
        model: "fixture-model",
        effort: "fixture-effort",
      }),
    );
    const readOnlyInvocation: string = JSON.stringify(
      EvidenceBenchmarkTurnLedger.invocationArguments({
        workspace: repository,
        model: "fixture-model",
        effort: "fixture-effort",
        writable: false,
      }),
    );
    assert.match(
      writableInvocation,
      /--ignore-user-config[\s\S]+--ignore-rules[\s\S]+--strict-config[\s\S]+default_permissions=\\"benchmark-cell\\"[\s\S]+permissions\.benchmark-cell\.extends=\\"\:workspace\\"[\s\S]+filesystem\.\\"\:root\\"=\\"deny\\"[\s\S]+filesystem\.\\"\:minimal\\"=\\"read\\"[\s\S]+filesystem\.\\"\:slash_tmp\\"=\\"deny\\"[\s\S]+network\.enabled=true[\s\S]+network\.domains\.\\"\*\\"=\\"allow\\"[\s\S]+network\.domains\.\\"127\.0\.0\.1\\"=\\"allow\\"[\s\S]+network\.domains\.\\"localhost\\"=\\"allow\\"/,
      "the retained writable invocation must freeze its permission profile and clean host-policy flags",
    );
    assert.match(
      readOnlyInvocation,
      /default_permissions=\\"benchmark-readonly\\"[\s\S]+permissions\.benchmark-readonly\.extends=\\"\:minimal\\"[\s\S]+filesystem\..+=\\"read\\"/,
      "the skills-contract invocation must make the measured workspace read-only",
    );
    assert.match(
      sandboxSource,
      /permissionRead\(authority\.toolchain\)[\s\S]+permissionRead\(authority\.corepack\)[\s\S]+permissionRead\(authority\.npmConfig\)[\s\S]+permissionRead\(authority\.gitConfig\)[\s\S]+permissionRead\(process\.execPath\)[\s\S]+corepackEntrypoint/,
      "the permission profile may read only the retained execution inputs required by workspace commands",
    );
    assert.match(
      commandLine,
      /verifyPermissionProfile\([\s\S]+assertNoLegacyManagedSandbox\(\)[\s\S]+EvidenceBenchmarkSandbox\.argumentsFor\([\s\S]+modelSentinel[\s\S]+runtime\.apiPort/,
      "the exact Codex permission adapter must pass a filesystem and loopback preflight before measurement",
    );
    assert.match(
      commandLine,
      /await verifyPermissionProfile\(\{[\s\S]+await EvidenceBenchmarkSetup\.assertReproducible\([\s\S]+const logs:[\s\S]+await runTurn\(\{/,
      "the production sandbox and fresh registry reconstruction must pass before the first measured turn",
    );
    assert.match(
      sandboxSource,
      /["']sandbox["'][\s\S]+["']--permission-profile["'][\s\S]+["']benchmark-cell["']/,
      "untrusted commands must use the named Codex permission profile",
    );
    assert.match(
      turnLedgerSource,
      /shell_environment_policy\.exclude=\["OPENAI_API_KEY","CODEX_API_KEY","ALL_PROXY","HTTP_PROXY","HTTPS_PROXY","NO_PROXY","NODE_EXTRA_CA_CERTS","SSL_CERT_DIR","SSL_CERT_FILE"\]/,
      "model tools must not inherit Codex authentication or upstream proxy credentials",
    );
    assert.doesNotMatch(
      commandLine,
      /--dangerously-bypass-approvals-and-sandbox/,
      "the measured agent must not receive write authority over retained input and controller state",
    );
    assert.match(
      commandLine,
      /function prepareModelHome[\s\S]+auth\.json[\s\S]+function assertModelHome[\s\S]+AGENTS\.md[\s\S]+AGENTS\.override\.md[\s\S]+config\.toml/,
      "the measured Codex must receive authentication through a clean retained home denied to model tools",
    );
    assert.match(
      `${commandLine}\n${sandboxSource}`,
      /OPENAI_API_KEY, process\.env\.CODEX_API_KEY[\s\S]+findExecutableOnPath\("codex\.exe"\)/,
      "Codex automation-key and Windows standalone installations must remain launchable",
    );
    assert.match(
      commandLine,
      /assertStateBaselines\(root, state\);[\s\S]+EvidenceBenchmarkSetup\.assertRestored\(workspace, root, arm\);[\s\S]+assertInfrastructureRestored/,
      "resume admission must reject immutable execution-boundary drift before every model turn",
    );
    assert.match(
      commandLine,
      /EvidenceBenchmarkSetup\.assertReproducible\([\s\S]+entry\.name === "overall-final"/,
      "every accepted turn must prove a clean install and overall final must rerun publishable gates",
    );
    const setupSource: string = fs.readFileSync(
      path.join(repository, "benchmark", "src", "EvidenceBenchmarkSetup.ts"),
      "utf8",
    );
    assert.match(
      setupSource,
      /admit\(workspace, root, manifest\)[\s\S]+workspaceCache[\s\S]+untrustedEnvironment\([\s\S]+npm_config_store_dir: path\.join\(workspaceCache, "pnpm-store"\)[\s\S]+runPnpm\([\s\S]+\["install", "--frozen-lockfile"\][\s\S]+sandboxedPnpm/,
      "clean reproduction must use a fresh credential-free sandboxed registry install",
    );
    assert.match(
      setupSource,
      /function admitReproduction\([\s\S]+resetMutableCaches\(workspace\)[\s\S]+assertRequirementsRestored\([\s\S]+assertRestored\([\s\S]+assertInfrastructureRestored\(/,
      "reproduction must reset hidden caches and validate frozen commands before execution",
    );
    const publicationSource: string = fs.readFileSync(
      path.join(
        repository,
        "benchmark",
        "src",
        "EvidenceBenchmarkPublication.ts",
      ),
      "utf8",
    );
    assert.match(
      publicationSource,
      /EvidenceBenchmarkTurnLedger\.assertAcceptedOrder\(state\.turns, true\)/,
      "publication must use the shared complete-turn validator",
    );
    assert.match(
      publicationSource,
      /EvidenceBenchmarkTurnLedger\.assertRetainedEvidence\([\s\S]+await reproduce\([\s\S]+workspace,[\s\S]+runRoot,[\s\S]+true/,
      "publication must verify retained model execution and rerun terminal clean gates",
    );
    assert.match(
      publicationSource,
      /state\.cliVersion !== readCliVersion\(\)[\s\S]+assertReport\(\{/,
      "publication must bind the current CLI and operator report to retained evidence",
    );
    assert.match(
      turnLedgerSource,
      /cached_input_tokens[\s\S]+reasoning_output_tokens/,
      "publication must retain all native token categories",
    );
    assert.match(
      turnLedgerSource,
      /props\.turns\.forEach[\s\S]+log inventory does not exactly match/,
      "publication must retain every attempt, all native token categories, and the exact log inventory",
    );
    assert.match(
      publicationSource,
      /Plain publication lint configuration immutability proof failed verification/,
      "Plain publication must revalidate every retained lint immutability proof",
    );
    for (const phase of ["backend", "frontend"])
      assert.deepEqual(
        fs.readdirSync(path.join(instructions, phase)).sort(),
        ["evidence-final.md", "plain-final.md", "review.md", "start.md"],
        `${phase} instruction inventory is invalid`,
      );
    assert.deepEqual(
      fs.readdirSync(path.join(instructions, "overall")).sort(),
      ["evidence-final.md", "plain-final.md", "review.md"],
      "overall instruction inventory is invalid",
    );
    const backendEvidenceFinal: string = fs.readFileSync(
      path.join(instructions, "backend", "evidence-final.md"),
      "utf8",
    );
    assert.match(
      backendEvidenceFinal,
      /build:prisma[\s\S]+packages\/api[\s\S]+pnpm build[\s\S]+build:main[\s\S]+build:sdk[\s\S]+build:test/,
      "backend final must preserve the authored dependency order",
    );
    assert.match(
      backendEvidenceFinal,
      /Do not run the backend package's aggregate `pnpm build` or the workspace-root build during this phase\./,
      "backend final must forbid both aggregate builds",
    );
    const frontendEvidenceFinal: string = fs.readFileSync(
      path.join(instructions, "frontend", "evidence-final.md"),
      "utf8",
    );
    assert.match(
      frontendEvidenceFinal,
      /Inspect all three canonical package `lint\.config\.ts` files\.[\s\S]+Restore all seven original claim objects[\s\S]+original populations and `error` severities[\s\S]+sealed backend main projection is unchanged/,
      "frontend final must inspect the complete seven-claim configuration",
    );
    const overallEvidenceFinal: string = fs.readFileSync(
      path.join(instructions, "overall", "evidence-final.md"),
      "utf8",
    );
    assert.match(
      overallEvidenceFinal,
      /Inspect `packages\/api\/lint\.config\.ts`, `packages\/backend\/lint\.config\.ts`, and `packages\/frontend\/lint\.config\.ts`[\s\S]+all seven claims are active with their original populations and `error` severities[\s\S]+`pnpm build`, `pnpm lint`[\s\S]+`pnpm test`/,
      "overall Evidence final must restore all configurations before the complete workspace gates",
    );
    for (const phase of ["backend", "frontend", "overall"])
      for (const file of fs.readdirSync(path.join(instructions, phase)))
        for (const contract of [
          /Use goal mode for this /,
          /The skills-contract turn remains binding\.[^\n]*re-read `AGENTS\.md`/i,
        ])
          assert.match(
            fs.readFileSync(path.join(instructions, phase, file), "utf8"),
            contract,
            `${phase}/${file} must preserve its bounded goal and skills contract`,
          );

    const template: string = path.join(repository, "benchmark", "template");
    for (const arm of ["evidence", "plain"] as const) {
      const composition: EvidenceBenchmarkTemplate.IComposition =
        EvidenceBenchmarkTemplate.compose({
          template,
          arm,
          variables: benchmarkVariables("integrated-self-test"),
        });
      assert.ok(composition.files.size > 0);
      for (const relative of [
        ".github/workflows/ci.yml",
        "packages/frontend/src/lib/client.ts",
        "packages/frontend/src/lib/config.ts",
      ])
        assert.ok(
          composition.files.has(relative),
          `integrated ${arm} scaffold is missing authored source ${relative}`,
        );
      assert.match(
        Buffer.from(composition.files.get("AGENTS.md")!).toString("utf8"),
        /The measurement boundary is frozen\.[^\n]+package names or scripts,[^\n]+dependency specifiers,[^\n]+resolution controls,[^\n]+workspace routing,[^\n]+fixed gate runners/,
        `integrated ${arm} instructions must disclose the frozen execution boundary`,
      );
      const workflow: string = Buffer.from(
        composition.files.get(".github/workflows/ci.yml")!,
      ).toString("utf8");
      for (const command of [
        "pnpm install --frozen-lockfile",
        "pnpm build",
        "pnpm lint",
        "pnpm prepare:database",
        "pnpm test:backend",
        "playwright install --with-deps chromium",
        "pnpm test:frontend",
      ])
        assert.ok(
          workflow.includes(command),
          `integrated ${arm} CI is missing ${command}`,
        );
      if (arm === "evidence")
        assertEvidenceClaimDeferralContract(composition.files);
    }

    const requirements: string = path.join(
      repository,
      "benchmark",
      "requirements",
    );
    for (const entry of fs.readdirSync(requirements, {
      withFileTypes: true,
    })) {
      if (!entry.isDirectory()) continue;
      const subject: string = path.join(requirements, entry.name);
      const corpus: EvidenceBenchmarkCorpus.IResult =
        EvidenceBenchmarkCorpus.read(subject);
      assert.ok(corpus.documents > 0);
      assert.ok(corpus.h2 > 0);
      assert.ok(corpus.h3 > 0);
      assert.ok(
        [...corpus.files.keys()].every((relative) => relative.endsWith(".md")),
        `${entry.name} requirement corpus must contain only Markdown`,
      );
    }
  }

  function assertEvidenceClaimDeferralContract(
    files: ReadonlyMap<string, Uint8Array>,
  ): void {
    const configurations: Readonly<Record<string, readonly string[]>> = {
      "packages/backend/lint.config.ts": [
        "schema-models",
        "api-operations",
        "backend-tests",
      ],
      "packages/api/lint.config.ts": ["dto-types", "dto-properties"],
      "packages/frontend/lint.config.ts": [
        "frontend-screens",
        "frontend-journeys",
      ],
    };
    const claims: Map<
      string,
      Map<string, { node: ts.ObjectLiteralExpression; source: ts.SourceFile }>
    > = new Map();
    for (const [relative, names] of Object.entries(configurations)) {
      const content: Uint8Array | undefined = files.get(relative);
      assert.ok(
        content,
        `materialized Evidence template is missing ${relative}`,
      );
      const objects = readClaimObjects(
        relative,
        Buffer.from(content).toString("utf8"),
      );
      assert.deepEqual(
        [...objects.keys()],
        names,
        `${relative} claim ownership drifted`,
      );
      claims.set(relative, objects);
    }
    assert.equal(
      [...claims.values()].reduce((sum, entries) => sum + entries.size, 0),
      7,
      "the materialized Evidence graph must own exactly seven claims",
    );
    const mainRelative = "packages/backend/lint.config.main.ts";
    const mainBytes: Uint8Array | undefined = files.get(mainRelative);
    assert.ok(
      mainBytes,
      `materialized Evidence template is missing ${mainRelative}`,
    );
    const mainClaims = readClaimObjects(
      mainRelative,
      Buffer.from(mainBytes).toString("utf8"),
    );
    assert.deepEqual(
      [...mainClaims.keys()],
      ["schema-models", "api-operations"],
      "the backend source Program must retain the exact two-claim projection",
    );
    for (const name of mainClaims.keys()) {
      const canonical = claims
        .get("packages/backend/lint.config.ts")
        ?.get(name);
      const projected = mainClaims.get(name);
      assert.ok(
        canonical !== undefined && projected !== undefined,
        `backend main projection has no canonical ${name} claim`,
      );
      assert.equal(
        normalizeClaimSource(projected.node.getText(projected.source)),
        normalizeClaimSource(canonical.node.getText(canonical.source)),
        `backend main projection drifted from canonical ${name}`,
      );
    }
    for (const {
      path: relative,
      configFile,
    } of EvidenceBenchmarkLintBaseline.PROGRAMS) {
      const bytes: Uint8Array | undefined = files.get(relative);
      assert.ok(bytes, `materialized Evidence template is missing ${relative}`);
      const config = JSON.parse(Buffer.from(bytes).toString("utf8")) as {
        compilerOptions?: {
          plugins?: Array<{ transform?: unknown; configFile?: unknown }>;
        };
      };
      assert.deepEqual(
        config.compilerOptions?.plugins,
        [{ transform: "@ttsc/lint", configFile }],
        `${relative} must load the graph matching its exact Program`,
      );
    }

    const skillPath: string = ".agents/skills/evidence/SKILL.md";
    const skillBytes: Uint8Array | undefined = files.get(skillPath);
    assert.ok(
      skillBytes,
      `materialized Evidence template is missing ${skillPath}`,
    );
    const skill: string = Buffer.from(skillBytes).toString("utf8");
    const matrix: readonly string[] = [
      "Schema authoring | `schema-models` | `dto-types`, `dto-properties`, `api-operations`, `backend-tests`, `frontend-screens`, `frontend-journeys`",
      "DTO authoring | `schema-models`, `dto-types`, `dto-properties` | `api-operations`, `backend-tests`, `frontend-screens`, `frontend-journeys`",
      "Controller authoring | `schema-models`, `dto-types`, `dto-properties`, `api-operations` | `backend-tests`, `frontend-screens`, `frontend-journeys`",
      "SDK generation | `schema-models`, `dto-types`, `dto-properties`, `api-operations` | `backend-tests`, `frontend-screens`, `frontend-journeys`",
      "Backend test | `schema-models`, `dto-types`, `dto-properties`, `api-operations`, `backend-tests` | `frontend-screens`, `frontend-journeys`",
      "Backend report | `schema-models`, `dto-types`, `dto-properties`, `api-operations`, `backend-tests` | `frontend-screens`, `frontend-journeys`",
      "Frontend screen | `schema-models`, `dto-types`, `dto-properties`, `api-operations`, `backend-tests`, `frontend-screens` | `frontend-journeys`",
      "Frontend journey/report | `schema-models`, `dto-types`, `dto-properties`, `api-operations`, `backend-tests`, `frontend-screens`, `frontend-journeys` | None",
      "Overall final | `schema-models`, `dto-types`, `dto-properties`, `api-operations`, `backend-tests`, `frontend-screens`, `frontend-journeys` | None",
    ];
    const matrixStart: number = skill.indexOf(
      "| Gate | Must be active | May be deferred only if not started |",
    );
    const matrixEnd: number = skill.indexOf(
      "\n\nBefore `build:sdk`",
      matrixStart,
    );
    assert.ok(matrixStart >= 0 && matrixEnd > matrixStart);
    const documentedRows: readonly string[] = skill
      .slice(matrixStart, matrixEnd)
      .split(/\r?\n/)
      .map((line) =>
        line
          .split("|")
          .slice(1, -1)
          .map((cell) => cell.trim())
          .join(" | "),
      );
    assert.deepEqual(documentedRows, [
      "Gate | Must be active | May be deferred only if not started",
      "--- | --- | ---",
      ...matrix,
    ]);
    for (const contract of [
      "Diagnostic volume never permits deferring the claim for the layer under active development.",
      "Before `build:sdk`, the schema, DTO, and API-operation claims must all be active and healthy.",
      "Never edit a claim's internals, severity, rule entry, `files`, `symbol`, or `reference` population; never disable `evidence/graph` or add an environment bypass.",
      "Open all three canonical `lint.config.ts` files and restore every temporarily commented claim; confirm the immutable backend main projection is unchanged.",
      "Confirm every configured evidence rule retains its original `error` severity and every claim retains its original population.",
      "Verify restoration from the three canonical configuration files and the immutable backend main projection, then run the complete workspace lint, build, and test gates with no staged configuration override.",
      "An agent's prose report is not restoration evidence.",
    ])
      assert.ok(
        skill.includes(contract),
        `Evidence deferral contract is missing ${contract}`,
      );

    const examplePattern =
      /<!-- claim-deferral-example: ([^#\s]+)#([a-z-]+) -->\r?\n```ts\r?\n([\s\S]*?)\r?\n```/g;
    const examples: Array<{
      relative: string;
      name: string;
      snippet: string;
    }> = [];
    for (const match of skill.matchAll(examplePattern))
      examples.push({
        relative: match[1]!,
        name: match[2]!,
        snippet: match[3]!,
      });
    assert.deepEqual(
      examples.map(({ relative, name }) => `${relative}#${name}`),
      [
        "packages/backend/lint.config.ts#api-operations",
        "packages/api/lint.config.ts#dto-properties",
        "packages/frontend/lint.config.ts#frontend-screens",
      ],
      "the Evidence skill must carry one actual whole-object example per config",
    );
    const printer: ts.Printer = ts.createPrinter({
      newLine: ts.NewLineKind.LineFeed,
      removeComments: true,
    });
    for (const example of examples) {
      const lines: string[] = example.snippet
        .replaceAll("\r\n", "\n")
        .split("\n");
      assert.equal(lines[0], "claims: [");
      assert.equal(lines.at(-1), "],");
      const commented: string[] = lines.slice(1, -1);
      assert.ok(commented.length > 0, `${example.name} example is empty`);
      assert.ok(
        commented.every((line) => /^\s*\/\/(?: |$)/.test(line)),
        `${example.name} must comment every line of the whole claim object`,
      );
      assert.match(
        commented.at(-1)!,
        /^\s*\/\/ \},$/,
        `${example.name} must retain the claim's following comma`,
      );
      const restored: string = commented
        .map((line) => line.replace(/^(\s*)\/\/ ?/, "$1"))
        .join("\n");
      const restoredObjects = readClaimObjects(
        `${example.relative}#${example.name}`,
        `const graph = { claims: [\n${restored}\n] };\n`,
      );
      assert.deepEqual(
        [...restoredObjects.keys()],
        [example.name],
        `${example.name} example must restore exactly one whole claim`,
      );
      const expected = claims.get(example.relative)?.get(example.name);
      const actual = restoredObjects.get(example.name);
      assert.ok(
        expected !== undefined && actual !== undefined,
        `${example.relative} does not own ${example.name}`,
      );
      assert.equal(
        printer.printNode(ts.EmitHint.Expression, actual.node, actual.source),
        printer.printNode(
          ts.EmitHint.Expression,
          expected.node,
          expected.source,
        ),
        `${example.name} example drifted from the materialized lint config`,
      );
      assert.equal(
        normalizeClaimSource(actual.node.getText(actual.source)),
        normalizeClaimSource(expected.node.getText(expected.source)),
        `${example.name} example must retain the exact whole claim object`,
      );
    }
  }

  function readClaimObjects(
    filename: string,
    content: string,
  ): Map<string, { node: ts.ObjectLiteralExpression; source: ts.SourceFile }> {
    const source: ts.SourceFile = ts.createSourceFile(
      filename,
      content,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    );
    const arrays: ts.ArrayLiteralExpression[] = [];
    const visit = (node: ts.Node): void => {
      if (
        ts.isPropertyAssignment(node) &&
        propertyName(node.name) === "claims" &&
        ts.isArrayLiteralExpression(node.initializer)
      )
        arrays.push(node.initializer);
      ts.forEachChild(node, visit);
    };
    visit(source);
    assert.equal(arrays.length, 1, `${filename} must define one claims array`);
    const output = new Map<
      string,
      { node: ts.ObjectLiteralExpression; source: ts.SourceFile }
    >();
    for (const element of arrays[0]!.elements) {
      assert.ok(
        ts.isObjectLiteralExpression(element),
        `${filename} claims must contain only object literals`,
      );
      const property = element.properties.find(
        (candidate): candidate is ts.PropertyAssignment =>
          ts.isPropertyAssignment(candidate) &&
          propertyName(candidate.name) === "name",
      );
      assert.ok(
        property !== undefined && ts.isStringLiteral(property.initializer),
        `${filename} claim is missing its literal name`,
      );
      assert.equal(
        output.has(property.initializer.text),
        false,
        `${filename} duplicates ${property.initializer.text}`,
      );
      output.set(property.initializer.text, { node: element, source });
    }
    return output;
  }

  function propertyName(name: ts.PropertyName): string | undefined {
    return ts.isIdentifier(name) || ts.isStringLiteral(name)
      ? name.text
      : undefined;
  }

  function normalizeClaimSource(input: string): string {
    const lines: string[] = input.replaceAll("\r\n", "\n").split("\n");
    const indentation: number = Math.min(
      ...lines
        .slice(1, -1)
        .filter((line) => line.trim().length !== 0)
        .map((line) => line.match(/^\s*/)![0].length),
    );
    return lines
      .map((line, index) =>
        index === 0 || index === lines.length - 1
          ? line.trim()
          : line.slice(indentation).trimEnd(),
      )
      .join("\n");
  }

  async function testRetentionIgnore(repository: string): Promise<void> {
    for (const relative of [
      "benchmark/result/todo/evidence/runs/example/logs/stderr.raw.log",
      "benchmark/.work/todo/evidence/terminal/stderr.raw.log",
    ]) {
      const result = await EvidenceBenchmarkProcess.run(
        "git",
        ["check-ignore", "--no-index", relative],
        {
          cwd: repository,
          allowFailure: true,
          label: `check ignored benchmark artifact ${relative}`,
        },
      );
      assert.equal(
        result.status,
        0,
        `local benchmark output must remain ignored: ${relative}`,
      );
    }
  }

  async function testPinnedPnpm(repository: string): Promise<void> {
    const version = await EvidenceBenchmarkProcess.pnpm(["--version"], {
      cwd: repository,
      label: "self-test pinned pnpm",
    });
    assert.equal(version.stdout.trim(), EvidenceBenchmarkProcess.PNPM_VERSION);
    const rootPackageManager: string = (
      JSON.parse(
        fs.readFileSync(path.join(repository, "package.json"), "utf8"),
      ) as { packageManager: string }
    ).packageManager;
    if (rootPackageManager !== `pnpm@${EvidenceBenchmarkProcess.PNPM_VERSION}`)
      assert.notEqual(
        version.stdout.trim(),
        rootPackageManager.replace(/^pnpm@/, ""),
        "benchmark pnpm must not inherit the repository package manager",
      );
    const scaffoldPackageManager: string = (
      JSON.parse(
        fs.readFileSync(
          path.join(
            repository,
            "benchmark",
            "template",
            "base",
            "package.json",
          ),
          "utf8",
        ),
      ) as { packageManager: string }
    ).packageManager;
    assert.equal(
      scaffoldPackageManager,
      `pnpm@${EvidenceBenchmarkProcess.PNPM_VERSION}`,
    );
  }

  async function testPinnedSetup(temporary: string): Promise<void> {
    const root: string = path.join(temporary, "setup-cell");
    const workspace: string = path.join(root, "workspace");
    const cache: string = path.join(root, "cache");
    write(
      path.join(workspace, "package.json"),
      `${JSON.stringify(
        {
          private: true,
          name: "benchmark-setup-self-test",
          packageManager: `pnpm@${EvidenceBenchmarkProcess.PNPM_VERSION}`,
          scripts: {
            "nested-version": "pnpm --version",
          },
          devDependencies: {
            "@ttsc/lint": "0.22.0",
            ttsc: "0.22.0",
            typescript: "7.0.2",
            "typescript-api": "npm:typescript@5.9.3",
          },
          peerDependencies: {
            "@ttsc/lint": "0.22.0",
          },
        },
        null,
        2,
      )}\n`,
    );
    write(
      path.join(workspace, "pnpm-workspace.yaml"),
      'packages:\n  - "."\n\nmodulesCacheMaxAge: 0\n',
    );
    const materialization: IEvidenceBenchmarkMaterialization = {
      root,
      workspace,
      immutableInputs: path.join(root, "inputs", "requirements"),
      manifest: path.join(root, "materialization.json"),
      workspaceTreeSha256: EvidenceBenchmarkHash.bytes("setup fixture"),
      lintBaselines: [],
      environment: {
        ...EvidenceBenchmarkMaterializer.hostEnvironment(),
        HOME: path.join(cache, "home"),
        USERPROFILE: path.join(cache, "home"),
        COREPACK_HOME: path.join(cache, "corepack"),
        npm_config_store_dir: path.join(cache, "pnpm-store"),
        npm_config_userconfig: path.join(root, "inputs", "npmrc"),
        npm_config_globalconfig: path.join(root, "inputs", "npmrc"),
        GIT_CONFIG_NOSYSTEM: "1",
        GIT_CONFIG_GLOBAL: path.join(root, "inputs", "gitconfig"),
        TTSC_CACHE_DIR: path.join(cache, "ttsc"),
        TTSC_GO_CACHE_DIR: path.join(cache, "go-build"),
        GOCACHE: path.join(cache, "go-build"),
        GOENV: "off",
        GOMODCACHE: path.join(cache, "go-modules"),
        GOPATH: path.join(cache, "go-path"),
        GOTMPDIR: path.join(cache, "go-tmp"),
        PLAYWRIGHT_BROWSERS_PATH: path.join(cache, "playwright"),
        TMPDIR: path.join(cache, "tmp"),
        TEMP: path.join(cache, "tmp"),
        TMP: path.join(cache, "tmp"),
      },
    };
    write(path.join(root, "inputs", "npmrc"), "");
    write(path.join(root, "inputs", "gitconfig"), "");
    write(
      materialization.manifest,
      `${JSON.stringify({
        schemaVersion: 6,
        variables: {
          frontendPackageName: "benchmark-setup-self-test",
        },
        caches: {
          home: materialization.environment.HOME,
          corepack: materialization.environment.COREPACK_HOME,
          pnpm: materialization.environment.npm_config_store_dir,
          ttsc: materialization.environment.TTSC_CACHE_DIR,
          go: materialization.environment.GOCACHE,
          goModules: materialization.environment.GOMODCACHE,
          goPath: materialization.environment.GOPATH,
          playwright: materialization.environment.PLAYWRIGHT_BROWSERS_PATH,
          temp: materialization.environment.TMPDIR,
          toolchain: path.join(cache, "toolchain-bin"),
        },
      })}\n`,
    );
    const setup = await EvidenceBenchmarkSetup.prepare({
      materialization,
      arm: "plain",
    });
    const reproduce = (verifyGates: boolean = false): Promise<string> =>
      EvidenceBenchmarkSetup.assertReproducible(
        workspace,
        root,
        verifyGates,
        (arguments_, options) =>
          EvidenceBenchmarkProcess.pnpm(arguments_, options),
        (candidate) => EvidenceBenchmarkSetup.resetMutableCaches(candidate),
      );
    assert.ok(setup.elapsedMs >= setup.lockElapsedMs + setup.installElapsedMs);
    assert.equal(setup.pnpmVersion, EvidenceBenchmarkProcess.PNPM_VERSION);
    assert.equal(setup.nodeVersion, process.version);
    assert.equal(setup.nodePlatform, process.platform);
    assert.equal(setup.nodeArchitecture, process.arch);
    assert.equal(
      setup.nodeExecutableSha256,
      EvidenceBenchmarkHash.file(process.execPath),
    );
    assert.ok(Object.keys(setup.installedPackagesSha256).length >= 3);
    assert.ok(setup.installedPackageResolutions.length >= 3);
    assert.ok(Object.keys(setup.installedLaunchersSha256).length >= 1);
    assert.ok(fs.existsSync(path.join(workspace, "pnpm-lock.yaml")));
    assert.ok(fs.existsSync(path.join(root, "setup.json")));
    const materializationSource: string = fs.readFileSync(
      materialization.manifest,
      "utf8",
    );
    const materializationFixture = JSON.parse(materializationSource) as {
      variables?: { frontendPackageName?: string };
      caches: { corepack: string };
    };
    delete materializationFixture.variables;
    fs.writeFileSync(
      materialization.manifest,
      `${JSON.stringify(materializationFixture)}\n`,
      "utf8",
    );
    await expectFailure(
      () => reproduce(),
      "rendered frontend package identity",
    );
    fs.writeFileSync(materialization.manifest, materializationSource, "utf8");
    materializationFixture.variables = {
      frontendPackageName: "benchmark-setup-self-test",
    };
    materializationFixture.caches.corepack = path.join(root, "outside");
    fs.writeFileSync(
      materialization.manifest,
      `${JSON.stringify(materializationFixture)}\n`,
      "utf8",
    );
    await expectFailure(
      () => reproduce(),
      "canonical Corepack cache authority",
    );
    fs.writeFileSync(materialization.manifest, materializationSource, "utf8");
    EvidenceBenchmarkSetup.assertRestored(workspace, root, "plain");
    const hiddenCachePayload: string = path.join(
      workspace,
      ".benchmark-cache",
      "pnpm-store",
      "agent-payload",
    );
    write(hiddenCachePayload, "forbidden\n");
    assert.match(await reproduce(), /^[0-9a-f]{64}$/);
    assert.equal(
      fs.existsSync(hiddenCachePayload),
      false,
      "reproduction admission must discard every model-writable cache payload",
    );
    const installedAlias: string = path.join(
      workspace,
      "node_modules",
      "typescript-api",
      "package.json",
    );
    const installedAliasSource: string = fs.readFileSync(
      installedAlias,
      "utf8",
    );
    fs.appendFileSync(installedAlias, "\n", "utf8");
    EvidenceBenchmarkSetup.assertRestored(workspace, root, "plain");
    await expectFailure(
      () => reproduce(),
      "do not match a clean frozen registry install",
    );
    fs.writeFileSync(installedAlias, installedAliasSource, "utf8");
    assert.match(await reproduce(), /^[0-9a-f]{64}$/);
    const installedCompiler: string = path.join(
      workspace,
      "node_modules",
      "typescript",
      "package.json",
    );
    const installedCompilerSource: string = fs.readFileSync(
      installedCompiler,
      "utf8",
    );
    fs.appendFileSync(installedCompiler, "\n", "utf8");
    await expectFailure(
      () => EvidenceBenchmarkSetup.assertRestored(workspace, root, "plain"),
      "installed compiler, command launcher, or measured-product payload was not restored",
    );
    fs.writeFileSync(installedCompiler, installedCompilerSource, "utf8");
    const ttscLauncher: string = path.join(
      workspace,
      "node_modules",
      ".bin",
      process.platform === "win32" ? "ttsc.cmd" : "ttsc",
    );
    const ttscLauncherSource: Buffer = fs.readFileSync(ttscLauncher);
    fs.appendFileSync(ttscLauncher, "\n", "utf8");
    await expectFailure(
      () => EvidenceBenchmarkSetup.assertRestored(workspace, root, "plain"),
      "installed compiler, command launcher, or measured-product payload was not restored",
    );
    fs.writeFileSync(ttscLauncher, ttscLauncherSource);
    EvidenceBenchmarkSetup.assertRestored(workspace, root, "plain");
    const shadowRoot: string = path.join(
      workspace,
      "packages",
      "frontend",
      "tests",
      "node_modules",
    );
    fs.mkdirSync(shadowRoot, { recursive: true });
    await expectFailure(
      () => EvidenceBenchmarkSetup.assertRestored(workspace, root, "plain"),
      "shadow dependency root",
    );
    fs.rmSync(path.join(workspace, "packages"), {
      recursive: true,
      force: true,
    });
    EvidenceBenchmarkSetup.assertRestored(workspace, root, "plain");
    write(
      path.join(
        workspace,
        "node_modules",
        "agent-added-package",
        "package.json",
      ),
      '{"name":"agent-added-package","version":"1.0.0"}\n',
    );
    await expectFailure(
      () => EvidenceBenchmarkSetup.assertRestored(workspace, root, "plain"),
      "undeclared direct package",
    );
    fs.rmSync(path.join(workspace, "node_modules", "agent-added-package"), {
      recursive: true,
      force: true,
    });
    EvidenceBenchmarkSetup.assertRestored(workspace, root, "plain");
    write(
      path.join(workspace, "node_modules", ".agent-payload", "index.js"),
      "module.exports = 'forbidden';\n",
    );
    await expectFailure(
      () => EvidenceBenchmarkSetup.assertRestored(workspace, root, "plain"),
      "unowned hidden payload",
    );
    fs.rmSync(path.join(workspace, "node_modules", ".agent-payload"), {
      recursive: true,
      force: true,
    });
    write(
      path.join(workspace, "src", "cache-import.ts"),
      'export const payload = ".benchmark-cache/payload.js";\n',
    );
    await expectFailure(
      () => EvidenceBenchmarkSetup.assertRestored(workspace, root, "plain"),
      "references excluded cache authority",
    );
    fs.rmSync(path.join(workspace, "src"), {
      recursive: true,
      force: true,
    });
    EvidenceBenchmarkSetup.assertRestored(workspace, root, "plain");
    const viteConfig: string = path.join(
      workspace,
      "packages",
      "frontend",
      "vite.config.ts",
    );
    write(
      viteConfig,
      [
        'import path from "node:path";',
        "export const config = {",
        '  cacheDir: path.resolve(__dirname, "../../.benchmark-cache/vite"),',
        'export const payload = "../../.benchmark-cache/agent-payload";',
        "};",
        "",
      ].join("\n"),
    );
    await expectFailure(
      () => EvidenceBenchmarkSetup.assertRestored(workspace, root, "plain"),
      "references excluded cache authority",
    );
    fs.rmSync(path.join(workspace, "packages"), {
      recursive: true,
      force: true,
    });
    EvidenceBenchmarkSetup.assertRestored(workspace, root, "plain");
    const manifestPath: string = path.join(workspace, "package.json");
    const manifestSource: string = fs.readFileSync(manifestPath, "utf8");
    const manifest = JSON.parse(manifestSource) as {
      devDependencies: Record<string, string>;
    };
    manifest.devDependencies["agent-declared-package"] = "1.0.0";
    fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    const lockPath: string = path.join(workspace, "pnpm-lock.yaml");
    const lockSource: string = fs.readFileSync(lockPath, "utf8");
    const dependencySection: string = "    devDependencies:\n";
    assert.ok(lockSource.includes(dependencySection));
    fs.writeFileSync(
      lockPath,
      lockSource.replace(
        dependencySection,
        [
          dependencySection.trimEnd(),
          "      agent-declared-package:",
          "        specifier: 1.0.0",
          "        version: 1.0.0",
          "",
        ].join("\n"),
      ),
      "utf8",
    );
    write(
      path.join(
        workspace,
        "node_modules",
        "agent-declared-package",
        "package.json",
      ),
      '{"name":"agent-declared-package","version":"1.0.0"}\n',
    );
    await expectFailure(
      () => EvidenceBenchmarkSetup.assertRestored(workspace, root, "plain"),
      "installed dependency is not linked by pnpm",
    );
    fs.rmSync(path.join(workspace, "node_modules", "agent-declared-package"), {
      recursive: true,
      force: true,
    });
    fs.writeFileSync(manifestPath, manifestSource, "utf8");
    fs.writeFileSync(lockPath, lockSource, "utf8");
    const driftedLock: string = lockSource.replace(
      /(^ {6}typescript:\r?\n {8}specifier: [^\r\n]+\r?\n {8}version: )[^\r\n]+/m,
      (_match, prefix: string) => `${prefix}0.0.0`,
    );
    assert.notEqual(driftedLock, lockSource);
    fs.writeFileSync(lockPath, driftedLock, "utf8");
    await expectFailure(
      () => EvidenceBenchmarkSetup.assertRestored(workspace, root, "plain"),
      "installed dependency drifted from its frozen lock target",
    );
    fs.writeFileSync(lockPath, lockSource, "utf8");
    EvidenceBenchmarkSetup.assertRestored(workspace, root, "plain");
    const orphanPayload: string = path.join(
      workspace,
      "node_modules",
      ".pnpm",
      "orphan@1.0.0",
      "node_modules",
      "orphan",
    );
    write(
      path.join(orphanPayload, "package.json"),
      '{"name":"orphan","version":"1.0.0"}\n',
    );
    await expectFailure(
      () => EvidenceBenchmarkSetup.assertRestored(workspace, root, "plain"),
      "orphan installed package payload",
    );
    fs.rmSync(path.join(workspace, "node_modules", ".pnpm", "orphan@1.0.0"), {
      recursive: true,
      force: true,
    });
    EvidenceBenchmarkSetup.assertRestored(workspace, root, "plain");
    const hoistedRoot: string = path.join(
      workspace,
      "node_modules",
      ".pnpm",
      "node_modules",
    );
    const injectedHoist: string = path.join(hoistedRoot, "agent-hoisted");
    fs.symlinkSync(
      fs.realpathSync(path.join(workspace, "node_modules", "typescript")),
      injectedHoist,
      process.platform === "win32" ? "junction" : "dir",
    );
    await expectFailure(
      () => reproduce(),
      "do not match a clean frozen registry install",
    );
    fs.rmSync(injectedHoist);
    EvidenceBenchmarkSetup.assertRestored(workspace, root, "plain");
    const nested = await EvidenceBenchmarkProcess.pnpm(
      ["run", "nested-version"],
      {
        cwd: workspace,
        env: materialization.environment,
        label: "self-test nested pinned pnpm",
      },
    );
    assert.ok(
      nested.stdout
        .split(/\r?\n/)
        .some((line) => line.trim() === EvidenceBenchmarkProcess.PNPM_VERSION),
      "nested package scripts must resolve the benchmark-pinned pnpm",
    );
    EvidenceBenchmarkSetup.assertRestored(workspace, root, "plain");
  }

  /**
   * Verifies Markdown corpus integrity without a parallel inventory contract.
   *
   * The corpus reader must preserve exact input bytes while deriving only
   * structure present in Markdown. It must reject other file kinds and
   * ambiguous requirement nodes without assigning semantics to numeric filename
   * prefixes.
   *
   * 1. Read a valid corpus with shared ordering prefixes and fenced examples.
   * 2. Reject a non-Markdown sidecar.
   * 3. Reject vacuous, duplicate, and anonymous requirement structures.
   */
  async function testMarkdownCorpus(temporary: string): Promise<void> {
    const root: string = path.join(temporary, "markdown-corpus");
    write(
      path.join(root, "00-corpus-contract.md"),
      "# Corpus Contract\r\n\r\nMarkdown is authoritative.\r\n",
    );
    write(
      path.join(root, "00-contents.md"),
      "# Corpus Contents\n\nTwo documents may share an ordering prefix.\n",
    );
    write(
      path.join(root, "01-requirements.md"),
      [
        "# Requirements",
        "",
        "## REQ-GROUP: Area",
        "",
        "### REQ-ONE: First",
        "",
        "Bound behavior.",
        "",
        "```md",
        "## REQ-HIDDEN: Example",
        "### REQ-HIDDEN-ONE: Example",
        "```",
        "",
      ].join("\n"),
    );
    const result: EvidenceBenchmarkCorpus.IResult =
      EvidenceBenchmarkCorpus.read(root);
    assert.equal(result.documents, 3);
    assert.equal(result.h2, 1);
    assert.equal(result.h3, 1);
    assert.deepEqual(
      result.files.get("00-corpus-contract.md"),
      fs.readFileSync(path.join(root, "00-corpus-contract.md")),
      "parser normalization must never rewrite copied corpus bytes",
    );

    const nonMarkdown: string = path.join(temporary, "non-markdown-corpus");
    fs.cpSync(root, nonMarkdown, { recursive: true });
    write(
      path.join(nonMarkdown, "metadata.json"),
      '{"parallel":"inventory"}\n',
    );
    await expectFailure(
      () => EvidenceBenchmarkCorpus.read(nonMarkdown),
      "root-level numbered Markdown documents: metadata.json",
    );

    const duplicate: string = path.join(temporary, "duplicate-node-corpus");
    fs.cpSync(root, duplicate, { recursive: true });
    write(
      path.join(duplicate, "02-more.md"),
      "# More\n\n### REQ-ONE: Duplicate\n",
    );
    await expectFailure(
      () => EvidenceBenchmarkCorpus.read(duplicate),
      "Requirement heading is duplicated: REQ-ONE",
    );

    const anonymous: string = path.join(temporary, "anonymous-h3-corpus");
    fs.cpSync(root, anonymous, { recursive: true });
    write(
      path.join(anonymous, "02-more.md"),
      "# More\n\n### Missing identifier\n",
    );
    await expectFailure(
      () => EvidenceBenchmarkCorpus.read(anonymous),
      "H3 must own a REQ identifier",
    );

    const noGroups: string = path.join(temporary, "no-group-corpus");
    write(
      path.join(noGroups, "00-notes.md"),
      "# Notes\n\nThis document declares no requirement group.\n",
    );
    await expectFailure(
      () => EvidenceBenchmarkCorpus.read(noGroups),
      "no level-two requirement groups",
    );

    const noRequirements: string = path.join(
      temporary,
      "no-requirement-corpus",
    );
    write(
      path.join(noRequirements, "00-groups.md"),
      "# Groups\n\n## REQ-GROUP: Area\n",
    );
    await expectFailure(
      () => EvidenceBenchmarkCorpus.read(noRequirements),
      "no REQ-owned level-three requirements",
    );
  }

  async function testMaterialization(
    repository: string,
    temporary: string,
  ): Promise<void> {
    const freeFormCorpus: string = path.join(
      repository,
      "benchmark",
      "requirements",
      "free-form-subject",
    );
    fs.cpSync(
      path.join(repository, "benchmark", "requirements", "todo"),
      freeFormCorpus,
      { recursive: true },
    );
    const archive: string = path.join(temporary, "fake.tgz");
    fs.writeFileSync(archive, "fixture archive bytes", "utf8");
    const archiveBytes: Buffer = fs.readFileSync(archive);
    const artifact: IEvidenceBenchmarkPackageArtifact = {
      archive,
      name: "@samchon/lint-plugin-evidence",
      version: "0.0.0-self-test",
      bytes: archiveBytes.byteLength,
      sha256: EvidenceBenchmarkHash.bytes(archiveBytes),
      sri: EvidenceBenchmarkHash.sri(archiveBytes),
      payloadSha256: EvidenceBenchmarkHash.bytes("fixture payload"),
      sourceCommit: "0000000000000000000000000000000000000000",
      sourceLockSha256: EvidenceBenchmarkHash.bytes("fixture lock"),
      elapsedMs: 0,
      packElapsedMs: 0,
      smokeInstallElapsedMs: 0,
      smokeCheckElapsedMs: 0,
      pnpmVersion: EvidenceBenchmarkProcess.PNPM_VERSION,
      nodeVersion: process.version,
      platform: process.platform,
      architecture: process.arch,
    };
    const variables: IEvidenceBenchmarkMaterialization.IVariables =
      benchmarkVariables("self-test");
    const cells: Map<string, IEvidenceBenchmarkMaterialization> = new Map();
    const inheritedNestiaLoader: string | undefined =
      process.env.NESTIA_SDK_TRANSFORM;
    process.env.NESTIA_SDK_TRANSFORM = "1";
    try {
      for (const project of ["todo", "reddit", "erp", "free-form-subject"])
        for (const arm of ["evidence", "plain"] as const) {
          const cell = await EvidenceBenchmarkMaterializer.materialize({
            repository,
            output: path.join(temporary, `${project}-${arm}`),
            project,
            arm,
            variables,
            artifact,
          });
          assert.equal(
            cell.environment.NESTIA_SDK_TRANSFORM,
            undefined,
            "materialized cells must clear Nestia's loader-only rule bypass",
          );
          cells.set(`${project}/${arm}`, cell);
          assertIntegratedCell({
            repository,
            project,
            arm,
            variables,
            artifact,
            cell,
          });
        }
    } finally {
      fs.rmSync(freeFormCorpus, { recursive: true, force: true });
      if (inheritedNestiaLoader === undefined)
        delete process.env.NESTIA_SDK_TRANSFORM;
      else process.env.NESTIA_SDK_TRANSFORM = inheritedNestiaLoader;
    }
    const evidenceOne: IEvidenceBenchmarkMaterialization =
      cells.get("todo/evidence")!;
    const plain: IEvidenceBenchmarkMaterialization = cells.get("todo/plain")!;
    const evidenceTwo = await EvidenceBenchmarkMaterializer.materialize({
      repository,
      output: path.join(temporary, "todo-evidence-repeat"),
      project: "todo",
      arm: "evidence",
      variables,
      artifact,
    });
    assert.equal(
      evidenceOne.workspaceTreeSha256,
      evidenceTwo.workspaceTreeSha256,
      "cell destination must not alter workspace bytes",
    );
    assert.equal(
      EvidenceBenchmarkHash.tree(
        EvidenceBenchmarkHash.directory(evidenceOne.workspace),
      ),
      EvidenceBenchmarkHash.tree(
        EvidenceBenchmarkHash.directory(evidenceTwo.workspace),
      ),
    );
    const sealedFiles: ReadonlyMap<string, Uint8Array> =
      EvidenceBenchmarkHash.directory(evidenceOne.workspace);
    const expectSeverityFailure = async (
      relative: string,
      before: string,
      after: string,
      fragment: string,
    ): Promise<void> => {
      const changed: Map<string, Uint8Array> = new Map(sealedFiles);
      const source: string = Buffer.from(changed.get(relative)!).toString(
        "utf8",
      );
      assert.equal(
        source.includes(before),
        true,
        `severity fixture must contain ${before}`,
      );
      changed.set(relative, Buffer.from(source.replace(before, after), "utf8"));
      await expectFailure(
        () => EvidenceBenchmarkLintBaseline.capture(changed, "evidence"),
        fragment,
      );
    };
    await expectSeverityFailure(
      EvidenceBenchmarkLintBaseline.PATHS[0],
      '"evidence/graph": ["error", graph]',
      '"evidence/graph": "off"',
      'direct ["error", graph] tuple',
    );
    await expectSeverityFailure(
      EvidenceBenchmarkLintBaseline.PATHS[0],
      '"evidence/graph": ["error", graph]',
      '"evidence/graph": "warn"',
      'direct ["error", graph] tuple',
    );
    await expectSeverityFailure(
      EvidenceBenchmarkLintBaseline.PATHS[2],
      '"evidence/graph": ["error", graph]',
      '"evidence/graph": true ? "off" : ["error", graph]',
      'direct ["error", graph] tuple',
    );
    await expectSeverityFailure(
      EvidenceBenchmarkLintBaseline.PATHS[1],
      'isNestiaConfigLoader ? "off" : ["error", graph]',
      'true ? "off" : ["error", graph]',
      "authorized Nestia loader bypass",
    );
    await expectSeverityFailure(
      EvidenceBenchmarkLintBaseline.PATHS[0],
      '"evidence/graph": ["error", graph]',
      '"evidence/graph": "off" }, decoy: { "evidence/graph": ["error", graph]',
      'direct ["error", graph] tuple',
    );
    await expectSeverityFailure(
      EvidenceBenchmarkLintBaseline.PATHS[0],
      '"evidence/graph": ["error", graph]',
      '"evidence/todo": "error" }, decoy: { "evidence/graph": ["error", graph]',
      "active evidence/graph rule",
    );
    await expectSeverityFailure(
      EvidenceBenchmarkLintBaseline.PATHS[1],
      "const isNestiaConfigLoader",
      "let isNestiaConfigLoader",
      "authorized Nestia loader bypass",
    );
    await expectSeverityFailure(
      EvidenceBenchmarkLintBaseline.PATHS[0],
      '"evidence/documented": "error"',
      '"evidence/documented": "off"',
      'evidence/documented must remain at "error" severity',
    );
    await expectSeverityFailure(
      EvidenceBenchmarkLintBaseline.PATHS[1],
      '"evidence/singular": isNestiaConfigLoader ? "off" : "error"',
      '"evidence/singular": "off"',
      "authorized Nestia loader bypass",
    );
    await expectSeverityFailure(
      EvidenceBenchmarkLintBaseline.PATHS[2],
      '"evidence/todo": "error"',
      '"evidence/todo": "warn"',
      'evidence/todo must remain at "error" severity',
    );
    await expectSeverityFailure(
      EvidenceBenchmarkLintBaseline.PATHS[3],
      '"evidence/documented": isNestiaConfigLoader ? "off" : "error"',
      '"evidence/documented": isNestiaConfigLoader ? "off" : "warn"',
      "authorized Nestia loader bypass",
    );
    const testProgram: string = path.join(
      evidenceTwo.workspace,
      "packages",
      "backend",
      "tsconfig.test.json",
    );
    const testProgramSource: string = fs.readFileSync(testProgram, "utf8");
    fs.writeFileSync(
      testProgram,
      testProgramSource.replace(
        '"configFile": "./lint.config.ts"',
        '"configFile": "./lint.config.main.ts"',
      ),
      "utf8",
    );
    await expectFailure(
      () =>
        EvidenceBenchmarkLintBaseline.assertRestored(
          evidenceTwo.workspace,
          "evidence",
          evidenceTwo.lintBaselines,
        ),
      "must load ./lint.config.ts",
    );
    fs.writeFileSync(testProgram, `${testProgramSource}\n`, "utf8");
    await expectFailure(
      () =>
        EvidenceBenchmarkLintBaseline.assertRestored(
          evidenceTwo.workspace,
          "evidence",
          evidenceTwo.lintBaselines,
        ),
      "Lint Program bytes were not restored",
    );
    fs.writeFileSync(testProgram, testProgramSource, "utf8");
    const backendPackage: string = path.join(
      evidenceTwo.workspace,
      "packages",
      "backend",
      "package.json",
    );
    const backendPackageSource: string = fs.readFileSync(
      backendPackage,
      "utf8",
    );
    const backendPackageValue = JSON.parse(backendPackageSource) as {
      scripts: Record<string, string>;
    };
    backendPackageValue.scripts.pretest = "NESTIA_SDK_TRANSFORM=1 pnpm lint";
    fs.writeFileSync(
      backendPackage,
      `${JSON.stringify(backendPackageValue, null, 2)}\n`,
      "utf8",
    );
    await expectFailure(
      () =>
        EvidenceBenchmarkLintBaseline.assertRestored(
          evidenceTwo.workspace,
          "evidence",
          evidenceTwo.lintBaselines,
        ),
      "package command surface was not restored",
    );
    fs.writeFileSync(backendPackage, backendPackageSource, "utf8");
    const backendIdentity = JSON.parse(backendPackageSource) as {
      name: string;
      devDependencies: Record<string, string>;
    };
    backendIdentity.name = "benchmark-filter-bypass";
    fs.writeFileSync(
      backendPackage,
      `${JSON.stringify(backendIdentity, null, 2)}\n`,
      "utf8",
    );
    await expectFailure(
      () =>
        EvidenceBenchmarkLintBaseline.assertInfrastructureRestored(
          evidenceTwo.workspace,
          "evidence",
          evidenceTwo.lintBaselines,
        ),
      "package command surface was not restored",
    );
    backendIdentity.name = JSON.parse(backendPackageSource).name as string;
    backendIdentity.devDependencies.ttsc = "0.0.0-bypass";
    fs.writeFileSync(
      backendPackage,
      `${JSON.stringify(backendIdentity, null, 2)}\n`,
      "utf8",
    );
    await expectFailure(
      () =>
        EvidenceBenchmarkLintBaseline.assertInfrastructureRestored(
          evidenceTwo.workspace,
          "evidence",
          evidenceTwo.lintBaselines,
        ),
      "package command surface was not restored",
    );
    backendIdentity.devDependencies.ttsc = (
      JSON.parse(backendPackageSource) as {
        devDependencies: Record<string, string>;
      }
    ).devDependencies.ttsc!;
    (
      backendIdentity as typeof backendIdentity & {
        pnpm: { overrides: Record<string, string> };
      }
    ).pnpm = { overrides: { ttsc: "0.0.0-bypass" } };
    fs.writeFileSync(
      backendPackage,
      `${JSON.stringify(backendIdentity, null, 2)}\n`,
      "utf8",
    );
    await expectFailure(
      () =>
        EvidenceBenchmarkLintBaseline.assertInfrastructureRestored(
          evidenceTwo.workspace,
          "evidence",
          evidenceTwo.lintBaselines,
        ),
      "package command surface was not restored",
    );
    fs.writeFileSync(backendPackage, backendPackageSource, "utf8");
    const fixedRunner: string = path.join(
      evidenceTwo.workspace,
      "packages",
      "frontend",
      "scripts",
      "run-playwright.mjs",
    );
    const fixedRunnerSource: string = fs.readFileSync(fixedRunner, "utf8");
    fs.appendFileSync(fixedRunner, "\nprocess.exit(0);\n", "utf8");
    await expectFailure(
      () =>
        EvidenceBenchmarkLintBaseline.assertInfrastructureRestored(
          evidenceTwo.workspace,
          "evidence",
          evidenceTwo.lintBaselines,
        ),
      "shared execution infrastructure was not restored",
    );
    fs.writeFileSync(fixedRunner, fixedRunnerSource, "utf8");
    const healthProof: string = path.join(
      evidenceTwo.workspace,
      "packages",
      "backend",
      "test",
      "features",
      "api",
      "health",
      "test_api_health.ts",
    );
    const healthProofSource: string = fs.readFileSync(healthProof, "utf8");
    fs.writeFileSync(
      healthProof,
      healthProofSource.replace("return 3;", "return 3 as never;"),
      "utf8",
    );
    await expectFailure(
      () =>
        EvidenceBenchmarkLintBaseline.assertInfrastructureRestored(
          evidenceTwo.workspace,
          "evidence",
          evidenceTwo.lintBaselines,
        ),
      "shared execution infrastructure was not restored",
    );
    fs.writeFileSync(healthProof, healthProofSource, "utf8");
    const policyOverride: string = path.join(
      evidenceTwo.workspace,
      "AGENTS.override.md",
    );
    fs.writeFileSync(policyOverride, "# Weakened policy\n", "utf8");
    await expectFailure(
      () =>
        EvidenceBenchmarkLintBaseline.assertInfrastructureRestored(
          evidenceTwo.workspace,
          "evidence",
          evidenceTwo.lintBaselines,
        ),
      "forbidden policy override",
    );
    fs.rmSync(policyOverride);
    const environmentOverride: string = path.join(
      evidenceTwo.workspace,
      "packages",
      "frontend",
      ".env.local",
    );
    fs.writeFileSync(environmentOverride, "VITE_API_SIMULATE=true\n", "utf8");
    await expectFailure(
      () =>
        EvidenceBenchmarkLintBaseline.assertInfrastructureRestored(
          evidenceTwo.workspace,
          "evidence",
          evidenceTwo.lintBaselines,
        ),
      "forbidden policy override",
    );
    fs.rmSync(environmentOverride);
    const backendLint: string = path.join(
      evidenceTwo.workspace,
      "packages",
      "backend",
      "lint.config.ts",
    );
    const backendLintSource: string = fs.readFileSync(backendLint, "utf8");
    const longClaimName: string = "x".repeat(4_096);
    fs.writeFileSync(
      backendLint,
      backendLintSource.replace(
        '"api-operations"',
        JSON.stringify(longClaimName),
      ),
      "utf8",
    );
    let semanticFailure: unknown;
    try {
      EvidenceBenchmarkLintBaseline.assertRestored(
        evidenceTwo.workspace,
        "evidence",
        evidenceTwo.lintBaselines,
      );
    } catch (error) {
      semanticFailure = error;
    }
    assert.ok(
      semanticFailure instanceof Error,
      "semantic drift must fail restoration",
    );
    assert.match(
      semanticFailure.message,
      /Lint graph semantics were not restored/,
    );
    assert.ok(
      semanticFailure.message.length < 1_024,
      "semantic drift diagnostics must remain bounded",
    );
    assert.equal(
      semanticFailure.message.includes(longClaimName),
      false,
      "semantic drift diagnostics must truncate individual claim names",
    );
    assert.doesNotMatch(
      semanticFailure.message,
      /"definition"/,
      "semantic drift diagnostics must not dump complete claim objects",
    );
    fs.writeFileSync(backendLint, backendLintSource, "utf8");
    fs.appendFileSync(backendLint, "// unauthorized bypass\n", "utf8");
    await expectFailure(
      () =>
        EvidenceBenchmarkLintBaseline.assertRestored(
          evidenceTwo.workspace,
          "evidence",
          evidenceTwo.lintBaselines,
        ),
      "Lint configuration bytes were not restored",
    );
    fs.writeFileSync(backendLint, backendLintSource, "utf8");
    assert.equal(
      fs.readdirSync(temporary).some((entry) => entry.includes(".tmp")),
      false,
      "materializer must not leak staging directories",
    );
    const failedOutput: string = path.join(temporary, "materializer-failure");
    await expectFailure(
      () =>
        EvidenceBenchmarkMaterializer.materialize({
          repository,
          output: failedOutput,
          project: "todo",
          arm: "evidence",
          variables,
          artifact: {
            ...artifact,
            sha256: EvidenceBenchmarkHash.bytes("wrong archive identity"),
          },
        }),
      "archive drifted",
    );
    assert.equal(fs.existsSync(failedOutput), false);
    assert.equal(
      fs
        .readdirSync(temporary)
        .some(
          (entry) =>
            entry.startsWith(".materializer-failure.") &&
            entry.endsWith(".tmp"),
        ),
      false,
      "failed materialization must remove its exact unpublished stage",
    );
    await expectFailure(
      () =>
        EvidenceBenchmarkMaterializer.materialize({
          repository,
          output: evidenceOne.root,
          project: "todo",
          arm: "evidence",
          variables,
          artifact,
        }),
      "refuses to overwrite",
    );
    assert.equal(
      fs.existsSync(path.join(plain.workspace, ".benchmark-deps")),
      false,
    );
  }

  function assertIntegratedCell(props: {
    repository: string;
    project: IEvidenceBenchmarkMaterialization.Project;
    arm: "evidence" | "plain";
    variables: IEvidenceBenchmarkMaterialization.IVariables;
    artifact: IEvidenceBenchmarkPackageArtifact;
    cell: IEvidenceBenchmarkMaterialization;
  }): void {
    const corpus: EvidenceBenchmarkCorpus.IResult =
      EvidenceBenchmarkCorpus.read(
        path.join(props.repository, "benchmark", "requirements", props.project),
      );
    const workspaceCorpus: Map<string, Uint8Array> =
      EvidenceBenchmarkHash.directory(
        path.join(props.cell.workspace, "docs", "analysis"),
      );
    const immutableCorpus: Map<string, Uint8Array> =
      EvidenceBenchmarkHash.directory(props.cell.immutableInputs);
    assert.equal(
      EvidenceBenchmarkHash.tree(workspaceCorpus),
      EvidenceBenchmarkHash.tree(corpus.files),
      `${props.project}/${props.arm} workspace must receive the whole corpus`,
    );
    assert.equal(
      EvidenceBenchmarkHash.tree(immutableCorpus),
      EvidenceBenchmarkHash.tree(corpus.files),
      `${props.project}/${props.arm} immutable input must receive the whole corpus`,
    );

    const manifest = JSON.parse(
      fs.readFileSync(props.cell.manifest, "utf8"),
    ) as IEvidenceBenchmarkMaterialization.IManifest;
    assert.equal(manifest.schemaVersion, 6);
    assert.ok(manifest.elapsedMs >= 0);
    assert.equal("materializedAt" in manifest, false);
    assert.equal(
      props.cell.environment.PLAYWRIGHT_BROWSERS_PATH,
      manifest.caches.playwright,
    );
    assert.equal(
      props.cell.environment.npm_config_userconfig,
      EvidenceBenchmarkMaterializer.npmConfig(props.cell.root),
    );
    assert.equal(
      props.cell.environment.npm_config_globalconfig,
      EvidenceBenchmarkMaterializer.npmConfig(props.cell.root),
    );
    assert.equal(
      props.cell.environment.GIT_CONFIG_GLOBAL,
      EvidenceBenchmarkMaterializer.gitConfig(props.cell.root),
    );
    assert.equal(props.cell.environment.GIT_CONFIG_NOSYSTEM, "1");
    assert.equal(props.cell.environment.GOENV, "off");
    assert.equal(props.cell.environment.GOMODCACHE, manifest.caches.goModules);
    assert.equal(props.cell.environment.GOPATH, manifest.caches.goPath);
    assert.equal(
      props.cell.environment.COREPACK_HOME,
      manifest.caches.corepack,
    );
    for (const forbidden of [
      "NODE_OPTIONS",
      "NODE_PATH",
      "NESTIA_SDK_TRANSFORM",
      "API_PORT",
      "JWT_SECRET_KEY",
      "VITE_API_HOST",
    ])
      assert.equal(
        props.cell.environment[forbidden],
        undefined,
        `${forbidden} must not leak from the operator environment`,
      );
    for (const cache of [
      manifest.caches.pnpm,
      manifest.caches.ttsc,
      manifest.caches.go,
      manifest.caches.goModules,
      manifest.caches.goPath,
      manifest.caches.playwright,
      manifest.caches.temp,
    ])
      assert.equal(
        path.relative(props.cell.workspace, cache).startsWith(".."),
        false,
        "mutable benchmark caches must remain inside the sandboxed workspace",
      );
    assert.equal(
      path
        .relative(props.cell.workspace, manifest.caches.toolchain)
        .startsWith(".."),
      true,
      "the pinned toolchain launcher must remain outside agent write authority",
    );
    for (const cache of [manifest.caches.home, manifest.caches.corepack])
      assert.equal(
        path.relative(props.cell.workspace, cache).startsWith(".."),
        true,
        "operator-home and Corepack state must remain outside agent write authority",
      );
    assert.equal(manifest.artifact.sha256, props.artifact.sha256);
    assert.deepEqual(manifest.corpus, {
      documents: corpus.documents,
      h2: corpus.h2,
      h3: corpus.h3,
    });
    assert.deepEqual(manifest.lintBaselines, props.cell.lintBaselines);
    assert.equal(
      EvidenceBenchmarkLintBaseline.assertRestored(
        props.cell.workspace,
        props.arm,
        props.cell.lintBaselines,
      ),
      EvidenceBenchmarkLintBaseline.digest(props.cell.lintBaselines),
    );
    assert.deepEqual(
      props.cell.lintBaselines.map((entry) => ({
        path: entry.path,
        claims: entry.graph?.claims.map((claim) => claim.name) ?? null,
      })),
      [
        {
          path: "packages/api/lint.config.ts",
          claims:
            props.arm === "evidence" ? ["dto-types", "dto-properties"] : null,
        },
        {
          path: "packages/backend/lint.config.ts",
          claims:
            props.arm === "evidence"
              ? ["schema-models", "api-operations", "backend-tests"]
              : null,
        },
        {
          path: "packages/frontend/lint.config.ts",
          claims:
            props.arm === "evidence"
              ? ["frontend-screens", "frontend-journeys"]
              : null,
        },
        {
          path: "packages/backend/lint.config.main.ts",
          claims:
            props.arm === "evidence"
              ? ["schema-models", "api-operations"]
              : null,
        },
      ],
    );
    const archiveRelative: string = `.benchmark-deps/e-${props.artifact.sha256.slice(0, 12)}.tgz`;
    const packageManifest = JSON.parse(
      fs.readFileSync(path.join(props.cell.workspace, "package.json"), "utf8"),
    ) as { devDependencies?: Record<string, string> };
    if (props.arm === "evidence") {
      assert.equal(manifest.artifact.relativeArchive, archiveRelative);
      assert.equal(
        packageManifest.devDependencies?.["@samchon/lint-plugin-evidence"],
        `file:${archiveRelative}`,
      );
      assert.ok(
        fs.existsSync(
          path.join(props.cell.workspace, ...archiveRelative.split("/")),
        ),
      );
    } else {
      assert.equal(manifest.artifact.relativeArchive, undefined);
      assert.equal(
        packageManifest.devDependencies?.["@samchon/lint-plugin-evidence"],
        undefined,
      );
      assert.equal(
        fs.existsSync(path.join(props.cell.workspace, ".benchmark-deps")),
        false,
      );
    }

    for (const packageName of ["api", "backend", "frontend"]) {
      const relative: string = `packages/${packageName}/lint.config.ts`;
      const overlay: string = fs
        .readFileSync(
          path.join(
            props.repository,
            "benchmark",
            "template",
            props.arm,
            ...relative.split("/"),
          ),
          "utf8",
        )
        .replaceAll("\r\n", "\n");
      const expected: string = renderFixtureVariables(overlay, props.variables);
      assert.equal(
        fs.readFileSync(
          path.join(props.cell.workspace, ...relative.split("/")),
          "utf8",
        ),
        expected,
        `${props.project}/${props.arm} must fully replace ${relative}`,
      );
    }
    for (const [relative, content] of EvidenceBenchmarkHash.directory(
      props.cell.workspace,
    )) {
      if (!/\.(?:c?js|mjs|json|md|ts|ya?ml)$/i.test(relative)) continue;
      const source: string = Buffer.from(content).toString("utf8");
      assert.doesNotMatch(
        source,
        /benchmark-template-splice:\s*base-body|\{\{base\}\}/,
        `${props.project}/${props.arm} retained a splice marker in ${relative}`,
      );
      assert.doesNotMatch(
        source,
        /\{\{(?:name|apiPackageName|backendPackageName|frontendPackageName)\}\}/,
        `${props.project}/${props.arm} retained a package placeholder in ${relative}`,
      );
    }
    if (props.arm === "evidence")
      assertEvidenceClaimDeferralContract(
        EvidenceBenchmarkHash.directory(props.cell.workspace),
      );
  }

  function renderFixtureVariables(
    source: string,
    variables: IEvidenceBenchmarkMaterialization.IVariables,
  ): string {
    return source.replace(
      /\{\{(name|apiPackageName|backendPackageName|frontendPackageName)\}\}/g,
      (
        _match: string,
        key: keyof IEvidenceBenchmarkMaterialization.IVariables,
      ) => variables[key],
    );
  }

  async function testPackage(
    repository: string,
    temporary: string,
  ): Promise<void> {
    const commit = await EvidenceBenchmarkProcess.run(
      "git",
      ["rev-parse", "HEAD"],
      {
        cwd: repository,
        label: "read package-smoke source commit",
      },
    );
    const output: string = path.join(temporary, "artifact");
    const request: IEvidenceBenchmarkPackageArtifact.IRequest = {
      repository,
      expectedCommit: commit.stdout.trim(),
      output,
    };
    const [first, second] = await Promise.all([
      EvidenceBenchmarkPackage.prepare(request),
      EvidenceBenchmarkPackage.prepare(request),
    ]);
    assert.equal(first.sha256, second.sha256);
    assert.equal(first.archive, second.archive);
    assert.equal(EvidenceBenchmarkHash.file(first.archive), first.sha256);
    assert.equal(
      fs.readdirSync(output).filter((file) => file.endsWith(".tgz")).length,
      1,
    );

    const cell = await EvidenceBenchmarkMaterializer.materialize({
      repository,
      output: path.join(temporary, "nestia-evidence-smoke"),
      project: "todo",
      arm: "evidence",
      variables: benchmarkVariables("nestia-evidence-smoke"),
      artifact: first,
    });
    const runtime: EvidenceBenchmarkRuntime.IAssignment =
      EvidenceBenchmarkRuntime.assign(0, 52_000);
    EvidenceBenchmarkRuntime.apply(cell.environment, runtime);
    EvidenceBenchmarkRuntime.persist(cell.workspace, runtime);
    await EvidenceBenchmarkSetup.prepare({
      materialization: cell,
      arm: "evidence",
    });
    await EvidenceBenchmarkConsumerProof.verifyPrismaIsolation(cell);
    await EvidenceBenchmarkProcess.pnpm(["exec", "nestia", "all"], {
      cwd: path.join(cell.workspace, "packages", "backend"),
      env: cell.environment,
      label: "Nestia evidence config-loader smoke",
    });
    const build: EvidenceBenchmarkProcess.IResult =
      await EvidenceBenchmarkProcess.pnpm(["run", "build"], {
        cwd: cell.workspace,
        env: cell.environment,
        label: "packaged Evidence template graph gate",
        allowFailure: true,
      });
    assert.notEqual(
      build.status,
      0,
      "the pristine Evidence template must stop at its unimplemented graph",
    );
    const buildOutput: string = `${build.stdout}\n${build.stderr}`.replace(
      /\u001b\[[0-9;]*m/g,
      "",
    );
    assert.match(
      buildOutput,
      /evidence\/graph/,
      "the packaged Evidence build must reach the active graph",
    );
    const compilerDiagnostics: string[] = buildOutput
      .split(/\r?\n/)
      .filter((line) => /\berror TS\d+:/.test(line));
    assert.ok(
      compilerDiagnostics.length !== 0,
      "the packaged Evidence build must retain compiler diagnostics",
    );
    assert.deepEqual(
      compilerDiagnostics.filter((line) => !line.includes("[evidence/graph]")),
      [],
      "the packaged Evidence build must not hide a non-graph compiler failure",
    );
    assert.equal(
      fs.existsSync(
        path.join(cell.workspace, "packages", "api", "swagger.json"),
      ),
      true,
      "Nestia evidence smoke must generate the OpenAPI contract",
    );
    await EvidenceBenchmarkConsumerProof.verifyActiveGraph(
      cell,
      benchmarkVariables("nestia-evidence-smoke"),
    );
  }

  async function testBaseline(
    repository: string,
    temporary: string,
  ): Promise<void> {
    const baseline = await EvidenceBenchmarkBaseline.prepare({
      repository,
      output: path.join(temporary, "neutral-baseline"),
    });
    assert.equal(baseline.pnpmVersion, EvidenceBenchmarkProcess.PNPM_VERSION);
    assert.ok(baseline.elapsedMs > 0);
    assert.equal(
      Object.keys(baseline.steps).length,
      9,
      "neutral baseline must retain every admission step",
    );
    assert.ok(fs.existsSync(path.join(baseline.root, "baseline.json")));
    assert.equal(
      fs.existsSync(
        path.join(
          baseline.workspace,
          "node_modules",
          "@samchon",
          "lint-plugin-evidence",
        ),
      ),
      false,
      "neutral baseline must not receive the measured product",
    );
  }

  function createFixture(repository: string, fixture: string): void {
    const source: string = path.join(repository, "benchmark");
    const target: string = path.join(fixture, "benchmark");
    fs.mkdirSync(target, { recursive: true });
    fs.cpSync(path.join(source, "template"), path.join(target, "template"), {
      recursive: true,
    });
    fs.cpSync(
      path.join(source, "requirements"),
      path.join(target, "requirements"),
      { recursive: true },
    );
    const base: string = path.join(target, "template", "base");
    for (const skill of [
      "api",
      "backend",
      "frontend",
      "project",
      "requirements",
    ])
      writeIfMissing(
        path.join(base, ".agents", "skills", skill, "SKILL.md"),
        `---\nname: ${skill}\ndescription: Self-test ${skill} instructions.\n---\n# ${skill}\n\nFixture body.\n`,
      );
    for (const arm of ["evidence", "plain"]) {
      writeIfMissing(
        path.join(
          target,
          "template",
          arm,
          ".agents",
          "skills",
          "review",
          "SKILL.md",
        ),
        "---\nname: review\ndescription: Self-test review instructions.\n---\n# Review\n\nFixture body.\n",
      );
      addSpliceContracts(base, path.join(target, "template", arm));
    }
    writeIfMissing(
      path.join(base, "package.json"),
      `${JSON.stringify(
        {
          name: "self-test",
          private: true,
          devDependencies: {
            "@ttsc/lint": "0.22.0",
            ttsc: "0.22.0",
            typescript: "7.0.2",
          },
        },
        null,
        2,
      )}\n`,
    );
    for (const relative of [
      "config/package.json",
      "packages/api/package.json",
      "packages/backend/package.json",
      "packages/frontend/package.json",
    ])
      writeIfMissing(
        path.join(base, ...relative.split("/")),
        '{"name":"self-test","private":true}\n',
      );
    writeIfMissing(
      path.join(base, "config/tsconfig.json"),
      '{"compilerOptions":{"strict":true}}\n',
    );
    writeIfMissing(
      path.join(base, "pnpm-workspace.yaml"),
      "packages:\n  - packages/*\n",
    );
  }

  function addSpliceContracts(base: string, arm: string): void {
    for (const relative of EvidenceBenchmarkHash.directory(arm).keys()) {
      const baseLocation: string = path.join(base, ...relative.split("/"));
      const armLocation: string = path.join(arm, ...relative.split("/"));
      if (!fs.existsSync(baseLocation) || !relative.endsWith(".md")) continue;
      const source: string = fs.readFileSync(armLocation, "utf8");
      if (source.includes("benchmark-template-splice: base-body")) continue;
      if (source.includes("{{base}}"))
        fs.writeFileSync(
          armLocation,
          source.replace(
            "{{base}}",
            "<!-- benchmark-template-splice: base-body -->\n{{base}}",
          ),
          "utf8",
        );
      else
        fs.writeFileSync(
          armLocation,
          source.replace(
            /^(# [^\r\n]+\r?\n)/m,
            "$1\n<!-- benchmark-template-splice: base-body -->\n{{base}}\n",
          ),
          "utf8",
        );
    }
  }

  function writeIfMissing(location: string, content: string): void {
    if (fs.existsSync(location)) return;
    write(location, content);
  }

  function write(location: string, content: string): void {
    fs.mkdirSync(path.dirname(location), { recursive: true });
    fs.writeFileSync(location, content, "utf8");
  }

  function benchmarkVariables(
    name: string,
  ): IEvidenceBenchmarkMaterialization.IVariables {
    return {
      name,
      apiPackageName: `@${name}/api`,
      backendPackageName: `@${name}/backend`,
      frontendPackageName: `@${name}/frontend`,
    };
  }

  async function expectFailure(
    action: () => unknown | Promise<unknown>,
    fragment: string,
  ): Promise<void> {
    await assert.rejects(
      async () => action(),
      (error: unknown): boolean =>
        error instanceof Error && error.message.includes(fragment),
      `expected failure containing ${JSON.stringify(fragment)}`,
    );
  }
}
