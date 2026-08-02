import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import typia from "typia";

import { EvidenceBenchmarkCheckpoint } from "./EvidenceBenchmarkCheckpoint.ts";
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

/** Records and verifies decisions made outside the measured agent thread. */
export namespace EvidenceBenchmarkSupervision {
  /** Binds an external expectation and audit report to the current pause. */
  export function decide(props: {
    runRoot: string;
    decision: "approved" | "rejected";
    expectations: string;
    report: string;
  }): IEvidenceBenchmarkSupervisionVerdict {
    const runRoot: string = path.resolve(props.runRoot);
    const statePath: string = path.join(runRoot, "state.json");
    const retained = typia.assert<ISupervisedStateFile>(
      JSON.parse(fs.readFileSync(statePath, "utf8")),
    );
    if (
      retained.cell.arm !== "plain" ||
      retained.state.status !== "awaiting-supervision" ||
      !samePath(retained.records.root, runRoot) ||
      !samePath(retained.records.state, statePath) ||
      !samePath(retained.records.workspace, path.join(runRoot, "workspace"))
    )
      throw new Error("Run is not an exact Plain supervision boundary.");
    const pause = retained.state.supervisionPauses?.at(-1);
    const goal = retained.state.goals.at(-1);
    if (
      pause === undefined ||
      pause.resumedAt !== undefined ||
      pause.verdict !== undefined ||
      goal === undefined ||
      goal.name !== pause.afterGoal ||
      goal.terminalTurnId === null ||
      goal.terminalTurnCompleted !== true ||
      goal.threadIdle !== true
    )
      throw new Error("Supervision boundary is incomplete or already decided.");

    const expectations: Buffer = readMarkdown(
      props.expectations,
      "expectations",
    );
    const report: Buffer = readMarkdown(props.report, "audit report");
    const workspace: IEvidenceBenchmarkWorkspaceIdentity =
      EvidenceBenchmarkCheckpoint.identifyWorkspace(retained.records.workspace);
    const directory: string = path.join(runRoot, "supervision");
    fs.mkdirSync(directory, { recursive: true });
    const prefix: string = `${String(retained.state.supervisionPauses!.length - 1).padStart(2, "0")}-${pause.afterGoal}`;
    const expectationsRelativePath: string = path.posix.join(
      "supervision",
      `${prefix}-expectations.md`,
    );
    const reportRelativePath: string = path.posix.join(
      "supervision",
      `${prefix}-report.md`,
    );
    const expectationsTarget: string = resolveWithin(
      runRoot,
      expectationsRelativePath,
    );
    const reportTarget: string = resolveWithin(runRoot, reportRelativePath);
    if (fs.existsSync(expectationsTarget) || fs.existsSync(reportTarget))
      throw new Error("External supervision evidence already exists.");
    writeExclusive(expectationsTarget, expectations);
    writeExclusive(reportTarget, report);

    const verdict: IEvidenceBenchmarkSupervisionVerdict = {
      decision: props.decision,
      decidedAt: new Date().toISOString(),
      terminalTurnId: goal.terminalTurnId,
      expectationsRelativePath,
      expectationsSha256: sha256(expectations),
      reportRelativePath,
      reportSha256: sha256(report),
      workspace,
    };
    pause.verdict = verdict;
    if (props.decision === "rejected") retained.state.status = "rejected";
    replaceDurably(statePath, `${JSON.stringify(retained, null, 2)}\n`);
    return verdict;
  }

  /** Proves that an approval still names the current Goal, files, and report. */
  export function assertApproved(props: {
    runRoot: string;
    workspace: string;
    state: IEvidenceBenchmarkRunState;
  }): void {
    const pause = props.state.supervisionPauses?.at(-1);
    const goal = props.state.goals.at(-1);
    const verdict = pause?.verdict;
    if (
      props.state.status !== "awaiting-supervision" ||
      pause === undefined ||
      pause.resumedAt !== undefined ||
      goal === undefined ||
      verdict?.decision !== "approved" ||
      goal.name !== pause.afterGoal ||
      goal.terminalTurnId === null ||
      verdict.terminalTurnId !== goal.terminalTurnId
    )
      throw new Error("Supervised resume lacks an exact external approval.");
    assertFile(
      props.runRoot,
      verdict.expectationsRelativePath,
      verdict.expectationsSha256,
    );
    assertFile(props.runRoot, verdict.reportRelativePath, verdict.reportSha256);
    const current: IEvidenceBenchmarkWorkspaceIdentity =
      EvidenceBenchmarkCheckpoint.identifyWorkspace(props.workspace);
    if (
      current.materialSha256 !== verdict.workspace.materialSha256 ||
      current.fileCount !== verdict.workspace.fileCount ||
      current.gitHead !== verdict.workspace.gitHead ||
      current.gitStatus !== verdict.workspace.gitStatus
    )
      throw new Error("Workspace changed after its external approval.");
  }

  function assertFile(root: string, relative: string, expected: string): void {
    const file: string = resolveWithin(path.resolve(root), relative);
    if (
      !fs.statSync(file).isFile() ||
      sha256(fs.readFileSync(file)) !== expected
    )
      throw new Error("External supervision evidence changed after decision.");
  }

  function readMarkdown(file: string, name: string): Buffer {
    const resolved: string = path.resolve(file);
    if (path.extname(resolved).toLowerCase() !== ".md")
      throw new Error(`External supervision ${name} must be Markdown.`);
    const content: Buffer = fs.readFileSync(resolved);
    if (content.length === 0)
      throw new Error(`External supervision ${name} cannot be empty.`);
    return content;
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
      throw new Error("Supervision evidence path must be relative.");
    const resolved: string = path.resolve(root, ...relative.split("/"));
    const prefix: string = root.endsWith(path.sep)
      ? root
      : `${root}${path.sep}`;
    if (resolved !== root && !resolved.startsWith(prefix))
      throw new Error("Supervision evidence escapes its retained run.");
    return resolved;
  }

  function samePath(left: string, right: string): boolean {
    const normalize = (value: string): string => {
      const resolved: string = path.resolve(value);
      return process.platform === "win32" ? resolved.toLowerCase() : resolved;
    };
    return normalize(left) === normalize(right);
  }

  function sha256(content: Buffer): string {
    return crypto.createHash("sha256").update(content).digest("hex");
  }
}
