import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { EvidenceBenchmarkCorpus } from "../EvidenceBenchmarkCorpus.ts";
import { EvidenceBenchmarkHash } from "../EvidenceBenchmarkHash.ts";
import { EvidenceBenchmarkProtocolValidatorTest } from "../EvidenceBenchmarkProtocolValidatorTest.ts";
import { EvidenceBenchmarkAcceptanceCatalog } from "../grading/EvidenceBenchmarkAcceptanceCatalog.ts";
import { EvidenceBenchmarkBlindBundle } from "../grading/EvidenceBenchmarkBlindBundle.ts";
import { EvidenceBenchmarkGradingPlan } from "../grading/EvidenceBenchmarkGradingPlan.ts";
import { EvidenceBenchmarkQualityCoverage } from "../grading/EvidenceBenchmarkQualityCoverage.ts";
import { EvidenceBenchmarkQualityGrade } from "../grading/EvidenceBenchmarkQualityGrade.ts";
import { EvidenceBenchmarkQualityPostprocess } from "../reporting/EvidenceBenchmarkQualityPostprocess.ts";
import { EvidenceBenchmarkQualityReport } from "../reporting/EvidenceBenchmarkQualityReport.ts";
import type { IEvidenceBenchmarkQualityGrade } from "../structures/IEvidenceBenchmarkQualityGrade.ts";
import type { IEvidenceBenchmarkQualityPostprocess } from "../structures/IEvidenceBenchmarkQualityPostprocess.ts";
import type { IEvidenceBenchmarkQualityReport } from "../structures/IEvidenceBenchmarkQualityReport.ts";

/** Runs deterministic, paid-call-free quality protocol regression tests. */
export namespace EvidenceBenchmarkQualityTest {
  const SHA = {
    rubric: digest("rubric"),
    prompt: digest("prompt"),
    provider: digest("provider-grade-schema"),
    local: digest("local-grade-schema"),
    armProvider: digest("provider-arm-schema"),
    armLocal: digest("local-arm-schema"),
    adjudicationProvider: digest("provider-adjudication-schema"),
    adjudicationLocal: digest("local-adjudication-schema"),
    registry: digest("registry"),
  } as const;

  interface IFixture {
    catalog: IEvidenceBenchmarkQualityGrade.ICatalog;
    bundle: EvidenceBenchmarkBlindBundle.IResult;
    plan: IEvidenceBenchmarkQualityGrade.IBlockPlan;
    first: IEvidenceBenchmarkQualityGrade.IGrade;
    second: IEvidenceBenchmarkQualityGrade.IGrade;
    comparison: IEvidenceBenchmarkQualityGrade.IComparison;
    adjudication: IEvidenceBenchmarkQualityGrade.IAdjudication;
    phase: IEvidenceBenchmarkQualityReport.IPhase;
  }

  /** Executes catalog, blind-grade, report, and promotion regressions. */
  export async function main(benchmarkRoot: string): Promise<void> {
    const temporary: string = fs.mkdtempSync(
      path.join(os.tmpdir(), "evidence-quality-test-"),
    );
    try {
      EvidenceBenchmarkProtocolValidatorTest.main(
        path.join(benchmarkRoot, "protocol"),
      );
      testCatalogs(benchmarkRoot, temporary);
      const fixture: IFixture = createFixture(
        temporary,
        "quality-run",
        "t_done",
      );
      testBlindBundle(fixture, temporary);
      testGrading(fixture);
      await testReport(fixture, temporary);
      await testPostprocess(temporary);
      console.log(
        "Benchmark quality test passed with deterministic fake graders only.",
      );
    } finally {
      fs.rmSync(temporary, { recursive: true, force: true });
    }
  }

  function testCatalogs(benchmarkRoot: string, temporary: string): void {
    const expected: Record<
      IEvidenceBenchmarkQualityGrade.Subject,
      [number, number]
    > = {
      todo: [211, 0],
      reddit: [255, 0],
      shopping: [2083, 0],
      erp: [1724, 986],
    };
    for (const subject of Object.keys(
      expected,
    ) as Array<IEvidenceBenchmarkQualityGrade.Subject>) {
      const root: string = path.join(benchmarkRoot, "requirements", subject);
      const catalog = EvidenceBenchmarkAcceptanceCatalog.read(
        root,
        freeze(root, subject),
      );
      assert.deepEqual(
        [catalog.acceptance.length, catalog.context.length],
        expected[subject],
      );
      assert.equal(catalog.denominatorsSummed, false);
    }

    const todoSource: string = path.join(benchmarkRoot, "requirements", "todo");
    const lineEndingRoot: string = path.join(temporary, "crlf", "todo");
    fs.mkdirSync(path.dirname(lineEndingRoot), { recursive: true });
    fs.cpSync(todoSource, lineEndingRoot, { recursive: true });
    const markdown: string = path.join(lineEndingRoot, "01-actors-and-auth.md");
    fs.writeFileSync(
      markdown,
      fs.readFileSync(markdown, "utf8").replaceAll("\n", "\r\n"),
      "utf8",
    );
    expectThrow(
      () =>
        EvidenceBenchmarkAcceptanceCatalog.read(
          lineEndingRoot,
          freeze(lineEndingRoot, "todo"),
        ),
      "LF line endings",
    );

    const ownershipRoot: string = path.join(temporary, "ownership", "todo");
    fs.mkdirSync(path.dirname(ownershipRoot), { recursive: true });
    fs.cpSync(todoSource, ownershipRoot, { recursive: true });
    const inventory: string = path.join(
      ownershipRoot,
      "acceptance-criteria.jsonl",
    );
    const rows: string[] = fs.readFileSync(inventory, "utf8").split("\n");
    const first = JSON.parse(rows[0]!) as Record<string, unknown>;
    first.source = "05-non-functional.md";
    rows[0] = JSON.stringify(first);
    fs.writeFileSync(inventory, rows.join("\n"), "utf8");
    expectThrow(
      () =>
        EvidenceBenchmarkAcceptanceCatalog.read(
          ownershipRoot,
          freeze(ownershipRoot, "todo"),
        ),
      "does not map",
    );

    const frozen = freeze(todoSource, "todo");
    expectThrow(
      () =>
        EvidenceBenchmarkAcceptanceCatalog.read(todoSource, {
          ...frozen,
          acceptance: frozen.acceptance + 1,
        }),
      "frozen subject manifest",
    );
  }

  function testBlindBundle(fixture: IFixture, temporary: string): void {
    const changed = createBlindBundle(
      path.join(temporary, "tampered-manifest"),
      "t_done",
      "tampered-bundle",
    );
    const manifestPath: string = path.join(
      temporary,
      "tampered-manifest",
      "grading",
      "input",
      "t_done",
      "manifest.json",
    );
    const manifest = JSON.parse(
      fs.readFileSync(manifestPath, "utf8"),
    ) as Record<string, unknown>;
    manifest.readOnly = false;
    fs.writeFileSync(manifestPath, `${JSON.stringify(manifest)}\n`, "utf8");
    expectThrow(
      () =>
        EvidenceBenchmarkBlindBundle.read(
          path.join(temporary, "tampered-manifest"),
          "t_done",
        ),
      "manifest identity",
    );
    assert.equal(changed.phase, "t_done");

    const target: string = path.join(fixture.bundle.bundleRoot, "src/app.ts");
    const original: Buffer = fs.readFileSync(target);
    fs.appendFileSync(target, "// mutation\n", "utf8");
    expectThrow(
      () => EvidenceBenchmarkBlindBundle.verifyAfterGrade(fixture.bundle),
      "changed during grading",
    );
    fs.writeFileSync(target, original);
    EvidenceBenchmarkBlindBundle.verifyAfterGrade(fixture.bundle);
  }

  function testGrading(fixture: IFixture): void {
    assert.notEqual(fixture.first.gradeId, fixture.second.gradeId);
    assert.equal(fixture.comparison.humanAuditQueue.length, 2);
    assert.equal(fixture.adjudication.adjudicator.kind, "llm_adjudicator");
    assert.equal(fixture.adjudication.humanValidationStatus, "pending");
    assert.equal(fixture.adjudication.humanValidatedCompositeClaim, false);
    assert.equal(fixture.phase.coverage.acceptance.populationCount, 2);
    assert.equal(fixture.phase.coverage.context, null);

    const undersized = clone(fixture.plan);
    undersized.sizing.maximumOutputTokens = 1;
    resignPlan(undersized);
    expectThrow(
      () => EvidenceBenchmarkGradingPlan.verify(fixture.catalog, undersized),
      "output-token admission",
    );

    const overlapping = clone(fixture.plan);
    overlapping.blocks[0]!.criterionIds.push(
      overlapping.blocks[0]!.criterionIds[0]!,
    );
    resignPlan(overlapping);
    expectThrow(
      () => EvidenceBenchmarkGradingPlan.verify(fixture.catalog, overlapping),
      "partition",
    );

    const stale = clone(fixture.phase);
    ++stale.coverage.acceptance.full;
    expectThrow(
      () =>
        EvidenceBenchmarkQualityReport.validatePhase(
          "quality-run",
          "todo",
          stale,
        ),
      "stale projection",
    );

    const reused = adjudicationSubmission(
      fixture.plan,
      fixture.comparison,
      fixture.first,
      fixture.bundle.bundleId,
    );
    reused.provenance.threadId = fixture.first.sourceThreadIds[0]!;
    expectThrow(
      () =>
        EvidenceBenchmarkQualityGrade.adjudicate(
          fixture.first,
          fixture.second,
          fixture.comparison,
          fixture.plan,
          reused,
          fixture.bundle,
        ),
      "reused a source grader context",
    );
  }

  async function testReport(
    fixture: IFixture,
    temporary: string,
  ): Promise<void> {
    const failed: IEvidenceBenchmarkQualityReport.ICell[] = [
      failedCell("todo-plain", "todo", "plain", 1),
      failedCell("todo-evidence", "todo", "evidence", 2),
      failedCell("reddit-evidence", "reddit", "evidence", 3),
      failedCell("reddit-plain", "reddit", "plain", 4),
    ];
    const block = blockReport("block-report", failed);
    const markdown: string = EvidenceBenchmarkQualityReport.markdown(block);
    assert.doesNotMatch(
      markdown,
      /\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s+#\d+\b/i,
    );
    assert.match(markdown, /Acceptance and context are independent/);
    const ledger: string = path.join(temporary, "ledger");
    const first = await EvidenceBenchmarkQualityReport.append(ledger, block);
    assert.equal(first.sequence, 1);
    await assert.rejects(
      EvidenceBenchmarkQualityReport.append(ledger, block),
      /already appended/,
    );
    const stage: string = path.join(ledger, ".next-manual");
    fs.writeFileSync(stage, "interrupted");
    await assert.rejects(
      EvidenceBenchmarkQualityReport.read(ledger),
      /recoverable staged rows/,
    );
    const retained = await EvidenceBenchmarkQualityReport.recover(ledger);
    assert.equal(retained.length, 1);
    assert.equal((await EvidenceBenchmarkQualityReport.read(ledger)).length, 1);

    const exposed = clone(failed[0]!);
    exposed.publicTerminalReason = "D:\\private\\record\\failure.json";
    expectThrow(
      () => EvidenceBenchmarkQualityReport.validateCell(exposed),
      "invalid",
    );
    const closing = clone(failed[0]!);
    closing.publicTerminalReason = "Fixes #99";
    expectThrow(
      () => EvidenceBenchmarkQualityReport.validateCell(closing),
      "invalid",
    );

    const safetyDigest: string = digest("shared-safety-stop");
    const safety = failed.map((cell) => safetyCell(cell, safetyDigest));
    EvidenceBenchmarkQualityReport.create({
      ...blockReport("safety-block", safety),
      safetyLimit: {
        sharedStopDigest: safetyDigest,
        threshold: 100,
        observedTotalTokens: 110,
        hardCeilingGuaranteed: false,
      },
    });

    const wrongSafety = safety.map((cell) => clone(cell));
    wrongSafety[0]!.safetyLimit!.sharedStopDigest = digest("different-stop");
    expectThrow(
      () =>
        EvidenceBenchmarkQualityReport.create({
          ...blockReport("wrong-safety-block", wrongSafety),
          safetyLimit: {
            sharedStopDigest: safetyDigest,
            threshold: 100,
            observedTotalTokens: 110,
            hardCeilingGuaranteed: false,
          },
        }),
      "safety-stop evidence",
    );
    assert.equal(fixture.phase.adjudication.humanValidationStatus, "pending");
  }

  async function testPostprocess(temporary: string): Promise<void> {
    const core: string = path.join(temporary, "core-seal.json");
    fs.writeFileSync(core, '{"immutable":true}\n', "utf8");
    const coreSealSha256: string = EvidenceBenchmarkHash.file(core);
    const done: IFixture = createFixture(
      temporary,
      "quality-run",
      "t_done",
      coreSealSha256,
    );
    const dry: IFixture = createFixture(
      temporary,
      "quality-run",
      "t_dry",
      coreSealSha256,
    );
    const output: string = path.join(temporary, "postprocess");
    const seal = await EvidenceBenchmarkQualityPostprocess.write({
      runId: "quality-run",
      generationStatus: "completed",
      coreSealPath: core,
      outputDirectory: output,
      subject: "todo",
      safetyStopSha256: null,
      phases: [
        { report: done.phase, bundle: done.bundle },
        { report: dry.phase, bundle: dry.bundle },
      ],
      sealedAtUtc: "2026-07-29T00:00:04.000Z",
    });
    assert.equal(seal.requiredQualityComplete, true);
    EvidenceBenchmarkQualityPostprocess.verify(core, output);

    const incomplete: string = path.join(temporary, "incomplete-postprocess");
    await assert.rejects(
      EvidenceBenchmarkQualityPostprocess.write({
        runId: "quality-run",
        generationStatus: "completed",
        coreSealPath: core,
        outputDirectory: incomplete,
        subject: "todo",
        safetyStopSha256: null,
        phases: [{ report: done.phase, bundle: done.bundle }],
        sealedAtUtc: "2026-07-29T00:00:04.000Z",
      }),
      /exact t_done and t_dry/,
    );

    const coreBytes: Buffer = fs.readFileSync(core);
    fs.appendFileSync(core, "changed");
    expectThrow(
      () => EvidenceBenchmarkQualityPostprocess.verify(core, output),
      "postprocess seal",
    );
    fs.writeFileSync(core, coreBytes);

    const postprocessSealPath: string = path.join(
      output,
      "postprocess-seal.json",
    );
    const completed = completedCell(
      "quality-run",
      [done.phase, dry.phase],
      EvidenceBenchmarkHash.file(core),
      EvidenceBenchmarkHash.file(postprocessSealPath),
    );
    const cells: IEvidenceBenchmarkQualityReport.ICell[] = [
      completed,
      failedCell("todo-evidence-final", "todo", "evidence", 2),
      failedCell("reddit-evidence-final", "reddit", "evidence", 3),
      failedCell("reddit-plain-final", "reddit", "plain", 4),
    ];
    const ledgerRoot: string = path.join(temporary, "promotion-ledger");
    const row = await EvidenceBenchmarkQualityReport.append(
      ledgerRoot,
      blockReport("promotion-block", cells),
    );
    EvidenceBenchmarkQualityPostprocess.admitFinalPromotion(
      core,
      output,
      row,
      "quality-run",
    );
    expectThrow(
      () =>
        EvidenceBenchmarkQualityPostprocess.admitFinalPromotion(
          core,
          output,
          row,
          "missing-run",
        ),
      "complete core",
    );

    const phasePath: string = path.join(output, "t_done.json");
    const phaseBytes: Buffer = fs.readFileSync(phasePath);
    fs.appendFileSync(phasePath, " ");
    expectThrow(
      () => EvidenceBenchmarkQualityPostprocess.verify(core, output),
      "changed after sealing",
    );
    fs.writeFileSync(phasePath, phaseBytes);
  }

  function createFixture(
    temporary: string,
    runId: string,
    phase: IEvidenceBenchmarkQualityGrade.Phase,
    generationCoreSealSha256: string = digest("generation-core-seal"),
  ): IFixture {
    const record: string = path.join(
      temporary,
      `${runId}-${phase}-${Math.random().toString(16).slice(2)}`,
    );
    const bundle = createBlindBundle(record, phase, `bundle-${phase}`);
    const catalog: IEvidenceBenchmarkQualityGrade.ICatalog = {
      schemaVersion: 1,
      subject: "todo",
      treeAlgorithm: EvidenceBenchmarkHash.TREE_ALGORITHM,
      requirementsRawTreeSha256: digest("requirements"),
      acceptanceCatalogSha256: digest("acceptance-catalog"),
      acceptance: [
        clause("AC-001", "REQ-TODO-001"),
        clause("AC-002", "REQ-TODO-002"),
      ],
      contextCatalogSha256: null,
      context: [],
      denominatorsSummed: false,
    };
    const firstGrader = grader("grader-a", "llm");
    const secondGrader = grader("grader-b", "llm");
    const adjudicator = grader("adjudicator-c", "llm_adjudicator");
    const plan = EvidenceBenchmarkGradingPlan.create(
      catalog,
      phase,
      {
        runId,
        bundleId: bundle.bundleId,
        treeAlgorithm: bundle.treeAlgorithm,
        bundleRawTreeSha256: bundle.bundleRawTreeSha256,
        gradingInputManifestSha256: bundle.manifestSha256,
        sourceSnapshotRawTreeSha256: bundle.sourceSnapshotRawTreeSha256,
        requirementsRawTreeSha256: catalog.requirementsRawTreeSha256,
        materializedRequirementsRawTreeSha256: digest(
          "materialized-requirements",
        ),
        runManifestSha256: bundle.runManifestSha256,
        generationCoreSealSha256,
        hiddenAcceptanceCatalogSha256: catalog.acceptanceCatalogSha256,
        deterministicInputsSha256: digest(`deterministic-${phase}`),
        rubricSha256: SHA.rubric,
        promptSha256: SHA.prompt,
        providerSchemaSha256: SHA.provider,
        localSchemaSha256: SHA.local,
        armGuessProviderSchemaSha256: SHA.armProvider,
        armGuessLocalSchemaSha256: SHA.armLocal,
        adjudicationProviderSchemaSha256: SHA.adjudicationProvider,
        adjudicationLocalSchemaSha256: SHA.adjudicationLocal,
        registrySha256: SHA.registry,
        protocolRevision: "quality-test-v1",
        graderAssignments: [firstGrader, secondGrader],
        adjudicatorAssignment: adjudicator,
        contextPolicy: "continuous",
      },
      2,
      {
        estimatedTokensPerCriterion: 200,
        envelopeTokens: 100,
        maximumOutputTokens: 500,
      },
    );
    const first = grade(
      catalog,
      plan,
      bundle,
      firstGrader,
      ["implemented_correctly", "implemented_correctly"],
      "a",
    );
    const second = grade(
      catalog,
      plan,
      bundle,
      secondGrader,
      ["implemented_correctly", "partial"],
      "b",
    );
    const comparison = EvidenceBenchmarkQualityGrade.compare(
      first,
      second,
      "0123456789abcdef",
    );
    const submission = adjudicationSubmission(
      plan,
      comparison,
      first,
      bundle.bundleId,
    );
    const adjudication = EvidenceBenchmarkQualityGrade.adjudicate(
      first,
      second,
      comparison,
      plan,
      submission,
      bundle,
    );
    const coverage = EvidenceBenchmarkQualityCoverage.compute(
      catalog,
      adjudication,
    );
    const qualityPhase: IEvidenceBenchmarkQualityReport.IPhase = {
      phase,
      bundleId: bundle.bundleId,
      snapshotRawTreeSha256: bundle.sourceSnapshotRawTreeSha256,
      bundleRawTreeSha256: bundle.bundleRawTreeSha256,
      rawScale: {
        files: bundle.rawScale.fileCount,
        bytes: bundle.rawScale.byteLength,
        treeAlgorithm: bundle.treeAlgorithm,
        rawTreeSha256: bundle.sourceSnapshotRawTreeSha256,
      },
      blindScale: {
        files: bundle.blindScale.fileCount,
        bytes: bundle.blindScale.byteLength,
        treeAlgorithm: bundle.treeAlgorithm,
        rawTreeSha256: bundle.bundleRawTreeSha256,
      },
      gradePlan: plan,
      firstGrade: first,
      secondGrade: second,
      comparison,
      adjudication,
      coverage,
      deterministicInputs: deterministic(phase),
      secondaryReview: secondary(phase),
    };
    EvidenceBenchmarkQualityReport.validatePhase(runId, "todo", qualityPhase);
    return {
      catalog,
      bundle,
      plan,
      first,
      second,
      comparison,
      adjudication,
      phase: qualityPhase,
    };
  }

  function grade(
    catalog: IEvidenceBenchmarkQualityGrade.ICatalog,
    plan: IEvidenceBenchmarkQualityGrade.IBlockPlan,
    bundle: EvidenceBenchmarkBlindBundle.IResult,
    identity: IEvidenceBenchmarkQualityGrade.IGrader,
    statuses: IEvidenceBenchmarkQualityGrade.Status[],
    suffix: string,
  ): IEvidenceBenchmarkQualityGrade.IGrade {
    const submissions = plan.blocks.map(
      (block): IEvidenceBenchmarkQualityGrade.IBlockSubmission => ({
        schemaVersion: 1,
        bundleId: bundle.bundleId,
        subject: catalog.subject,
        phase: plan.phase,
        grader: identity,
        blind: true,
        population: block.population,
        output: {
          schemaVersion: 1,
          blockId: block.blockId,
          ratings: block.criterionIds.map((id, index) =>
            rating(id, statuses[index] ?? "implemented_correctly"),
          ),
        },
        provenance: provenance(
          `thread-${suffix}`,
          `turn-${suffix}-${block.index}`,
          [`response-${suffix}-${block.index}`],
          SHA.provider,
          SHA.local,
          "2026-07-29T00:00:01.000Z",
        ),
      }),
    );
    const armGuess: IEvidenceBenchmarkQualityGrade.IArmGuessSubmission = {
      schemaVersion: 1,
      bundleId: bundle.bundleId,
      grader: identity,
      output: {
        schemaVersion: 1,
        planSha256: plan.planSha256,
        arm: "unknown",
        confidence: 0.5,
        clues: ["No arm-specific identifiers were visible."],
      },
      provenance: provenance(
        `thread-${suffix}`,
        `turn-${suffix}-arm`,
        [`response-${suffix}-arm`],
        SHA.armProvider,
        SHA.armLocal,
        "2026-07-29T00:00:02.000Z",
      ),
    };
    return EvidenceBenchmarkQualityGrade.assemble(
      catalog,
      plan,
      submissions,
      armGuess,
      bundle,
    );
  }

  function adjudicationSubmission(
    plan: IEvidenceBenchmarkQualityGrade.IBlockPlan,
    comparison: IEvidenceBenchmarkQualityGrade.IComparison,
    first: IEvidenceBenchmarkQualityGrade.IGrade,
    bundleId: string,
  ): IEvidenceBenchmarkQualityGrade.IAdjudicationSubmission {
    const byId: ReadonlyMap<string, IEvidenceBenchmarkQualityGrade.IRating> =
      new Map(
        [...first.acceptanceRatings, ...first.contextRatings].map((entry) => [
          entry.criterionId,
          entry,
        ]),
      );
    return {
      schemaVersion: 1,
      bundleId,
      adjudicator: plan.bindings.adjudicatorAssignment,
      output: {
        schemaVersion: 1,
        firstGradeId: comparison.firstGradeId,
        secondGradeId: comparison.secondGradeId,
        comparisonSha256: comparison.comparisonSha256,
        decisions: comparison.humanAuditQueue.map((item) => ({
          population: item.population,
          criterionId: item.criterionId,
          rating: clone(byId.get(item.criterionId)!),
          rationale:
            "The third blind review independently confirmed the file evidence.",
        })),
      },
      provenance: provenance(
        "thread-adjudicator-c",
        "turn-adjudicator-c",
        ["response-adjudicator-c"],
        SHA.adjudicationProvider,
        SHA.adjudicationLocal,
        "2026-07-29T00:00:03.000Z",
      ),
    };
  }

  function rating(
    criterionId: string,
    status: IEvidenceBenchmarkQualityGrade.Status,
  ): IEvidenceBenchmarkQualityGrade.IRating {
    const implemented: boolean = status === "implemented_correctly";
    return {
      criterionId,
      status,
      confidence: 0.8,
      surfaces: [
        "database",
        "api",
        "backend",
        "frontend",
        "integration",
        "test",
        "operations",
        "documentation",
      ].map((surface) => ({
        surface:
          surface as IEvidenceBenchmarkQualityGrade.IRating["surfaces"][number]["surface"],
        status: implemented ? "correct" : "partial",
      })),
      test: {
        testable: true,
        exists: true,
        executed: true,
        passes: true,
        nonVacuous: true,
        positive: true,
        negative: false,
        boundary: false,
        counterfactual:
          "Reversing the returned value would fail the assertion.",
      },
      evidence: [
        {
          path: "src/app.ts",
          line: 1,
          observation: "The exported value is implemented in the blind bundle.",
        },
      ],
      severity: implemented ? "none" : "medium",
      rationale: "The file-backed behavior determines this rating.",
    };
  }

  function createBlindBundle(
    recordDirectory: string,
    phase: IEvidenceBenchmarkQualityGrade.Phase,
    bundleId: string,
  ): EvidenceBenchmarkBlindBundle.IResult {
    const input: string = path.join(recordDirectory, "grading", "input", phase);
    const bundle: string = path.join(input, "bundle");
    fs.mkdirSync(path.join(bundle, "src"), { recursive: true });
    const source: string = "export const value = true;\n";
    fs.writeFileSync(path.join(bundle, "src/app.ts"), source, "utf8");
    const bundleRawTreeSha256 =
      EvidenceBenchmarkBlindBundle.rawTreeSha256(bundle);
    const provenanceValue = {
      name: "deterministic-test-stripper",
      version: "1.0.0",
      configurationSha256: digest("stripper-configuration"),
    };
    const unsigned: Record<string, unknown> = {
      schemaVersion: 1,
      phase,
      bundleId,
      treeAlgorithm: EvidenceBenchmarkHash.TREE_ALGORITHM,
      runManifestSha256: digest("run-manifest"),
      requirementsRawTreeSha256: digest("requirements"),
      sourceSnapshotRawTreeSha256: digest(`source-${phase}`),
      bundleRawTreeSha256,
      relativeBundlePath: "bundle",
      rawScale: { fileCount: 1, byteLength: Buffer.byteLength(source) },
      blindScale: { fileCount: 1, byteLength: Buffer.byteLength(source) },
      stripperProvenance: provenanceValue,
      stripperProvenanceSha256: canonicalDigest(provenanceValue),
      readOnly: true,
      postGradeRehashRequired: true,
      leakScanPassed: true,
      deterministicDoubleHashPassed: true,
    };
    const manifest = {
      ...unsigned,
      manifestSha256: canonicalDigest(unsigned),
    };
    fs.writeFileSync(
      path.join(input, "manifest.json"),
      `${JSON.stringify(manifest, null, 2)}\n`,
      "utf8",
    );
    return EvidenceBenchmarkBlindBundle.read(recordDirectory, phase);
  }

  function freeze(
    root: string,
    subject: IEvidenceBenchmarkQualityGrade.Subject,
  ): EvidenceBenchmarkAcceptanceCatalog.IFreeze {
    const corpus = EvidenceBenchmarkCorpus.read(root);
    const files = EvidenceBenchmarkHash.directory(root);
    const acceptance = files.get("acceptance-criteria.jsonl")!;
    const context = files.get("context-criteria.jsonl");
    return {
      subject,
      treeAlgorithm: EvidenceBenchmarkHash.TREE_ALGORITHM,
      requirementsRawTreeSha256: EvidenceBenchmarkHash.tree(files),
      acceptanceCatalogSha256: EvidenceBenchmarkHash.bytes(acceptance),
      contextCatalogSha256:
        context === undefined ? null : EvidenceBenchmarkHash.bytes(context),
      documents: corpus.documents,
      h2: corpus.h2,
      h3: corpus.h3,
      acceptance: corpus.atomicAcceptanceClauses,
      context: corpus.contextCriteria,
    };
  }

  function clause(
    id: string,
    h3: string,
  ): IEvidenceBenchmarkQualityGrade.IClause {
    return {
      id,
      requirement: h3,
      source: "01-requirements.md",
      criterion: `Observable behavior for ${id}.`,
      population: "acceptance",
      h2: "REQ-TODO",
      h3,
    };
  }

  function grader(
    pseudonym: string,
    kind: "llm" | "llm_adjudicator",
  ): IEvidenceBenchmarkQualityGrade.IGrader {
    return {
      pseudonym,
      kind,
      model: "gpt-5.6-terra",
      version: "2026-07-29",
      reasoningEffort: "high",
      authMode: "app_server",
      serviceTier: "priority",
      agentVersion: "codex-test",
    };
  }

  function provenance(
    threadId: string,
    turnId: string,
    responseIds: string[],
    providerSchemaSha256: string,
    localSchemaSha256: string,
    submittedAtUtc: string,
  ): IEvidenceBenchmarkQualityGrade.IBlockSubmission["provenance"] {
    return {
      threadId,
      turnId,
      responseIds,
      providerSchemaSha256,
      localSchemaSha256,
      registrySha256: SHA.registry,
      submittedAtUtc,
    };
  }

  function deterministic(
    phase: IEvidenceBenchmarkQualityGrade.Phase,
  ): IEvidenceBenchmarkQualityReport.IDeterministicInputs {
    const collector = (
      name: string,
    ): IEvidenceBenchmarkQualityReport.ICollector => ({
      producer: name,
      version: "1.0.0",
      configurationSha256: digest(`${name}-configuration`),
      resultSha256: digest(`${name}-${phase}-result`),
    });
    return {
      manifestSha256: digest(`deterministic-${phase}`),
      hiddenAcceptance: {
        total: 2,
        passed: 1,
        failed: 1,
        catalogSha256: digest("hidden-catalog"),
        collector: collector("hidden"),
      },
      conventionalCoverage: {
        lines: { covered: 9, total: 10 },
        branches: { covered: 3, total: 4 },
        functions: { covered: 2, total: 2 },
        statements: { covered: 9, total: 10 },
        collector: collector("coverage"),
      },
      mutation: {
        sampled: 3,
        killed: 2,
        survived: 1,
        invalid: 0,
        sampleManifestSha256: digest("mutation-sample"),
        collector: collector("mutation"),
      },
    };
  }

  function secondary(
    phase: IEvidenceBenchmarkQualityGrade.Phase,
  ): IEvidenceBenchmarkQualityReport.ISecondaryReview {
    return {
      schemaVersion: 1,
      scenarioManifestSha256: digest(`scenario-${phase}`),
      evidence: {
        viewportWidths: [390, 834, 1440],
        routes: 2,
        states: 4,
        screenshotSetSha256: digest(`screenshots-${phase}`),
        browserFlowSha256: digest(`browser-${phase}`),
      },
      scores: {
        legibility: 0.8,
        responsive: 0.7,
        stateFeedback: 0.9,
        accessibility: 0.6,
        maintainability: 0.75,
      },
      sourceGradeSha256: [
        digest(`secondary-a-${phase}`),
        digest(`secondary-b-${phase}`),
      ],
      gradeProviderSchemaSha256: digest("secondary-provider-grade"),
      gradeLocalSchemaSha256: digest("secondary-local-grade"),
      adjudicationProviderSchemaSha256: digest(
        "secondary-provider-adjudication",
      ),
      adjudicationLocalSchemaSha256: digest("secondary-local-adjudication"),
      registrySha256: SHA.registry,
      adjudicationSha256: digest(`secondary-adjudication-${phase}`),
      humanValidationStatus: "pending",
      humanValidatedCompositeClaim: false,
      combinedWithRequirementCoverage: false,
    };
  }

  function failedCell(
    runId: string,
    subject: IEvidenceBenchmarkQualityGrade.Subject,
    arm: "plain" | "evidence",
    launchOrder: number,
  ): IEvidenceBenchmarkQualityReport.ICell {
    return {
      schemaVersion: 1,
      runId,
      subject,
      arm,
      replicate: 1,
      launchOrder,
      status: "failed",
      publicTerminalReason: "Deterministic fake failure retained.",
      privateTerminalReasonSha256: digest(`${runId}-private-reason`),
      censoring: null,
      safetyLimit: null,
      timing: timing(false),
      usage: usage(true),
      campaign: campaign(),
      phases: [],
      terminalSealSha256: null,
      promotionSha256: null,
      promotionAbsentReason: "Generation did not complete.",
      attemptSealSha256: digest(`${runId}-attempt`),
      postprocessSealSha256: digest(`${runId}-postprocess`),
    };
  }

  function completedCell(
    runId: string,
    phases: IEvidenceBenchmarkQualityReport.IPhase[],
    attemptSealSha256: string,
    postprocessSealSha256: string,
  ): IEvidenceBenchmarkQualityReport.ICell {
    return {
      ...failedCell(runId, "todo", "plain", 1),
      status: "completed",
      publicTerminalReason: "Generation and required postprocess completed.",
      timing: timing(true),
      phases,
      promotionAbsentReason: "Final promotion has not run yet.",
      attemptSealSha256,
      postprocessSealSha256,
    };
  }

  function safetyCell(
    source: IEvidenceBenchmarkQualityReport.ICell,
    sharedStopDigest: string,
  ): IEvidenceBenchmarkQualityReport.ICell {
    return {
      ...clone(source),
      status: "safety_limit",
      publicTerminalReason: "Shared observed-token safety limit fired.",
      censoring: "safety_limit",
      usage: usage(false),
      safetyLimit: {
        scope: "block",
        sharedStopDigest,
        trigger: "observed_total_tokens",
        threshold: 100,
        observed: 110,
        overshoot: 10,
        stopObserved: true,
        hardCeilingGuaranteed: false,
      },
    };
  }

  function blockReport(
    blockId: string,
    cells: IEvidenceBenchmarkQualityReport.ICell[],
  ): IEvidenceBenchmarkQualityReport.IBlock {
    return {
      schemaVersion: 1,
      blockId,
      blockPlanSha256: digest(`${blockId}-plan`),
      selectedSubjects: ["todo", "reddit"],
      sourceMergedCommit: "1".repeat(40),
      protocolRevision: "quality-test-v1",
      priceSheetSha256: digest("price-sheet"),
      safetyLimit: null,
      cells,
      createdAtUtc: "2026-07-29T00:00:05.000Z",
    };
  }

  function timing(completed: boolean): IEvidenceBenchmarkQualityReport.ITiming {
    return completed
      ? {
          startedAtUtc: "2026-07-29T00:00:00.000Z",
          startedMonotonicNanoseconds: "1000000000",
          tDoneAtUtc: "2026-07-29T00:00:01.000Z",
          tDoneMonotonicNanoseconds: "2000000000",
          tGreenAtUtc: "2026-07-29T00:00:01.000Z",
          tGreenMonotonicNanoseconds: "2000000000",
          tDryAtUtc: "2026-07-29T00:00:02.000Z",
          tDryMonotonicNanoseconds: "3000000000",
          terminalAtUtc: "2026-07-29T00:00:03.000Z",
          terminalMonotonicNanoseconds: "4000000000",
          tDoneElapsedMs: 1000,
          tGreenElapsedMs: 1000,
          tDryElapsedMs: 2000,
          terminalElapsedMs: 3000,
          tGreenEvidenceSha256: digest("green-evidence"),
          gateAtDoneGreen: true,
          gateAtDoneEvidenceSha256: digest("green-evidence"),
        }
      : {
          startedAtUtc: "2026-07-29T00:00:00.000Z",
          startedMonotonicNanoseconds: "1000000000",
          tDoneAtUtc: null,
          tDoneMonotonicNanoseconds: null,
          tGreenAtUtc: null,
          tGreenMonotonicNanoseconds: null,
          tDryAtUtc: null,
          tDryMonotonicNanoseconds: null,
          terminalAtUtc: "2026-07-29T00:00:01.000Z",
          terminalMonotonicNanoseconds: "2000000000",
          tDoneElapsedMs: null,
          tGreenElapsedMs: null,
          tDryElapsedMs: null,
          terminalElapsedMs: 1000,
          tGreenEvidenceSha256: null,
          gateAtDoneGreen: null,
          gateAtDoneEvidenceSha256: null,
        };
  }

  function usage(exact: boolean): IEvidenceBenchmarkQualityReport.IUsage {
    return {
      exact,
      completeness: exact ? "exact" : "observed_lower_bound",
      responseCount: 1,
      responseSetSha256: digest("response-set"),
      costReportSha256: digest("cost-report"),
      totalTokens: 110,
      inputTokens: 80,
      cachedInputTokens: 20,
      cacheWriteInputTokens: 0,
      outputTokens: 30,
      reasoningOutputTokens: 10,
    };
  }

  function campaign(): IEvidenceBenchmarkQualityReport.ICampaign {
    return {
      completedRounds: 1,
      incompleteRoundPreserved: false,
      verifiedFindings: 1,
      repairAttempts: 1,
      provenFixed: 1,
      consecutiveDryRounds: 1,
      gateExecutions: 2,
      failedGates: 1,
    };
  }

  function resignPlan(plan: IEvidenceBenchmarkQualityGrade.IBlockPlan): void {
    const { planSha256: _planSha256, ...unsigned } = plan;
    plan.planSha256 = EvidenceBenchmarkHash.object(unsigned);
  }

  function canonicalDigest(input: unknown): string {
    return EvidenceBenchmarkHash.bytes(canonicalJson(input));
  }

  function canonicalJson(input: unknown): string {
    if (input === null) return "null";
    if (
      typeof input === "boolean" ||
      typeof input === "number" ||
      typeof input === "string"
    )
      return JSON.stringify(input);
    if (Array.isArray(input)) return `[${input.map(canonicalJson).join(",")}]`;
    const record = input as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
      .join(",")}}`;
  }

  function digest(value: string): string {
    return EvidenceBenchmarkHash.bytes(value);
  }

  function clone<T>(input: T): T {
    return structuredClone(input);
  }

  function expectThrow(action: () => unknown, message: string): void {
    assert.throws(action, new RegExp(message));
  }
}
