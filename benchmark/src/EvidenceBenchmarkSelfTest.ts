import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { EvidenceBenchmarkCorpus } from "./EvidenceBenchmarkCorpus.ts";
import { EvidenceBenchmarkHash } from "./EvidenceBenchmarkHash.ts";
import { EvidenceBenchmarkMaterializer } from "./EvidenceBenchmarkMaterializer.ts";
import { EvidenceBenchmarkPackage } from "./EvidenceBenchmarkPackage.ts";
import { EvidenceBenchmarkProcess } from "./EvidenceBenchmarkProcess.ts";
import { EvidenceBenchmarkTemplate } from "./EvidenceBenchmarkTemplate.ts";
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
      await testRepositoryInputs(repository);
      await testCorpusAdapters(temporary);
      await testComposition(fixture, temporary);
      await testMaterialization(fixture, temporary);
      if (args.includes("--package")) await testPackage(repository, temporary);
      console.log(
        `Benchmark self-test passed${args.includes("--package") ? " with package smoke" : ""}.`,
      );
    } finally {
      fs.rmSync(temporary, { recursive: true, force: true });
    }
  }

  async function testComposition(
    fixture: string,
    temporary: string,
  ): Promise<void> {
    const variables: Readonly<Record<string, string>> = {
      name: "self-test",
      apiPackageName: "@self-test/api",
    };
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

    const collision: string = path.join(temporary, "collision");
    fs.cpSync(fixture, collision, { recursive: true });
    write(
      path.join(collision, "benchmark/template/plain/CLAUDE.md"),
      "@AGENTS.md\n",
    );
    await expectFailure(
      () =>
        EvidenceBenchmarkTemplate.compose({
          template: path.join(collision, "benchmark", "template"),
          arm: "plain",
          variables,
        }),
      "collision is not authorized",
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
  }

  async function testRepositoryInputs(repository: string): Promise<void> {
    const template: string = path.join(repository, "benchmark", "template");
    for (const arm of ["evidence", "plain"] as const) {
      try {
        const composition: EvidenceBenchmarkTemplate.IComposition =
          EvidenceBenchmarkTemplate.compose({
            template,
            arm,
            variables: {
              name: "integrated-self-test",
              apiPackageName: "@integrated-self-test/api",
            },
          });
        assert.ok(composition.files.size > 0);
      } catch (error) {
        if (
          error instanceof Error &&
          error.message.includes("base template is missing required paths")
        ) {
          console.log(
            `Integrated ${arm} template launch gate remains closed: ${error.message}`,
          );
          continue;
        }
        throw error;
      }
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
      if (hasInventory) EvidenceBenchmarkCorpus.read(subject);
      else
        await expectFailure(
          () => EvidenceBenchmarkCorpus.read(subject),
          "no audited machine-readable inventory",
        );
    }
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
  }

  async function testMaterialization(
    fixture: string,
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
      pnpmVersion: "10.10.0",
      nodeVersion: process.version,
      platform: process.platform,
      architecture: process.arch,
    };
    const variables: Readonly<Record<string, string>> = {
      name: "self-test",
      apiPackageName: "@self-test/api",
    };
    const evidenceOne = await EvidenceBenchmarkMaterializer.materialize({
      repository: fixture,
      output: path.join(temporary, "evidence-one"),
      project: "todo",
      arm: "evidence",
      variables,
      artifact,
    });
    const evidenceTwo = await EvidenceBenchmarkMaterializer.materialize({
      repository: fixture,
      output: path.join(temporary, "evidence-two"),
      project: "todo",
      arm: "evidence",
      variables,
      artifact,
    });
    const plain = await EvidenceBenchmarkMaterializer.materialize({
      repository: fixture,
      output: path.join(temporary, "plain"),
      project: "todo",
      arm: "plain",
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
    const evidenceManifest: Record<string, unknown> = JSON.parse(
      fs.readFileSync(evidenceOne.manifest, "utf8"),
    );
    const plainManifest: Record<string, unknown> = JSON.parse(
      fs.readFileSync(plain.manifest, "utf8"),
    );
    assert.equal(
      (
        JSON.parse(
          fs.readFileSync(
            path.join(evidenceOne.workspace, "package.json"),
            "utf8",
          ),
        ) as { devDependencies: Record<string, string> }
      ).devDependencies["@samchon/lint-plugin-evidence"],
      "file:.benchmark-deps/e-" + `${artifact.sha256.slice(0, 12)}.tgz`,
    );
    assert.ok(
      fs.existsSync(
        path.join(
          evidenceOne.workspace,
          `.benchmark-deps/e-${artifact.sha256.slice(0, 12)}.tgz`,
        ),
      ),
    );
    assert.equal(
      fs.existsSync(path.join(plain.workspace, ".benchmark-deps")),
      false,
    );
    assert.equal(
      (
        plainManifest.artifact as {
          sha256: string;
          relativeArchive?: string;
        }
      ).sha256,
      artifact.sha256,
    );
    assert.equal(
      (
        plainManifest.artifact as {
          relativeArchive?: string;
        }
      ).relativeArchive,
      undefined,
    );
    assert.equal(
      (evidenceManifest.artifact as { sha256: string }).sha256,
      artifact.sha256,
    );
    const requirementRelative: string = EvidenceBenchmarkHash.directory(
      path.join(fixture, "benchmark/requirements/todo"),
    )
      .keys()
      .next().value!;
    assert.deepEqual(
      fs.readFileSync(
        path.join(evidenceOne.workspace, "docs/analysis", requirementRelative),
      ),
      fs.readFileSync(
        path.join(evidenceOne.immutableInputs, requirementRelative),
      ),
    );
    assert.deepEqual(
      fs.readFileSync(
        path.join(
          evidenceOne.workspace,
          "docs/analysis/acceptance-criteria.jsonl",
        ),
      ),
      fs.readFileSync(
        path.join(evidenceOne.immutableInputs, "acceptance-criteria.jsonl"),
      ),
      "machine-readable corpus files must be copied with the Markdown",
    );
    assert.ok(
      (evidenceManifest.corpus as { atomicAcceptanceClauses: number })
        .atomicAcceptanceClauses > 0,
    );
    assert.equal(
      fs.readdirSync(temporary).some((entry) => entry.includes(".tmp")),
      false,
      "materializer must not leak staging directories",
    );
    await expectFailure(
      () =>
        EvidenceBenchmarkMaterializer.materialize({
          repository: fixture,
          output: evidenceOne.root,
          project: "todo",
          arm: "evidence",
          variables,
          artifact,
        }),
      "refuses to overwrite",
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

  function writeIfMissing(location: string, content: string): void {
    if (fs.existsSync(location)) return;
    write(location, content);
  }

  function write(location: string, content: string): void {
    fs.mkdirSync(path.dirname(location), { recursive: true });
    fs.writeFileSync(location, content, "utf8");
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
