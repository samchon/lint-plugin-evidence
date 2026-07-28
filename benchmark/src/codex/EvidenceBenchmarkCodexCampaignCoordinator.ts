import fs from "node:fs";
import path from "node:path";

import type { IEvidenceBenchmarkCodexCampaign } from "../structures/IEvidenceBenchmarkCodexCampaign.ts";
import type { IEvidenceBenchmarkCodexRecord } from "../structures/IEvidenceBenchmarkCodexRecord.ts";
import { EvidenceBenchmarkCodexCheckpoint } from "./EvidenceBenchmarkCodexCheckpoint.ts";
import { EvidenceBenchmarkCodexLog } from "./EvidenceBenchmarkCodexLog.ts";
import { EvidenceBenchmarkCodexValue } from "./EvidenceBenchmarkCodexValue.ts";

/**
 * Resumable Phase 2 state machine for isolated discovery, adversarial
 * verification, one mutation probe, verified-only fixing, and two
 * digest-identical clean rounds.
 */
export class EvidenceBenchmarkCodexCampaignCoordinator {
  private readonly assignments: ReadonlyArray<{
    id: IEvidenceBenchmarkCodexCampaign.FinderAssignment;
    lenses: IEvidenceBenchmarkCodexCampaign.Lens[];
  }> = [
    {
      id: "F1-requirements-database",
      lenses: ["requirements", "database"],
    },
    { id: "F2-api-logic", lenses: ["api", "logic"] },
    { id: "F3-tests", lenses: ["tests"] },
    { id: "F4-frontend", lenses: ["frontend"] },
  ];
  private readonly usedThreadIds = new Set<string>();
  private readonly usedBundleInstanceIds = new Set<string>();
  private state?: IEvidenceBenchmarkCodexCampaign.IState;
  private interruptionReason?: string;
  private deadlineEpochMilliseconds = 0;
  private readonly abortController = new AbortController();

  /**
   * Creates a coordinator whose adapter owns app-server contexts and workspace
   * operations.
   *
   * @param options Frozen campaign and Phase 1 identity.
   * @param adapter Fresh-context and workspace operations.
   * @param log Shared append-only semantic ledger.
   */
  public constructor(
    private readonly options: IEvidenceBenchmarkCodexCampaign.IOptions,
    private readonly adapter: IEvidenceBenchmarkCodexCampaign.IAdapter,
    private readonly log: EvidenceBenchmarkCodexLog,
    private readonly hooks: EvidenceBenchmarkCodexCampaignCoordinator.IHooks = {},
  ) {}

  /** Aborts active work and requests an interrupted terminal outcome. */
  public interrupt(reason: string): void {
    this.interruptionReason = reason;
    this.abortController.abort(reason);
  }

  /** Runs or resumes until two valid clean rounds share one authored digest. */
  public async run(): Promise<IEvidenceBenchmarkCodexCampaign.IState> {
    await this.restore();
    const state = this.state!;
    if (state.status !== "running") return state;
    while (state.consecutiveCleanRounds < state.requiredCleanRounds) {
      if (this.interruptionReason !== undefined) {
        await this.terminal("interrupted", this.interruptionReason);
        break;
      }
      if (Date.now() >= this.deadlineEpochMilliseconds) {
        await this.terminal(
          "interrupted",
          `campaign exceeded ${this.options.timeoutMs}ms`,
        );
        break;
      }
      if (!(await this.round(state.rounds.length + 1))) break;
    }
    if (
      state.status === "running" &&
      state.consecutiveCleanRounds === state.requiredCleanRounds
    ) {
      if (
        state.tDryEventSha256 === undefined ||
        state.tDryAuthoredDigest === undefined
      )
        throw new Error("completed campaign is missing t_dry proof");
      await this.quiesce("campaign completed");
      await this.log.flush();
      state.status = "completed";
      state.updatedAtUtc = new Date().toISOString();
      await this.log.recordEvent(
        "campaign_completed",
        {
          cleanDigest: state.tDryAuthoredDigest,
          rounds: state.rounds.length,
          tDryEventSha256: state.tDryEventSha256,
        },
        { phase: "terminal" },
      );
      await this.persist();
    }
    return state;
  }

  private async round(index: number): Promise<boolean> {
    const state = this.state!;
    const startedAtUtc = new Date().toISOString();
    const startDigest = await this.step(
      this.adapter.digest(this.abortController.signal),
      `round ${index} start digest`,
    );
    await this.log.recordEvent(
      "campaign_round_started",
      { index, startDigest },
      { phase: "agent" },
    );
    let bundle: IEvidenceBenchmarkCodexCampaign.IRoundBundle;
    try {
      bundle = await this.step(
        this.adapter.materializeBundle(
          index,
          startDigest,
          this.abortController.signal,
        ),
        `round ${index} bundle`,
      );
      this.validateBundle(index, startDigest, bundle);
      if (
        (await this.step(
          this.adapter.digest(this.abortController.signal),
          `round ${index} post-bundle digest`,
        )) !== startDigest
      )
        throw new Error(
          `round ${index} bundle materialization mutated authored state`,
        );
    } catch (error) {
      await this.incomplete(
        index,
        startedAtUtc,
        "bundle",
        undefined,
        [],
        [],
        [],
        undefined,
        EvidenceBenchmarkCodexCampaignCoordinator.message(error),
        true,
      );
      return false;
    }
    const finderSettled = await Promise.allSettled(
      this.assignments.map(
        async (
          assignment,
        ): Promise<IEvidenceBenchmarkCodexCampaign.IFinderResult> =>
          this.step(
            this.adapter.find(
              index,
              assignment.id,
              [...assignment.lenses],
              bundle,
              this.abortController.signal,
            ),
            `round ${index} finder ${assignment.id}`,
          ),
      ),
    );
    const finders =
      EvidenceBenchmarkCodexCampaignCoordinator.fulfilled(finderSettled);
    const finderFailure =
      EvidenceBenchmarkCodexCampaignCoordinator.rejected(finderSettled);
    if (finderFailure !== undefined) {
      await this.incomplete(
        index,
        startedAtUtc,
        "finder",
        bundle,
        finders,
        [],
        [],
        undefined,
        `fresh finder failed: ${EvidenceBenchmarkCodexCampaignCoordinator.reason(
          finderFailure,
        )}`,
        false,
      );
      return false;
    }
    try {
      this.validateFinders(index, bundle, finders);
      if (
        (await this.step(
          this.adapter.digest(this.abortController.signal),
          `round ${index} post-finder digest`,
        )) !== startDigest
      )
        throw new Error(`round ${index} finders mutated authored state`);
    } catch (error) {
      await this.incomplete(
        index,
        startedAtUtc,
        "finder",
        bundle,
        finders,
        [],
        [],
        undefined,
        EvidenceBenchmarkCodexCampaignCoordinator.message(error),
        true,
      );
      return false;
    }
    const rawFindings = finders.flatMap((finder) => finder.findings);
    const finderAssignmentByCandidate = new Map(
      finders.flatMap((finder) =>
        finder.findings.map(
          (
            finding,
          ): [string, IEvidenceBenchmarkCodexCampaign.FinderAssignment] => [
            finding.candidateId,
            finder.assignmentId,
          ],
        ),
      ),
    );
    let dedupeDecisions: IEvidenceBenchmarkCodexCampaign.IDedupeDecision[];
    try {
      dedupeDecisions = await this.step(
        this.adapter.deduplicate(
          index,
          rawFindings,
          state.activeDedupeIndex?.authoredDigest === startDigest
            ? [...state.activeDedupeIndex.entries]
            : [],
          this.abortController.signal,
        ),
        `round ${index} dedupe`,
      );
      this.validateDedupe(rawFindings, dedupeDecisions);
    } catch (error) {
      await this.incomplete(
        index,
        startedAtUtc,
        "dedupe",
        bundle,
        finders,
        [],
        [],
        undefined,
        EvidenceBenchmarkCodexCampaignCoordinator.message(error),
        true,
      );
      return false;
    }
    const findingsByCandidate = new Map(
      rawFindings.map(
        (finding): [string, IEvidenceBenchmarkCodexCampaign.IFinding] => [
          finding.candidateId,
          finding,
        ],
      ),
    );
    const dedupNew = dedupeDecisions.filter(
      (decision): boolean => decision.decision === "new",
    );
    const verifierSettled = await Promise.allSettled(
      dedupNew.map(
        async (
          decision,
        ): Promise<IEvidenceBenchmarkCodexCampaign.IVerification> =>
          this.step(
            this.adapter.verify(
              index,
              findingsByCandidate.get(decision.candidateId)!,
              decision,
              bundle,
              this.abortController.signal,
            ),
            `round ${index} verifier ${decision.candidateId}`,
          ),
      ),
    );
    const verifications =
      EvidenceBenchmarkCodexCampaignCoordinator.fulfilled(verifierSettled);
    const verifierFailure =
      EvidenceBenchmarkCodexCampaignCoordinator.rejected(verifierSettled);
    if (verifierFailure !== undefined) {
      await this.incomplete(
        index,
        startedAtUtc,
        "verifier",
        bundle,
        finders,
        dedupeDecisions,
        verifications,
        undefined,
        `fresh verifier failed: ${EvidenceBenchmarkCodexCampaignCoordinator.reason(
          verifierFailure,
        )}`,
        false,
      );
      return false;
    }
    try {
      this.validateVerifications(
        dedupNew,
        verifications,
        bundle.canonicalBundleSha256,
      );
      if (
        (await this.step(
          this.adapter.digest(this.abortController.signal),
          `round ${index} post-verifier digest`,
        )) !== startDigest
      )
        throw new Error(`round ${index} verifiers mutated authored state`);
    } catch (error) {
      await this.incomplete(
        index,
        startedAtUtc,
        "verifier",
        bundle,
        finders,
        dedupeDecisions,
        verifications,
        undefined,
        EvidenceBenchmarkCodexCampaignCoordinator.message(error),
        true,
      );
      return false;
    }
    const findingLifecycles = this.findingLifecycles(
      rawFindings,
      finderAssignmentByCandidate,
      dedupeDecisions,
      verifications,
    );
    let mutationCheck:
      IEvidenceBenchmarkCodexCampaign.IMutationCheck | undefined;
    try {
      mutationCheck = await this.step(
        this.adapter.checkMutation(
          index,
          startDigest,
          this.abortController.signal,
        ),
        `round ${index} mutation`,
      );
      this.validateMutation(index, startDigest, mutationCheck);
      if (
        (await this.step(
          this.adapter.digest(this.abortController.signal),
          `round ${index} post-mutation digest`,
        )) !== startDigest
      )
        throw new Error(
          `round ${index} mutation probe did not restore authored state`,
        );
    } catch (error) {
      await this.incomplete(
        index,
        startedAtUtc,
        "mutation-check",
        bundle,
        finders,
        dedupeDecisions,
        verifications,
        mutationCheck,
        EvidenceBenchmarkCodexCampaignCoordinator.message(error),
        true,
      );
      return false;
    }
    const verifiedFindings = this.verifiedFindings(
      dedupNew,
      findingsByCandidate,
      verifications,
      mutationCheck,
    );
    let fixManifest: IEvidenceBenchmarkCodexCampaign.IFixManifest | undefined;
    let fixResult: IEvidenceBenchmarkCodexCampaign.IFixResult | undefined;
    let fixResolution:
      IEvidenceBenchmarkCodexCampaign.IFixResolution | undefined;
    if (verifiedFindings.length !== 0) {
      try {
        fixManifest = await this.writeFixManifest(
          index,
          startedAtUtc,
          startDigest,
          bundle,
          dedupeDecisions,
          verifiedFindings,
        );
        const manifestPath = path.join(
          this.options.fixManifestDirectory,
          `${index}-${fixManifest.manifestSha256}.json`,
        );
        fixResult = await this.step(
          this.adapter.fix(
            {
              manifestPath,
              manifestSha256: fixManifest.manifestSha256,
            },
            this.abortController.signal,
          ),
          `round ${index} fixer`,
        );
        if (
          fixResult.threadId !== this.options.firstDoneThreadId ||
          fixResult.round !== index ||
          fixResult.manifestSha256 !== fixManifest.manifestSha256 ||
          !fixResult.completed
        )
          throw new Error(
            `round ${index} fixer did not complete in the first-done thread`,
          );
      } catch (error) {
        await this.incomplete(
          index,
          startedAtUtc,
          "fixer",
          bundle,
          finders,
          dedupeDecisions,
          verifications,
          mutationCheck,
          EvidenceBenchmarkCodexCampaignCoordinator.message(error),
          false,
        );
        return false;
      }
      try {
        const afterFixDigest = await this.step(
          this.adapter.digest(this.abortController.signal),
          `round ${index} post-fix digest`,
        );
        if (afterFixDigest === startDigest)
          throw new Error(`round ${index} fixer made no authored-state change`);
        fixResolution = await this.step(
          this.adapter.resolveFix(
            fixManifest,
            startDigest,
            afterFixDigest,
            this.abortController.signal,
          ),
          `round ${index} fix resolution`,
        );
        this.validateFixResolution(
          index,
          fixManifest,
          startDigest,
          afterFixDigest,
          fixResolution,
        );
        if (
          (await this.step(
            this.adapter.digest(this.abortController.signal),
            `round ${index} post-resolution digest`,
          )) !== afterFixDigest
        )
          throw new Error(
            `round ${index} fix resolution mutated authored state`,
          );
      } catch (error) {
        await this.incomplete(
          index,
          startedAtUtc,
          "fix-resolution",
          bundle,
          finders,
          dedupeDecisions,
          verifications,
          mutationCheck,
          EvidenceBenchmarkCodexCampaignCoordinator.message(error),
          false,
        );
        return false;
      }
    }
    const preGateDigest = await this.step(
      this.adapter.digest(this.abortController.signal),
      `round ${index} pre-gate digest`,
    );
    let gates: IEvidenceBenchmarkCodexRecord.IGateResult[];
    try {
      gates = await this.step(
        this.adapter.gate(index, this.abortController.signal),
        `round ${index} gates`,
      );
      EvidenceBenchmarkCodexCampaignCoordinator.validateGates(gates);
      await this.hooks.onGreen?.(index, gates);
    } catch (error) {
      await this.incomplete(
        index,
        startedAtUtc,
        "gate",
        bundle,
        finders,
        dedupeDecisions,
        verifications,
        mutationCheck,
        EvidenceBenchmarkCodexCampaignCoordinator.message(error),
        false,
      );
      return false;
    }
    const endDigest = await this.step(
      this.adapter.digest(this.abortController.signal),
      `round ${index} end digest`,
    );
    if (endDigest !== preGateDigest) {
      await this.incomplete(
        index,
        startedAtUtc,
        "gate",
        bundle,
        finders,
        dedupeDecisions,
        verifications,
        mutationCheck,
        `round ${index} gates mutated authored state`,
        true,
      );
      return false;
    }
    const invalidReasons = verifications
      .filter(
        (verification): boolean => verification.verdict === "unverifiable",
      )
      .map(
        (verification): string => `unverifiable:${verification.candidateId}`,
      );
    const valid = invalidReasons.length === 0;
    const clean =
      valid &&
      verifiedFindings.length === 0 &&
      endDigest === startDigest &&
      mutationCheck.outcome === "expected_failure" &&
      mutationCheck.restoredBytesExact &&
      mutationCheck.unauthorizedMutationPaths.length === 0;
    const previousCleanDigest = state.cleanDigest;
    if (clean) {
      if (state.cleanDigest === endDigest) ++state.consecutiveCleanRounds;
      else {
        state.cleanDigest = endDigest;
        state.consecutiveCleanRounds = 1;
      }
    } else {
      state.cleanDigest = undefined;
      state.consecutiveCleanRounds = 0;
    }
    this.updateCatalog(
      dedupeDecisions,
      verifications,
      startDigest,
      endDigest,
      fixResolution,
    );
    const establishesTDry =
      clean && state.consecutiveCleanRounds === state.requiredCleanRounds;
    const verifiedByFinderCount = verifications.filter(
      (verification): boolean => verification.verdict === "verified",
    ).length;
    const mutationVerifiedCount: 0 | 1 =
      mutationCheck.outcome === "verified_test_oracle_gap" ? 1 : 0;
    const fixHandoffCount = fixManifest?.verifiedFindings.length ?? 0;
    if (
      rawFindings.length !== findingLifecycles.length ||
      verifiedFindings.length !==
        verifiedByFinderCount + mutationVerifiedCount ||
      fixHandoffCount !== verifiedFindings.length
    )
      throw new Error(`round ${index} finding counts do not reconcile`);
    if (
      fixManifest !== undefined &&
      EvidenceBenchmarkCodexValue.canonicalJson(
        fixManifest.verifiedFindings
          .map((finding): string => finding.canonicalFindingId)
          .sort(),
      ) !==
        EvidenceBenchmarkCodexValue.canonicalJson(
          verifiedFindings
            .map((finding): string => finding.canonicalFindingId)
            .sort(),
        )
    )
      throw new Error(`round ${index} fixer handoff changed verified set`);
    const round: IEvidenceBenchmarkCodexCampaign.IRound = {
      schemaVersion: 1,
      runId: this.options.runId,
      phase1Boundary: this.options.phase1Boundary,
      index,
      startedAtUtc,
      completedAtUtc: new Date().toISOString(),
      startDigest,
      bundle,
      finders,
      findingLifecycles,
      rawCandidateCount: rawFindings.length,
      reconciliation: {
        lifecycleCount: findingLifecycles.length,
        deduplicatedNewCount: dedupNew.length,
        verifiedByFinderCount,
        mutationVerifiedCount,
        fixHandoffCount,
        countsReconciled: true,
        verifiedSetMatchesHandoff: true,
      },
      mutationCheck,
      verifiedNewCount: verifiedFindings.length,
      fixManifest: fixManifest ?? null,
      fixResult: fixResult ?? null,
      fixResolution: fixResolution ?? null,
      gates,
      endDigest,
      sameDigestAsStart: endDigest === startDigest,
      sameDigestAsPreviousCleanRound:
        previousCleanDigest !== undefined && previousCleanDigest === endDigest,
      valid,
      invalidReasons,
      clean,
      consecutiveCleanRounds: state.consecutiveCleanRounds,
      establishesTDry,
    };
    state.rounds.push(round);
    state.findingLifecycles.push(...findingLifecycles);
    state.updatedAtUtc = round.completedAtUtc;
    await this.log.recordEvent(
      "campaign_round_completed",
      {
        index,
        startDigest,
        endDigest,
        bundleSha256: bundle.canonicalBundleSha256,
        finderThreadIds: finders.map((finder) => finder.threadId),
        verifierThreadIds: verifications.map(
          (verification) => verification.threadId,
        ),
        rawFindingCount: rawFindings.length,
        lifecycleCount: findingLifecycles.length,
        duplicateFindingCount: dedupeDecisions.filter(
          (decision): boolean => decision.decision === "duplicate",
        ).length,
        rejectedFindingCount: verifications.filter(
          (verification): boolean => verification.verdict === "rejected",
        ).length,
        verifiedFindingCount: verifications.filter(
          (verification): boolean => verification.verdict === "verified",
        ).length,
        mutationVerifiedFindingCount:
          mutationCheck.outcome === "verified_test_oracle_gap" ? 1 : 0,
        repairedFindingCount: fixManifest?.verifiedFindings.length ?? 0,
        invalidReasons,
        clean,
        consecutiveCleanRounds: state.consecutiveCleanRounds,
      },
      { phase: "agent" },
    );
    if (establishesTDry) {
      const event = await this.log.recordEvent(
        "campaign_t_dry",
        {
          authoredStateDigest: endDigest,
          round: index,
          requiredCleanRounds: state.requiredCleanRounds,
        },
        { phase: "terminal" },
      );
      state.tDryEventSha256 = event.eventSha256;
      state.tDryAuthoredDigest = endDigest;
      await this.hooks.onDry?.(index, endDigest, event.eventSha256);
    }
    await this.persist();
    return true;
  }

  private validateBundle(
    round: number,
    digest: string,
    bundle: IEvidenceBenchmarkCodexCampaign.IRoundBundle,
  ): void {
    if (
      bundle.round !== round ||
      bundle.sourceAuthoredDigest !== digest ||
      bundle.bundleId.length === 0 ||
      bundle.manifestSha256.length !== 64 ||
      bundle.stripperProvenanceSha256.length !== 64 ||
      bundle.canonicalBundleSha256.length !== 64 ||
      bundle.instances.length !== this.assignments.length
    )
      throw new Error(`round ${round} neutral bundle is invalid`);
    for (let i = 0; i < this.assignments.length; ++i) {
      const assignment = this.assignments[i]!;
      const instance = bundle.instances[i]!;
      if (
        instance.assignmentId !== assignment.id ||
        instance.bundleSha256 !== bundle.canonicalBundleSha256 ||
        instance.readOnly !== true ||
        instance.priorTranscriptAbsent !== true ||
        instance.armInformationAbsent !== true ||
        instance.instanceId.length === 0 ||
        this.usedBundleInstanceIds.has(instance.instanceId)
      )
        throw new Error(
          `round ${round} bundle instance ${assignment.id} is invalid`,
        );
      this.usedBundleInstanceIds.add(instance.instanceId);
    }
  }

  private validateFinders(
    round: number,
    bundle: IEvidenceBenchmarkCodexCampaign.IRoundBundle,
    finders: readonly IEvidenceBenchmarkCodexCampaign.IFinderResult[],
  ): void {
    if (finders.length !== this.assignments.length)
      throw new Error(`round ${round} requires exactly four finders`);
    const candidateIds = new Set<string>();
    for (const assignment of this.assignments) {
      const finder = finders.find(
        (candidate): boolean => candidate.assignmentId === assignment.id,
      );
      const instance = bundle.instances.find(
        (candidate): boolean => candidate.assignmentId === assignment.id,
      );
      if (finder === undefined || instance === undefined)
        throw new Error(`round ${round} is missing finder ${assignment.id}`);
      if (
        finder.round !== round ||
        finder.bundleInstanceId !== instance.instanceId ||
        finder.bundleSha256 !== instance.bundleSha256 ||
        finder.priorTranscriptAbsent !== true ||
        finder.armInformationAbsent !== true ||
        EvidenceBenchmarkCodexValue.canonicalJson(finder.lenses) !==
          EvidenceBenchmarkCodexValue.canonicalJson(assignment.lenses)
      )
        throw new Error(`round ${round} finder ${assignment.id} is not frozen`);
      this.claimFreshThread(finder.threadId, `round ${round} finder`);
      for (const finding of finder.findings) {
        if (
          finding.candidateId.length === 0 ||
          finding.expectedBehavior.trim().length === 0 ||
          finding.observedBehavior.trim().length === 0 ||
          candidateIds.has(finding.candidateId)
        )
          throw new Error(
            `round ${round} has duplicate candidate ${finding.candidateId}`,
          );
        candidateIds.add(finding.candidateId);
        if (!finder.lenses.includes(finding.lens))
          throw new Error(
            `round ${round} finder emitted a finding outside its lenses`,
          );
      }
    }
  }

  private validateDedupe(
    findings: readonly IEvidenceBenchmarkCodexCampaign.IFinding[],
    decisions: readonly IEvidenceBenchmarkCodexCampaign.IDedupeDecision[],
  ): void {
    if (decisions.length !== findings.length)
      throw new Error("dedupe must decide every raw candidate exactly once");
    const findingsById = new Map(
      findings.map(
        (finding): [string, IEvidenceBenchmarkCodexCampaign.IFinding] => [
          finding.candidateId,
          finding,
        ],
      ),
    );
    const catalog = new Map(
      this.state!.findingHistory.map(
        (
          decision,
        ): [string, IEvidenceBenchmarkCodexCampaign.IDedupeDecision] => [
          decision.canonicalFindingId,
          decision,
        ],
      ),
    );
    const globalCanonicalIds = new Set(this.state!.canonicalFindingIdRegistry);
    const activeCanonicalIds = new Set(
      this.state!.activeDedupeIndex?.entries.map(
        (decision): string => decision.canonicalFindingId,
      ) ?? [],
    );
    const latestLifecycle = new Map<
      string,
      IEvidenceBenchmarkCodexCampaign.IFindingLifecycle
    >();
    for (const lifecycle of this.state!.findingLifecycles)
      latestLifecycle.set(lifecycle.canonicalFindingId, lifecycle);
    const observed = new Set<string>();
    for (const decision of decisions) {
      const finding = findingsById.get(decision.candidateId);
      if (finding === undefined || observed.has(decision.candidateId))
        throw new Error(`invalid dedupe coverage for ${decision.candidateId}`);
      observed.add(decision.candidateId);
      if (
        decision.fingerprint !== finding.fingerprint ||
        decision.behavior !== finding.behavior ||
        decision.lens !== finding.lens ||
        decision.expectedBehavior !== finding.expectedBehavior ||
        decision.observedBehavior !== finding.observedBehavior ||
        decision.reproduction !== finding.reproduction ||
        decision.claim !== finding.claim ||
        EvidenceBenchmarkCodexValue.canonicalJson(decision.clauseIds) !==
          EvidenceBenchmarkCodexValue.canonicalJson(finding.clauseIds) ||
        EvidenceBenchmarkCodexValue.canonicalJson(decision.locations) !==
          EvidenceBenchmarkCodexValue.canonicalJson(finding.locations) ||
        EvidenceBenchmarkCodexValue.canonicalJson(decision.evidence) !==
          EvidenceBenchmarkCodexValue.canonicalJson(finding.evidence) ||
        decision.basis.trim().length === 0 ||
        decision.canonicalFindingId.length === 0
      )
        throw new Error(
          `dedupe decision ${decision.candidateId} lost structured evidence`,
        );
      if (decision.decision === "new") {
        if (
          decision.duplicateOf !== null ||
          globalCanonicalIds.has(decision.canonicalFindingId)
        )
          throw new Error(
            `new candidate ${decision.candidateId} reused a canonical id`,
          );
        catalog.set(decision.canonicalFindingId, decision);
        globalCanonicalIds.add(decision.canonicalFindingId);
        activeCanonicalIds.add(decision.canonicalFindingId);
      } else {
        const priorLifecycle = latestLifecycle.get(decision.duplicateOf ?? "");
        if (
          decision.duplicateOf !== decision.canonicalFindingId ||
          !catalog.has(decision.duplicateOf) ||
          !activeCanonicalIds.has(decision.duplicateOf) ||
          (priorLifecycle !== undefined &&
            (priorLifecycle.disposition === "unverifiable" ||
              priorLifecycle.disposition === "repair_pending")) ||
          !EvidenceBenchmarkCodexCampaignCoordinator.sameStructure(
            decision,
            catalog.get(decision.duplicateOf)!,
          )
        )
          throw new Error(
            `duplicate ${decision.candidateId} lacks a structured canonical match`,
          );
      }
    }
  }

  private validateVerifications(
    decisions: readonly IEvidenceBenchmarkCodexCampaign.IDedupeDecision[],
    verifications: readonly IEvidenceBenchmarkCodexCampaign.IVerification[],
    bundleSha256: string,
  ): void {
    if (verifications.length !== decisions.length)
      throw new Error("every dedup-new candidate requires one fresh verifier");
    const expected = new Map(
      decisions.map(
        (
          decision,
        ): [string, IEvidenceBenchmarkCodexCampaign.IDedupeDecision] => [
          decision.candidateId,
          decision,
        ],
      ),
    );
    const canonicalIds = new Set(
      this.state!.activeDedupeIndex?.entries.map(
        (decision): string => decision.canonicalFindingId,
      ) ?? [],
    );
    for (const decision of decisions)
      canonicalIds.add(decision.canonicalFindingId);
    const latestLifecycle = new Map<
      string,
      IEvidenceBenchmarkCodexCampaign.IFindingLifecycle
    >();
    for (const lifecycle of this.state!.findingLifecycles)
      latestLifecycle.set(lifecycle.canonicalFindingId, lifecycle);
    const observed = new Set<string>();
    for (const verification of verifications) {
      const decision = expected.get(verification.candidateId);
      if (decision === undefined || observed.has(verification.candidateId))
        throw new Error(
          `invalid verifier coverage for ${verification.candidateId}`,
        );
      observed.add(verification.candidateId);
      if (
        verification.fingerprint !== decision.fingerprint ||
        verification.bundleSha256 !== bundleSha256 ||
        verification.priorTranscriptAbsent !== true ||
        verification.armInformationAbsent !== true ||
        verification.rationale.trim().length === 0
      )
        throw new Error(
          `verifier ${verification.candidateId} is not traceable to frozen input`,
        );
      this.claimFreshThread(verification.threadId, "verifier");
      if (verification.verdict === "verified") {
        if (
          verification.canonicalFindingId !== decision.canonicalFindingId ||
          verification.classification === null ||
          verification.classification === "non_defect" ||
          verification.severity === null ||
          verification.severity.trim().length === 0
        )
          throw new Error(
            `verified candidate ${verification.candidateId} lacks defect metadata`,
          );
      } else if (verification.verdict === "rejected") {
        if (
          verification.canonicalFindingId !== decision.canonicalFindingId ||
          verification.classification !== "non_defect" ||
          verification.severity !== null
        )
          throw new Error(
            `rejected candidate ${verification.candidateId} is misclassified`,
          );
      } else if (verification.verdict === "duplicate") {
        const targetLifecycle = latestLifecycle.get(
          verification.canonicalFindingId,
        );
        if (
          verification.canonicalFindingId === decision.canonicalFindingId ||
          !canonicalIds.has(verification.canonicalFindingId) ||
          (targetLifecycle !== undefined &&
            (targetLifecycle.disposition === "unverifiable" ||
              targetLifecycle.disposition === "repair_pending"))
        )
          throw new Error(
            `verifier duplicate ${verification.candidateId} lacks a canonical target`,
          );
      } else if (
        verification.classification !== null ||
        verification.severity !== null
      )
        throw new Error(
          `unverifiable candidate ${verification.candidateId} must remain unclassified`,
        );
    }
  }

  private validateMutation(
    round: number,
    digest: string,
    mutation: IEvidenceBenchmarkCodexCampaign.IMutationCheck,
  ): void {
    const baseValid =
      mutation.owner === "harness" &&
      mutation.round === round &&
      mutation.authoredStateDigest === digest &&
      mutation.selection.populationSha256.length === 64 &&
      mutation.selection.selectionSha256.length === 64 &&
      mutation.selection.targetId.length !== 0 &&
      mutation.selection.criterionId.length !== 0 &&
      mutation.targetPath.length !== 0 &&
      mutation.targetSpan.start >= 0 &&
      mutation.targetSpan.end > mutation.targetSpan.start &&
      mutation.preSha256.length === 64 &&
      mutation.mutatedSha256.length === 64 &&
      mutation.preSha256 !== mutation.mutatedSha256 &&
      mutation.command.length !== 0 &&
      mutation.expectedFailure.length !== 0 &&
      mutation.actualDiagnosticSha256.length === 64 &&
      mutation.restoreSha256 === mutation.preSha256 &&
      mutation.restoredBytesExact &&
      mutation.unauthorizedMutationPaths.length === 0;
    if (!baseValid)
      throw new Error(
        `round ${round} mutation probe or restoration is invalid`,
      );
    if (
      mutation.outcome === "expected_failure" &&
      (mutation.actualExitCode === 0 || mutation.verifiedFinding !== null)
    )
      throw new Error(`round ${round} expected mutation failure is invalid`);
    if (
      mutation.outcome === "verified_test_oracle_gap" &&
      (mutation.actualExitCode !== 0 ||
        mutation.verifiedFinding === null ||
        mutation.verifiedFinding.source !== "harness_mutation" ||
        mutation.verifiedFinding.verdict !== "verified" ||
        mutation.verifiedFinding.classification !== "test_oracle_gap")
    )
      throw new Error(`round ${round} mutation survivor is not verified`);
  }

  private validateFixResolution(
    round: number,
    manifest: IEvidenceBenchmarkCodexCampaign.IFixManifest,
    beforeDigest: string,
    afterFixDigest: string,
    resolution: IEvidenceBenchmarkCodexCampaign.IFixResolution,
  ): void {
    if (
      resolution.round !== round ||
      resolution.manifestSha256 !== manifest.manifestSha256 ||
      resolution.beforeDigest !== beforeDigest ||
      resolution.afterFixDigest !== afterFixDigest ||
      resolution.authoredDigestChanged !== true ||
      resolution.freshBundleSha256.length !== 64 ||
      resolution.verifiedSetMatchesResolution !== true ||
      resolution.allResolved !== true ||
      afterFixDigest === beforeDigest
    )
      throw new Error(`round ${round} fix resolution header is invalid`);
    const expected = new Map(
      manifest.verifiedFindings.map(
        (
          finding,
        ): [string, IEvidenceBenchmarkCodexCampaign.IVerifiedFinding] => [
          finding.canonicalFindingId,
          finding,
        ],
      ),
    );
    const observed = new Set<string>();
    for (const finding of resolution.findings) {
      const verified = expected.get(finding.canonicalFindingId);
      if (
        verified === undefined ||
        observed.has(finding.canonicalFindingId) ||
        finding.source !== verified.source ||
        finding.verdict !== "fixed" ||
        finding.reproduction.command.length === 0 ||
        finding.reproduction.evidenceSha256.length !== 64 ||
        finding.reproduction.expectedResolution.trim().length === 0 ||
        finding.reproduction.matched !== true
      )
        throw new Error(
          `round ${round} finding ${finding.canonicalFindingId} is not resolved`,
        );
      observed.add(finding.canonicalFindingId);
      if (finding.source === "finder_verification") {
        if (
          finding.freshVerifierThreadId === null ||
          finding.mutationReplay !== null
        )
          throw new Error(
            `round ${round} finder defect lacks fresh post-fix verification`,
          );
        this.claimFreshThread(
          finding.freshVerifierThreadId,
          "fix-resolution verifier",
        );
      } else if (
        finding.freshVerifierThreadId !== null ||
        finding.mutationReplay === null ||
        finding.mutationReplay.sameTargetId !== true ||
        finding.mutationReplay.expectedFailureMatched !== true ||
        finding.mutationReplay.restoreSha256.length !== 64 ||
        finding.mutationReplay.restoredBytesExact !== true
      )
        throw new Error(
          `round ${round} mutation defect lacks exact repaired replay`,
        );
    }
    if (observed.size !== expected.size)
      throw new Error(`round ${round} fix resolution omitted verified defects`);
  }

  private verifiedFindings(
    decisions: readonly IEvidenceBenchmarkCodexCampaign.IDedupeDecision[],
    findings: ReadonlyMap<string, IEvidenceBenchmarkCodexCampaign.IFinding>,
    verifications: readonly IEvidenceBenchmarkCodexCampaign.IVerification[],
    mutation: IEvidenceBenchmarkCodexCampaign.IMutationCheck,
  ): IEvidenceBenchmarkCodexCampaign.IVerifiedFinding[] {
    const decisionsById = new Map(
      decisions.map(
        (
          decision,
        ): [string, IEvidenceBenchmarkCodexCampaign.IDedupeDecision] => [
          decision.candidateId,
          decision,
        ],
      ),
    );
    const verified = verifications.flatMap(
      (verification): IEvidenceBenchmarkCodexCampaign.IVerifiedFinding[] => {
        if (verification.verdict !== "verified") return [];
        const finding = findings.get(verification.candidateId)!;
        const decision = decisionsById.get(verification.candidateId)!;
        return [
          {
            candidateId: finding.candidateId,
            fingerprint: finding.fingerprint,
            canonicalFindingId: decision.canonicalFindingId,
            verdict: "verified",
            classification: verification.classification as Exclude<
              IEvidenceBenchmarkCodexCampaign.Classification,
              "non_defect"
            >,
            severity: verification.severity!,
            lens: finding.lens,
            atomicClauseIds: [...finding.clauseIds],
            expectedBehavior: finding.expectedBehavior,
            observedBehavior: finding.observedBehavior,
            locations: [...finding.locations],
            verificationProcedure: finding.reproduction,
            evidence: [...finding.evidence],
            verifierThreadId: verification.threadId,
            rationale: verification.rationale,
            source: "finder_verification",
          },
        ];
      },
    );
    if (mutation.verifiedFinding !== null)
      verified.push(mutation.verifiedFinding);
    return verified;
  }

  private findingLifecycles(
    findings: readonly IEvidenceBenchmarkCodexCampaign.IFinding[],
    assignments: ReadonlyMap<
      string,
      IEvidenceBenchmarkCodexCampaign.FinderAssignment
    >,
    decisions: readonly IEvidenceBenchmarkCodexCampaign.IDedupeDecision[],
    verifications: readonly IEvidenceBenchmarkCodexCampaign.IVerification[],
  ): IEvidenceBenchmarkCodexCampaign.IFindingLifecycle[] {
    const decisionById = new Map(
      decisions.map(
        (
          decision,
        ): [string, IEvidenceBenchmarkCodexCampaign.IDedupeDecision] => [
          decision.candidateId,
          decision,
        ],
      ),
    );
    const verificationById = new Map(
      verifications.map(
        (
          verification,
        ): [string, IEvidenceBenchmarkCodexCampaign.IVerification] => [
          verification.candidateId,
          verification,
        ],
      ),
    );
    return findings.map(
      (finding): IEvidenceBenchmarkCodexCampaign.IFindingLifecycle => {
        const assignment = assignments.get(finding.candidateId);
        const decision = decisionById.get(finding.candidateId);
        if (assignment === undefined || decision === undefined)
          throw new Error(
            `candidate ${finding.candidateId} has no exhaustive lifecycle`,
          );
        if (decision.decision === "duplicate")
          return {
            candidateId: finding.candidateId,
            fingerprint: finding.fingerprint,
            finderAssignmentId: assignment,
            dedupeDecision: decision,
            verification: null,
            disposition: "duplicate",
            canonicalFindingId: decision.canonicalFindingId,
          };
        const verification = verificationById.get(finding.candidateId);
        if (verification === undefined)
          throw new Error(
            `dedup-new candidate ${finding.candidateId} has no verification`,
          );
        const disposition =
          verification.verdict === "verified"
            ? "repair_pending"
            : verification.verdict === "rejected"
              ? "rejected"
              : verification.verdict === "unverifiable"
                ? "unverifiable"
                : "duplicate";
        return {
          candidateId: finding.candidateId,
          fingerprint: finding.fingerprint,
          finderAssignmentId: assignment,
          dedupeDecision: decision,
          verification,
          disposition,
          canonicalFindingId: verification.canonicalFindingId,
        };
      },
    );
  }

  private async writeFixManifest(
    round: number,
    createdAtUtc: string,
    digest: string,
    bundle: IEvidenceBenchmarkCodexCampaign.IRoundBundle,
    decisions: readonly IEvidenceBenchmarkCodexCampaign.IDedupeDecision[],
    findings: IEvidenceBenchmarkCodexCampaign.IVerifiedFinding[],
  ): Promise<IEvidenceBenchmarkCodexCampaign.IFixManifest> {
    const catalog = [...this.state!.findingHistory, ...decisions];
    const catalogSha256 = EvidenceBenchmarkCodexValue.sha256(
      EvidenceBenchmarkCodexValue.canonicalJson(catalog),
    );
    const handoffId = EvidenceBenchmarkCodexValue.sha256(
      EvidenceBenchmarkCodexValue.canonicalJson({
        runId: this.options.runId,
        round,
        digest,
        bundleSha256: bundle.canonicalBundleSha256,
        canonicalFindingIds: findings.map(
          (finding): string => finding.canonicalFindingId,
        ),
      }),
    );
    const unsigned = {
      schemaVersion: 1 as const,
      runId: this.options.runId,
      round,
      handoffId,
      createdAtUtc,
      rawWorkspaceDigest: digest,
      neutralBundleSha256: bundle.canonicalBundleSha256,
      catalogSha256,
      verifiedFindingSchemaSha256: this.options.verifiedFindingSchemaSha256,
      verifiedFindings: findings,
    };
    const manifest: IEvidenceBenchmarkCodexCampaign.IFixManifest = {
      ...unsigned,
      manifestSha256: EvidenceBenchmarkCodexValue.sha256(
        EvidenceBenchmarkCodexValue.canonicalJson(unsigned),
      ),
    };
    await fs.promises.mkdir(this.options.fixManifestDirectory, {
      recursive: true,
    });
    const manifestPath = path.join(
      this.options.fixManifestDirectory,
      `${round}-${manifest.manifestSha256}.json`,
    );
    await fs.promises.writeFile(
      manifestPath,
      `${EvidenceBenchmarkCodexValue.canonicalJson(manifest)}\n`,
      { encoding: "utf8", flag: "wx", mode: 0o444 },
    );
    return manifest;
  }

  private updateCatalog(
    decisions: readonly IEvidenceBenchmarkCodexCampaign.IDedupeDecision[],
    verifications: readonly IEvidenceBenchmarkCodexCampaign.IVerification[],
    startDigest: string,
    endDigest: string,
    fixResolution: IEvidenceBenchmarkCodexCampaign.IFixResolution | undefined,
  ): void {
    const verificationById = new Map(
      verifications.map(
        (
          verification,
        ): [string, IEvidenceBenchmarkCodexCampaign.IVerification] => [
          verification.candidateId,
          verification,
        ],
      ),
    );
    for (const decision of decisions)
      if (decision.decision === "new") {
        this.state!.findingHistory.push(decision);
        this.state!.canonicalFindingIdRegistry.push(
          decision.canonicalFindingId,
        );
      }
    for (const finding of fixResolution?.findings ?? [])
      if (
        finding.source === "harness_mutation" &&
        !this.state!.canonicalFindingIdRegistry.includes(
          finding.canonicalFindingId,
        )
      )
        this.state!.canonicalFindingIdRegistry.push(finding.canonicalFindingId);
    for (const finding of fixResolution?.findings ?? [])
      this.state!.findingClosures.push({
        round: fixResolution!.round,
        canonicalFindingId: finding.canonicalFindingId,
        from: "repair_pending",
        to: "fixed",
        authoredDigest: fixResolution!.afterFixDigest,
        manifestSha256: fixResolution!.manifestSha256,
        resolution: finding,
      });
    const newlyRejected = decisions.flatMap(
      (decision): IEvidenceBenchmarkCodexCampaign.IDedupeDecision[] => {
        const verification = verificationById.get(decision.candidateId);
        return decision.decision === "new" &&
          verification?.verdict === "rejected"
          ? [decision]
          : [];
      },
    );
    if (startDigest === endDigest) {
      const prior =
        this.state!.activeDedupeIndex?.authoredDigest === endDigest
          ? this.state!.activeDedupeIndex.entries
          : [];
      const entries = new Map(
        [...prior, ...newlyRejected].map(
          (
            decision,
          ): [string, IEvidenceBenchmarkCodexCampaign.IDedupeDecision] => [
            decision.canonicalFindingId,
            decision,
          ],
        ),
      );
      this.state!.activeDedupeIndex = {
        authoredDigest: endDigest,
        entries: [...entries.values()],
      };
      return;
    }
    this.state!.activeDedupeIndex = {
      authoredDigest: endDigest,
      entries: [],
    };
  }

  private claimFreshThread(threadId: string, role: string): void {
    if (
      threadId.length === 0 ||
      threadId === this.options.firstDoneThreadId ||
      this.usedThreadIds.has(threadId)
    )
      throw new Error(`${role} reused non-fresh thread ${threadId}`);
    this.usedThreadIds.add(threadId);
  }

  private async incomplete(
    index: number,
    startedAtUtc: string,
    stage: IEvidenceBenchmarkCodexCampaign.IIncompleteRound["stage"],
    bundle: IEvidenceBenchmarkCodexCampaign.IRoundBundle | undefined,
    finders: IEvidenceBenchmarkCodexCampaign.IFinderResult[],
    dedupeDecisions: IEvidenceBenchmarkCodexCampaign.IDedupeDecision[],
    verifications: IEvidenceBenchmarkCodexCampaign.IVerification[],
    mutationCheck: IEvidenceBenchmarkCodexCampaign.IMutationCheck | undefined,
    terminalReason: string,
    fatal: boolean,
  ): Promise<void> {
    const state = this.state!;
    this.abortController.abort(terminalReason);
    await this.quiesce(terminalReason);
    await this.log.flush();
    state.status = fatal ? "failed" : "interrupted";
    state.terminalReason = terminalReason;
    state.incompleteRound = {
      index,
      startedAtUtc,
      stage,
      ...(bundle === undefined ? {} : { bundle }),
      finders,
      dedupeDecisions,
      verifications,
      ...(mutationCheck === undefined ? {} : { mutationCheck }),
      reason: terminalReason,
    };
    state.updatedAtUtc = new Date().toISOString();
    await this.log.recordEvent(
      "campaign_incomplete",
      { index, stage, fatal, reason: terminalReason },
      { phase: "terminal" },
    );
    await this.persist();
  }

  private async restore(): Promise<void> {
    if (
      !Number.isSafeInteger(this.options.phase1Boundary.tDoneEventSeq) ||
      this.options.phase1Boundary.tDoneEventSeq < 1 ||
      this.options.phase1Boundary.tDoneEventSha256.length !== 64 ||
      this.options.phase1Boundary.tDoneSnapshotSha256.length !== 64 ||
      this.options.phase1Boundary.completionChallengeAdjudicationSha256
        .length !== 64 ||
      this.options.phase1Boundary.completionChallengeCompleted !== true
    )
      throw new Error("campaign requires a valid Phase 1 challenge boundary");
    const recovered =
      await EvidenceBenchmarkCodexCheckpoint.read<IEvidenceBenchmarkCodexCampaign.IState>(
        this.options.checkpointPath,
      );
    this.state =
      recovered ??
      ({
        schemaVersion: 1,
        status: "running",
        phase1Boundary: this.options.phase1Boundary,
        firstDoneThreadId: this.options.firstDoneThreadId,
        finderPromptSha256: this.options.finderPromptSha256,
        verifierPromptSha256: this.options.verifierPromptSha256,
        fixerPromptSha256: this.options.fixerPromptSha256,
        requiredCleanRounds: 2,
        consecutiveCleanRounds: 0,
        findingHistory: [],
        canonicalFindingIdRegistry: [],
        activeDedupeIndex: null,
        findingLifecycles: [],
        findingClosures: [],
        rounds: [],
        updatedAtUtc: new Date().toISOString(),
        startedAtUtc: new Date().toISOString(),
        deadlineAtUtc: new Date(
          Date.now() + this.options.timeoutMs,
        ).toISOString(),
      } satisfies IEvidenceBenchmarkCodexCampaign.IState);
    const state = this.state;
    this.deadlineEpochMilliseconds = Date.parse(state.deadlineAtUtc);
    if (
      !Number.isFinite(this.deadlineEpochMilliseconds) ||
      Date.parse(state.startedAtUtc) > this.deadlineEpochMilliseconds
    )
      throw new Error("campaign checkpoint has an invalid frozen deadline");
    if (
      state.firstDoneThreadId !== this.options.firstDoneThreadId ||
      state.finderPromptSha256 !== this.options.finderPromptSha256 ||
      state.verifierPromptSha256 !== this.options.verifierPromptSha256 ||
      state.fixerPromptSha256 !== this.options.fixerPromptSha256 ||
      state.requiredCleanRounds !== 2 ||
      EvidenceBenchmarkCodexValue.canonicalJson(state.phase1Boundary) !==
        EvidenceBenchmarkCodexValue.canonicalJson(this.options.phase1Boundary)
    )
      throw new Error("campaign checkpoint does not match frozen inputs");
    for (const round of state.rounds) {
      for (const instance of round.bundle.instances)
        this.usedBundleInstanceIds.add(instance.instanceId);
      for (const finder of round.finders)
        this.usedThreadIds.add(finder.threadId);
      for (const lifecycle of round.findingLifecycles)
        if (lifecycle.verification !== null)
          this.usedThreadIds.add(lifecycle.verification.threadId);
      for (const resolution of round.fixResolution?.findings ?? [])
        if (resolution.freshVerifierThreadId !== null)
          this.usedThreadIds.add(resolution.freshVerifierThreadId);
    }
    await this.persist();
  }

  private async terminal(
    status: "interrupted" | "failed",
    terminalReason: string,
  ): Promise<void> {
    const state = this.state!;
    this.abortController.abort(terminalReason);
    await this.quiesce(terminalReason);
    await this.log.flush();
    state.status = status;
    state.terminalReason = terminalReason;
    state.updatedAtUtc = new Date().toISOString();
    await this.log.recordEvent(
      `campaign_${status}`,
      { reason: terminalReason },
      { phase: "terminal" },
    );
    await this.persist();
  }

  private async persist(): Promise<void> {
    await EvidenceBenchmarkCodexCheckpoint.write(
      this.options.checkpointPath,
      this.state,
    );
  }

  private async quiesce(reason: string): Promise<void> {
    const cleanup = new AbortController();
    let timeout: NodeJS.Timeout | undefined;
    try {
      await Promise.race([
        this.adapter.quiesce(cleanup.signal),
        new Promise<never>((_resolve, reject): void => {
          timeout = setTimeout((): void => {
            const message = `adapter quiescence timed out after ${reason}`;
            cleanup.abort(message);
            reject(new Error(message));
          }, 30_000);
          timeout.unref();
        }),
      ]);
    } finally {
      if (timeout !== undefined) clearTimeout(timeout);
    }
  }

  private async step<T>(promise: Promise<T>, label: string): Promise<T> {
    const remaining = this.deadlineEpochMilliseconds - Date.now();
    if (remaining <= 0)
      throw new Error(`${label} exceeded the frozen campaign deadline`);
    let timer: NodeJS.Timeout | undefined;
    try {
      return await Promise.race([
        promise,
        new Promise<never>((_resolve, reject): void => {
          timer = setTimeout((): void => {
            this.abortController.abort(
              `${label} exceeded the frozen campaign deadline`,
            );
            reject(new Error(`${label} exceeded the frozen campaign deadline`));
          }, remaining);
          timer.unref();
        }),
      ]);
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  }

  private static sameStructure(
    left: IEvidenceBenchmarkCodexCampaign.IDedupeDecision,
    right: IEvidenceBenchmarkCodexCampaign.IDedupeDecision,
  ): boolean {
    return (
      EvidenceBenchmarkCodexValue.canonicalJson({
        clauseIds: left.clauseIds,
        lens: left.lens,
        behavior: left.behavior,
        expectedBehavior: left.expectedBehavior,
        observedBehavior: left.observedBehavior,
        locations: left.locations,
        reproduction: left.reproduction,
        claim: left.claim,
        evidence: left.evidence,
      }) ===
      EvidenceBenchmarkCodexValue.canonicalJson({
        clauseIds: right.clauseIds,
        lens: right.lens,
        behavior: right.behavior,
        expectedBehavior: right.expectedBehavior,
        observedBehavior: right.observedBehavior,
        locations: right.locations,
        reproduction: right.reproduction,
        claim: right.claim,
        evidence: right.evidence,
      })
    );
  }

  private static validateGates(
    gates: readonly IEvidenceBenchmarkCodexRecord.IGateResult[],
  ): void {
    if (
      !gates.some((gate) => gate.kind === "build") ||
      !gates.some((gate) => gate.kind === "test")
    )
      throw new Error("campaign requires full build and test gates");
    const failed = gates.find(
      (gate): boolean =>
        gate.exitCode !== 0 || gate.signal !== null || gate.timedOut,
    );
    if (failed !== undefined)
      throw new Error(`campaign gate ${failed.name} did not pass`);
  }

  private static fulfilled<T>(
    results: readonly PromiseSettledResult<T>[],
  ): T[] {
    return results.flatMap((result): T[] =>
      result.status === "fulfilled" ? [result.value] : [],
    );
  }

  private static rejected<T>(
    results: readonly PromiseSettledResult<T>[],
  ): PromiseRejectedResult | undefined {
    return results.find(
      (result): result is PromiseRejectedResult => result.status === "rejected",
    );
  }

  private static reason(result: PromiseRejectedResult): string {
    return EvidenceBenchmarkCodexCampaignCoordinator.message(result.reason);
  }

  private static message(input: unknown): string {
    return input instanceof Error ? input.message : String(input);
  }
}

/** Optional exact-boundary hooks for the enclosing measured runner. */
export namespace EvidenceBenchmarkCodexCampaignCoordinator {
  /** Hooks invoked only after their corresponding campaign proof exists. */
  export interface IHooks {
    /** First independently valid build-and-test gate set completed. */
    onGreen?: (
      /** One-based campaign round. */
      round: number,
      /** Independently executed gate results. */
      gates: IEvidenceBenchmarkCodexRecord.IGateResult[],
    ) => Promise<void>;

    /** Two digest-identical clean rounds established dryness. */
    onDry?: (
      /** One-based campaign round. */
      round: number,
      /** Protected authored-state digest. */
      authoredDigest: string,
      /** Hash of the campaign event that established dryness. */
      campaignEventSha256: string,
    ) => Promise<void>;
  }
}
