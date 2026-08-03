import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import typia from "typia";

import { EvidenceBenchmarkCheckpoint } from "./EvidenceBenchmarkCheckpoint.ts";
import { EvidenceBenchmarkInstruction } from "./EvidenceBenchmarkInstruction.ts";
import type { IEvidenceBenchmarkRunState } from "./structures/IEvidenceBenchmarkRunState.ts";
import type { IEvidenceBenchmarkSupervisionVerdict } from "./structures/IEvidenceBenchmarkSupervisionVerdict.ts";
import type { IEvidenceBenchmarkWorkspaceIdentity } from "./structures/IEvidenceBenchmarkWorkspaceIdentity.ts";

interface ISupervisedStateFile {
  cell: {
    arm: "plain" | "evidence";
    runId: string;
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
  /** Applies one immutable verdict to the exact paused Review boundary. */
  export function decide(props: {
    runRoot: string;
    instructionsRoot: string;
    verdictFile: string;
  }): IEvidenceBenchmarkSupervisionVerdict {
    const runRoot: string = path.resolve(props.runRoot);
    const statePath: string = path.join(runRoot, "state.json");
    const retained = typia.assert<ISupervisedStateFile>(
      JSON.parse(fs.readFileSync(statePath, "utf8")),
    );
    assertRunBoundary(retained, runRoot, statePath);
    assertHistory(runRoot, retained.state);
    const pause = retained.state.supervisionPauses!.at(-1)!;
    const goal = retained.state.goals.at(-1)!;
    const plan = retained.state.instructionPlan!;
    const next = plan[retained.state.nextInstructionIndex];
    if (next?.kind !== "base" || next.name !== `${pause.scope}-final`)
      throw new Error("Review verdict does not precede its matching Final.");

    const submittedBytes: Buffer = fs.readFileSync(
      path.resolve(props.verdictFile),
    );
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
        : pause.attempt < 4
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
  ): void {
    const pause = retained.state.supervisionPauses?.at(-1);
    const goal = retained.state.goals.at(-1);
    const planEntry =
      retained.state.instructionPlan?.[retained.state.nextInstructionIndex - 1];
    const boundary =
      planEntry === undefined
        ? undefined
        : EvidenceBenchmarkInstruction.reviewBoundary(planEntry);
    if (
      retained.cell.arm !== "plain" ||
      retained.state.arm !== "plain" ||
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
      goal.terminalTurnId === null ||
      goal.terminalTurnCompleted !== true ||
      goal.threadIdle !== true
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

  function samePath(left: string, right: string): boolean {
    const normalize = (value: string): string => {
      const resolved: string = path.resolve(value);
      return process.platform === "win32" ? resolved.toLowerCase() : resolved;
    };
    return normalize(left) === normalize(right);
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
