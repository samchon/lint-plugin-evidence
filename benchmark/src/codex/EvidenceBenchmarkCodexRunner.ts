import fs from "node:fs";
import path from "node:path";

import type { IEvidenceBenchmarkCodexCampaign } from "../structures/IEvidenceBenchmarkCodexCampaign.ts";
import type { IEvidenceBenchmarkCodexRecord } from "../structures/IEvidenceBenchmarkCodexRecord.ts";
import type { IEvidenceBenchmarkCodexRun } from "../structures/IEvidenceBenchmarkCodexRun.ts";
import { EvidenceBenchmarkCodexActivityLedger } from "./EvidenceBenchmarkCodexActivityLedger.ts";
import { EvidenceBenchmarkCodexCampaignCoordinator } from "./EvidenceBenchmarkCodexCampaignCoordinator.ts";
import { EvidenceBenchmarkCodexCheckpoint } from "./EvidenceBenchmarkCodexCheckpoint.ts";
import { EvidenceBenchmarkCodexCompletion } from "./EvidenceBenchmarkCodexCompletion.ts";
import { EvidenceBenchmarkCodexCostLedger } from "./EvidenceBenchmarkCodexCostLedger.ts";
import { EvidenceBenchmarkCodexGateRunner } from "./EvidenceBenchmarkCodexGateRunner.ts";
import { EvidenceBenchmarkCodexLaunchGate } from "./EvidenceBenchmarkCodexLaunchGate.ts";
import { EvidenceBenchmarkCodexLog } from "./EvidenceBenchmarkCodexLog.ts";
import { EvidenceBenchmarkCodexProcess } from "./EvidenceBenchmarkCodexProcess.ts";
import { EvidenceBenchmarkCodexProviderSchemas } from "./EvidenceBenchmarkCodexProviderSchemas.ts";
import { EvidenceBenchmarkCodexProtocol } from "./EvidenceBenchmarkCodexProtocol.ts";
import { EvidenceBenchmarkCodexSourceSnapshot } from "./EvidenceBenchmarkCodexSourceSnapshot.ts";
import { EvidenceBenchmarkCodexUsageLedger } from "./EvidenceBenchmarkCodexUsageLedger.ts";
import { EvidenceBenchmarkCodexValue } from "./EvidenceBenchmarkCodexValue.ts";

/**
 * Fail-closed long runner connecting Codex app-server, completion challenge,
 * Phase 2 campaign, exact usage, source sealing, and append-only promotion.
 */
export class EvidenceBenchmarkCodexRunner {
  private readonly checkpointPath: string;
  private readonly usagePath: string;
  private readonly activityPath: string;
  private readonly costPath: string;
  private readonly coreSealPath: string;
  private readonly executionSafetyPath: string;
  private readonly manifestSha256: string;
  private deadline = Number.POSITIVE_INFINITY;
  private log?: EvidenceBenchmarkCodexLog;
  private process?: EvidenceBenchmarkCodexProcess;
  private state?: IEvidenceBenchmarkCodexRun.IRunState;
  private usage = new EvidenceBenchmarkCodexUsageLedger();
  private activity = new EvidenceBenchmarkCodexActivityLedger();
  private cost?: EvidenceBenchmarkCodexCostLedger;
  private readonly turnFacts = new Map<
    string,
    EvidenceBenchmarkCodexRunner.ITurnFacts
  >();
  private goalStatus: IEvidenceBenchmarkCodexRun.GoalStatus | null = null;
  private activationPending = false;
  private activation?: Promise<EvidenceBenchmarkCodexProtocol.IResponse>;
  private fatal?: Error;
  private pulse?: () => void;
  private coordinator?: EvidenceBenchmarkCodexCampaignCoordinator;
  private forcedStop?: Promise<void>;
  private sharedStopDigest: string | null = null;
  private heartbeat?: NodeJS.Timeout;
  private persistTail: Promise<void> = Promise.resolve();
  private sealedSourceDirectory?: string;
  private sealedSourceManifestPath?: string;

  /**
   * Creates one non-restartable measured attempt.
   *
   * @param options Frozen run and campaign dependencies.
   */
  public constructor(
    private readonly options: EvidenceBenchmarkCodexRunner.IOptions,
  ) {
    this.checkpointPath = path.join(options.run.outputDirectory, "state.json");
    this.usagePath = path.join(options.run.outputDirectory, "usage.json");
    this.activityPath = path.join(options.run.outputDirectory, "activity.json");
    this.costPath = path.join(options.run.outputDirectory, "cost.json");
    this.coreSealPath = path.join(
      options.run.outputDirectory,
      "terminal-core-seal.json",
    );
    this.executionSafetyPath = path.join(
      options.run.outputDirectory,
      "execution-safety.json",
    );
    this.manifestSha256 = EvidenceBenchmarkCodexValue.sha256(
      EvidenceBenchmarkCodexValue.canonicalJson(options.run.manifest),
    );
  }

  /**
   * Applies one outer four-cell safety stop idempotently to every live phase.
   *
   * @param reason Evidence-backed shared stop reason.
   * @param sharedStopDigest SHA-256 of the outer scheduler stop record.
   * @param safetyLimitReason Shared token or wall-time boundary.
   */
  public abort(
    reason: string,
    sharedStopDigest: string,
    safetyLimitReason: "observed_total_tokens" | "hard_deadline",
  ): void {
    if (
      this.sharedStopDigest !== null &&
      this.sharedStopDigest !== sharedStopDigest
    )
      throw new Error("runner received conflicting shared stop digests");
    if (this.sharedStopDigest !== null) return;
    this.sharedStopDigest = sharedStopDigest;
    this.cost?.markSharedStop(sharedStopDigest);
    if (safetyLimitReason === "hard_deadline")
      this.cost?.markHardDeadlineStop();
    else this.cost?.markResponseObservedStop();
    this.cost?.markUsageLowerBound();
    this.usage.missingExactUsage(`shared ${safetyLimitReason} stop: ${reason}`);
    this.coordinator?.interrupt(reason);
    this.fatal = new EvidenceBenchmarkCodexRunner.ExternalAbort(
      reason,
      safetyLimitReason,
      sharedStopDigest,
    );
    this.scheduleForcedStop();
    this.signal();
  }

  /** Executes a fresh attempt or fail-closes a prior running checkpoint. */
  public async run(): Promise<IEvidenceBenchmarkCodexRun.IResult> {
    await this.options.preflight(this.options.run);
    EvidenceBenchmarkCodexCostLedger.priceSheet(
      JSON.parse(
        await fs.promises.readFile(
          this.options.run.frozenArtifacts.priceSheetPath,
          "utf8",
        ),
      ),
    );
    const recoveredUsage =
      await EvidenceBenchmarkCodexCheckpoint.read<IEvidenceBenchmarkCodexRecord.IUsageReport>(
        this.usagePath,
      );
    const recoveredActivity = await EvidenceBenchmarkCodexCheckpoint.read<{
      schemaVersion: 1;
      activities: IEvidenceBenchmarkCodexRecord.IActivity[];
    }>(this.activityPath);
    const recoveredCost =
      await EvidenceBenchmarkCodexCheckpoint.read<IEvidenceBenchmarkCodexRun.ICostReport>(
        this.costPath,
      );
    this.usage = new EvidenceBenchmarkCodexUsageLedger(recoveredUsage);
    this.activity = new EvidenceBenchmarkCodexActivityLedger(
      recoveredActivity?.activities,
    );
    this.cost = new EvidenceBenchmarkCodexCostLedger(
      this.options.run.manifest.experiment.costAuthorization
        .maximumObservedTotalTokens,
      this.options.run.manifest.experiment.costAuthorization
        .maximumObservedBlockTotalTokens,
      this.options.run.manifest.experiment.costAuthorization
        .hardWallDurationSeconds,
      this.options.run.manifest.experiment.costAuthorization
        .blockHardWallDurationSeconds,
      Date.now,
      recoveredCost,
    );
    if (recoveredCost !== undefined && recoveredUsage !== undefined) {
      const usageResponseIds = recoveredUsage.responses.map(
        (response): string => response.responseId,
      );
      if (
        EvidenceBenchmarkCodexValue.canonicalJson(
          [...usageResponseIds].sort(EvidenceBenchmarkCodexValue.utf8Compare),
        ) !==
          EvidenceBenchmarkCodexValue.canonicalJson(
            [...recoveredCost.responseIds].sort(
              EvidenceBenchmarkCodexValue.utf8Compare,
            ),
          ) ||
        recoveredUsage.exactTotal.totalTokens !==
          recoveredCost.observedTotalTokens
      )
        throw new Error("recovered usage and safety ledger disagree");
    }
    if (
      recoveredCost?.hardDeadlineUtc !== null &&
      recoveredCost?.hardDeadlineUtc !== undefined
    )
      this.deadline = Date.parse(recoveredCost.hardDeadlineUtc);
    if (this.sharedStopDigest !== null)
      this.cost.markSharedStop(this.sharedStopDigest);
    const recovered =
      await EvidenceBenchmarkCodexCheckpoint.read<IEvidenceBenchmarkCodexRun.IRunState>(
        this.checkpointPath,
      );
    this.log = new EvidenceBenchmarkCodexLog(
      this.options.run.outputDirectory,
      recovered?.streamHeads.envelope.lastSequence ?? 0,
      this.options.run.manifest.experiment.runId,
    );
    await this.log.open();
    if (recovered !== undefined) {
      this.state = recovered;
      if (recovered.status === "running") {
        await this.preservePrecrashLedgers();
        this.markRightCensored(
          "controller or app-server restart cannot preserve raw response events in Codex 0.145.0",
        );
        return this.finish(
          "interrupted",
          "controller or app-server restart cannot preserve raw response events in Codex 0.145.0",
          "harness",
        );
      }
      if (!(await this.ensureRecoveredCoreSeal()))
        return this.result(
          "failed",
          "terminal core is incomplete after controller crash",
        );
      return this.result(recovered.status, recovered.terminal?.reason);
    }
    this.state = this.initialState();
    await EvidenceBenchmarkCodexCheckpoint.write(
      path.join(this.options.run.outputDirectory, "manifest.json"),
      this.options.run.manifest,
    );
    await this.persist();
    try {
      if (this.fatal !== undefined) throw this.fatal;
      this.startHeartbeat();
      await this.startProcess();
      const primaryThreadId = await this.startPrimaryThread();
      const phase1 = await this.generationTurn(
        primaryThreadId,
        this.options.run.prompt,
        "phase1",
        true,
      );
      if (phase1.decision !== "complete")
        return await this.finish(
          "interrupted",
          `Phase 1 reported unfinished work: ${phase1.output.unfinished.join("; ")}`,
          "harness",
        );
      this.state.completionAdjudication = phase1;
      const done = await this.milestone(
        "t_done",
        "first generation turn completed with locally validated complete outcome",
      );
      const doneSource = await this.captureSource("t-done");
      this.state.tDoneSourceSnapshotSha256 =
        doneSource.manifest.sourceSnapshotSha256;
      this.state.gateAtDone = await new EvidenceBenchmarkCodexGateRunner(
        this.options.run.outputDirectory,
        this.log,
      ).run(this.options.run.gates, 0);
      const greenAtDone =
        this.state.gateAtDone.some((gate): boolean => gate.kind === "build") &&
        this.state.gateAtDone.some((gate): boolean => gate.kind === "test") &&
        this.state.gateAtDone.every(
          (gate): boolean =>
            gate.exitCode === 0 &&
            gate.signal === null &&
            gate.timedOut === false,
        );
      if (greenAtDone && this.state.milestones.t_green === undefined)
        await this.milestone(
          "t_green",
          "canonical build and test gates passed immediately after t_done",
        );
      this.state.green = greenAtDone;
      this.state.phase = "completion_challenge";
      await this.persist();
      const doneSnapshot = EvidenceBenchmarkCodexValue.sha256(
        await fs.promises.readFile(this.checkpointPath),
      );
      this.state.completionChallengeStarted = true;
      const challenge = await this.generationTurn(
        primaryThreadId,
        this.options.run.completionChallenge,
        "completion_challenge",
        false,
      );
      this.state.completionChallengeAdjudication = challenge;
      if (challenge.decision !== "complete")
        return await this.finish(
          "interrupted",
          `completion challenge reported unfinished work: ${challenge.output.unfinished.join("; ")}`,
          "harness",
        );
      this.state.phase1Boundary = {
        tDoneEventSeq: done.eventSeq,
        tDoneEventSha256: done.eventSha256,
        tDoneSnapshotSha256: doneSnapshot,
        tDoneSourceSnapshotSha256: doneSource.manifest.sourceSnapshotSha256,
        completionChallengeTurnId: challenge.turnId,
        completionChallengeResponseId: challenge.responseId,
        completionChallengeCompletedAtUtc: challenge.adjudicatedAtUtc,
        completionChallengeCompleted: true,
        completionChallengeAdjudicationSha256:
          EvidenceBenchmarkCodexValue.sha256(
            EvidenceBenchmarkCodexValue.canonicalJson(challenge),
          ),
      };
      this.state.phase = "campaign";
      await this.persist();
      const campaign = await this.options.campaign({
        process: this.process!,
        log: this.log,
        primaryThreadId,
        phase1Boundary: this.state.phase1Boundary,
      });
      EvidenceBenchmarkCodexProviderSchemas.admit(campaign.schemaRegistry);
      const schemaPins = this.options.run.manifest.runner.phase2SchemaSha256;
      if (
        campaign.schemaRegistry.schemas.generation_outcome.providerSha256 !==
          this.options.run.manifest.runner.generationOutcomeSchemaSha256 ||
        campaign.schemaRegistry.schemas.generation_outcome.localSha256 !==
          this.options.run.manifest.runner
            .generationOutcomeLocalValidationSha256 ||
        campaign.schemaRegistry.schemas.finding.providerSha256 !==
          schemaPins.finding.provider ||
        campaign.schemaRegistry.schemas.finding.localSha256 !==
          schemaPins.finding.local ||
        campaign.schemaRegistry.schemas.verification.providerSha256 !==
          schemaPins.verification.provider ||
        campaign.schemaRegistry.schemas.verification.localSha256 !==
          schemaPins.verification.local
      )
        throw new Error("Phase 2 provider/local schema registry drifted");
      const coordinator = new EvidenceBenchmarkCodexCampaignCoordinator(
        {
          runId: this.options.run.manifest.experiment.runId,
          firstDoneThreadId: primaryThreadId,
          phase1Boundary: this.state.phase1Boundary,
          finderPromptSha256:
            this.options.run.manifest.runner.phase2PromptSha256.finder,
          verifierPromptSha256:
            this.options.run.manifest.runner.phase2PromptSha256.verifier,
          fixerPromptSha256:
            this.options.run.manifest.runner.phase2PromptSha256.fixer,
          verifiedFindingSchemaSha256: campaign.verifiedFindingSchemaSha256,
          fixManifestDirectory: path.join(
            this.options.run.outputDirectory,
            "fix-manifests",
          ),
          checkpointPath: path.join(
            this.options.run.outputDirectory,
            "campaign.json",
          ),
          timeoutMs: Math.max(
            1,
            Math.min(campaign.timeoutMs, this.deadline - Date.now()),
          ),
        },
        campaign.adapter,
        this.log,
        {
          onGreen: async (round): Promise<void> => {
            if (this.state!.milestones.t_green === undefined)
              await this.milestone(
                "t_green",
                `first independent build-and-test gate set passed in round ${round}`,
              );
            this.state!.green = true;
          },
          onDry: async (
            round,
            authoredDigest,
            campaignEventSha256,
          ): Promise<void> => {
            if (this.state!.milestones.t_dry === undefined)
              await this.milestone(
                "t_dry",
                `round ${round} established K=2 digest ${authoredDigest}; campaign event ${campaignEventSha256}`,
              );
          },
        },
      );
      this.coordinator = coordinator;
      const campaignState = await coordinator.run();
      this.coordinator = undefined;
      this.state.campaignCheckpointSha256 = EvidenceBenchmarkCodexValue.sha256(
        await fs.promises.readFile(
          path.join(this.options.run.outputDirectory, "campaign.json"),
        ),
      );
      if (campaignState.status !== "completed")
        if (campaignState.status === "interrupted") {
          this.markRightCensored(
            "Phase 2 interruption may omit in-flight final usage",
          );
          return await this.finish(
            "interrupted",
            campaignState.terminalReason ?? "Phase 2 campaign did not complete",
            "watchdog",
          );
        } else
          return await this.finish(
            "failed",
            campaignState.terminalReason ?? "Phase 2 campaign did not complete",
            null,
          );
      const finalRound = campaignState.rounds.at(-1);
      this.state.green =
        finalRound !== undefined &&
        finalRound.gates.some((gate): boolean => gate.kind === "build") &&
        finalRound.gates.some((gate): boolean => gate.kind === "test") &&
        finalRound.gates.every(
          (gate): boolean =>
            gate.exitCode === 0 && !gate.timedOut && gate.signal === null,
        );
      if (!this.state.green)
        return await this.finish(
          "failed",
          "Phase 2 completed without independent green build and test gates",
          null,
        );
      const drySource = await this.captureSource("t-dry");
      const sourceSnapshot = drySource.manifest;
      this.state.tDrySourceSnapshotSha256 = sourceSnapshot.sourceSnapshotSha256;
      this.sealedSourceDirectory = drySource.directory;
      this.sealedSourceManifestPath = drySource.manifestPath;
      this.state.phase = "grading";
      await this.process!.stop();
      this.process = undefined;
      const usage = this.usage.report();
      if (!usage.exactUsageComplete)
        return await this.finish(
          "failed",
          "exact raw response usage is incomplete",
          null,
        );
      const orphans = await this.log.orphanSegments();
      if (orphans.length !== 0)
        return await this.finish(
          "failed",
          "raw transport contains preserved orphan segments",
          null,
        );
      return await this.finish("completed", "t_dry reached", null);
    } catch (error) {
      const cause = this.fatal ?? error;
      if (cause instanceof EvidenceBenchmarkCodexCostLedger.BudgetExceeded) {
        if (cause.reason === "hard_deadline") this.cost!.markHardDeadlineStop();
        else this.cost!.markResponseObservedStop();
        this.markRightCensored(cause.message);
        this.coordinator?.interrupt(cause.message);
        this.scheduleForcedStop();
        return this.finish(
          "safety_limit",
          `${cause.message}; response-observed overshoot ${cause.overshootTokens} tokens`,
          "safety_limit",
          cause.reason === "hard_deadline"
            ? "hard_deadline"
            : "observed_total_tokens",
        );
      }
      if (cause instanceof EvidenceBenchmarkCodexRunner.DeadlineExceeded) {
        this.cost!.markHardDeadlineStop();
        this.markRightCensored(cause.message);
        this.coordinator?.interrupt(cause.message);
        this.scheduleForcedStop();
        return this.finish(
          "safety_limit",
          cause.message,
          "safety_limit",
          "hard_deadline",
        );
      }
      if (cause instanceof EvidenceBenchmarkCodexRunner.ExternalAbort)
        return this.finish(
          "safety_limit",
          cause.message,
          "safety_limit",
          cause.safetyLimitReason,
        );
      return this.finish(
        "failed",
        cause instanceof Error ? cause.message : String(cause),
        null,
      );
    } finally {
      this.stopHeartbeat();
      if (this.process !== undefined) {
        await this.process.stop().catch((): void => {});
        this.process = undefined;
      }
    }
  }

  private async startProcess(): Promise<void> {
    this.process = new EvidenceBenchmarkCodexProcess(
      {
        command: this.options.run.appServer.command,
        arguments: this.options.run.appServer.arguments,
        cwd: this.options.run.workspace,
        environment: this.options.run.appServer.environment,
        requestTimeoutMs: this.options.run.requestTimeoutMs,
        shutdownGraceMs: this.options.run.appServer.shutdownGraceMs,
        log: this.log!,
        onFrame: async (): Promise<void> => {},
        onNotification: async (notification, frame): Promise<void> => {
          await this.notification(notification, frame.receivedAtUtc);
        },
        onProtocolAnomaly: async (message): Promise<void> => {
          this.usage.missingExactUsage(message);
          this.fatal = new Error(`protocol anomaly: ${message}`);
          await this.log!.recordEvent(
            "protocol_anomaly",
            { message },
            { phase: "reconciliation", actor: "auditor" },
          );
          this.signal();
        },
        beforeRequest: async (method): Promise<void> => {
          if (method === "turn/start") this.cost!.assertCanStartProviderTurn();
        },
      },
      this.state!.lastRequestId,
    );
    await this.process.start();
    void this.process.wait().then((exit): void => {
      if (!exit.expected && this.state?.status === "running") {
        this.usage.missingExactUsage(
          "app-server exited; Codex 0.145.0 resume cannot restore raw events",
        );
        this.fatal = new Error(
          `app-server exited unexpectedly (${String(exit.code)}/${String(exit.signal)})`,
        );
        this.signal();
      }
    });
    const initialize = EvidenceBenchmarkCodexProtocol.initialize(0);
    await this.process.request(initialize.method, initialize.params);
    const initialized = EvidenceBenchmarkCodexProtocol.initialized();
    await this.process.notify(initialized.method, initialized.params);
  }

  private async startPrimaryThread(): Promise<string> {
    const response = await this.process!.request(
      "thread/start",
      EvidenceBenchmarkCodexProtocol.threadStart(0, this.options.run).params,
    );
    const thread = EvidenceBenchmarkCodexProtocol.responseThread(response);
    const identity =
      EvidenceBenchmarkCodexProtocol.responseThreadStartIdentity(response);
    const threadId = EvidenceBenchmarkCodexValue.string(thread.id, "thread.id");
    const sessionId =
      typeof thread.sessionId === "string" ? thread.sessionId : threadId;
    if (
      identity.model !== this.options.run.manifest.runner.model ||
      identity.modelProvider !==
        this.options.run.manifest.runner.modelProvider ||
      identity.serviceTier !== null ||
      thread.modelProvider !== identity.modelProvider ||
      path.resolve(identity.cwd) !== path.resolve(this.options.run.workspace) ||
      identity.approvalPolicy !== "never" ||
      identity.sandboxPolicy.type !== "workspaceWrite" ||
      identity.effort !== this.options.run.manifest.runner.effort
    )
      throw new Error("effective thread settings drifted");
    this.state!.primaryThreadId = threadId;
    this.state!.sessionId = sessionId;
    this.state!.threads[threadId] = {
      id: threadId,
      parentThreadId: null,
      sessionId,
      status: "idle",
      rolloutPath: typeof thread.path === "string" ? thread.path : undefined,
    };
    this.state!.effectiveThreadSettings = {
      threadId,
      cwd: identity.cwd,
      model: this.options.run.manifest.runner.model,
      modelProvider: this.options.run.manifest.runner.modelProvider,
      serviceTier: null,
      effort: this.options.run.manifest.runner.effort,
      approvalPolicy: "never",
      sandboxType: "workspaceWrite",
      activePermissionProfileId: identity.activePermissionProfileId,
      observedAtUtc: new Date().toISOString(),
      source: "thread/start",
    };
    const stagedGoal = await this.process!.request(
      "thread/goal/set",
      EvidenceBenchmarkCodexProtocol.goalSet(
        0,
        threadId,
        this.options.run.goal,
        "paused",
      ).params,
    );
    this.validateGoalResponse(stagedGoal, threadId, "paused");
    this.state!.goal = {
      objectiveSha256: this.options.run.manifest.runner.goalSha256,
      status: "paused",
      checkedAtUtc: new Date().toISOString(),
    };
    this.state!.phase = "phase1";
    await this.persist();
    return threadId;
  }

  private async generationTurn(
    threadId: string,
    prompt: string,
    context: IEvidenceBenchmarkCodexRun.ICompletionAdjudication["context"],
    activateGoal: boolean,
  ): Promise<IEvidenceBenchmarkCodexRun.ICompletionAdjudication> {
    this.activationPending = activateGoal;
    const response = await this.process!.request(
      "turn/start",
      EvidenceBenchmarkCodexProtocol.turnStart(
        0,
        threadId,
        prompt,
        this.options.run.manifest,
        this.options.run.generationOutcomeSchema,
      ).params,
    );
    const turnId = EvidenceBenchmarkCodexProtocol.responseTurnId(response);
    this.state!.activeTurnId = turnId;
    this.state!.firstTurnStarted = true;
    if (activateGoal)
      await this.wait((): boolean => this.activation !== undefined);
    await this.activation;
    const facts = await this.waitTurn(turnId);
    if (facts.status !== "completed")
      throw new Error(`generation turn ${turnId} ended ${facts.status}`);
    const output = EvidenceBenchmarkCodexCompletion.parse(facts.assistantText!);
    if (output.outcome === "complete")
      await this.wait((): boolean => this.goalStatus === "complete");
    const goalResponse = await this.process!.request(
      "thread/goal/get",
      EvidenceBenchmarkCodexProtocol.goalGet(0, threadId).params,
    );
    this.validateGoalResponse(
      goalResponse,
      threadId,
      this.goalStatus ?? "paused",
    );
    const consistency =
      this.goalStatus === null
        ? "unavailable"
        : output.outcome === "complete" && this.goalStatus === "complete"
          ? "consistent"
          : output.outcome === "interrupted" && this.goalStatus !== "complete"
            ? "consistent"
            : "mismatch";
    const decision =
      output.outcome === "complete" && consistency !== "mismatch"
        ? "complete"
        : "interrupted";
    const event = await this.log!.recordEvent(
      "completion_adjudicated",
      {
        context,
        threadId,
        turnId,
        responseId: facts.responseId,
        assistantItemId: facts.assistantItemId,
        decision,
        goalConsistency: consistency,
      },
      { phase: "agent", actor: "auditor" },
    );
    this.state!.activeTurnId = undefined;
    return {
      threadId,
      turnId,
      responseId: facts.responseId!,
      assistantItemId: facts.assistantItemId!,
      turnStatus: "completed",
      context,
      outputSchemaSha256:
        this.options.run.manifest.runner.generationOutcomeSchemaSha256,
      localValidationSha256:
        this.options.run.manifest.runner.generationOutcomeLocalValidationSha256,
      localValidationPassed: true,
      output,
      goalStatus: this.goalStatus,
      goalConsistency: consistency,
      decision,
      eventSeq: event.seq,
      eventSha256: event.eventSha256,
      adjudicatedAtUtc: event.utc,
    };
  }

  private async notification(
    notification: EvidenceBenchmarkCodexProtocol.IServerNotification,
    receivedAtUtc: string,
  ): Promise<void> {
    const { method, params } = notification;
    this.usage.ingest(method, params, receivedAtUtc);
    if (method === "rawResponse/completed") {
      const responseId = EvidenceBenchmarkCodexValue.string(
        params.responseId,
        "responseId",
      );
      const response = this.usage
        .report()
        .responses.find((entry): boolean => entry.responseId === responseId);
      if (response !== undefined) {
        const priorCount = this.cost!.report().responseIds.length;
        this.cost!.ingest(response);
        const report = this.cost!.report();
        if (report.responseIds.length !== priorCount) {
          await EvidenceBenchmarkCodexCheckpoint.write(this.costPath, report);
          await this.log!.recordEvent(
            "cost_updated",
            {
              responseId,
              observedTotalTokens: report.observedTotalTokens,
              maximumObservedTotalTokens: report.maximumObservedTotalTokens,
              responseObservedOvershootTokens:
                report.responseObservedOvershootTokens,
              thresholdReached: report.thresholdReached,
            },
            { phase: "reconciliation", actor: "auditor" },
          );
          if (report.thresholdReached) {
            this.cost!.markResponseObservedStop();
            this.usage.missingExactUsage(
              "response-observed cost stop may omit in-flight final usage",
            );
            this.cost!.markUsageLowerBound();
            await Promise.all([
              EvidenceBenchmarkCodexCheckpoint.write(
                this.costPath,
                this.cost!.report(),
              ),
              this.usage.write(this.usagePath),
            ]);
            const activeTurnId = this.state!.activeTurnId;
            const primaryThreadId = this.state!.primaryThreadId;
            if (activeTurnId !== undefined && primaryThreadId !== undefined)
              void this.process!.request(
                "turn/interrupt",
                EvidenceBenchmarkCodexProtocol.turnInterrupt(
                  0,
                  primaryThreadId,
                  activeTurnId,
                ).params,
              ).catch((): void => {});
            this.coordinator?.interrupt(
              "response-observed provider-credit threshold reached",
            );
            this.scheduleForcedStop();
            this.fatal = new EvidenceBenchmarkCodexCostLedger.BudgetExceeded(
              "observed_token_threshold",
              report.observedTotalTokens,
              report.maximumObservedTotalTokens,
              report.responseObservedOvershootTokens,
            );
            this.signal();
          }
        }
      }
    }
    this.activity.ingest(method, params, receivedAtUtc);
    if (method === "model/rerouted") {
      this.fatal = new Error("model reroute violates the frozen model");
      this.signal();
      return;
    }
    if (method === "thread/settings/updated") {
      try {
        const settings =
          EvidenceBenchmarkCodexProtocol.notificationThreadSettings(params);
        this.reconcileThreadSettings(
          settings,
          receivedAtUtc,
          "thread/settings/updated",
        );
      } catch (error) {
        this.fatal = error instanceof Error ? error : new Error(String(error));
        this.signal();
        return;
      }
    }
    if (method === "turn/started") {
      const turn = EvidenceBenchmarkCodexValue.isRecord(params.turn)
        ? params.turn
        : undefined;
      const turnId =
        turn === undefined
          ? undefined
          : EvidenceBenchmarkCodexValue.string(turn.id, "turn.id");
      if (turnId !== undefined) this.facts(turnId).status = "inProgress";
      if (this.activationPending) {
        this.activationPending = false;
        if (this.state!.milestones.t0 === undefined) {
          const t0 = await this.milestone(
            "t0",
            "first user turn started before Goal activation",
          );
          await this.activateExecutionSafety(t0);
        }
        const primaryThreadId = this.state!.primaryThreadId!;
        this.activation = this.process!.request(
          "thread/goal/set",
          EvidenceBenchmarkCodexProtocol.goalSet(
            0,
            primaryThreadId,
            undefined,
            "active",
          ).params,
        ).then((response): EvidenceBenchmarkCodexProtocol.IResponse => {
          this.validateGoalResponse(response, primaryThreadId, "active");
          return response;
        });
        void this.activation.catch((error: unknown): void => {
          this.fatal =
            error instanceof Error ? error : new Error(String(error));
          this.signal();
        });
      }
    } else if (method === "rawResponse/completed") {
      const turnId = EvidenceBenchmarkCodexValue.string(
        params.turnId,
        "turnId",
      );
      this.facts(turnId).responseId = EvidenceBenchmarkCodexValue.string(
        params.responseId,
        "responseId",
      );
    } else if (method === "item/completed") {
      if (!EvidenceBenchmarkCodexValue.isRecord(params.item)) return;
      const item = params.item;
      if (item.type === "agentMessage" && typeof item.text === "string") {
        if (
          item.phase !== undefined &&
          item.phase !== null &&
          item.phase !== "final_answer"
        )
          return;
        const turnId = EvidenceBenchmarkCodexValue.string(
          params.turnId,
          "turnId",
        );
        const facts = this.facts(turnId);
        facts.assistantCandidates ??= [];
        facts.assistantCandidates.push({
          id: EvidenceBenchmarkCodexValue.string(item.id, "item.id"),
          text: item.text,
          explicitFinal: item.phase === "final_answer",
        });
      }
    } else if (method === "turn/completed") {
      if (!EvidenceBenchmarkCodexValue.isRecord(params.turn)) return;
      const turnId = EvidenceBenchmarkCodexValue.string(
        params.turn.id,
        "turn.id",
      );
      this.facts(turnId).status = EvidenceBenchmarkCodexValue.string(
        params.turn.status,
        "turn.status",
      ) as IEvidenceBenchmarkCodexRun.TurnStatus;
    } else if (method === "thread/goal/updated") {
      if (EvidenceBenchmarkCodexValue.isRecord(params.goal)) {
        const primaryThreadId = this.state!.primaryThreadId;
        if (
          primaryThreadId === undefined ||
          params.threadId !== primaryThreadId ||
          params.goal.threadId !== primaryThreadId
        ) {
          await this.log!.recordEvent(
            "descendant_goal_observed",
            {
              notificationThreadId: params.threadId ?? null,
              goalThreadId: params.goal.threadId ?? null,
            },
            { phase: "agent", actor: "auditor" },
          );
          return;
        }
        if (
          typeof params.goal.objective !== "string" ||
          EvidenceBenchmarkCodexValue.sha256(params.goal.objective) !==
            this.options.run.manifest.runner.goalSha256
        ) {
          this.fatal = new Error("primary Goal objective drifted");
          this.signal();
          return;
        }
        const status = params.goal.status;
        if (
          typeof status === "string" &&
          [
            "active",
            "paused",
            "blocked",
            "usageLimited",
            "budgetLimited",
            "complete",
          ].includes(status)
        ) {
          this.goalStatus = status as IEvidenceBenchmarkCodexRun.GoalStatus;
          this.state!.goal = {
            objectiveSha256: this.options.run.manifest.runner.goalSha256,
            status: this.goalStatus,
            checkedAtUtc: receivedAtUtc,
          };
        }
      }
    }
    this.state!.lastActivityAtUtc = receivedAtUtc;
    this.signal();
  }

  private facts(turnId: string): EvidenceBenchmarkCodexRunner.ITurnFacts {
    let facts = this.turnFacts.get(turnId);
    if (facts === undefined) {
      facts = {};
      this.turnFacts.set(turnId, facts);
    }
    return facts;
  }

  private async waitTurn(
    turnId: string,
  ): Promise<EvidenceBenchmarkCodexRunner.ICompleteTurnFacts> {
    await this.wait((): boolean => {
      const facts = this.facts(turnId);
      this.finalizeAssistant(turnId, facts);
      return (
        facts.status !== undefined &&
        facts.status !== "inProgress" &&
        facts.responseId !== undefined &&
        facts.assistantItemId !== undefined &&
        facts.assistantText !== undefined
      );
    });
    return this.facts(
      turnId,
    ) as EvidenceBenchmarkCodexRunner.ICompleteTurnFacts;
  }

  private finalizeAssistant(
    turnId: string,
    facts: EvidenceBenchmarkCodexRunner.ITurnFacts,
  ): void {
    if (
      facts.status === undefined ||
      facts.status === "inProgress" ||
      facts.assistantItemId !== undefined
    )
      return;
    const candidates = facts.assistantCandidates ?? [];
    if (candidates.length === 1) {
      facts.assistantItemId = candidates[0]!.id;
      facts.assistantText = candidates[0]!.text;
    } else if (candidates.length > 1) {
      this.fatal = new Error(
        `turn ${turnId} emitted multiple conflicting terminal assistant candidates`,
      );
    }
  }

  private validateGoalResponse(
    response: EvidenceBenchmarkCodexProtocol.IResponse,
    threadId: string,
    expectedStatus: IEvidenceBenchmarkCodexRun.GoalStatus,
  ): void {
    const goal = EvidenceBenchmarkCodexProtocol.responseGoal(response);
    if (
      goal.threadId !== threadId ||
      goal.status !== expectedStatus ||
      typeof goal.objective !== "string" ||
      EvidenceBenchmarkCodexValue.sha256(goal.objective) !==
        this.options.run.manifest.runner.goalSha256
    )
      throw new Error(
        "primary Goal response identity, objective, or status drifted",
      );
  }

  private async wait(predicate: () => boolean): Promise<void> {
    while (!predicate()) {
      if (this.fatal !== undefined) throw this.fatal;
      const remaining = this.deadline - Date.now();
      if (remaining <= 0)
        throw new EvidenceBenchmarkCodexRunner.DeadlineExceeded(
          "benchmark hard wall deadline elapsed; final usage may be incomplete",
        );
      await new Promise<void>((resolve): void => {
        this.pulse = resolve;
        const timer = setTimeout(resolve, Math.min(remaining, 1_000));
        timer.unref();
      });
      this.pulse = undefined;
    }
    if (this.fatal !== undefined) throw this.fatal;
  }

  private signal(): void {
    this.pulse?.();
  }

  private async milestone(
    name: IEvidenceBenchmarkCodexRecord.Milestone,
    basis: string,
  ): Promise<{
    eventSeq: number;
    eventSha256: string;
    occurredAtUtc: string;
    monotonicNanoseconds: string;
  }> {
    if (this.state!.milestones[name] !== undefined)
      throw new Error(`milestone ${name} was already recorded`);
    const event = await this.log!.recordEvent(
      "milestone",
      { name, basis },
      { phase: "agent", actor: "auditor" },
    );
    this.state!.milestones[name] = {
      name,
      occurredAtUtc: event.utc,
      monotonicNanoseconds: event.monotonicNs,
      measurement: "exact-event",
      basis,
    };
    return {
      eventSeq: event.seq,
      eventSha256: event.eventSha256,
      occurredAtUtc: event.utc,
      monotonicNanoseconds: event.monotonicNs,
    };
  }

  private async activateExecutionSafety(t0: {
    eventSeq: number;
    eventSha256: string;
    occurredAtUtc: string;
    monotonicNanoseconds: string;
  }): Promise<void> {
    const authorization =
      this.options.run.manifest.experiment.costAuthorization;
    const hardDeadlineUtc = new Date(
      Date.parse(t0.occurredAtUtc) +
        authorization.hardWallDurationSeconds * 1_000,
    ).toISOString();
    await EvidenceBenchmarkCodexCheckpoint.writeOnce(this.executionSafetyPath, {
      schemaVersion: 1,
      runId: this.options.run.manifest.experiment.runId,
      blockId: this.options.run.manifest.experiment.blockId,
      blockPlanSha256: this.options.run.manifest.experiment.blockPlanSha256,
      t0EventSeq: t0.eventSeq,
      t0EventSha256: t0.eventSha256,
      t0Utc: t0.occurredAtUtc,
      t0MonotonicNanoseconds: t0.monotonicNanoseconds,
      maximumObservedTotalTokens: authorization.maximumObservedTotalTokens,
      hardWallDurationSeconds: authorization.hardWallDurationSeconds,
      hardDeadlineUtc,
      maximumObservedBlockTotalTokens:
        authorization.maximumObservedBlockTotalTokens,
      blockHardWallDurationSeconds: authorization.blockHardWallDurationSeconds,
      hardCeilingGuaranteed: false,
      monetaryStatus: "unavailable",
    });
    const executionSafetySha256 = EvidenceBenchmarkCodexValue.sha256(
      await fs.promises.readFile(this.executionSafetyPath),
    );
    this.deadline = Date.parse(
      this.cost!.activateDeadline(t0.occurredAtUtc, executionSafetySha256),
    );
    this.state!.executionSafetySha256 = executionSafetySha256;
    await this.persist();
  }

  private initialState(): IEvidenceBenchmarkCodexRun.IRunState {
    const now = new Date().toISOString();
    const empty = EvidenceBenchmarkCodexValue.sha256("");
    return {
      schemaVersion: 1,
      status: "running",
      manifestSha256: this.manifestSha256,
      phase: "setup",
      startedAtUtc: now,
      updatedAtUtc: now,
      threads: {},
      effectiveThreadSettings: null,
      goal: null,
      restartCount: 0,
      gateRepairCount: 0,
      firstTurnStarted: false,
      completionAdjudication: null,
      phase1Boundary: null,
      completionChallengeStarted: false,
      completionChallengeAdjudication: null,
      green: false,
      gateAtDone: [],
      milestones: {},
      streamHeads: {
        raw: {
          client: { byteLength: 0, sha256: empty },
          server: { byteLength: 0, sha256: empty },
          stderr: { byteLength: 0, sha256: empty },
        },
        envelope: {
          lastSequence: 0,
          byteLength: 0,
          sha256: empty,
        },
        event: {
          lastSequence: 0,
          lastEventSha256: "0".repeat(64),
          byteLength: 0,
          sha256: empty,
        },
      },
      lastRequestId: 0,
      lastActivityAtUtc: now,
      campaignCheckpointSha256: null,
      tDoneSourceSnapshotSha256: null,
      tDrySourceSnapshotSha256: null,
      executionSafetySha256: null,
      terminal: null,
    };
  }

  private async persist(): Promise<void> {
    const operation = this.persistTail.then(async (): Promise<void> =>
      this.persistNow(),
    );
    this.persistTail = operation.catch((): void => {});
    return operation;
  }

  private async persistNow(): Promise<void> {
    this.state!.lastRequestId = this.process?.lastRequestId() ?? 0;
    this.state!.streamHeads = await this.log!.streamHeads();
    this.state!.updatedAtUtc = new Date().toISOString();
    await EvidenceBenchmarkCodexCheckpoint.write(
      this.checkpointPath,
      this.state,
    );
    await Promise.all([
      this.usage.write(this.usagePath),
      this.activity.write(this.activityPath),
      EvidenceBenchmarkCodexCheckpoint.write(
        this.costPath,
        this.cost!.report(),
      ),
    ]);
  }

  private startHeartbeat(): void {
    if (this.heartbeat !== undefined)
      throw new Error("runner heartbeat already started");
    this.heartbeat = setInterval((): void => {
      void this.heartbeatOnce().catch((error: unknown): void => {
        this.fatal = error instanceof Error ? error : new Error(String(error));
        this.signal();
      });
    }, this.options.run.heartbeatIntervalMs);
    this.heartbeat.unref();
  }

  private stopHeartbeat(): void {
    if (this.heartbeat === undefined) return;
    clearInterval(this.heartbeat);
    this.heartbeat = undefined;
  }

  private async heartbeatOnce(): Promise<void> {
    if (this.state?.status !== "running") return;
    await this.log!.recordEvent(
      "runner_heartbeat",
      {
        phase: this.state.phase,
        activeTurnId: this.state.activeTurnId ?? null,
        responseCount: this.usage.report().responses.length,
      },
      { phase: "reconciliation", actor: "runner" },
    );
    await this.persist();
  }

  private async finish(
    status: Exclude<IEvidenceBenchmarkCodexRun.Status, "running">,
    reason: string,
    interruptionSubtype: NonNullable<
      IEvidenceBenchmarkCodexRun.IRunState["terminal"]
    >["interruptionSubtype"],
    safetyLimitReason: NonNullable<
      IEvidenceBenchmarkCodexRun.IRunState["terminal"]
    >["safetyLimitReason"] = null,
  ): Promise<IEvidenceBenchmarkCodexRun.IResult> {
    if (this.state!.status !== "running")
      return status === "failed"
        ? this.result("failed", reason)
        : this.result(this.state!.status, this.state!.terminal?.reason);
    this.stopHeartbeat();
    if (this.process !== undefined) {
      await this.process.stop().catch((): void => {});
      this.process = undefined;
    }
    await this.persist();
    const lastCheckpointSha256 = EvidenceBenchmarkCodexValue.sha256(
      await fs.promises.readFile(this.checkpointPath),
    );
    this.state!.status = status;
    this.state!.phase = "terminal";
    this.state!.terminal = {
      atUtc: new Date().toISOString(),
      reason,
      interruptionSubtype:
        status === "interrupted" || status === "safety_limit"
          ? interruptionSubtype
          : null,
      safetyLimitReason:
        status === "safety_limit" && interruptionSubtype === "safety_limit"
          ? safetyLimitReason
          : null,
      sharedStopDigest: this.sharedStopDigest,
      lastCheckpointSha256,
    };
    await this.log!.recordEvent(
      "run_terminal",
      { status, reason, interruptionSubtype, safetyLimitReason },
      { phase: "terminal", actor: "runner" },
    );
    await this.persist();
    if (
      this.sealedSourceDirectory === undefined ||
      this.sealedSourceManifestPath === undefined
    ) {
      const terminalSource = await this.captureSource(`terminal-${status}`);
      this.sealedSourceDirectory = terminalSource.directory;
      this.sealedSourceManifestPath = terminalSource.manifestPath;
    }
    await this.writeCoreSeal();
    return this.result(status, reason);
  }

  private async writeCoreSeal(): Promise<void> {
    const sourceDirectory = this.sealedSourceDirectory;
    const sourceManifestPath = this.sealedSourceManifestPath;
    if (sourceDirectory === undefined || sourceManifestPath === undefined)
      throw new Error("terminal core cannot seal without a retained source");
    await EvidenceBenchmarkCodexCheckpoint.writeOnce(this.coreSealPath, {
      schemaVersion: 1,
      complete: true,
      runId: this.options.run.manifest.experiment.runId,
      status: this.state!.status,
      terminalAtUtc: this.state!.terminal!.atUtc,
      manifestSha256: this.state!.manifestSha256,
      checkpointSha256: EvidenceBenchmarkCodexValue.sha256(
        await fs.promises.readFile(this.checkpointPath),
      ),
      finalEventSha256: this.state!.streamHeads.event.lastEventSha256,
      usageSha256: EvidenceBenchmarkCodexValue.sha256(
        await fs.promises.readFile(this.usagePath),
      ),
      activitySha256: EvidenceBenchmarkCodexValue.sha256(
        await fs.promises.readFile(this.activityPath),
      ),
      costSha256: EvidenceBenchmarkCodexValue.sha256(
        await fs.promises.readFile(this.costPath),
      ),
      sourceSnapshotManifestSha256: EvidenceBenchmarkCodexValue.sha256(
        await fs.promises.readFile(sourceManifestPath),
      ),
      sourceSnapshotDirectory: path.relative(
        this.options.run.outputDirectory,
        sourceDirectory,
      ),
      sourceSnapshotManifestPath: path.relative(
        this.options.run.outputDirectory,
        sourceManifestPath,
      ),
      finalPromotionOwnedBy: "postprocess",
      latestAndDemoUpdated: false,
    });
  }

  private async ensureRecoveredCoreSeal(): Promise<boolean> {
    if (await this.exists(this.coreSealPath)) {
      return this.verifyCoreSeal();
    }
    const status = this.state!.status;
    const candidates = [
      ...(status === "completed"
        ? [
            {
              directory: path.join(
                this.options.run.outputDirectory,
                "artifacts",
                "t-dry-workspace",
              ),
              manifestPath: path.join(
                this.options.run.outputDirectory,
                "artifacts",
                "t-dry-source-snapshot.json",
              ),
            },
          ]
        : []),
      {
        directory: path.join(
          this.options.run.outputDirectory,
          "artifacts",
          `terminal-${status}-workspace`,
        ),
        manifestPath: path.join(
          this.options.run.outputDirectory,
          "artifacts",
          `terminal-${status}-source-snapshot.json`,
        ),
      },
    ];
    const retained = (
      await Promise.all(
        candidates.map(async (candidate) => ({
          candidate,
          exists:
            (await this.exists(candidate.directory)) &&
            (await this.exists(candidate.manifestPath)),
        })),
      )
    ).find((entry): boolean => entry.exists)?.candidate;
    if (retained === undefined) {
      await EvidenceBenchmarkCodexCheckpoint.writeOnce(this.coreSealPath, {
        schemaVersion: 1,
        complete: false,
        runId: this.options.run.manifest.experiment.runId,
        originalStatus: status,
        detectedAtUtc: new Date().toISOString(),
        reason:
          "terminal checkpoint exists without a retained terminal source snapshot",
        manifestSha256: this.state!.manifestSha256,
        checkpointSha256: EvidenceBenchmarkCodexValue.sha256(
          await fs.promises.readFile(this.checkpointPath),
        ),
        finalPromotionOwnedBy: "postprocess",
        latestAndDemoUpdated: false,
      });
      return false;
    }
    this.sealedSourceDirectory = retained.directory;
    this.sealedSourceManifestPath = retained.manifestPath;
    await this.writeCoreSeal();
    return true;
  }

  private async verifyCoreSeal(): Promise<boolean> {
    const seal = JSON.parse(
      await fs.promises.readFile(this.coreSealPath, "utf8"),
    ) as Record<string, unknown>;
    if (seal.complete === false) return false;
    if (seal.complete !== true)
      throw new Error("terminal core seal completeness is missing");
    const verifyHash = async (target: string, field: string): Promise<void> => {
      if (
        typeof seal[field] !== "string" ||
        EvidenceBenchmarkCodexValue.sha256(
          await fs.promises.readFile(target),
        ) !== seal[field]
      )
        throw new Error(`terminal core seal ${field} does not match`);
    };
    if (
      seal.runId !== this.options.run.manifest.experiment.runId ||
      seal.status !== this.state!.status ||
      seal.manifestSha256 !== this.state!.manifestSha256
    )
      throw new Error("terminal core seal identity does not match checkpoint");
    await Promise.all([
      verifyHash(this.checkpointPath, "checkpointSha256"),
      verifyHash(this.usagePath, "usageSha256"),
      verifyHash(this.activityPath, "activitySha256"),
      verifyHash(this.costPath, "costSha256"),
    ]);
    if (
      typeof seal.sourceSnapshotDirectory !== "string" ||
      typeof seal.sourceSnapshotManifestPath !== "string"
    )
      throw new Error("terminal core seal has no retained source paths");
    const sourceDirectory = path.resolve(
      this.options.run.outputDirectory,
      seal.sourceSnapshotDirectory,
    );
    const sourceManifestPath = path.resolve(
      this.options.run.outputDirectory,
      seal.sourceSnapshotManifestPath,
    );
    const outputRoot = `${path.resolve(this.options.run.outputDirectory)}${path.sep}`;
    if (
      !`${sourceDirectory}${path.sep}`.startsWith(outputRoot) ||
      !sourceManifestPath.startsWith(outputRoot)
    )
      throw new Error("terminal core seal source path escapes the run record");
    await verifyHash(sourceManifestPath, "sourceSnapshotManifestSha256");
    const sourceManifest = JSON.parse(
      await fs.promises.readFile(sourceManifestPath, "utf8"),
    ) as EvidenceBenchmarkCodexSourceSnapshot.IManifest;
    await EvidenceBenchmarkCodexSourceSnapshot.verify(
      sourceDirectory,
      sourceManifest,
    );
    return true;
  }

  private async exists(target: string): Promise<boolean> {
    return fs.promises
      .stat(target)
      .then((): boolean => true)
      .catch((error: unknown): boolean => {
        if (
          EvidenceBenchmarkCodexValue.isRecord(error) &&
          error.code === "ENOENT"
        )
          return false;
        throw error;
      });
  }

  private async preservePrecrashLedgers(): Promise<void> {
    const directory = path.join(
      this.options.run.outputDirectory,
      "recovery",
      "precrash",
    );
    await fs.promises.mkdir(directory, { recursive: true });
    const sources = [
      ["state.json", this.checkpointPath],
      ["usage.json", this.usagePath],
      ["activity.json", this.activityPath],
      ["cost.json", this.costPath],
    ] as const;
    const hashes: Record<string, string> = {};
    for (const [name, source] of sources) {
      const bytes = await fs.promises.readFile(source);
      await fs.promises.writeFile(path.join(directory, name), bytes, {
        flag: "wx",
      });
      hashes[name] = EvidenceBenchmarkCodexValue.sha256(bytes);
    }
    await EvidenceBenchmarkCodexCheckpoint.writeOnce(
      path.join(directory, "seal.json"),
      {
        schemaVersion: 1,
        runId: this.options.run.manifest.experiment.runId,
        preservedAtUtc: new Date().toISOString(),
        reason:
          "controller restart cannot continue Codex 0.145.0 exact raw usage",
        hashes,
      },
    );
  }

  private async captureSource(label: string): Promise<{
    directory: string;
    manifestPath: string;
    manifest: EvidenceBenchmarkCodexSourceSnapshot.IManifest;
  }> {
    const directory = path.join(
      this.options.run.outputDirectory,
      "artifacts",
      `${label}-workspace`,
    );
    const manifestPath = path.join(
      this.options.run.outputDirectory,
      "artifacts",
      `${label}-source-snapshot.json`,
    );
    const manifest = await EvidenceBenchmarkCodexSourceSnapshot.create(
      this.options.run.workspace,
      directory,
      manifestPath,
    );
    return { directory, manifestPath, manifest };
  }

  private result(
    status: Exclude<IEvidenceBenchmarkCodexRun.Status, "running">,
    reason?: string,
  ): IEvidenceBenchmarkCodexRun.IResult {
    return {
      status,
      outputDirectory: this.options.run.outputDirectory,
      primaryThreadId: this.state?.primaryThreadId,
      terminalReason: reason,
      checkpointPath: this.checkpointPath,
      usagePath: this.usagePath,
      activityPath: this.activityPath,
      costPath: this.costPath,
      coreSealPath: this.coreSealPath,
    };
  }

  private reconcileThreadSettings(
    settings: ReturnType<
      typeof EvidenceBenchmarkCodexProtocol.notificationThreadSettings
    >,
    observedAtUtc: string,
    source: "thread/settings/updated",
  ): void {
    const expectedThreadId = this.state!.primaryThreadId;
    if (
      settings.threadId !== expectedThreadId ||
      settings.model !== this.options.run.manifest.runner.model ||
      settings.modelProvider !==
        this.options.run.manifest.runner.modelProvider ||
      settings.serviceTier !== null ||
      path.resolve(settings.cwd) !== path.resolve(this.options.run.workspace) ||
      settings.approvalPolicy !== "never" ||
      settings.sandboxPolicy.type !== "workspaceWrite" ||
      settings.effort !== this.options.run.manifest.runner.effort
    )
      throw new Error("effective thread settings update drifted");
    this.state!.effectiveThreadSettings = {
      threadId: settings.threadId,
      cwd: settings.cwd,
      model: this.options.run.manifest.runner.model,
      modelProvider: this.options.run.manifest.runner.modelProvider,
      serviceTier: null,
      effort: this.options.run.manifest.runner.effort,
      approvalPolicy: "never",
      sandboxType: "workspaceWrite",
      activePermissionProfileId: settings.activePermissionProfileId,
      observedAtUtc,
      source,
    };
  }

  private markRightCensored(message: string): void {
    this.usage.missingExactUsage(message);
    this.cost?.markUsageLowerBound();
  }

  private scheduleForcedStop(): void {
    if (this.forcedStop !== undefined) return;
    this.forcedStop = new Promise<void>((resolve): void => {
      setImmediate(resolve);
    }).then(async (): Promise<void> => {
      const process = this.process;
      if (process !== undefined) {
        await process.stop().catch((): void => {});
        if (this.process === process) this.process = undefined;
      }
    });
  }
}

/** Runtime-only dependencies for {@link EvidenceBenchmarkCodexRunner}. */
export namespace EvidenceBenchmarkCodexRunner {
  /** Outer scheduler stopped all cells at one shared safety boundary. */
  export class ExternalAbort extends Error {
    /**
     * Creates one shared outer-scheduler stop.
     *
     * @param message Evidence-backed stop reason.
     * @param safetyLimitReason Shared safety boundary.
     * @param sharedStopDigest SHA-256 of the scheduler stop record.
     */
    public constructor(
      message: string,
      public readonly safetyLimitReason:
        "observed_total_tokens" | "hard_deadline",
      public readonly sharedStopDigest: string,
    ) {
      super(message);
      this.name = "EvidenceBenchmarkCodexExternalAbort";
    }
  }

  /** Hard wall elapsed before terminal usage reconciliation could finish. */
  export class DeadlineExceeded extends Error {
    /** Creates one right-censoring hard-wall error. */
    public constructor(message: string) {
      super(message);
      this.name = "EvidenceBenchmarkCodexDeadlineExceeded";
    }
  }

  /** Factory context sharing the live primary app-server with the campaign. */
  export interface ICampaignContext {
    /** Live non-restartable app-server process. */
    process: EvidenceBenchmarkCodexProcess;

    /** Shared append-only raw and semantic log. */
    log: EvidenceBenchmarkCodexLog;

    /** Original Phase 1 thread reserved for verified-only fixing. */
    primaryThreadId: string;

    /** Immutable Phase 1 and completion-challenge boundary. */
    phase1Boundary: IEvidenceBenchmarkCodexCampaign.IPhase1Boundary;
  }

  /** Campaign adapter and immutable schema/runtime pins. */
  export interface ICampaignRuntime {
    /** Bound fresh-context and workspace implementation. */
    adapter: IEvidenceBenchmarkCodexCampaign.IAdapter;

    /** SHA-256 of the verified finding schema given to fresh verifiers. */
    verifiedFindingSchemaSha256: string;

    /** Maximum cumulative Phase 2 duration. */
    timeoutMs: number;

    /** Complete provider/local schema registry for every measured turn class. */
    schemaRegistry: EvidenceBenchmarkCodexProviderSchemas.IRegistry;
  }

  /** Complete runner input with injectable deterministic-test preflight. */
  export interface IOptions {
    /** Frozen serializable attempt configuration. */
    run: IEvidenceBenchmarkCodexRun.IOptions;

    /** Builds Phase 2 around the already-running primary app-server. */
    campaign: (context: ICampaignContext) => Promise<ICampaignRuntime>;

    /**
     * Production defaults to the immutable launch gate; deterministic tests may
     * inject a no-spend fake validator.
     */
    preflight: (options: IEvidenceBenchmarkCodexRun.IOptions) => Promise<void>;
  }

  /** Partial notification facts retained until one generation turn closes. */
  export interface ITurnFacts {
    /** Latest observed terminal or active turn status. */
    status?: IEvidenceBenchmarkCodexRun.TurnStatus;

    /** Exact upstream response id from raw response completion. */
    responseId?: string;

    /** Unique final assistant item id. */
    assistantItemId?: string;

    /** Exact final assistant text constrained by output schema. */
    assistantText?: string;

    /** Final or phase-unknown assistant messages awaiting terminal selection. */
    assistantCandidates?: Array<{
      /** Assistant item id. */
      id: string;

      /** Exact assistant message text. */
      text: string;

      /** Whether app-server explicitly marked the item final. */
      explicitFinal: boolean;
    }>;
  }

  /** Fully reconciled facts required for completion adjudication. */
  export interface ICompleteTurnFacts extends ITurnFacts {
    /** Terminal turn status. */
    status: Exclude<IEvidenceBenchmarkCodexRun.TurnStatus, "inProgress">;

    /** Exact upstream response id. */
    responseId: string;

    /** Unique final assistant item id. */
    assistantItemId: string;

    /** Final assistant structured JSON text. */
    assistantText: string;
  }

  /** Returns production options with the fail-closed launch gate installed. */
  export function productionOptions(
    run: IEvidenceBenchmarkCodexRun.IOptions,
    campaign: IOptions["campaign"],
  ): IOptions {
    return {
      run,
      campaign,
      preflight: EvidenceBenchmarkCodexLaunchGate.validate,
    };
  }
}
