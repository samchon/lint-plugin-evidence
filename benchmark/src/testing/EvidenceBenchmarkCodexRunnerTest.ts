import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { EvidenceBenchmarkCodexCompletion } from "../codex/EvidenceBenchmarkCodexCompletion.ts";
import { EvidenceBenchmarkCodexCostLedger } from "../codex/EvidenceBenchmarkCodexCostLedger.ts";
import { EvidenceBenchmarkCodexRunner } from "../codex/EvidenceBenchmarkCodexRunner.ts";
import { EvidenceBenchmarkCodexProviderSchemas } from "../codex/EvidenceBenchmarkCodexProviderSchemas.ts";
import { EvidenceBenchmarkCodexValue } from "../codex/EvidenceBenchmarkCodexValue.ts";
import type { IEvidenceBenchmarkCodexCampaign } from "../structures/IEvidenceBenchmarkCodexCampaign.ts";
import type { IEvidenceBenchmarkCodexRecord } from "../structures/IEvidenceBenchmarkCodexRecord.ts";
import type { IEvidenceBenchmarkCodexRun } from "../structures/IEvidenceBenchmarkCodexRun.ts";

/** No-spend full-lifecycle fixture for the production runner state machine. */
export namespace EvidenceBenchmarkCodexRunnerTest {
  /** Runs completed and process-restart right-censoring fixtures. */
  export async function main(): Promise<void> {
    const root = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), "evidence-codex-runner-test-"),
    );
    try {
      testProviderSchemaRegistry();
      testCostCeiling();
      assert.deepEqual(
        ["ä", "a", "Z"].sort(EvidenceBenchmarkCodexValue.utf8Compare),
        ["Z", "a", "ä"],
      );
      const run = await runOptions(
        path.join(root, "complete"),
        "complete",
        "fragmented",
      );
      const runner = runnerFor(run);
      const result = await runner.run();
      assert.equal(result.status, "completed", result.terminalReason);
      const state: IEvidenceBenchmarkCodexRun.IRunState = JSON.parse(
        await fs.promises.readFile(result.checkpointPath, "utf8"),
      );
      assert.equal(state.milestones.t0?.measurement, "exact-event");
      assert.ok(state.milestones.t_done);
      assert.ok(state.milestones.t_green);
      assert.ok(state.milestones.t_dry);
      assert.equal(state.green, true);
      assert.ok(state.tDrySourceSnapshotSha256);
      assert.equal(state.completionAdjudication?.localValidationPassed, true);
      assert.equal(
        state.completionChallengeAdjudication?.context,
        "completion_challenge",
      );
      const usage: IEvidenceBenchmarkCodexRecord.IUsageReport = JSON.parse(
        await fs.promises.readFile(result.usagePath, "utf8"),
      );
      assert.equal(usage.exactUsageComplete, true);
      assert.equal(usage.responses.length, 2);
      assert.equal(await exists(result.coreSealPath), true);
      const coreSealSha256 = EvidenceBenchmarkCodexValue.sha256(
        await fs.promises.readFile(result.coreSealPath),
      );
      await fs.promises.mkdir(
        path.join(result.outputDirectory, "postprocess"),
        {
          recursive: true,
        },
      );
      await fs.promises.writeFile(
        path.join(result.outputDirectory, "postprocess", "fixture.json"),
        "{}\n",
      );
      assert.equal(
        EvidenceBenchmarkCodexValue.sha256(
          await fs.promises.readFile(result.coreSealPath),
        ),
        coreSealSha256,
      );
      assert.equal(
        await exists(path.join(run.canonicalResultDirectory, "latest.json")),
        false,
      );
      const sharedRun = await runOptions(
        path.join(root, "shared-stop"),
        "shared-stop",
        "fragmented",
      );
      const sharedRunner = runnerFor(sharedRun);
      const sharedResultPromise = sharedRunner.run();
      const sharedStopDigest = "9".repeat(64);
      setTimeout(
        (): void =>
          sharedRunner.abort(
            "four-cell aggregate token threshold reached",
            sharedStopDigest,
            "observed_total_tokens",
          ),
        100,
      );
      const sharedResult = await sharedResultPromise;
      assert.equal(
        sharedResult.status,
        "safety_limit",
        sharedResult.terminalReason,
      );
      const sharedCost: IEvidenceBenchmarkCodexRun.ICostReport = JSON.parse(
        await fs.promises.readFile(sharedResult.costPath, "utf8"),
      );
      assert.equal(sharedCost.sharedStopDigest, sharedStopDigest);
      assert.equal(sharedCost.usageAfterStopLowerBound, true);
      const sharedState: IEvidenceBenchmarkCodexRun.IRunState = JSON.parse(
        await fs.promises.readFile(sharedResult.checkpointPath, "utf8"),
      );
      assert.equal(
        sharedState.terminal?.safetyLimitReason,
        "observed_total_tokens",
      );
      assert.equal(sharedState.terminal?.sharedStopDigest, sharedStopDigest);
      const observedStop = await runnerFor(
        await runOptions(
          path.join(root, "response-observed-stop"),
          "response-observed-stop",
          "fragmented,descendant",
          10,
        ),
      ).run();
      assert.equal(observedStop.status, "safety_limit");
      assert.match(
        observedStop.terminalReason ?? "",
        /observed_token_threshold exhausted/,
      );
      const stoppedUsage: IEvidenceBenchmarkCodexRecord.IUsageReport =
        JSON.parse(await fs.promises.readFile(observedStop.usagePath, "utf8"));
      assert.equal(stoppedUsage.exactUsageComplete, false);
      const stoppedCost: IEvidenceBenchmarkCodexRun.ICostReport = JSON.parse(
        await fs.promises.readFile(observedStop.costPath, "utf8"),
      );
      assert.equal(stoppedCost.responseObservedStopTriggered, true);
      assert.equal(stoppedCost.usageAfterStopLowerBound, true);
      assert.equal(stoppedCost.hardCeilingGuaranteed, false);
      assert.equal(stoppedCost.controllerTurnStartGateOnly, true);
      const missingPhase = await runnerFor(
        await runOptions(
          path.join(root, "missing-phase"),
          "missing-phase",
          "fragmented,missing-phase",
        ),
      ).run();
      assert.equal(
        missingPhase.status,
        "completed",
        missingPhase.terminalReason,
      );
      const conflicting = await runnerFor(
        await runOptions(
          path.join(root, "multiple-final"),
          "multiple-final",
          "fragmented,multiple-final",
        ),
      ).run();
      assert.equal(conflicting.status, "failed");
      assert.match(
        conflicting.terminalReason ?? "",
        /multiple conflicting terminal assistant candidates/,
      );
      const startSettingsDrift = await runnerFor(
        await runOptions(
          path.join(root, "start-settings-drift"),
          "start-settings-drift",
          "fragmented,settings-drift",
        ),
      ).run();
      assert.equal(startSettingsDrift.status, "failed");
      assert.match(
        startSettingsDrift.terminalReason ?? "",
        /effective thread settings drifted/,
      );
      const updateSettingsDrift = await runnerFor(
        await runOptions(
          path.join(root, "update-settings-drift"),
          "update-settings-drift",
          "fragmented,settings-update-drift",
        ),
      ).run();
      assert.equal(updateSettingsDrift.status, "failed");
      assert.match(
        updateSettingsDrift.terminalReason ?? "",
        /effective thread settings update drifted/,
      );
      console.log("EvidenceBenchmarkCodexRunnerTest passed");
    } finally {
      await fs.promises.rm(root, { recursive: true, force: true });
    }
  }

  async function runOptions(
    root: string,
    runId: string,
    scenario: string,
    maximumObservedTotalTokens = 100_000,
  ): Promise<IEvidenceBenchmarkCodexRun.IOptions> {
    const workspace = path.join(root, "workspace");
    await fs.promises.mkdir(path.join(workspace, "src"), {
      recursive: true,
    });
    await fs.promises.writeFile(
      path.join(workspace, "src", "index.ts"),
      "export const complete = true;\n",
    );
    const hash = EvidenceBenchmarkCodexValue.sha256("fixture");
    const prompt = "Build the complete project from the supplied requirements.";
    const goal = "Complete every requirement and all independent checks.";
    const challenge =
      "Re-check every requirement and test before confirming completion.";
    const recovery = "Unused: process restart ends this measured attempt.";
    const outputSchema = EvidenceBenchmarkCodexCompletion.providerSchema();
    const providerSchemaHash = EvidenceBenchmarkCodexValue.sha256(
      EvidenceBenchmarkCodexValue.canonicalJson(outputSchema),
    );
    const priceSheet = {
      schemaVersion: 1,
      model: "gpt-5.6-terra",
      serviceTier: "default",
      unit: "provider_credits",
      tokenUnit: 1_000_000,
      ratesPerMillionTokens: {
        uncachedInput: 62.5,
        cachedInput: 6.25,
        cacheWriteInput: null,
        output: 375,
      },
      reasoningTokensIncludedInOutput: true,
      monetaryUse: {
        status: "unavailable",
        launchBlocking: false,
      },
    };
    const priceSheetBytes = `${JSON.stringify(priceSheet, null, 2)}\n`;
    const priceSheetPath = path.join(root, "prices.json");
    await fs.promises.writeFile(priceSheetPath, priceSheetBytes);
    return {
      workspace,
      outputDirectory: path.join(root, "record"),
      prompt,
      goal,
      completionChallenge: challenge,
      recoveryPrompt: recovery,
      generationOutcomeSchema: outputSchema,
      manifest: {
        schemaVersion: 1,
        experiment: {
          runId,
          subject: "todo",
          arm: "evidence",
          replicate: 1,
          blockId: "fake-block",
          blockPlanSha256: hash,
          sourceRevision: "fake-source",
          templateSha256: hash,
          requirementsSha256: hash,
          acceptanceCatalogSha256: hash,
          acceptanceCatalogCount: 1,
          contextCatalogSha256: null,
          contextCatalogCount: 0,
          denominatorsSummed: false,
          projectInputSha256: hash,
          productTgzSha256: hash,
          environmentSha256: hash,
          concurrency: 1,
          costAuthorization: {
            id: "no-spend-fixture",
            approvedAtUtc: "2026-07-29T00:00:00.000Z",
            maximumObservedTotalTokens,
            maximumObservedBlockTotalTokens: maximumObservedTotalTokens * 4,
            hardWallDurationSeconds: 60,
            blockHardWallDurationSeconds: 120,
            hardCeilingGuaranteed: false,
            monetaryStatus: "unavailable",
          },
        },
        runner: {
          codexCliVersion: "0.145.0",
          codexExecutableSha256: hash,
          codexSchemaSha256: hash,
          codexSchemaPreservationMode: "tracked-extracted-tree",
          codexSchemaOwnedPath:
            "benchmark/protocol/vendor/codex/0.145.0/app-server-schema-experimental",
          codexSchemaFileCount: 347,
          codexSchemaByteLength: 3_303_877,
          codexSchemaArchiveSha256: null,
          codexSchemaArchiveByteLength: 0,
          codexSchemaTreeAlgorithm: "sha256(sorted-posix-path-nul-bytes-nul)",
          codexSourceCommit: "25af12f7e61572b0bc18ddb1008be543b91519b0",
          model: "gpt-5.6-terra",
          modelProvider: "openai",
          effort: "high",
          serviceTier: "default",
          allowProviderModelFallback: false,
          initialGoalStatus: "paused",
          goalActivationPolicy:
            "paused-before-first-turn-active-after-turn-started",
          firstPromptSelfContained: true,
          promptSha256: EvidenceBenchmarkCodexValue.sha256(prompt),
          goalSha256: EvidenceBenchmarkCodexValue.sha256(goal),
          completionChallengeSha256:
            EvidenceBenchmarkCodexValue.sha256(challenge),
          recoveryPromptSha256: EvidenceBenchmarkCodexValue.sha256(recovery),
          phase2PromptSha256: {
            finder: hash,
            verifier: hash,
            fixer: hash,
          },
          phase2SchemaSha256: {
            finding: { provider: providerSchemaHash, local: hash },
            verification: { provider: providerSchemaHash, local: hash },
          },
          generationOutcomeSchemaSha256: providerSchemaHash,
          generationOutcomeLocalValidationSha256:
            EvidenceBenchmarkCodexCompletion.localValidationSha256(),
          priceSheetSha256: EvidenceBenchmarkCodexValue.sha256(priceSheetBytes),
        },
        createdAtUtc: "2026-07-29T00:00:00.000Z",
      },
      appServer: {
        command: process.execPath,
        arguments: [fixturePath()],
        environment: { EVIDENCE_FAKE_SCENARIO: scenario },
        shutdownGraceMs: 500,
      },
      codexSchemaDirectory: path.join(root, "unused-schema"),
      frozenArtifacts: {
        templateManifestPath: path.join(root, "template.json"),
        requirementsManifestPath: path.join(root, "requirements.json"),
        acceptanceCatalogPath: path.join(root, "acceptance.json"),
        contextCatalogPath: null,
        projectInputManifestPath: path.join(root, "project-input.json"),
        productTgzPath: path.join(root, "product.tgz"),
        environmentManifestPath: path.join(root, "environment.json"),
        phase2PromptPaths: {
          finder: path.join(root, "finder.txt"),
          verifier: path.join(root, "verifier.txt"),
          fixer: path.join(root, "fixer.txt"),
        },
        priceSheetPath,
      },
      gates: [
        gate("build", "build", workspace),
        gate("test", "test", workspace),
      ],
      timeoutMs: 20_000,
      maximumRestarts: 0,
      maximumGateRepairs: 0,
      requestTimeoutMs: 2_000,
      heartbeatIntervalMs: 100,
      dryIntervalMs: 10,
      canonicalResultDirectory: path.join(root, "canonical"),
    };
  }

  function runnerFor(
    run: IEvidenceBenchmarkCodexRun.IOptions,
  ): EvidenceBenchmarkCodexRunner {
    return new EvidenceBenchmarkCodexRunner({
      run,
      preflight: async (): Promise<void> => {},
      campaign:
        async (): Promise<EvidenceBenchmarkCodexRunner.ICampaignRuntime> => ({
          adapter: cleanAdapter(),
          verifiedFindingSchemaSha256: "f".repeat(64),
          timeoutMs: 10_000,
          schemaRegistry: schemaRegistry(),
        }),
    });
  }

  function testProviderSchemaRegistry(): void {
    EvidenceBenchmarkCodexProviderSchemas.admit(schemaRegistry());
    const unsupported = schemaRegistry();
    unsupported.schemas.finding = {
      provider: {
        type: "object",
        properties: { claim: { type: "string", minLength: 1 } },
      },
      providerSha256: "",
      localSha256: EvidenceBenchmarkCodexValue.sha256("local"),
    };
    unsupported.schemas.finding.providerSha256 =
      EvidenceBenchmarkCodexValue.sha256(
        EvidenceBenchmarkCodexValue.canonicalJson(
          unsupported.schemas.finding.provider,
        ),
      );
    assert.throws(
      (): void => EvidenceBenchmarkCodexProviderSchemas.admit(unsupported),
      /unsupported keyword minLength/,
    );
    const missingReference = schemaRegistry();
    missingReference.schemas.verification = {
      provider: { $ref: "schema://missing" },
      providerSha256: EvidenceBenchmarkCodexValue.sha256(
        EvidenceBenchmarkCodexValue.canonicalJson({
          $ref: "schema://missing",
        }),
      ),
      localSha256: EvidenceBenchmarkCodexValue.sha256("local"),
    };
    assert.throws(
      (): void => EvidenceBenchmarkCodexProviderSchemas.admit(missingReference),
      /reference is missing/,
    );
    const nestedReference = schemaRegistry();
    nestedReference.references["schema://nested"] = {
      type: "string",
      pattern: "^unsafe$",
    };
    nestedReference.schemas.verification = {
      provider: { $ref: "schema://nested" },
      providerSha256: EvidenceBenchmarkCodexValue.sha256(
        EvidenceBenchmarkCodexValue.canonicalJson({
          $ref: "schema://nested",
        }),
      ),
      localSha256: EvidenceBenchmarkCodexValue.sha256("local"),
    };
    assert.throws(
      (): void => EvidenceBenchmarkCodexProviderSchemas.admit(nestedReference),
      /unsupported keyword pattern/,
    );
  }

  function testCostCeiling(): void {
    const sheet: IEvidenceBenchmarkCodexRun.IPriceSheet = {
      schemaVersion: 1,
      model: "gpt-5.6-terra",
      serviceTier: "default",
      unit: "provider_credits",
      tokenUnit: 1_000,
      ratesPerMillionTokens: {
        uncachedInput: 1,
        cachedInput: 0.5,
        cacheWriteInput: null,
        output: 2,
      },
      reasoningTokensIncludedInOutput: true,
      monetaryUse: {
        status: "unavailable",
        launchBlocking: false,
      },
    };
    const ledger = new EvidenceBenchmarkCodexCostLedger(90, 360, 60, 120);
    ledger.ingest({
      responseId: "cost-1",
      threadId: "thread",
      turnId: "turn",
      usage: {
        totalTokens: 100,
        inputTokens: 80,
        cachedInputTokens: 20,
        cacheWriteInputTokens: 10,
        outputTokens: 20,
        reasoningOutputTokens: 5,
      },
      receivedAtUtc: "2026-07-29T00:00:00.000Z",
    });
    const report = ledger.report();
    assert.equal(report.observedTotalTokens, 100);
    assert.equal(report.responseObservedOvershootTokens, 10);
    assert.equal(report.providerCredits, null);
    assert.equal(report.usd, null);
    assert.throws(
      (): void => ledger.assertCanStartProviderTurn(),
      EvidenceBenchmarkCodexCostLedger.BudgetExceeded,
    );
    assert.throws(
      (): IEvidenceBenchmarkCodexRun.IPriceSheet =>
        EvidenceBenchmarkCodexCostLedger.priceSheet({
          ...sheet,
          ratesPerMillionTokens: {
            ...sheet.ratesPerMillionTokens,
            output: -1,
          },
        }),
      /finite and nonnegative/,
    );
  }

  function schemaRegistry(): EvidenceBenchmarkCodexProviderSchemas.IRegistry {
    const provider = EvidenceBenchmarkCodexCompletion.providerSchema();
    const providerSha256 = EvidenceBenchmarkCodexValue.sha256(
      EvidenceBenchmarkCodexValue.canonicalJson(provider),
    );
    const localSha256 = EvidenceBenchmarkCodexValue.sha256("fixture");
    const entry = { provider, providerSha256, localSha256 };
    return {
      schemas: {
        generation_outcome: {
          provider,
          providerSha256,
          localSha256: EvidenceBenchmarkCodexCompletion.localValidationSha256(),
        },
        finding: entry,
        verification: entry,
      },
      references: {},
    };
  }

  function cleanAdapter(): IEvidenceBenchmarkCodexCampaign.IAdapter {
    const digest = "a".repeat(64);
    let thread = 0;
    return {
      digest: async (): Promise<string> => digest,
      materializeBundle: async (
        round,
      ): Promise<IEvidenceBenchmarkCodexCampaign.IRoundBundle> => {
        const sha = EvidenceBenchmarkCodexValue.sha256(`bundle-${round}`);
        const assignments: IEvidenceBenchmarkCodexCampaign.FinderAssignment[] =
          [
            "F1-requirements-database",
            "F2-api-logic",
            "F3-tests",
            "F4-frontend",
          ];
        const instances = assignments.map((assignmentId, index) => ({
          assignmentId,
          instanceId: `instance-${round}-${index}`,
          bundleSha256: sha,
          readOnly: true as const,
          priorTranscriptAbsent: true as const,
          armInformationAbsent: true as const,
        }));
        return {
          round,
          sourceAuthoredDigest: digest,
          bundleId: `bundle-${round}`,
          manifestSha256: "b".repeat(64),
          stripperProvenanceSha256: "c".repeat(64),
          canonicalBundleSha256: sha,
          instances: instances as [
            IEvidenceBenchmarkCodexCampaign.IBundleInstance,
            IEvidenceBenchmarkCodexCampaign.IBundleInstance,
            IEvidenceBenchmarkCodexCampaign.IBundleInstance,
            IEvidenceBenchmarkCodexCampaign.IBundleInstance,
          ],
        };
      },
      find: async (
        round,
        assignmentId,
        lenses,
        bundle,
      ): Promise<IEvidenceBenchmarkCodexCampaign.IFinderResult> => {
        const instance = bundle.instances.find(
          (entry): boolean => entry.assignmentId === assignmentId,
        )!;
        const sequence = ++thread;
        return {
          round,
          assignmentId,
          lenses,
          threadId: `finder-${sequence}`,
          bundleInstanceId: instance.instanceId,
          bundleSha256: instance.bundleSha256,
          priorTranscriptAbsent: true,
          armInformationAbsent: true,
          findings: [],
          responseIds: [`finder-response-${sequence}`],
        };
      },
      deduplicate: async (): Promise<
        IEvidenceBenchmarkCodexCampaign.IDedupeDecision[]
      > => [],
      verify:
        async (): Promise<IEvidenceBenchmarkCodexCampaign.IVerification> => {
          throw new Error("clean fixture must not invoke a verifier");
        },
      checkMutation: async (
        round,
      ): Promise<IEvidenceBenchmarkCodexCampaign.IMutationCheck> => ({
        owner: "harness",
        round,
        authoredStateDigest: digest,
        selection: {
          populationSha256: "d".repeat(64),
          selectionSha256: "e".repeat(64),
          targetId: "target",
          criterionId: "criterion",
        },
        targetPath: "src/index.ts",
        targetSpan: { start: 0, end: 1 },
        preSha256: "1".repeat(64),
        mutatedSha256: "2".repeat(64),
        command: [process.execPath, "--version"],
        expectedFailure: "test rejects mutation",
        actualExitCode: 1,
        actualDiagnosticSha256: "3".repeat(64),
        outcome: "expected_failure",
        verifiedFinding: null,
        restoreSha256: "1".repeat(64),
        restoredBytesExact: true,
        unauthorizedMutationPaths: [],
        checkedAtUtc: new Date().toISOString(),
      }),
      fix: async (): Promise<IEvidenceBenchmarkCodexCampaign.IFixResult> => {
        throw new Error("clean fixture must not invoke a fixer");
      },
      resolveFix:
        async (): Promise<IEvidenceBenchmarkCodexCampaign.IFixResolution> => {
          throw new Error("clean fixture must not resolve a fixer");
        },
      gate: async (
        round,
      ): Promise<IEvidenceBenchmarkCodexRecord.IGateResult[]> => [
        gateResult(round, "build", "build"),
        gateResult(round, "test", "test"),
      ],
      quiesce: async (): Promise<void> => {},
    };
  }

  function gate(
    name: string,
    kind: "build" | "test",
    cwd: string,
  ): IEvidenceBenchmarkCodexRun.IGate {
    return {
      name,
      kind,
      command: process.execPath,
      arguments: ["--version"],
      cwd,
      timeoutMs: 1_000,
    };
  }

  function gateResult(
    round: number,
    name: string,
    kind: "build" | "test",
  ): IEvidenceBenchmarkCodexRecord.IGateResult {
    return {
      name,
      kind,
      startedAtUtc: "2026-07-29T00:00:00.000Z",
      completedAtUtc: "2026-07-29T00:00:01.000Z",
      durationMs: 1_000,
      exitCode: 0,
      signal: null,
      timedOut: false,
      stdoutPath: `round-${round}-${name}.stdout.log`,
      stderrPath: `round-${round}-${name}.stderr.log`,
    };
  }

  function fixturePath(): string {
    return path.resolve(
      import.meta.dirname,
      "..",
      "..",
      "fixtures",
      "fake-codex-app-server.mjs",
    );
  }

  async function exists(target: string): Promise<boolean> {
    return fs.promises
      .stat(target)
      .then((): boolean => true)
      .catch((): boolean => false);
  }
}
