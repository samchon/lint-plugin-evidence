import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import typia from "typia";

import { EvidenceBenchmarkCheckpoint } from "./EvidenceBenchmarkCheckpoint.ts";
import { EvidenceBenchmarkInstruction } from "./EvidenceBenchmarkInstruction.ts";
import type { IEvidenceBenchmarkInputIdentity } from "./structures/IEvidenceBenchmarkInputIdentity.ts";
import type { IEvidenceBenchmarkRunState } from "./structures/IEvidenceBenchmarkRunState.ts";
import type { IEvidenceBenchmarkSupervisionVerdict } from "./structures/IEvidenceBenchmarkSupervisionVerdict.ts";
import type { IEvidenceBenchmarkWorkspaceIdentity } from "./structures/IEvidenceBenchmarkWorkspaceIdentity.ts";

interface ISupervisedStateFile {
  cell: {
    arm: "plain" | "evidence";
    runId: string;
    subject?: string;
    inputIdentity?: IEvidenceBenchmarkInputIdentity;
  };
  records: {
    root: string;
    workspace: string;
    state: string;
  };
  state: IEvidenceBenchmarkRunState;
}

interface ISubmittedVerdict {
  decision: "pass" | "fail";
  rationale: string;
  feedback?: string;
}

/** Retains and verifies Plain review decisions outside the measured thread. */
export namespace EvidenceBenchmarkSupervision {
  /**
   * Attaches one operator warning to a stopped Evidence cell's current
   * objective.
   *
   * The Evidence arm never pauses for a verdict, and `thread/goal/set` is the
   * runner's only channel into the thread, so a warning reaches an Evidence
   * cell exactly one way: stop the cell, attach the warning, resume. The
   * warning replaces the arm continuation rather than extending the objective,
   * because `backend/start` already expands to within 77 characters of the
   * limit Codex accepts.
   *
   * A warning states the frozen boundary and the edit that crossed it. It is
   * the alternative to restarting a cell over a correctable violation, which
   * destroys the evidence of that violation along with the cell's work.
   */
  export function warn(props: {
    runRoot: string;
    instructionsRoot: string;
    warningFile: string;
    subject?: string;
  }): IEvidenceBenchmarkSupervisionVerdict {
    const runRoot: string = path.resolve(props.runRoot);
    const statePath: string = path.join(runRoot, "state.json");
    const retained = typia.assert<ISupervisedStateFile>(
      JSON.parse(fs.readFileSync(statePath, "utf8")),
    );
    if (props.subject !== undefined && retained.cell.subject !== props.subject)
      throw new Error("Operator warning does not match its subject.");
    if (retained.cell.arm !== retained.state.arm)
      throw new Error("Retained cell and state disagree about the arm.");
    if (retained.state.status === "running")
      throw new Error("Stop the cell before attaching an operator warning.");
    const plan = retained.state.instructionPlan;
    if (plan === undefined) throw new Error("Retained instruction plan is missing.");
    const index: number = retained.state.nextInstructionIndex;
    const entry = plan[index];
    if (entry === undefined)
      throw new Error("No current objective can carry the warning.");

    const submittedFile: string = path.resolve(props.warningFile);
    if (isWithin(retained.records.workspace, submittedFile))
      throw new Error(
        "Operator warning input cannot modify the measured workspace.",
      );
    const submittedBytes: Buffer = fs.readFileSync(submittedFile);
    const submitted: ISubmittedVerdict = parseSubmitted(submittedBytes);
    const rationale: string = submitted.rationale.trim();
    const feedback: string | undefined = submitted.feedback?.trim();
    if (submitted.decision !== "fail")
      throw new Error("An operator warning is always a failing decision.");
    if (rationale.length === 0)
      throw new Error("Operator warning rationale cannot be empty.");
    if (!feedback)
      throw new Error("An operator warning requires concrete feedback.");
    assertMeasuredBoundary(feedback);

    // Composing here rejects an oversized warning before it can reach the
    // thread, and the runner recomposes the objective only when no Goal record
    // occupies the index, so the stale one is dropped. The plan itself is left
    // untouched: its base sequence must stay byte-identical to the frozen one.
    EvidenceBenchmarkInstruction.objective({
      arm: retained.state.arm,
      instructionsRoot: props.instructionsRoot,
      entry: { relativePath: entry.relativePath, reviewFeedback: feedback },
    });
    retained.state.goals = retained.state.goals.filter(
      (record) => record.index !== index,
    );
    const workspace: IEvidenceBenchmarkWorkspaceIdentity =
      EvidenceBenchmarkCheckpoint.identifyWorkspace(retained.records.workspace);
    const directory: string = path.join(runRoot, "supervision");
    fs.mkdirSync(directory, { recursive: true });
    const warnings: number = fs
      .readdirSync(directory)
      .filter((name) => name.includes("-warning.json")).length;
    const verdictRelativePath: string = path.posix.join(
      "supervision",
      `${String(warnings).padStart(2, "0")}-${entry.name}-warning.json`,
    );
    const verdictTarget: string = resolveWithin(runRoot, verdictRelativePath);
    if (fs.existsSync(verdictTarget)) {
      if (!fs.readFileSync(verdictTarget).equals(submittedBytes))
        throw new Error("A different warning already occupies this boundary.");
    } else writeExclusive(verdictTarget, submittedBytes);
    retained.state.operatorWarnings = [
      ...(retained.state.operatorWarnings ?? []).filter(
        (warning) => warning.instructionIndex !== index,
      ),
      {
        instructionIndex: index,
        instructionName: entry.name,
        feedback,
        warnedAt: new Date().toISOString(),
        verdictRelativePath,
      },
    ];

    const verdict: IEvidenceBenchmarkSupervisionVerdict = {
      scope: "backend",
      attempt: warnings,
      decision: "fail",
      action: "retry",
      decidedAt: new Date().toISOString(),
      goalIndex: index,
      terminalTurnId: "",
      rationale,
      feedback,
      verdictRelativePath,
      verdictSha256: sha256(submittedBytes),
      workspace,
    };
    replaceDurably(statePath, `${JSON.stringify(retained, null, 2)}\n`);
    return verdict;
  }

  /** Applies one immutable verdict to the exact paused Review boundary. */
  export function decide(props: {
    runRoot: string;
    instructionsRoot: string;
    verdictFile: string;
    subject?: string;
    inputIdentity?: IEvidenceBenchmarkInputIdentity;
  }): IEvidenceBenchmarkSupervisionVerdict {
    const runRoot: string = path.resolve(props.runRoot);
    const statePath: string = path.join(runRoot, "state.json");
    const retained = typia.assert<ISupervisedStateFile>(
      JSON.parse(fs.readFileSync(statePath, "utf8")),
    );
    assertRunBoundary(retained, runRoot, statePath, {
      subject: props.subject,
      inputIdentity: props.inputIdentity,
    });
    assertHistory(runRoot, retained.state);
    const pause = retained.state.supervisionPauses!.at(-1)!;
    const goal = retained.state.goals.at(-1)!;
    const plan = retained.state.instructionPlan!;
    const next = plan[retained.state.nextInstructionIndex];
    if (next?.kind !== "base" || next.name !== `${pause.scope}-final`)
      throw new Error("Review verdict does not precede its matching Final.");

    const submittedFile: string = path.resolve(props.verdictFile);
    if (isWithin(retained.records.workspace, submittedFile))
      throw new Error(
        "Review verdict input cannot modify the measured workspace.",
      );
    const submittedBytes: Buffer = fs.readFileSync(submittedFile);
    const submitted: ISubmittedVerdict = parseSubmitted(submittedBytes);
    const rationale: string = submitted.rationale.trim();
    const feedback: string | undefined = submitted.feedback?.trim();
    if (rationale.length === 0)
      throw new Error("Review verdict rationale cannot be empty.");
    if (submitted.decision === "pass" && feedback !== undefined)
      throw new Error("A passing review verdict cannot inject feedback.");
    if (submitted.decision === "fail" && !feedback)
      throw new Error("A failing review verdict requires concrete feedback.");
    if (feedback !== undefined) assertMeasuredBoundary(feedback);

    const action: IEvidenceBenchmarkSupervisionVerdict["action"] =
      submitted.decision === "pass"
        ? "final"
        : pause.attempt < EvidenceBenchmarkInstruction.REVIEW_SUPPLEMENT_LIMIT
          ? "retry"
          : "quality-failed";
    if (action === "retry") {
      const attempt: number = pause.attempt + 1;
      const entry = {
        name: `${pause.scope}-remind-${attempt}`,
        relativePath: `plain/${pause.scope}/remind.md`,
        kind: "review-supplement" as const,
        reviewScope: pause.scope,
        reviewAttempt: attempt,
        reviewFeedback: feedback!,
      };
      EvidenceBenchmarkInstruction.objective({
        arm: "plain",
        instructionsRoot: props.instructionsRoot,
        entry,
      });
      plan.splice(retained.state.nextInstructionIndex, 0, entry);
    }

    const workspace: IEvidenceBenchmarkWorkspaceIdentity =
      EvidenceBenchmarkCheckpoint.identifyWorkspace(retained.records.workspace);
    const directory: string = path.join(runRoot, "supervision");
    fs.mkdirSync(directory, { recursive: true });
    const verdictRelativePath: string = path.posix.join(
      "supervision",
      `${String(retained.state.supervisionPauses!.length - 1).padStart(2, "0")}-${pause.scope}-${pause.attempt}-verdict.json`,
    );
    const verdictTarget: string = resolveWithin(runRoot, verdictRelativePath);
    if (fs.existsSync(verdictTarget)) {
      if (!fs.readFileSync(verdictTarget).equals(submittedBytes))
        throw new Error(
          "A different review verdict already occupies this boundary.",
        );
    } else writeExclusive(verdictTarget, submittedBytes);

    const verdict: IEvidenceBenchmarkSupervisionVerdict = {
      scope: pause.scope,
      attempt: pause.attempt,
      decision: submitted.decision,
      action,
      decidedAt: new Date().toISOString(),
      goalIndex: goal.index,
      terminalTurnId: goal.terminalTurnId!,
      rationale,
      ...(feedback === undefined ? {} : { feedback }),
      verdictRelativePath,
      verdictSha256: sha256(submittedBytes),
      workspace,
    };
    pause.verdict = verdict;
    if (action === "quality-failed") retained.state.status = "quality-failed";
    replaceDurably(statePath, `${JSON.stringify(retained, null, 2)}\n`);
    return verdict;
  }

  /** Proves the verdict, workspace, Goal, and chosen continuation still agree. */
  export function assertDecided(props: {
    runRoot: string;
    workspace: string;
    state: IEvidenceBenchmarkRunState;
  }): void {
    const pause = props.state.supervisionPauses?.at(-1);
    const goal = props.state.goals.at(-1);
    const verdict = pause?.verdict;
    if (
      props.state.status !== "awaiting-review-verdict" ||
      pause === undefined ||
      pause.resumedAt !== undefined ||
      verdict === undefined ||
      goal === undefined ||
      goal.index !== pause.goalIndex ||
      goal.name !== pause.afterGoal ||
      goal.terminalTurnId === null ||
      goal.terminalTurnCompleted !== true ||
      goal.threadIdle !== true ||
      verdict.scope !== pause.scope ||
      verdict.attempt !== pause.attempt ||
      verdict.goalIndex !== goal.index ||
      verdict.terminalTurnId !== goal.terminalTurnId ||
      verdict.action === "quality-failed"
    )
      throw new Error(
        "Review-verdict resume lacks an exact retained decision.",
      );
    assertHistory(props.runRoot, props.state);
    const next =
      props.state.instructionPlan?.[props.state.nextInstructionIndex];
    if (
      (verdict.action === "final" &&
        (verdict.decision !== "pass" ||
          next?.kind !== "base" ||
          next.name !== `${pause.scope}-final`)) ||
      (verdict.action === "retry" &&
        (verdict.decision !== "fail" ||
          verdict.feedback === undefined ||
          next?.kind !== "review-supplement" ||
          next.reviewScope !== pause.scope ||
          next.reviewAttempt !== pause.attempt + 1 ||
          next.reviewFeedback !== verdict.feedback))
    )
      throw new Error(
        "Review verdict does not match its retained continuation.",
      );
    const current: IEvidenceBenchmarkWorkspaceIdentity =
      EvidenceBenchmarkCheckpoint.identifyWorkspace(props.workspace);
    if (!sameWorkspace(current, verdict.workspace))
      throw new Error("Workspace changed after its review verdict.");
  }

  /** Proves every previously submitted verdict file remains immutable. */
  export function assertHistory(
    runRoot: string,
    state: IEvidenceBenchmarkRunState,
  ): void {
    for (const pause of state.supervisionPauses ?? [])
      if (pause.verdict !== undefined)
        assertFile(
          runRoot,
          pause.verdict.verdictRelativePath,
          pause.verdict.verdictSha256,
        );
  }

  function assertRunBoundary(
    retained: ISupervisedStateFile,
    runRoot: string,
    statePath: string,
    current: {
      subject?: string;
      inputIdentity?: IEvidenceBenchmarkInputIdentity;
    },
  ): void {
    const pause = retained.state.supervisionPauses?.at(-1);
    const goal = retained.state.goals.at(-1);
    const planEntry =
      retained.state.instructionPlan?.[retained.state.nextInstructionIndex - 1];
    const boundary =
      planEntry === undefined
        ? undefined
        : EvidenceBenchmarkInstruction.reviewBoundary(planEntry);
    const process = retained.state.processes.at(-1);
    // The cell records its own frozen inputs and revision, which is the audit
    // trail. Comparing them with the repository as it stands would lock every
    // running Plain cell out of supervision the moment the operator commits a
    // correction the benchmark skill tells them to commit, and the verdict
    // concerns a review that already ran against the retained workspace.
    if (retained.cell.subject !== current.subject)
      throw new Error("Review verdict does not match its subject.");
    if (
      retained.cell.arm !== "plain" ||
      retained.cell.runId !== path.basename(runRoot) ||
      retained.state.arm !== "plain" ||
      typeof retained.state.sessionId !== "string" ||
      typeof retained.state.cliVersion !== "string" ||
      retained.state.status !== "awaiting-review-verdict" ||
      retained.state.instructionPlan === undefined ||
      !samePath(retained.records.root, runRoot) ||
      !samePath(retained.records.state, statePath) ||
      !samePath(retained.records.workspace, path.join(runRoot, "workspace")) ||
      pause === undefined ||
      boundary === undefined ||
      boundary.scope !== pause.scope ||
      boundary.attempt !== pause.attempt ||
      pause.resumedAt !== undefined ||
      pause.verdict !== undefined ||
      goal === undefined ||
      goal.index !== pause.goalIndex ||
      goal.index !== retained.state.nextInstructionIndex - 1 ||
      goal.name !== pause.afterGoal ||
      goal.name !== planEntry?.name ||
      goal.relativePath !== planEntry.relativePath ||
      goal.goal?.threadId !== retained.state.sessionId ||
      goal.goal.status !== "complete" ||
      goal.terminalTurnId === null ||
      goal.terminalTurnCompleted !== true ||
      goal.threadIdle !== true ||
      goal.tokenUsageTurnId !== goal.terminalTurnId ||
      goal.tokenUsageEnd === null ||
      process === undefined ||
      ((process.exitCode !== 0 || process.signal !== null) &&
        process.shutdownForced !== true)
    )
      throw new Error("Run is not an exact undecided Plain review boundary.");
  }

  function parseSubmitted(content: Buffer): ISubmittedVerdict {
    const value: unknown = JSON.parse(content.toString("utf8"));
    if (value === null || typeof value !== "object" || Array.isArray(value))
      throw new Error("Review verdict must be a JSON object.");
    const record = value as Record<string, unknown>;
    if (
      Object.keys(record).some(
        (key) => !["decision", "rationale", "feedback"].includes(key),
      ) ||
      (record.decision !== "pass" && record.decision !== "fail") ||
      typeof record.rationale !== "string" ||
      (record.feedback !== undefined && typeof record.feedback !== "string")
    )
      throw new Error("Review verdict JSON has an invalid shape.");
    return record as unknown as ISubmittedVerdict;
  }

  function assertMeasuredBoundary(feedback: string): void {
    if (
      /\b(?:benchmark|operators?|auditors?|verdicts?|supervisors?|supervision|reviewers?|plugin)\b|\b(?:another|other|external|main|measurement)\s+agent\b|\b(?:plain|evidence)\s+(?:arm|mode|agent)\b/iu.test(
        feedback,
      )
    )
      throw new Error("Review feedback discloses benchmark-only machinery.");
  }

  function assertFile(root: string, relative: string, expected: string): void {
    const file: string = resolveWithin(path.resolve(root), relative);
    if (!fs.existsSync(file) || !fs.statSync(file).isFile())
      throw new Error("Retained review verdict changed after decision.");
    if (sha256(fs.readFileSync(file)) !== expected)
      throw new Error("Retained review verdict changed after decision.");
  }

  function writeExclusive(file: string, content: Buffer): void {
    const descriptor: number = fs.openSync(file, "wx");
    try {
      fs.writeFileSync(descriptor, content);
      fs.fsyncSync(descriptor);
    } finally {
      fs.closeSync(descriptor);
    }
  }

  function replaceDurably(file: string, content: string): void {
    const temporary: string = `${file}.${process.pid}.tmp`;
    const descriptor: number = fs.openSync(temporary, "wx");
    try {
      fs.writeFileSync(descriptor, content, "utf8");
      fs.fsyncSync(descriptor);
    } finally {
      fs.closeSync(descriptor);
    }
    fs.renameSync(temporary, file);
  }

  function resolveWithin(root: string, relative: string): string {
    if (path.isAbsolute(relative))
      throw new Error("Review verdict path must be relative.");
    const resolved: string = path.resolve(root, ...relative.split("/"));
    const prefix: string = root.endsWith(path.sep)
      ? root
      : `${root}${path.sep}`;
    if (resolved !== root && !resolved.startsWith(prefix))
      throw new Error("Review verdict escapes its retained run.");
    return resolved;
  }

  function isWithin(root: string, candidate: string): boolean {
    const normalizedRoot: string = normalizePath(root);
    const normalizedCandidate: string = normalizePath(candidate);
    return (
      normalizedCandidate === normalizedRoot ||
      normalizedCandidate.startsWith(`${normalizedRoot}${path.sep}`)
    );
  }

  function samePath(left: string, right: string): boolean {
    return normalizePath(left) === normalizePath(right);
  }

  function normalizePath(value: string): string {
    const absolute: string = path.resolve(value);
    const resolved: string = fs.existsSync(absolute)
      ? fs.realpathSync.native(absolute)
      : absolute;
    return process.platform === "win32" ? resolved.toLowerCase() : resolved;
  }

  function sameWorkspace(
    left: IEvidenceBenchmarkWorkspaceIdentity,
    right: IEvidenceBenchmarkWorkspaceIdentity,
  ): boolean {
    return (
      left.materialSha256 === right.materialSha256 &&
      left.fileCount === right.fileCount &&
      left.gitHead === right.gitHead &&
      left.gitStatus === right.gitStatus
    );
  }

  function sha256(content: Buffer): string {
    return crypto.createHash("sha256").update(content).digest("hex");
  }
}
