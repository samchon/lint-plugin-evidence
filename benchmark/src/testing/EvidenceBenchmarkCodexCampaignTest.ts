import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { EvidenceBenchmarkCodexCampaignCoordinator } from "../codex/EvidenceBenchmarkCodexCampaignCoordinator.ts";
import { EvidenceBenchmarkCodexLog } from "../codex/EvidenceBenchmarkCodexLog.ts";
import { EvidenceBenchmarkCodexNeutralBundle } from "../codex/EvidenceBenchmarkCodexNeutralBundle.ts";
import { EvidenceBenchmarkCodexSourceSnapshot } from "../codex/EvidenceBenchmarkCodexSourceSnapshot.ts";
import { EvidenceBenchmarkCodexValue } from "../codex/EvidenceBenchmarkCodexValue.ts";
import type { IEvidenceBenchmarkCodexCampaign } from "../structures/IEvidenceBenchmarkCodexCampaign.ts";
import type { IEvidenceBenchmarkCodexRecord } from "../structures/IEvidenceBenchmarkCodexRecord.ts";

/** Deterministic campaign and neutral-bundle tests that invoke no paid model. */
export namespace EvidenceBenchmarkCodexCampaignTest {
  /** Runs campaign lifecycle, false-dry, mutation, and stripping regressions. */
  export async function main(): Promise<void> {
    const root = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), "evidence-codex-campaign-test-"),
    );
    try {
      await testTwoCleanRounds(root);
      await testUnverifiableRequiresReplacement(root);
      await testFixResetsDigest(root);
      await testFixedFindingRediscoveryReopens(root);
      await testMutationSurvivorRequiresReplay(root);
      await testFinderFailureIsIncomplete(root);
      await testNoOpFixerCannotDry(root);
      await testTimeoutCancelsLateFixer(root);
      await testNeutralBundle(root);
      await testSourceSnapshot(root);
      console.log("EvidenceBenchmarkCodexCampaignTest passed");
    } finally {
      await fs.promises.rm(root, { recursive: true, force: true });
    }
  }

  async function testTwoCleanRounds(root: string): Promise<void> {
    const harness = await createHarness(path.join(root, "two-clean"), {
      findings: (
        round,
        assignment,
      ): IEvidenceBenchmarkCodexCampaign.IFinding[] =>
        round === 1 &&
        (assignment === "F1-requirements-database" ||
          assignment === "F2-api-logic")
          ? [
              finding(
                assignment === "F1-requirements-database" ? "a" : "b",
                assignment === "F1-requirements-database"
                  ? "requirements"
                  : "api",
              ),
            ]
          : [],
      verdict: (): IEvidenceBenchmarkCodexCampaign.IVerification["verdict"] =>
        "rejected",
    });
    const state = await harness.coordinator.run();
    assert.equal(state.status, "completed", state.terminalReason);
    assert.equal(state.rounds.length, 2);
    assert.equal(state.rounds[0]!.rawCandidateCount, 2);
    assert.equal(
      state.rounds[0]!.findingLifecycles.filter(
        (lifecycle): boolean => lifecycle.disposition === "duplicate",
      ).length,
      0,
    );
    assert.equal(state.rounds[0]!.consecutiveCleanRounds, 1);
    assert.equal(state.rounds[1]!.establishesTDry, true);
    assert.equal(state.rounds[1]!.sameDigestAsPreviousCleanRound, true);
  }

  async function testUnverifiableRequiresReplacement(
    root: string,
  ): Promise<void> {
    let verifierCount = 0;
    const harness = await createHarness(path.join(root, "unverifiable"), {
      findings: (
        round,
        assignment,
      ): IEvidenceBenchmarkCodexCampaign.IFinding[] =>
        assignment === "F1-requirements-database" && round <= 2
          ? [finding(`unverifiable-${round}`)]
          : [],
      verdict: (
        round,
      ): IEvidenceBenchmarkCodexCampaign.IVerification["verdict"] => {
        ++verifierCount;
        return round === 1 ? "unverifiable" : "rejected";
      },
    });
    const state = await harness.coordinator.run();
    assert.equal(state.status, "completed", state.terminalReason);
    assert.equal(verifierCount, 2);
    assert.equal(state.rounds.length, 3);
    assert.equal(state.rounds[0]!.valid, false);
    assert.equal(state.rounds[0]!.consecutiveCleanRounds, 0);
    assert.equal(
      state.rounds[1]!.findingLifecycles[0]!.dedupeDecision.decision,
      "new",
    );
  }

  async function testFixResetsDigest(root: string): Promise<void> {
    const harness = await createHarness(path.join(root, "repair"), {
      findings: (
        round,
        assignment,
      ): IEvidenceBenchmarkCodexCampaign.IFinding[] =>
        round === 1 && assignment === "F2-api-logic"
          ? [finding("repair", "api")]
          : [],
      verdict: (): IEvidenceBenchmarkCodexCampaign.IVerification["verdict"] =>
        "verified",
      changeDigestOnFix: true,
    });
    const state = await harness.coordinator.run();
    assert.equal(state.status, "completed");
    assert.equal(state.rounds.length, 3);
    assert.equal(state.rounds[0]!.verifiedNewCount, 1);
    assert.equal(state.rounds[0]!.clean, false);
    assert.notEqual(state.rounds[0]!.startDigest, state.rounds[0]!.endDigest);
    assert.equal(state.rounds[0]!.fixResolution?.allResolved, true);
    assert.equal(state.rounds[1]!.consecutiveCleanRounds, 1);
  }

  async function testFixedFindingRediscoveryReopens(
    root: string,
  ): Promise<void> {
    let verifierCount = 0;
    const harness = await createHarness(path.join(root, "repair-rediscovery"), {
      findings: (
        round,
        assignment,
      ): IEvidenceBenchmarkCodexCampaign.IFinding[] =>
        round <= 2 && assignment === "F2-api-logic"
          ? [finding(`repair-rediscovered-${round}`, "api")]
          : [],
      verdict: (): IEvidenceBenchmarkCodexCampaign.IVerification["verdict"] => {
        ++verifierCount;
        return "verified";
      },
      changeDigestOnFix: true,
    });
    const state = await harness.coordinator.run();
    assert.equal(state.status, "completed", state.terminalReason);
    assert.equal(verifierCount, 2);
    assert.equal(
      state.rounds[1]!.findingLifecycles[0]!.dedupeDecision.decision,
      "new",
    );
    assert.equal(
      state.rounds[1]!.findingLifecycles[0]!.verification?.verdict,
      "verified",
    );
  }

  async function testMutationSurvivorRequiresReplay(
    root: string,
  ): Promise<void> {
    const harness = await createHarness(path.join(root, "mutation-survivor"), {
      findings: (): IEvidenceBenchmarkCodexCampaign.IFinding[] => [],
      verdict: (): IEvidenceBenchmarkCodexCampaign.IVerification["verdict"] =>
        "rejected",
      mutationSurvivesRound: 1,
      changeDigestOnFix: true,
    });
    const state = await harness.coordinator.run();
    assert.equal(state.status, "completed");
    assert.equal(state.rounds[0]!.verifiedNewCount, 1);
    assert.equal(
      state.rounds[0]!.fixResolution?.findings[0]?.mutationReplay
        ?.expectedFailureMatched,
      true,
    );
    assert.equal(state.rounds.length, 3);
  }

  async function testFinderFailureIsIncomplete(root: string): Promise<void> {
    const harness = await createHarness(path.join(root, "finder-failure"), {
      findings: (): IEvidenceBenchmarkCodexCampaign.IFinding[] => [],
      verdict: (): IEvidenceBenchmarkCodexCampaign.IVerification["verdict"] =>
        "rejected",
      finderFailure: "F3-tests",
    });
    const state = await harness.coordinator.run();
    assert.equal(state.status, "interrupted");
    assert.equal(state.incompleteRound?.stage, "finder");
    assert.equal(state.rounds.length, 0);
  }

  async function testNoOpFixerCannotDry(root: string): Promise<void> {
    const harness = await createHarness(path.join(root, "no-op-fixer"), {
      findings: (
        round,
        assignment,
      ): IEvidenceBenchmarkCodexCampaign.IFinding[] =>
        round === 1 && assignment === "F1-requirements-database"
          ? [finding("no-op")]
          : [],
      verdict: (): IEvidenceBenchmarkCodexCampaign.IVerification["verdict"] =>
        "verified",
      changeDigestOnFix: false,
    });
    const state = await harness.coordinator.run();
    assert.equal(state.status, "interrupted");
    assert.equal(state.incompleteRound?.stage, "fix-resolution");
    assert.match(state.terminalReason ?? "", /no authored-state change/);
  }

  async function testTimeoutCancelsLateFixer(root: string): Promise<void> {
    const harness = await createHarness(path.join(root, "cancel-fixer"), {
      findings: (
        round,
        assignment,
      ): IEvidenceBenchmarkCodexCampaign.IFinding[] =>
        round === 1 && assignment === "F1-requirements-database"
          ? [finding("cancel")]
          : [],
      verdict: (): IEvidenceBenchmarkCodexCampaign.IVerification["verdict"] =>
        "verified",
      changeDigestOnFix: true,
      delayedFixMs: 500,
      timeoutMs: 100,
    });
    const state = await harness.coordinator.run();
    assert.equal(state.status, "interrupted");
    await new Promise<void>((resolve): void => {
      setTimeout(resolve, 550);
    });
    assert.equal(harness.digest(), "a".repeat(64));
  }

  async function testNeutralBundle(root: string): Promise<void> {
    const workspace = path.join(root, "neutral-source");
    await fs.promises.mkdir(path.join(workspace, "src"), { recursive: true });
    await fs.promises.mkdir(path.join(workspace, ".agents"), {
      recursive: true,
    });
    await fs.promises.writeFile(
      path.join(workspace, "src", "sample.ts"),
      [
        'const literal = "/** @example must-stay */";',
        "/**",
        " * docs",
        " * @evidence docs/analysis/a.md#x reason",
        " * @evidenceExclude docs/analysis/a.md#y exception",
        " */",
        "export const value = literal;",
        "",
      ].join("\n"),
    );
    await fs.promises.writeFile(
      path.join(workspace, "package.json"),
      JSON.stringify(
        {
          dependencies: {
            "@samchon/lint-plugin-evidence": "file:./plugin.tgz",
          },
        },
        null,
        2,
      ),
    );
    await fs.promises.writeFile(
      path.join(workspace, ".agents", "SKILL.md"),
      "@evidence leak",
    );
    await fs.promises.writeFile(
      path.join(workspace, "lint.config.ts"),
      '"evidence/graph"',
    );
    const materializer = new EvidenceBenchmarkCodexNeutralBundle(
      workspace,
      path.join(root, "neutral-bundles"),
    );
    const bundle = await materializer.materialize(1, "a".repeat(64));
    assert.equal(bundle.instances.length, 4);
    assert.ok(
      bundle.instances.every(
        (instance): boolean =>
          instance.bundleSha256 === bundle.canonicalBundleSha256,
      ),
    );
    const sample = await fs.promises.readFile(
      path.join(
        materializer.instanceRoot(bundle.instances[0].instanceId),
        "src",
        "sample.ts",
      ),
      "utf8",
    );
    assert.ok(sample.includes("@example must-stay"));
    assert.ok(!sample.includes("@evidence docs/analysis"));
    assert.ok(!sample.includes("@evidenceExclude"));
    assert.equal(
      await fs.promises
        .stat(
          path.join(
            materializer.instanceRoot(bundle.instances[0].instanceId),
            "lint.config.ts",
          ),
        )
        .then((): boolean => true)
        .catch((): boolean => false),
      false,
    );
    await fs.promises.writeFile(
      path.join(workspace, "src", "hidden.ts"),
      'export const hidden = "@evidence hidden-arm-leak";\n',
    );
    const hiddenMaterializer = new EvidenceBenchmarkCodexNeutralBundle(
      workspace,
      path.join(root, "neutral-hidden-bundles"),
    );
    await assert.rejects(
      hiddenMaterializer.materialize(1, "b".repeat(64)),
      /arm tag remained|arm information leaked/,
    );
  }

  async function testSourceSnapshot(root: string): Promise<void> {
    const workspace = path.join(root, "snapshot-source");
    await fs.promises.mkdir(
      path.join(workspace, "packages", "backend", "src", "prisma"),
      { recursive: true },
    );
    await fs.promises.mkdir(
      path.join(workspace, "packages", "frontend", "src"),
      { recursive: true },
    );
    await fs.promises.writeFile(
      path.join(workspace, "packages", "frontend", "src", "index.ts"),
      "export const retained = true;\n",
    );
    await fs.promises.writeFile(
      path.join(workspace, "packages", "backend", "src", "prisma", "client.ts"),
      "generated\n",
    );
    await fs.promises.writeFile(path.join(workspace, ".env.local"), "SECRET=x");
    await fs.promises.writeFile(
      path.join(workspace, ".env.example"),
      "PUBLIC=x\n",
    );
    await fs.promises.writeFile(
      path.join(workspace, "project.tsbuildinfo"),
      "cache",
    );
    const target = path.join(root, "snapshot-target");
    const manifest = await EvidenceBenchmarkCodexSourceSnapshot.create(
      workspace,
      target,
      path.join(root, "snapshot.manifest.json"),
    );
    await EvidenceBenchmarkCodexSourceSnapshot.verify(target, manifest);
    assert.ok(
      manifest.entries.some(
        (entry): boolean => entry.path === "packages/frontend/src/index.ts",
      ),
    );
    assert.ok(
      manifest.entries.some((entry): boolean => entry.path === ".env.example"),
    );
    assert.ok(
      manifest.exclusions.some(
        (entry): boolean =>
          entry.path === "packages/backend/src/prisma" &&
          entry.descendantCount === 1 &&
          entry.byteLength > 0,
      ),
    );
    assert.ok(
      manifest.exclusions.some((entry): boolean => entry.path === ".env.local"),
    );
    assert.ok(
      manifest.exclusions.some(
        (entry): boolean => entry.path === "project.tsbuildinfo",
      ),
    );
    assert.equal(
      await fs.promises
        .stat(path.join(target, ".env.local"))
        .then((): boolean => true)
        .catch((): boolean => false),
      false,
    );

    if (process.platform !== "win32") {
      const escapeSource = path.join(root, "snapshot-escape-source");
      await fs.promises.mkdir(escapeSource, { recursive: true });
      await fs.promises.symlink(
        "../outside",
        path.join(escapeSource, "escape"),
      );
      await assert.rejects(
        EvidenceBenchmarkCodexSourceSnapshot.create(
          escapeSource,
          path.join(root, "snapshot-escape-target"),
          path.join(root, "snapshot-escape.manifest.json"),
        ),
        /symlink escapes workspace/,
      );
    }
  }

  async function createHarness(
    directory: string,
    scenario: IScenario,
  ): Promise<{
    coordinator: EvidenceBenchmarkCodexCampaignCoordinator;
    digest: () => string;
  }> {
    await fs.promises.mkdir(directory, { recursive: true });
    const log = new EvidenceBenchmarkCodexLog(
      directory,
      0,
      path.basename(directory),
    );
    await log.open();
    let digest = "a".repeat(64);
    let threadSequence = 0;
    const adapter: IEvidenceBenchmarkCodexCampaign.IAdapter = {
      digest: async (): Promise<string> => digest,
      materializeBundle: async (
        round,
        authoredStateDigest,
      ): Promise<IEvidenceBenchmarkCodexCampaign.IRoundBundle> =>
        bundle(round, authoredStateDigest),
      find: async (
        round,
        assignmentId,
        lenses,
        roundBundle,
      ): Promise<IEvidenceBenchmarkCodexCampaign.IFinderResult> => {
        if (scenario.finderFailure === assignmentId)
          throw new Error(`planned ${assignmentId} failure`);
        await new Promise<void>((resolve): void => {
          setTimeout(
            resolve,
            assignmentId === "F1-requirements-database" ? 4 : 1,
          );
        });
        const instance = roundBundle.instances.find(
          (candidate): boolean => candidate.assignmentId === assignmentId,
        )!;
        return {
          round,
          assignmentId,
          lenses,
          threadId: `finder-${++threadSequence}`,
          bundleInstanceId: instance.instanceId,
          bundleSha256: instance.bundleSha256,
          priorTranscriptAbsent: true,
          armInformationAbsent: true,
          findings: scenario.findings(round, assignmentId),
          responseIds: [`response-finder-${threadSequence}`],
        };
      },
      deduplicate: async (
        _round,
        findings,
        catalog,
      ): Promise<IEvidenceBenchmarkCodexCampaign.IDedupeDecision[]> => {
        const current = [...catalog];
        return findings.map(
          (candidate): IEvidenceBenchmarkCodexCampaign.IDedupeDecision => {
            const duplicate = current.find(
              (entry): boolean =>
                EvidenceBenchmarkCodexValue.canonicalJson({
                  clauseIds: entry.clauseIds,
                  lens: entry.lens,
                  behavior: entry.behavior,
                  expectedBehavior: entry.expectedBehavior,
                  observedBehavior: entry.observedBehavior,
                  locations: entry.locations,
                  reproduction: entry.reproduction,
                  claim: entry.claim,
                  evidence: entry.evidence,
                }) ===
                EvidenceBenchmarkCodexValue.canonicalJson({
                  clauseIds: candidate.clauseIds,
                  lens: candidate.lens,
                  behavior: candidate.behavior,
                  expectedBehavior: candidate.expectedBehavior,
                  observedBehavior: candidate.observedBehavior,
                  locations: candidate.locations,
                  reproduction: candidate.reproduction,
                  claim: candidate.claim,
                  evidence: candidate.evidence,
                }),
            );
            const decision: IEvidenceBenchmarkCodexCampaign.IDedupeDecision =
              duplicate === undefined
                ? {
                    candidateId: candidate.candidateId,
                    fingerprint: candidate.fingerprint,
                    clauseIds: [...candidate.clauseIds],
                    behavior: candidate.behavior,
                    lens: candidate.lens,
                    expectedBehavior: candidate.expectedBehavior,
                    observedBehavior: candidate.observedBehavior,
                    locations: [...candidate.locations],
                    reproduction: candidate.reproduction,
                    claim: candidate.claim,
                    evidence: [...candidate.evidence],
                    decision: "new",
                    canonicalFindingId: `canonical-${candidate.candidateId}`,
                    duplicateOf: null,
                    basis: "structured tuple is new",
                  }
                : {
                    candidateId: candidate.candidateId,
                    fingerprint: candidate.fingerprint,
                    clauseIds: [...candidate.clauseIds],
                    behavior: candidate.behavior,
                    lens: candidate.lens,
                    expectedBehavior: candidate.expectedBehavior,
                    observedBehavior: candidate.observedBehavior,
                    locations: [...candidate.locations],
                    reproduction: candidate.reproduction,
                    claim: candidate.claim,
                    evidence: [...candidate.evidence],
                    decision: "duplicate",
                    canonicalFindingId: duplicate.canonicalFindingId,
                    duplicateOf: duplicate.canonicalFindingId,
                    basis: "structured tuple matches canonical entry",
                  };
            if (decision.decision === "new") current.push(decision);
            return decision;
          },
        );
      },
      verify: async (
        round,
        candidate,
        decision,
        roundBundle,
      ): Promise<IEvidenceBenchmarkCodexCampaign.IVerification> => {
        const verdict = scenario.verdict(round, candidate);
        const threadId = `verifier-${++threadSequence}`;
        return {
          candidateId: candidate.candidateId,
          fingerprint: candidate.fingerprint,
          canonicalFindingId: decision.canonicalFindingId,
          threadId,
          bundleSha256: roundBundle.canonicalBundleSha256,
          priorTranscriptAbsent: true,
          armInformationAbsent: true,
          verdict,
          classification:
            verdict === "verified"
              ? "semantic_defect"
              : verdict === "rejected"
                ? "non_defect"
                : null,
          severity: verdict === "verified" ? "high" : null,
          rationale: `independent ${verdict}`,
          responseIds: [`response-${threadId}`],
        };
      },
      checkMutation: async (
        round,
        authoredStateDigest,
      ): Promise<IEvidenceBenchmarkCodexCampaign.IMutationCheck> =>
        mutation(
          round,
          authoredStateDigest,
          scenario.mutationSurvivesRound === round,
        ),
      fix: async (
        handoff,
        signal,
      ): Promise<IEvidenceBenchmarkCodexCampaign.IFixResult> => {
        const manifest: IEvidenceBenchmarkCodexCampaign.IFixManifest =
          JSON.parse(await fs.promises.readFile(handoff.manifestPath, "utf8"));
        if (scenario.delayedFixMs !== undefined)
          await new Promise<void>((resolve, reject): void => {
            const timer = setTimeout(resolve, scenario.delayedFixMs);
            const abort = (): void => {
              clearTimeout(timer);
              reject(new Error("planned fixer abort"));
            };
            if (signal.aborted) abort();
            else signal.addEventListener("abort", abort, { once: true });
          });
        if (scenario.changeDigestOnFix)
          digest = EvidenceBenchmarkCodexValue.sha256(
            `fix-round-${manifest.round}`,
          );
        return {
          threadId: "phase1-thread",
          round: manifest.round,
          manifestSha256: handoff.manifestSha256,
          responseIds: [`response-fixer-${manifest.round}`],
          changedPaths: scenario.changeDigestOnFix ? ["src/fixed.ts"] : [],
          completed: true,
        };
      },
      resolveFix: async (
        manifest,
        beforeDigest,
        afterFixDigest,
      ): Promise<IEvidenceBenchmarkCodexCampaign.IFixResolution> => ({
        round: manifest.round,
        manifestSha256: manifest.manifestSha256,
        beforeDigest,
        afterFixDigest,
        authoredDigestChanged: true,
        freshBundleSha256: "c".repeat(64),
        findings: manifest.verifiedFindings.map((verified) => ({
          canonicalFindingId: verified.canonicalFindingId,
          source: verified.source,
          verdict: "fixed",
          freshVerifierThreadId:
            verified.source === "finder_verification"
              ? `resolution-${++threadSequence}`
              : null,
          responseIds:
            verified.source === "finder_verification"
              ? [`response-resolution-${threadSequence}`]
              : [],
          reproduction: {
            command: [process.execPath, "--version"],
            exitCode: 0,
            evidenceSha256: "d".repeat(64),
            expectedResolution: "defect no longer reproduces",
            matched: true,
          },
          mutationReplay:
            verified.source === "harness_mutation"
              ? {
                  sameTargetId: true,
                  expectedFailureMatched: true,
                  restoreSha256: "e".repeat(64),
                  restoredBytesExact: true,
                }
              : null,
        })),
        verifiedSetMatchesResolution: true,
        allResolved: true,
      }),
      gate: async (
        round,
      ): Promise<IEvidenceBenchmarkCodexRecord.IGateResult[]> => [
        gateResult(round, "build", "build"),
        gateResult(round, "test", "test"),
      ],
      quiesce: async (signal): Promise<void> => {
        assert.equal(
          signal.aborted,
          false,
          "quiesce requires a fresh cleanup signal",
        );
      },
    };
    const hash = "f".repeat(64);
    const phase1Boundary = {
      tDoneEventSeq: 1,
      tDoneEventSha256: hash,
      tDoneSnapshotSha256: hash,
      tDoneSourceSnapshotSha256: hash,
      completionChallengeTurnId: "challenge-turn",
      completionChallengeResponseId: "challenge-response",
      completionChallengeCompletedAtUtc: "2026-07-29T00:00:00.000Z",
      completionChallengeCompleted: true as const,
      completionChallengeAdjudicationSha256: hash,
    };
    const coordinator = new EvidenceBenchmarkCodexCampaignCoordinator(
      {
        runId: path.basename(directory),
        firstDoneThreadId: "phase1-thread",
        phase1Boundary,
        finderPromptSha256: hash,
        verifierPromptSha256: hash,
        fixerPromptSha256: hash,
        verifiedFindingSchemaSha256: hash,
        fixManifestDirectory: path.join(directory, "fix-manifests"),
        checkpointPath: path.join(directory, "campaign.json"),
        timeoutMs: scenario.timeoutMs ?? 10_000,
      },
      adapter,
      log,
    );
    return { coordinator, digest: (): string => digest };
  }

  function finding(
    candidateId: string,
    lens: IEvidenceBenchmarkCodexCampaign.Lens = "requirements",
  ): IEvidenceBenchmarkCodexCampaign.IFinding {
    return {
      candidateId,
      fingerprint: `fingerprint-${candidateId}`,
      lens,
      clauseIds: ["REQ-1"],
      behavior: "expected true but observed false",
      expectedBehavior: "returns true",
      observedBehavior: "returns false",
      locations: ["src/feature.ts"],
      reproduction: "run feature case one",
      claim: "feature violates REQ-1",
      evidence: ["src/feature.ts:1"],
    };
  }

  function bundle(
    round: number,
    digest: string,
  ): IEvidenceBenchmarkCodexCampaign.IRoundBundle {
    const assignments: IEvidenceBenchmarkCodexCampaign.FinderAssignment[] = [
      "F1-requirements-database",
      "F2-api-logic",
      "F3-tests",
      "F4-frontend",
    ];
    const sha = EvidenceBenchmarkCodexValue.sha256(`${round}-${digest}`);
    const instances = assignments.map((assignmentId, index) => ({
      assignmentId,
      instanceId: `${round}-${index + 1}`,
      bundleSha256: sha,
      readOnly: true as const,
      priorTranscriptAbsent: true as const,
      armInformationAbsent: true as const,
    }));
    return {
      round,
      sourceAuthoredDigest: digest,
      bundleId: `bundle-${round}`,
      manifestSha256: "1".repeat(64),
      stripperProvenanceSha256: "7".repeat(64),
      canonicalBundleSha256: sha,
      instances: instances as [
        IEvidenceBenchmarkCodexCampaign.IBundleInstance,
        IEvidenceBenchmarkCodexCampaign.IBundleInstance,
        IEvidenceBenchmarkCodexCampaign.IBundleInstance,
        IEvidenceBenchmarkCodexCampaign.IBundleInstance,
      ],
    };
  }

  function mutation(
    round: number,
    digest: string,
    survives: boolean,
  ): IEvidenceBenchmarkCodexCampaign.IMutationCheck {
    const verifiedFinding: IEvidenceBenchmarkCodexCampaign.IVerifiedFinding = {
      candidateId: `mutation-${round}`,
      fingerprint: `mutation-fingerprint-${round}`,
      canonicalFindingId: `canonical-mutation-${round}`,
      verdict: "verified",
      classification: "test_oracle_gap",
      severity: "high",
      lens: "tests",
      atomicClauseIds: ["MUTATION-1"],
      expectedBehavior: "tests reject the mutation",
      observedBehavior: "tests accept the mutation",
      locations: ["src/feature.ts"],
      verificationProcedure: "run deterministic mutation probe",
      evidence: ["mutation exit code 0"],
      verifierThreadId: null,
      rationale: "the critical mutation survived",
      source: "harness_mutation",
    };
    return {
      owner: "harness",
      round,
      authoredStateDigest: digest,
      selection: {
        populationSha256: "2".repeat(64),
        selectionSha256: "3".repeat(64),
        targetId: "target-1",
        criterionId: "criterion-1",
      },
      targetPath: "src/feature.ts",
      targetSpan: { start: 0, end: 1 },
      preSha256: "4".repeat(64),
      mutatedSha256: "5".repeat(64),
      command: [process.execPath, "--version"],
      expectedFailure: "test rejects mutation",
      actualExitCode: survives ? 0 : 1,
      actualDiagnosticSha256: "6".repeat(64),
      outcome: survives ? "verified_test_oracle_gap" : "expected_failure",
      verifiedFinding: survives ? verifiedFinding : null,
      restoreSha256: "4".repeat(64),
      restoredBytesExact: true,
      unauthorizedMutationPaths: [],
      checkedAtUtc: new Date().toISOString(),
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

  interface IScenario {
    findings: (
      round: number,
      assignment: IEvidenceBenchmarkCodexCampaign.FinderAssignment,
    ) => IEvidenceBenchmarkCodexCampaign.IFinding[];
    verdict: (
      round: number,
      finding: IEvidenceBenchmarkCodexCampaign.IFinding,
    ) => IEvidenceBenchmarkCodexCampaign.IVerification["verdict"];
    finderFailure?: IEvidenceBenchmarkCodexCampaign.FinderAssignment;
    mutationSurvivesRound?: number;
    changeDigestOnFix?: boolean;
    delayedFixMs?: number;
    timeoutMs?: number;
  }
}
