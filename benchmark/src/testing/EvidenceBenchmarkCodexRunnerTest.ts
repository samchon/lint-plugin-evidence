import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { EvidenceBenchmarkCodexCompletion } from "../codex/EvidenceBenchmarkCodexCompletion.ts";
import { EvidenceBenchmarkCodexRunner } from "../codex/EvidenceBenchmarkCodexRunner.ts";
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
      assert.ok(
        await exists(
          path.join(
            run.canonicalResultDirectory,
            "runs",
            run.manifest.experiment.runId,
            "workspace",
            "src",
            "index.ts",
          ),
        ),
      );
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
          "fragmented,missing-phase,multiple-final",
        ),
      ).run();
      assert.equal(conflicting.status, "failed");
      assert.match(
        conflicting.terminalReason ?? "",
        /multiple conflicting terminal assistant candidates/,
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
            maximumCost: 1,
            currency: "USD",
          },
        },
        runner: {
          codexCliVersion: "0.145.0",
          codexExecutableSha256: hash,
          codexSchemaSha256: hash,
          codexSchemaFileCount: 347,
          codexSchemaByteLength: 3_303_877,
          codexSchemaArchiveSha256: null,
          codexSchemaArchiveByteLength: 0,
          codexSchemaTreeAlgorithm: "sha256(sorted-posix-path-nul-bytes-nul)",
          codexSourceCommit: "25af12f7e61572b0bc18ddb1008be543b91519b0",
          model: "gpt-5.6-terra",
          effort: "high",
          serviceTier: "priority",
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
          generationOutcomeSchemaSha256: EvidenceBenchmarkCodexValue.sha256(
            EvidenceBenchmarkCodexValue.canonicalJson(outputSchema),
          ),
          generationOutcomeLocalValidationSha256:
            EvidenceBenchmarkCodexCompletion.localValidationSha256(),
          priceSheetSha256: hash,
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
        }),
    });
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
