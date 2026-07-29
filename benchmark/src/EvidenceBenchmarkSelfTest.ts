import assert from "node:assert/strict";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";

import * as ts from "typescript-api";

import { EvidenceBenchmarkBaseline } from "./EvidenceBenchmarkBaseline.ts";
import { EvidenceBenchmarkCorpus } from "./EvidenceBenchmarkCorpus.ts";
import { EvidenceBenchmarkHash } from "./EvidenceBenchmarkHash.ts";
import { EvidenceBenchmarkLintBaseline } from "./EvidenceBenchmarkLintBaseline.ts";
import { EvidenceBenchmarkMaterializer } from "./EvidenceBenchmarkMaterializer.ts";
import { EvidenceBenchmarkPackage } from "./EvidenceBenchmarkPackage.ts";
import { EvidenceBenchmarkProcess } from "./EvidenceBenchmarkProcess.ts";
import { EvidenceBenchmarkPublication } from "./EvidenceBenchmarkPublication.ts";
import { EvidenceBenchmarkRepair } from "./EvidenceBenchmarkRepair.ts";
import { EvidenceBenchmarkRuntime } from "./EvidenceBenchmarkRuntime.ts";
import { EvidenceBenchmarkSetup } from "./EvidenceBenchmarkSetup.ts";
import { EvidenceBenchmarkTemplate } from "./EvidenceBenchmarkTemplate.ts";
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
      await testMaterialization(repository, temporary);
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
    const assignments: EvidenceBenchmarkRuntime.IAssignment[] = [];
    for (const project of ["todo", "reddit", "shopping", "erp"] as const)
      for (const arm of ["evidence", "plain"] as const)
        assignments.push(EvidenceBenchmarkRuntime.assign(project, arm));
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

    const todoEvidence: EvidenceBenchmarkRuntime.IAssignment = assignments[0]!;
    const shifted: EvidenceBenchmarkRuntime.IAssignment =
      EvidenceBenchmarkRuntime.assign("reddit", "plain", 50_000);
    assert.deepEqual(shifted, {
      apiPort: 50_030,
      swaggerPort: 50_031,
      viteDevelopmentPort: 50_032,
      playwrightPort: 50_033,
      apiHost: "http://127.0.0.1:50030",
    });
    assert.throws(
      () => EvidenceBenchmarkRuntime.assign("erp", "plain", 65_463),
      /between 1 and 65462/,
    );
    const environment: NodeJS.ProcessEnv = {
      API_PORT: "37001",
      PLAYWRIGHT_TEST_PORT: "4173",
    };
    EvidenceBenchmarkRuntime.apply(environment, todoEvidence);
    assert.deepEqual(environment, {
      API_PORT: "46000",
      PLAYWRIGHT_TEST_PORT: "46003",
      SWAGGER_PORT: "46001",
      VITE_API_HOST: "http://127.0.0.1:46000",
      VITE_DEV_PORT: "46002",
    });
    const secondWave = [
      EvidenceBenchmarkRuntime.assign("todo", "evidence", 51_000),
      EvidenceBenchmarkRuntime.assign("todo", "plain", 51_000),
      EvidenceBenchmarkRuntime.assign("reddit", "evidence", 51_000),
      EvidenceBenchmarkRuntime.assign("reddit", "plain", 51_000),
    ];
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
    } finally {
      fs.rmSync(persisted, { recursive: true, force: true });
    }

    const blocker: net.Server = net.createServer();
    await new Promise<void>((resolve, reject) => {
      blocker.once("error", reject);
      blocker.listen(
        { host: "127.0.0.1", port: todoEvidence.apiPort, exclusive: true },
        resolve,
      );
    });
    try {
      await expectFailure(
        () => EvidenceBenchmarkRuntime.assertAvailable([todoEvidence]),
        `api port ${todoEvidence.apiPort} is unavailable`,
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
    write(path.join(workspace, "package.json"), '{"private":true}\n');
    write(
      path.join(workspace, "packages", "frontend", "package.json"),
      '{"name":"@evidence-benchmark/todo-evidence-frontend"}\n',
    );
    for (const [
      index,
      relative,
    ] of EvidenceBenchmarkLintBaseline.PATHS.entries())
      write(
        path.join(workspace, ...relative.split("/")),
        [
          "const graph = {",
          "  claims: [",
          `    { name: "fixture-${index}", type: "typescript", files: ["src/**/*.ts"], symbol: "function", reference: { type: "markdown", files: ["docs/**/*.md"], symbol: "h2" } },`,
          "  ],",
          "};",
          'export default { rules: { "evidence/graph": ["error", graph] } };',
          "",
        ].join("\n"),
      );
    const lintBaselines: readonly IEvidenceBenchmarkMaterialization.ILintConfigBaseline[] =
      EvidenceBenchmarkLintBaseline.captureDirectory(workspace, "evidence");
    const lintRestorationSha256: string =
      EvidenceBenchmarkLintBaseline.digest(lintBaselines);
    write(path.join(workspace, ".env"), "SECRET=must-not-publish\n");
    write(path.join(workspace, ".env.example"), "SECRET=\n");
    write(
      path.join(workspace, ".benchmark-deps", "evidence.tgz"),
      "package archive",
    );
    const archiveSha256: string = EvidenceBenchmarkHash.bytes(
      Buffer.from("package archive"),
    );
    const runRoot: string = path.dirname(workspace);
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
    const materializationPath: string = path.join(
      runRoot,
      "materialization.json",
    );
    const materialization = {
      schemaVersion: 5,
      project: "todo",
      arm: "evidence",
      requirementsTreeSha256,
      lintBaselines,
      artifact: {
        sourceCommit: "0123456789abcdef0123456789abcdef01234567",
        sha256: archiveSha256,
        relativeArchive: ".benchmark-deps/evidence.tgz",
      },
    };
    write(materializationPath, `${JSON.stringify(materialization)}\n`);
    const runStatePath: string = path.join(runRoot, "run.json");
    write(
      runStatePath,
      `${JSON.stringify({
        schemaVersion: 6,
        workflow: "backend-first-gated-v2",
        instructionsTreeSha256,
        project: "todo",
        arm: "evidence",
        engine: "codex",
        model: "gpt-5.6-terra",
        effort: "high",
        cliVersion: "codex-cli 0.145.0",
        status: "completed",
        sourceCommit: "0123456789abcdef0123456789abcdef01234567",
        lintBaselines,
        completedWorkspaceTreeSha256:
          EvidenceBenchmarkPublication.workspaceSha256(workspace),
        turns: [
          "skills-contract",
          "backend-start",
          "backend-review",
          "backend-final",
          "frontend-start",
          "frontend-review",
          "frontend-final",
          "overall-review",
          "overall-final",
        ].map((name) => ({
          name,
          status: 0,
          invocation: ["codex", "exec"],
          accepted: true,
          lintRestorationSha256:
            name === "overall-final" ? lintRestorationSha256 : undefined,
        })),
      })}\n`,
    );
    write(
      path.join(runRoot, "benchmark-report.json"),
      `${JSON.stringify({ schemaVersion: 1, quality: { score: 100 } })}\n`,
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
        assert.equal(
          fs.existsSync(path.join(leaf, ".env")),
          false,
          "publication staging must exclude local environment files",
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
    const result: EvidenceBenchmarkPublication.IResult =
      await EvidenceBenchmarkPublication.publish(repository, request, runner);
    assert.equal(result.repository, "fixture-owner/evidence-benchmark-results");
    assert.ok(calls.includes("git push origin master"));

    const runState = JSON.parse(fs.readFileSync(runStatePath, "utf8")) as {
      turns: unknown[];
    };
    [runState.turns[1], runState.turns[2]] = [
      runState.turns[2],
      runState.turns[1],
    ];
    write(runStatePath, `${JSON.stringify(runState)}\n`);
    await expectFailure(
      () =>
        EvidenceBenchmarkPublication.publish(repository, request, async () => {
          throw new Error("swapped turn order reached the process runner");
        }),
      "canonical order",
    );
    [runState.turns[1], runState.turns[2]] = [
      runState.turns[2],
      runState.turns[1],
    ];
    write(runStatePath, `${JSON.stringify(runState)}\n`);

    materialization.artifact.relativeArchive = ".benchmark-deps/../outside.tgz";
    write(materializationPath, `${JSON.stringify(materialization)}\n`);
    await expectFailure(
      () =>
        EvidenceBenchmarkPublication.publish(repository, request, async () => {
          throw new Error("unsafe archive path reached the process runner");
        }),
      "unsafe product archive path",
    );
    materialization.artifact.relativeArchive = ".benchmark-deps/evidence.tgz";
    write(materializationPath, `${JSON.stringify(materialization)}\n`);

    write(path.join(workspace, "package.json"), '{"private":false}\n');
    await expectFailure(
      () =>
        EvidenceBenchmarkPublication.publish(repository, request, async () => {
          throw new Error("mutated workspace reached the process runner");
        }),
      "workspace failed identity verification",
    );
    write(path.join(workspace, "package.json"), '{"private":true}\n');

    await expectFailure(
      () =>
        EvidenceBenchmarkPublication.publish(
          repository,
          request,
          async (command, arguments_) =>
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
        EvidenceBenchmarkPublication.publish(
          repository,
          request,
          async (command, arguments_) => {
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
            if (command === "git" && arguments_[0] === "reset")
              rolledBack = true;
            return processResult(0);
          },
        ),
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
      /Do not start backend work in this turn\./,
      "the skills-contract turn must finish before backend implementation",
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
      /Inspect all three package `lint\.config\.ts` files\.[\s\S]+Restore all seven original claim objects[\s\S]+original populations and `error` severities/,
      "frontend final must inspect the complete seven-claim configuration",
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
          },
        },
        null,
        2,
      )}\n`,
    );
    write(path.join(workspace, "pnpm-workspace.yaml"), 'packages:\n  - "."\n');
    const materialization: IEvidenceBenchmarkMaterialization = {
      root,
      workspace,
      immutableInputs: path.join(root, "inputs", "requirements"),
      manifest: path.join(root, "materialization.json"),
      workspaceTreeSha256: EvidenceBenchmarkHash.bytes("setup fixture"),
      lintBaselines: [],
      environment: {
        ...process.env,
        npm_config_store_dir: path.join(cache, "pnpm-store"),
        TTSC_CACHE_DIR: path.join(cache, "ttsc"),
        TTSC_GO_CACHE_DIR: path.join(cache, "go-build"),
        GOCACHE: path.join(cache, "go-build"),
        GOTMPDIR: path.join(cache, "go-tmp"),
        PLAYWRIGHT_BROWSERS_PATH: path.join(cache, "playwright"),
      },
    };
    const setup = await EvidenceBenchmarkSetup.prepare({
      materialization,
      arm: "plain",
    });
    assert.ok(setup.elapsedMs >= setup.lockElapsedMs + setup.installElapsedMs);
    assert.equal(setup.pnpmVersion, EvidenceBenchmarkProcess.PNPM_VERSION);
    assert.ok(fs.existsSync(path.join(workspace, "pnpm-lock.yaml")));
    assert.ok(fs.existsSync(path.join(root, "setup.json")));
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
   * 3. Reject duplicate and anonymous requirement nodes.
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
  }

  async function testMaterialization(
    repository: string,
    temporary: string,
  ): Promise<void> {
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
    for (const project of ["todo", "reddit", "erp"] as const)
      for (const arm of ["evidence", "plain"] as const) {
        const cell = await EvidenceBenchmarkMaterializer.materialize({
          repository,
          output: path.join(temporary, `${project}-${arm}`),
          project,
          arm,
          variables,
          artifact,
        });
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
    const backendLint: string = path.join(
      evidenceTwo.workspace,
      "packages",
      "backend",
      "lint.config.ts",
    );
    const backendLintSource: string = fs.readFileSync(backendLint, "utf8");
    fs.writeFileSync(
      backendLint,
      backendLintSource.replace('"api-operations"', '"api-operations-drift"'),
      "utf8",
    );
    await expectFailure(
      () =>
        EvidenceBenchmarkLintBaseline.assertRestored(
          evidenceTwo.workspace,
          "evidence",
          evidenceTwo.lintBaselines,
        ),
      "Lint graph semantics were not restored",
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
    assert.equal(manifest.schemaVersion, 5);
    assert.ok(manifest.elapsedMs >= 0);
    assert.equal("materializedAt" in manifest, false);
    assert.equal(
      props.cell.environment.PLAYWRIGHT_BROWSERS_PATH,
      manifest.caches.playwright,
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
      EvidenceBenchmarkRuntime.assign("todo", "evidence", 52_000);
    EvidenceBenchmarkRuntime.apply(cell.environment, runtime);
    EvidenceBenchmarkRuntime.persist(cell.workspace, runtime);
    await EvidenceBenchmarkSetup.prepare({
      materialization: cell,
      arm: "evidence",
    });
    await EvidenceBenchmarkProcess.pnpm(["exec", "nestia", "all"], {
      cwd: path.join(cell.workspace, "packages", "backend"),
      env: cell.environment,
      label: "Nestia evidence config-loader smoke",
    });
    assert.equal(
      fs.existsSync(
        path.join(cell.workspace, "packages", "api", "swagger.json"),
      ),
      true,
      "Nestia evidence smoke must generate the OpenAPI contract",
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
