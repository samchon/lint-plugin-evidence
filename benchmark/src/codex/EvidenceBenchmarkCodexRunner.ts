import fs from "node:fs";
import path from "node:path";

import type { IEvidenceBenchmarkCodexCampaign } from "../structures/IEvidenceBenchmarkCodexCampaign.ts";
import type { IEvidenceBenchmarkCodexRecord } from "../structures/IEvidenceBenchmarkCodexRecord.ts";
import type { IEvidenceBenchmarkCodexRun } from "../structures/IEvidenceBenchmarkCodexRun.ts";
import { EvidenceBenchmarkCodexActivityLedger } from "./EvidenceBenchmarkCodexActivityLedger.ts";
import { EvidenceBenchmarkCodexCampaignCoordinator } from "./EvidenceBenchmarkCodexCampaignCoordinator.ts";
import { EvidenceBenchmarkCodexCheckpoint } from "./EvidenceBenchmarkCodexCheckpoint.ts";
import { EvidenceBenchmarkCodexCompletion } from "./EvidenceBenchmarkCodexCompletion.ts";
import { EvidenceBenchmarkCodexLaunchGate } from "./EvidenceBenchmarkCodexLaunchGate.ts";
import { EvidenceBenchmarkCodexLog } from "./EvidenceBenchmarkCodexLog.ts";
import { EvidenceBenchmarkCodexProcess } from "./EvidenceBenchmarkCodexProcess.ts";
import { EvidenceBenchmarkCodexPromotion } from "./EvidenceBenchmarkCodexPromotion.ts";
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
  private readonly manifestSha256: string;
  private readonly deadline: number;
  private log?: EvidenceBenchmarkCodexLog;
  private process?: EvidenceBenchmarkCodexProcess;
  private state?: IEvidenceBenchmarkCodexRun.IRunState;
  private readonly usage = new EvidenceBenchmarkCodexUsageLedger();
  private readonly activity = new EvidenceBenchmarkCodexActivityLedger();
  private readonly turnFacts = new Map<
    string,
    EvidenceBenchmarkCodexRunner.ITurnFacts
  >();
  private goalStatus: IEvidenceBenchmarkCodexRun.GoalStatus | null = null;
  private activationPending = false;
  private activation?: Promise<EvidenceBenchmarkCodexProtocol.IResponse>;
  private fatal?: Error;
  private pulse?: () => void;
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
    this.manifestSha256 = EvidenceBenchmarkCodexValue.sha256(
      EvidenceBenchmarkCodexValue.canonicalJson(options.run.manifest),
    );
    this.deadline = Date.now() + options.run.timeoutMs;
  }

  /** Executes a fresh attempt or fail-closes a prior running checkpoint. */
  public async run(): Promise<IEvidenceBenchmarkCodexRun.IResult> {
    await this.options.preflight(this.options.run);
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
      if (recovered.status === "running")
        return this.finish(
          "interrupted",
          "controller or app-server restart cannot preserve raw response events in Codex 0.145.0",
          "harness",
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
          timeoutMs: campaign.timeoutMs,
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
      const campaignState = await coordinator.run();
      this.state.campaignCheckpointSha256 = EvidenceBenchmarkCodexValue.sha256(
        await fs.promises.readFile(
          path.join(this.options.run.outputDirectory, "campaign.json"),
        ),
      );
      if (campaignState.status !== "completed")
        return await this.finish(
          campaignState.status === "failed" ? "failed" : "interrupted",
          campaignState.terminalReason ?? "Phase 2 campaign did not complete",
          campaignState.status === "failed" ? null : "harness",
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
      return this.finish(
        "failed",
        error instanceof Error ? error.message : String(error),
        null,
      );
    } finally {
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
          this.usage.anomaly(message);
          await this.log!.recordEvent(
            "protocol_anomaly",
            { message },
            { phase: "reconciliation", actor: "auditor" },
          );
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
    const threadId = EvidenceBenchmarkCodexValue.string(thread.id, "thread.id");
    const sessionId =
      typeof thread.sessionId === "string" ? thread.sessionId : threadId;
    if (
      thread.model !== this.options.run.manifest.runner.model ||
      thread.serviceTier !== this.options.run.manifest.runner.serviceTier
    )
      throw new Error("effective thread model or service tier drifted");
    this.state!.primaryThreadId = threadId;
    this.state!.sessionId = sessionId;
    this.state!.threads[threadId] = {
      id: threadId,
      parentThreadId: null,
      sessionId,
      status: "idle",
      rolloutPath: typeof thread.path === "string" ? thread.path : undefined,
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
    this.activity.ingest(method, params, receivedAtUtc);
    if (method === "model/rerouted") {
      this.fatal = new Error("model reroute violates the frozen model");
      this.signal();
      return;
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
        if (this.state!.milestones.t0 === undefined)
          await this.milestone(
            "t0",
            "first user turn started before Goal activation",
          );
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
    const explicit = candidates.filter(
      (candidate): boolean => candidate.explicitFinal,
    );
    const eligible = explicit.length === 0 ? candidates : explicit;
    if (eligible.length === 1) {
      facts.assistantItemId = eligible[0]!.id;
      facts.assistantText = eligible[0]!.text;
    } else if (eligible.length > 1) {
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
      if (remaining <= 0) throw new Error("benchmark attempt timed out");
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
  ): Promise<{ eventSeq: number; eventSha256: string }> {
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
    return { eventSeq: event.seq, eventSha256: event.eventSha256 };
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
      goal: null,
      restartCount: 0,
      gateRepairCount: 0,
      firstTurnStarted: false,
      completionAdjudication: null,
      phase1Boundary: null,
      completionChallengeStarted: false,
      completionChallengeAdjudication: null,
      green: false,
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
      terminal: null,
    };
  }

  private async persist(): Promise<void> {
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
    ]);
  }

  private async finish(
    status: Exclude<IEvidenceBenchmarkCodexRun.Status, "running">,
    reason: string,
    interruptionSubtype: NonNullable<
      IEvidenceBenchmarkCodexRun.IRunState["terminal"]
    >["interruptionSubtype"],
  ): Promise<IEvidenceBenchmarkCodexRun.IResult> {
    if (this.state!.status !== "running")
      return status === "failed"
        ? this.result("failed", reason)
        : this.result(this.state!.status, this.state!.terminal?.reason);
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
        status === "interrupted" ? interruptionSubtype : null,
      lastCheckpointSha256,
    };
    await this.log!.recordEvent(
      "run_terminal",
      { status, reason, interruptionSubtype },
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
    await EvidenceBenchmarkCodexPromotion.promote({
      runId: this.options.run.manifest.experiment.runId,
      runDirectory: this.options.run.outputDirectory,
      sealedSourceSnapshotDirectory: this.sealedSourceDirectory,
      sealedSourceSnapshotManifestPath: this.sealedSourceManifestPath,
      canonicalDirectory: this.options.run.canonicalResultDirectory,
      manifest: this.options.run.manifest,
      state: this.state!,
      finalEventSha256: this.state!.streamHeads.event.lastEventSha256,
    });
    return this.result(status, reason);
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
    };
  }
}

/** Runtime-only dependencies for {@link EvidenceBenchmarkCodexRunner}. */
export namespace EvidenceBenchmarkCodexRunner {
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
