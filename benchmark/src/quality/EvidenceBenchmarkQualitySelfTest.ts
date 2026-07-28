import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { EvidenceBenchmarkHash } from "../EvidenceBenchmarkHash.ts";
import { EvidenceBenchmarkArtifactInventory } from "../quality/EvidenceBenchmarkArtifactInventory.ts";
import { EvidenceBenchmarkCoverage } from "../quality/EvidenceBenchmarkCoverage.ts";
import { EvidenceBenchmarkHiddenAcceptance } from "../quality/EvidenceBenchmarkHiddenAcceptance.ts";
import { EvidenceBenchmarkMutation } from "../quality/EvidenceBenchmarkMutation.ts";

/** Exercises deterministic quality producers without a model or generated app. */
export namespace EvidenceBenchmarkQualitySelfTest {
  const benchmarkRoot: string = path.resolve(import.meta.dirname, "../..");
  const temporary: string = fs.mkdtempSync(
    path.join(os.tmpdir(), "evidence-quality-self-test-"),
  );

  /** Runs valid, invalid, restoration, and production-absence fixtures. */
  export async function main(): Promise<void> {
    try {
      verifyFrozenTodoAndReddit();
      const workspace: string = createWorkspace();
      testInventory(workspace);
      testCoverage(workspace);
      await testMutation(workspace);
      await testHiddenAdapter(workspace);
      console.log("Benchmark deterministic quality self-test passed.");
    } finally {
      fs.rmSync(temporary, { recursive: true, force: true });
    }
  }

  function verifyFrozenTodoAndReddit(): void {
    for (const subject of ["todo", "reddit"] as const) {
      const manifest = EvidenceBenchmarkHiddenAcceptance.manifest(
        path.join(
          benchmarkRoot,
          "quality",
          "hidden",
          `${subject}.manifest.json`,
        ),
      );
      EvidenceBenchmarkHiddenAcceptance.verifyCorpus(
        manifest,
        path.join(benchmarkRoot, "requirements", subject),
      );
    }
  }

  function createWorkspace(): string {
    const workspace: string = path.join(temporary, "workspace");
    write(
      path.join(workspace, "package.json"),
      `${JSON.stringify(
        {
          private: true,
          scripts: {
            build: "tsc --noEmit",
            test: "node tests/check.mjs",
            "test:disabled": "node tests/check.mjs || true",
          },
        },
        null,
        2,
      )}\n`,
    );
    write(
      path.join(workspace, "packages/app/src/domain.ts"),
      [
        "export const enabled: boolean = true;",
        "export const accepts = (value: number): boolean => value >= 1;",
        "// TODO: fixture inventory witness",
        "",
      ].join("\n"),
    );
    write(
      path.join(workspace, "packages/app/tests/domain.spec.ts"),
      [
        'import { test } from "node:test";',
        'test.skip("fixture skipped witness", () => undefined);',
        "",
      ].join("\n"),
    );
    write(
      path.join(workspace, "tests/check.mjs"),
      'process.stdout.write("fixture test\\n");\n',
    );
    return workspace;
  }

  function testInventory(workspace: string): void {
    const inventory = EvidenceBenchmarkArtifactInventory.inspect(workspace);
    assert.ok(inventory.files >= 4);
    assert.ok(inventory.sourceFiles >= 3);
    assert.ok(inventory.testFiles >= 2);
    assert.ok(
      inventory.findings.some((finding) => finding.category === "todo"),
    );
    assert.ok(
      inventory.findings.some((finding) => finding.category === "skipped_test"),
    );
    assert.ok(
      inventory.findings.some(
        (finding) => finding.category === "disabled_gate",
      ),
    );
  }

  function testCoverage(workspace: string): void {
    const source: string = path.join(workspace, "packages/app/src/domain.ts");
    const istanbulPath: string = path.join(temporary, "coverage-final.json");
    write(
      istanbulPath,
      `${JSON.stringify({
        [source]: {
          path: source,
          statementMap: {
            "0": {
              start: { line: 1, column: 0 },
              end: { line: 1, column: 37 },
            },
            "1": {
              start: { line: 2, column: 0 },
              end: { line: 2, column: 70 },
            },
          },
          fnMap: {
            "0": {
              name: "accepts",
              decl: {
                start: { line: 2, column: 13 },
                end: { line: 2, column: 20 },
              },
              loc: {
                start: { line: 2, column: 23 },
                end: { line: 2, column: 70 },
              },
            },
          },
          branchMap: {
            "0": {
              type: "binary-expr",
              locations: [
                {
                  start: { line: 2, column: 60 },
                  end: { line: 2, column: 61 },
                },
                {
                  start: { line: 2, column: 64 },
                  end: { line: 2, column: 65 },
                },
              ],
            },
          },
          s: { "0": 1, "1": 0 },
          f: { "0": 1 },
          b: { "0": [1, 0] },
        },
      })}\n`,
    );
    const istanbul = EvidenceBenchmarkCoverage.istanbul(
      workspace,
      istanbulPath,
    );
    assert.deepEqual(istanbul.lines, { covered: 1, total: 2, ratio: 0.5 });
    assert.deepEqual(istanbul.branches, {
      covered: 1,
      total: 2,
      ratio: 0.5,
    });
    assert.deepEqual(istanbul.functions, {
      covered: 1,
      total: 1,
      ratio: 1,
    });
    const lcovPath: string = path.join(temporary, "lcov.info");
    write(
      lcovPath,
      [
        `SF:${source}`,
        "FNDA:1,accepts",
        "DA:1,1",
        "DA:2,0",
        "BRDA:2,0,0,1",
        "BRDA:2,0,1,-",
        "end_of_record",
        "",
      ].join("\n"),
    );
    const lcov = EvidenceBenchmarkCoverage.lcov(workspace, lcovPath);
    assert.equal(lcov.statements, null);
    assert.equal(lcov.lines.ratio, 0.5);
    const escaped: string = path.join(temporary, "escaped-coverage.json");
    write(
      escaped,
      `${JSON.stringify({
        [path.join(temporary, "outside.ts")]: {
          statementMap: {},
          s: {},
          f: {},
          b: {},
        },
      })}\n`,
    );
    assert.throws(
      () => EvidenceBenchmarkCoverage.istanbul(workspace, escaped),
      /escapes the workspace/u,
    );
  }

  async function testMutation(workspace: string): Promise<void> {
    const plan = EvidenceBenchmarkMutation.plan({
      workspace,
      seed: "quality-self-test-v1",
      sampleSize: 2,
    });
    assert.equal(plan.mutations.length, 2);
    const originalTree: string = plan.workspaceSourceTreeSha256;
    const killed = await EvidenceBenchmarkMutation.execute({
      workspace,
      output: path.join(temporary, "mutation-killed"),
      plan,
      test: {
        command: process.execPath,
        arguments: ["-e", "process.exit(1)"],
        cwd: workspace,
        timeoutMs: 5_000,
      },
    });
    assert.ok(killed.every((result) => result.status === "killed"));
    assert.ok(killed.every((result) => result.restored));
    const survived = await EvidenceBenchmarkMutation.execute({
      workspace,
      output: path.join(temporary, "mutation-survived"),
      plan,
      test: {
        command: process.execPath,
        arguments: ["-e", "process.exit(0)"],
        cwd: workspace,
        timeoutMs: 5_000,
      },
    });
    assert.ok(survived.every((result) => result.status === "survived"));
    assert.equal(
      EvidenceBenchmarkArtifactInventory.treeSha256(
        EvidenceBenchmarkArtifactInventory.authoredFiles(workspace),
      ),
      originalTree,
    );
  }

  async function testHiddenAdapter(workspace: string): Promise<void> {
    const fixtureBenchmark: string = path.join(temporary, "benchmark");
    const requirements: string = path.join(fixtureBenchmark, "requirements");
    write(
      path.join(requirements, "01.md"),
      "# Fixture\n\n## Area\n\n### REQ-ONE\n\nFixture.\n",
    );
    write(
      path.join(requirements, "acceptance-criteria.jsonl"),
      [
        JSON.stringify({
          id: "REQ-ONE.AC-01",
          requirement: "REQ-ONE",
          source: "01.md",
          criterion: "HTTP behavior works.",
        }),
        JSON.stringify({
          id: "REQ-ONE.AC-02",
          requirement: "REQ-ONE",
          source: "01.md",
          criterion: "Browser behavior works.",
        }),
        "",
      ].join("\n"),
    );
    const adapterPath: string = path.join(
      fixtureBenchmark,
      "quality/adapters/fixture/index.ts",
    );
    write(adapterPath, fakeAdapterSource());
    const adapterRoot: string = path.dirname(adapterPath);
    const requirementsTreeSha256: string =
      EvidenceBenchmarkArtifactInventory.treeSha256(
        EvidenceBenchmarkHash.directory(requirements),
      );
    const catalogPath: string = path.join(
      requirements,
      "acceptance-criteria.jsonl",
    );
    const manifestPath: string = path.join(
      fixtureBenchmark,
      "quality/hidden/fixture.manifest.json",
    );
    write(
      manifestPath,
      `${JSON.stringify(
        {
          schemaVersion: 1,
          suiteId: "fixture-hidden-v1",
          freezeId: "fixture-freeze-v1",
          subject: "todo",
          requirementsTreeSha256,
          acceptanceCatalog: {
            sha256: EvidenceBenchmarkHash.file(catalogPath),
            count: 2,
          },
          adapter: {
            module: "quality/adapters/fixture/index.ts",
            sha256: EvidenceBenchmarkHash.file(adapterPath),
            closure: {
              root: "quality/adapters/fixture",
              files: 1,
              treeSha256: EvidenceBenchmarkArtifactInventory.treeSha256(
                EvidenceBenchmarkHash.directory(adapterRoot),
              ),
            },
            exportName: "adapter",
          },
          cases: [
            {
              id: "FIXTURE-HTTP",
              criterionIds: ["REQ-ONE.AC-01"],
              kind: "http",
              routeState: null,
              viewports: [],
            },
            {
              id: "FIXTURE-BROWSER",
              criterionIds: ["REQ-ONE.AC-02"],
              kind: "browser",
              routeState: "fixture-state",
              viewports: ["mobile", "tablet", "desktop"],
            },
          ],
        },
        null,
        2,
      )}\n`,
    );
    const valid = await EvidenceBenchmarkHiddenAcceptance.run({
      benchmarkRoot: fixtureBenchmark,
      manifestPath,
      requirements,
      workspace,
      output: path.join(temporary, "hidden-valid"),
    });
    assert.equal(valid.status, "passed");
    assert.equal(valid.result?.browser.length, 3);
    const frozenTodo = await EvidenceBenchmarkHiddenAcceptance.run({
      benchmarkRoot,
      manifestPath: path.join(
        benchmarkRoot,
        "quality/hidden/todo.manifest.json",
      ),
      requirements: path.join(benchmarkRoot, "requirements/todo"),
      workspace,
      output: path.join(temporary, "hidden-blocked"),
    });
    assert.equal(frozenTodo.status, "blocked");
    assert.equal(frozenTodo.result, null);
    const incompleteManifest: Record<string, unknown> = JSON.parse(
      fs.readFileSync(manifestPath, "utf8"),
    ) as Record<string, unknown>;
    incompleteManifest.suiteId = "fixture-incomplete-v1";
    const incompletePath: string = path.join(
      fixtureBenchmark,
      "quality/hidden/incomplete.manifest.json",
    );
    write(incompletePath, `${JSON.stringify(incompleteManifest, null, 2)}\n`);
    const incomplete = await EvidenceBenchmarkHiddenAcceptance.run({
      benchmarkRoot: fixtureBenchmark,
      manifestPath: incompletePath,
      requirements,
      workspace,
      output: path.join(temporary, "hidden-incomplete"),
    });
    assert.equal(incomplete.status, "failed");
    assert.match(incomplete.reason ?? "", /exact frozen set/u);
    const invalidManifest: Record<string, unknown> =
      structuredClone(incompleteManifest);
    invalidManifest.cases = [];
    const invalidPath: string = path.join(
      fixtureBenchmark,
      "quality/hidden/invalid.manifest.json",
    );
    write(invalidPath, `${JSON.stringify(invalidManifest, null, 2)}\n`);
    assert.throws(
      () => EvidenceBenchmarkHiddenAcceptance.manifest(invalidPath),
      /at least one case/u,
    );
  }

  function fakeAdapterSource(): string {
    return `
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const digest = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
const viewports = {
  mobile: { width: 390, height: 844 },
  tablet: { width: 768, height: 1024 },
  desktop: { width: 1440, height: 900 },
};
const write = (location, bytes) => {
  fs.mkdirSync(path.dirname(location), { recursive: true });
  fs.writeFileSync(location, bytes);
};
const png = (width, height) => {
  const bytes = Buffer.alloc(24);
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(bytes, 0);
  bytes.writeUInt32BE(13, 8);
  bytes.write("IHDR", 12, "ascii");
  bytes.writeUInt32BE(width, 16);
  bytes.writeUInt32BE(height, 20);
  return bytes;
};
export const adapter = {
  schemaVersion: 1,
  async execute(input) {
    const hidden = [];
    const browser = [];
    if (input.manifest.suiteId.includes("incomplete"))
      return {
        schemaVersion: 1,
        suiteId: input.manifest.suiteId,
        subject: input.manifest.subject,
        workspaceSourceTreeSha256: input.workspaceSourceTreeSha256,
        hidden,
        browser,
      };
    for (const test of input.manifest.cases) {
      if (test.kind === "http") {
        const relative = "http/" + test.id + ".json";
        const content = Buffer.from(JSON.stringify({ passed: true }) + "\\n");
        write(path.join(input.output, relative), content);
        hidden.push({
          caseId: test.id,
          status: "passed",
          startedMonotonicNs: "1",
          completedMonotonicNs: "2",
          artifact: relative,
          artifactSha256: digest(content),
        });
      } else for (const viewport of test.viewports) {
        const dimensions = viewports[viewport];
        const screenshotRelative = "browser/" + test.id + "-" + viewport + ".png";
        const screenshot = png(dimensions.width, dimensions.height);
        write(path.join(input.output, screenshotRelative), screenshot);
        const axeRelative = "browser/" + test.id + "-" + viewport + ".axe.json";
        const axe = Buffer.from(JSON.stringify({
          engine: "axe-core",
          engineVersion: "4.10.0",
          rulesetSha256: "${"a".repeat(64)}",
          violations: [],
        }) + "\\n");
        write(path.join(input.output, axeRelative), axe);
        browser.push({
          caseId: test.id,
          viewport,
          routeState: test.routeState,
          requestedUrl: "http://127.0.0.1:4173/",
          finalUrl: "http://127.0.0.1:4173/",
          status: "passed",
          startedMonotonicNs: "3",
          completedMonotonicNs: "4",
          screenshot: {
            path: screenshotRelative,
            sha256: digest(screenshot),
            width: dimensions.width,
            height: dimensions.height,
          },
          accessibility: {
            artifact: axeRelative,
            sha256: digest(axe),
            engine: "axe-core",
            engineVersion: "4.10.0",
            rulesetSha256: "${"a".repeat(64)}",
            violations: 0,
          },
        });
      }
    }
    return {
      schemaVersion: 1,
      suiteId: input.manifest.suiteId,
      subject: input.manifest.subject,
      workspaceSourceTreeSha256: input.workspaceSourceTreeSha256,
      hidden,
      browser,
    };
  },
};
`.trimStart();
  }

  function write(location: string, content: string): void {
    fs.mkdirSync(path.dirname(location), { recursive: true });
    fs.writeFileSync(location, content, "utf8");
  }
}
