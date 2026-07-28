import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { EvidenceBenchmarkBaseline } from "./EvidenceBenchmarkBaseline.ts";
import { EvidenceBenchmarkCorpus } from "./EvidenceBenchmarkCorpus.ts";
import { EvidenceBenchmarkHash } from "./EvidenceBenchmarkHash.ts";
import { EvidenceBenchmarkMaterializer } from "./EvidenceBenchmarkMaterializer.ts";
import { EvidenceBenchmarkPackage } from "./EvidenceBenchmarkPackage.ts";
import { EvidenceBenchmarkProcess } from "./EvidenceBenchmarkProcess.ts";
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
    let preserveFailure: boolean = false;
    try {
      const fixture: string = path.join(temporary, "fixture");
      createFixture(repository, fixture);
      await testPinnedPnpm(repository);
      await testPinnedSetup(temporary);
      await testRepositoryInputs(repository);
      await testRetentionIgnore(repository);
      await testCorpusAdapters(temporary);
      await testComposition(fixture, temporary);
      await testMaterialization(repository, temporary);
      if (args.includes("--baseline"))
        await testBaseline(repository, temporary);
      if (args.includes("--package")) await testPackage(repository, temporary);
      console.log(
        `Benchmark self-test passed${args.includes("--baseline") ? " with neutral baseline" : ""}${args.includes("--package") ? " with package smoke" : ""}.`,
      );
    } catch (error) {
      preserveFailure = args.includes("--baseline");
      if (preserveFailure)
        console.error(
          `Baseline self-test failure retained its diagnostics at ${temporary}.`,
        );
      throw error;
    } finally {
      if (!preserveFailure)
        fs.rmSync(temporary, { recursive: true, force: true });
    }
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
        "benchmark/template/plain/.agents/skills/completeness/extra.md",
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
        "benchmark/template/plain/.agents/skills/completeness/SKILL.md",
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
        "packages/frontend/src/lib/client.ts",
        "packages/frontend/src/lib/config.ts",
      ])
        assert.ok(
          composition.files.has(relative),
          `integrated ${arm} scaffold is missing authored source ${relative}`,
        );
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
      const hasInventory: boolean =
        fs.existsSync(path.join(subject, "acceptance-criteria.jsonl")) ||
        fs.existsSync(path.join(subject, "metadata.json"));
      if (hasInventory) {
        const corpus: EvidenceBenchmarkCorpus.IResult =
          EvidenceBenchmarkCorpus.read(subject);
        if (entry.name === "erp") {
          assert.equal(corpus.h2, 261);
          assert.equal(corpus.h3, 1_344);
          assert.equal(corpus.atomicAcceptanceClauses, 1_724);
          assert.equal(corpus.contextCriteria, 986);
        }
      } else
        await expectFailure(
          () => EvidenceBenchmarkCorpus.read(subject),
          "no audited machine-readable inventory",
        );
    }
  }

  async function testRetentionIgnore(repository: string): Promise<void> {
    for (const relative of [
      "benchmark/result/todo/evidence/runs/example/logs/stderr.raw.log",
      "benchmark/result/todo/evidence/runs/example/gates/format.stdout.log",
      "benchmark/result/todo/evidence/workspace/.benchmark-deps/e-deadbeef.tgz",
    ]) {
      const result = await EvidenceBenchmarkProcess.run(
        "git",
        ["check-ignore", "--no-index", relative],
        {
          cwd: repository,
          allowFailure: true,
          label: `check retained benchmark artifact ${relative}`,
        },
      );
      assert.equal(
        result.status,
        1,
        `canonical result artifact must remain trackable: ${relative}`,
      );
    }
    for (const relative of [
      "benchmark/.work/todo/evidence/terminal/stderr.raw.log",
      "benchmark/not-result/stray.log",
      "benchmark/not-result/stray.tgz",
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
        `non-result artifact must remain ignored: ${relative}`,
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
            "@ttsc/lint": "0.23.0",
            ttsc: "0.23.0",
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
      environment: {
        ...process.env,
        npm_config_store_dir: path.join(cache, "pnpm-store"),
        TTSC_CACHE_DIR: path.join(cache, "ttsc"),
        TTSC_GO_CACHE_DIR: path.join(cache, "go-build"),
        GOCACHE: path.join(cache, "go-build"),
        GOTMPDIR: path.join(cache, "go-tmp"),
      },
    };
    const setup = await EvidenceBenchmarkSetup.prepare({
      materialization,
      arm: "plain",
    });
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

  async function testCorpusAdapters(temporary: string): Promise<void> {
    const root: string = path.join(temporary, "metadata-corpus");
    write(
      path.join(root, "00-corpus-contract.md"),
      "# Corpus Contract\n\nThe inventory is authoritative.\n",
    );
    write(
      path.join(root, "01-requirements.md"),
      "# Requirements\n\n## Area\n\n### REQ-ONE First\n\nBound behavior.\n",
    );
    const metadata = {
      schemaVersion: 1,
      subject: "metadata-corpus",
      documentInventory: {
        documents: [
          { path: "00-corpus-contract.md", h2: 0, h3: 0 },
          { path: "01-requirements.md", h2: 1, h3: 1 },
        ],
        totals: {
          documents: 2,
          h2: 1,
          h3: 1,
          atomicAcceptanceClauses: 1,
        },
      },
      sectionInventory: {
        headingPattern: "REQ-*",
        unit: "H3",
        states: ["present", "absent"],
      },
      atomicAcceptanceInventory: {
        unit: "criterion",
        states: ["satisfied", "unsatisfied"],
        scoringRule: "one point per clause",
        clauses: [
          {
            id: "AC-ONE",
            source: "01-requirements.md#REQ-ONE",
            criterion: "The first requirement is observable.",
          },
        ],
      },
    };
    write(
      path.join(root, "metadata.json"),
      `${JSON.stringify(metadata, null, 2)}\n`,
    );
    const result: EvidenceBenchmarkCorpus.IResult =
      EvidenceBenchmarkCorpus.read(root);
    assert.equal(result.inventory, "metadata.json");
    assert.equal(result.atomicAcceptanceClauses, 1);
    assert.equal(result.contextCriteria, 0);
    write(
      path.join(root, "00-corpus-contract.md"),
      "# Corpus Contract\r\n\r\nThe inventory is authoritative.\r\n",
    );
    const rawResult: EvidenceBenchmarkCorpus.IResult =
      EvidenceBenchmarkCorpus.read(root);
    assert.deepEqual(
      rawResult.files.get("00-corpus-contract.md"),
      fs.readFileSync(path.join(root, "00-corpus-contract.md")),
      "parser normalization must never rewrite copied corpus bytes",
    );

    const raw: string = path.join(temporary, "raw-corpus");
    fs.cpSync(root, raw, { recursive: true });
    fs.rmSync(path.join(raw, "metadata.json"));
    await expectFailure(
      () => EvidenceBenchmarkCorpus.read(raw),
      "no audited machine-readable inventory",
    );
    metadata.documentInventory.totals.h3 = 2;
    write(
      path.join(root, "metadata.json"),
      `${JSON.stringify(metadata, null, 2)}\n`,
    );
    await expectFailure(
      () => EvidenceBenchmarkCorpus.read(root),
      "total h3 must be 1",
    );

    const dual: string = path.join(temporary, "dual-corpus");
    createDualCorpus(dual);
    const dualResult: EvidenceBenchmarkCorpus.IResult =
      EvidenceBenchmarkCorpus.read(dual);
    assert.equal(dualResult.inventory, "acceptance-criteria.jsonl");
    assert.equal(dualResult.h2, 2);
    assert.equal(dualResult.h3, 2);
    assert.equal(dualResult.atomicAcceptanceClauses, 2);
    assert.equal(dualResult.contextCriteria, 3);

    const missingContext: string = path.join(temporary, "missing-context");
    fs.cpSync(dual, missingContext, { recursive: true });
    write(
      path.join(missingContext, "context-criteria.jsonl"),
      `${readJsonLines(path.join(missingContext, "context-criteria.jsonl"))
        .slice(0, 2)
        .map((row) => JSON.stringify(row))
        .join("\n")}\n`,
    );
    writeCorpusManifest(missingContext, {
      h2: 2,
      h3: 2,
      acceptanceCriteria: 2,
      contextCriteria: 2,
    });
    await expectFailure(
      () => EvidenceBenchmarkCorpus.read(missingContext),
      "does not cover every REQ H2",
    );

    const wrongSource: string = path.join(temporary, "wrong-context-source");
    fs.cpSync(dual, wrongSource, { recursive: true });
    const wrongSourceRows: Record<string, unknown>[] = readJsonLines(
      path.join(wrongSource, "context-criteria.jsonl"),
    );
    wrongSourceRows[2]!.source = "00-toc.md";
    write(
      path.join(wrongSource, "context-criteria.jsonl"),
      `${wrongSourceRows.map((row) => JSON.stringify(row)).join("\n")}\n`,
    );
    writeCorpusManifest(wrongSource, {
      h2: 2,
      h3: 2,
      acceptanceCriteria: 2,
      contextCriteria: 3,
    });
    await expectFailure(
      () => EvidenceBenchmarkCorpus.read(wrongSource),
      "does not own REQ H2",
    );

    const drifted: string = path.join(temporary, "drifted-corpus");
    fs.cpSync(dual, drifted, { recursive: true });
    fs.appendFileSync(path.join(drifted, "00-toc.md"), "\nDrift.\n", "utf8");
    await expectFailure(
      () => EvidenceBenchmarkCorpus.read(drifted),
      "file hash drifted",
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
      preparedAt: "2000-01-01T00:00:00.000Z",
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
    assert.equal(manifest.artifact.sha256, props.artifact.sha256);
    assert.deepEqual(manifest.corpus, {
      documents: corpus.documents,
      h2: corpus.h2,
      h3: corpus.h3,
      atomicAcceptanceClauses: corpus.atomicAcceptanceClauses,
      contextCriteria: corpus.contextCriteria,
      inventory: corpus.inventory,
    });
    if (props.project === "erp") {
      const analysis: string = path.join(
        props.cell.workspace,
        "docs",
        "analysis",
      );
      const validation: EvidenceBenchmarkProcess.IResult =
        EvidenceBenchmarkProcess.runSync(
          process.execPath,
          [path.join(analysis, "validate.mjs")],
          {
            cwd: analysis,
            label: `${props.project}/${props.arm} copied corpus validator`,
          },
        );
      assert.match(validation.stdout, /"contextCriteria":986/);
    }
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
    createAcceptanceInventory(path.join(target, "requirements", "todo"));
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
          "completeness",
          "SKILL.md",
        ),
        "---\nname: completeness\ndescription: Self-test completeness instructions.\n---\n# Completeness\n\nFixture body.\n",
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
            "@ttsc/lint": "0.23.0",
            ttsc: "0.23.0",
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

  function createAcceptanceInventory(root: string): void {
    const location: string = path.join(root, "acceptance-criteria.jsonl");
    if (fs.existsSync(location)) return;
    const clauses: string[] = [];
    let sequence: number = 0;
    for (const [relative, content] of EvidenceBenchmarkHash.directory(root)) {
      if (!relative.endsWith(".md")) continue;
      const source: string = Buffer.from(content).toString("utf8");
      for (const match of source.matchAll(
        /^### (REQ-[A-Za-z0-9._-]+)(?::|\s|$)/gm,
      )) {
        ++sequence;
        clauses.push(
          JSON.stringify({
            id: `AC-${sequence}`,
            requirement: match[1],
            source: relative,
            criterion: `Exercise ${match[1]} in the self-test fixture.`,
          }),
        );
      }
    }
    write(location, `${clauses.join("\n")}\n`);
  }

  function createDualCorpus(root: string): void {
    write(
      path.join(root, "00-corpus-contract.md"),
      [
        "# Corpus Contract",
        "",
        "## Protocol",
        "",
        "````md",
        "### REQ-HIDDEN-001 Hidden by a longer fence",
        "```",
        "~~~",
        "````",
        "",
      ].join("\n"),
    );
    write(
      path.join(root, "00-toc.md"),
      "# Corpus Contents\n\nEvery file is frozen.\n",
    );
    write(
      path.join(root, "01-requirements.md"),
      [
        "# Requirements",
        "",
        "## REQ-GROUP-A: Group A",
        "",
        "First group context. Second group context.",
        "",
        "### REQ-GROUP-A-001: First leaf",
        "",
        "First leaf behavior.",
        "",
        "## REQ-GROUP-B: Group B",
        "",
        "Third group context.",
        "",
        "### REQ-GROUP-B-001: Second leaf",
        "",
        "Second leaf behavior.",
        "",
      ].join("\n"),
    );
    write(
      path.join(root, "acceptance-criteria.jsonl"),
      [
        {
          id: "REQ-GROUP-A-001.AC-01",
          requirement: "REQ-GROUP-A-001",
          source: "01-requirements.md",
          criterion: "First leaf behavior.",
        },
        {
          id: "REQ-GROUP-B-001.AC-01",
          requirement: "REQ-GROUP-B-001",
          source: "01-requirements.md",
          criterion: "Second leaf behavior.",
        },
      ]
        .map((row) => JSON.stringify(row))
        .join("\n") + "\n",
    );
    write(
      path.join(root, "context-criteria.jsonl"),
      [
        {
          id: "REQ-GROUP-A.CTX-01",
          requirement: "REQ-GROUP-A",
          source: "01-requirements.md",
          criterion: "First group context.",
        },
        {
          id: "REQ-GROUP-A.CTX-02",
          requirement: "REQ-GROUP-A",
          source: "01-requirements.md",
          criterion: "Second group context.",
        },
        {
          id: "REQ-GROUP-B.CTX-01",
          requirement: "REQ-GROUP-B",
          source: "01-requirements.md",
          criterion: "Third group context.",
        },
      ]
        .map((row) => JSON.stringify(row))
        .join("\n") + "\n",
    );
    write(
      path.join(root, "validate.mjs"),
      'process.stdout.write("dual corpus fixture valid\\n");\n',
    );
    writeCorpusManifest(root, {
      h2: 2,
      h3: 2,
      acceptanceCriteria: 2,
      contextCriteria: 3,
    });
  }

  function writeCorpusManifest(
    root: string,
    counts: {
      h2: number;
      h3: number;
      acceptanceCriteria: number;
      contextCriteria: number;
    },
  ): void {
    const files: Map<string, Uint8Array> =
      EvidenceBenchmarkHash.directory(root);
    files.delete("corpus-manifest.json");
    const paths: string[] = [...files.keys()].sort();
    const chunks: Uint8Array[] = [];
    const entries = paths.map((relative) => {
      const content: Uint8Array = files.get(relative)!;
      chunks.push(
        Buffer.from(relative, "utf8"),
        Buffer.from([0]),
        content,
        Buffer.from([0]),
      );
      return {
        path: relative,
        sha256: EvidenceBenchmarkHash.bytes(content),
      };
    });
    write(
      path.join(root, "corpus-manifest.json"),
      `${JSON.stringify(
        {
          schemaVersion: 1,
          ...counts,
          files: entries,
          aggregateSha256: EvidenceBenchmarkHash.bytes(Buffer.concat(chunks)),
        },
        null,
        2,
      )}\n`,
    );
  }

  function readJsonLines(location: string): Record<string, unknown>[] {
    return fs
      .readFileSync(location, "utf8")
      .split(/\r?\n/)
      .filter((line) => line.length !== 0)
      .map((line) => JSON.parse(line) as Record<string, unknown>);
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
