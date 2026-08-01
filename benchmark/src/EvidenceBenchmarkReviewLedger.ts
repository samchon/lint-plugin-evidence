import crypto from "node:crypto";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import type { IEvidenceBenchmarkGoalRecord } from "./structures/IEvidenceBenchmarkGoalRecord.ts";
import type {
  IEvidenceBenchmarkReviewLedger,
  IEvidenceBenchmarkReviewCalibration,
  IEvidenceBenchmarkReviewCommand,
  IEvidenceBenchmarkReviewManifestEntry,
  IEvidenceBenchmarkReviewRound,
} from "./structures/IEvidenceBenchmarkReviewLedger.ts";
import type { IEvidenceBenchmarkRunState } from "./structures/IEvidenceBenchmarkRunState.ts";

interface IToolCall {
  tool: string;
  arguments: unknown;
  callId: string;
  turnId: string;
}

interface IToolResult {
  contentItems: { type: "inputText"; text: string }[];
  success: boolean;
}

type ReviewCommand = IEvidenceBenchmarkReviewCommand["command"];
type ReviewCommandPhase = IEvidenceBenchmarkReviewCommand["phase"];

interface ICommandResult {
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  stdout: Buffer;
  stderr: Buffer;
  timedOut: boolean;
  outputLimited: boolean;
  cleanupForced: boolean;
  watchClean: boolean;
  watchErrors: boolean;
}

const CONFIGURATION_PATHS = [
  ".node-version",
  "config/lint.config.ts",
  "config/package.json",
  "config/tsconfig.json",
  "package.json",
  "packages/api/lint.config.ts",
  "packages/api/package.json",
  "packages/api/tsconfig.json",
  "packages/backend/.env.example",
  "packages/backend/lint.config.ts",
  "packages/backend/nestia.config.ts",
  "packages/backend/package.json",
  "packages/backend/prisma.config.ts",
  "packages/backend/tsconfig.json",
  "pnpm-workspace.yaml",
] as const;

/** Owns canonical manifests and exact one-file reads outside agent self-report. */
export namespace EvidenceBenchmarkReviewLedger {
  export const tools = (): Record<string, unknown>[] => [
    {
      type: "function",
      name: "review_start_round",
      description:
        "Start the mandatory runner-owned backend review round. It creates the fresh canonical manifest. Shell inventories and self-authored manifests receive no review credit.",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        properties: {},
      },
    },
    {
      type: "function",
      name: "review_read_file",
      description:
        "Read exactly the next file in the active runner-owned review manifest. This is the only file-read mechanism that receives review credit.",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        properties: { path: { type: "string" } },
        required: ["path"],
      },
    },
    {
      type: "function",
      name: "review_finish_round",
      description:
        "Finish the active runner-owned round after every manifest file was returned and the workspace stayed unchanged. Report findings, a pre-calibration clean candidate, or dry.",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        properties: {
          result: {
            type: "string",
            enum: ["findings", "clean", "dry"],
          },
          findings: {
            type: "array",
            items: { type: "string" },
          },
        },
        required: ["result", "findings"],
      },
    },
    {
      type: "function",
      name: "review_start_calibration",
      description:
        "Seal the exact reviewed workspace before the mandatory fail-restore-pass calibration. Break one material behavior only after this call.",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        properties: {},
      },
    },
    {
      type: "function",
      name: "review_run_backend_command",
      description:
        "Run one bounded backend generator or gate under runner-owned process-tree serialization. Native shell execution receives no gate credit.",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        properties: {
          command: {
            type: "string",
            enum: [
              "build-prisma",
              "build-main",
              "schema",
              "build-sdk",
              "build-test",
              "check-watch",
              "lint",
              "format",
              "test",
            ],
          },
          phase: {
            type: "string",
            enum: [
              "correction",
              "calibration-fail",
              "calibration-pass",
              "final",
            ],
          },
        },
        required: ["command", "phase"],
      },
    },
  ];

  export async function handle(props: {
    cwd: string;
    state: IEvidenceBenchmarkRunState;
    goal: IEvidenceBenchmarkGoalRecord;
    call: IToolCall;
    onChange?: () => Promise<void>;
    signal?: AbortSignal;
  }): Promise<IToolResult> {
    if (
      props.goal.name !== "backend-review" &&
      props.goal.name !== "backend-final"
    )
      return failure(
        "The backend review ledger is available only during backend-review and backend-final.",
      );
    if (props.call.tool === "review_start_round") return startRound(props);
    if (props.call.tool === "review_read_file") return readFile(props);
    if (props.call.tool === "review_finish_round") return finishRound(props);
    if (props.call.tool === "review_start_calibration")
      return startCalibration(props);
    if (props.call.tool === "review_run_backend_command")
      return runBackendCommand(props);
    return failure(`Unknown review ledger tool: ${props.call.tool}`);
  }

  /** Rejects native shell concurrency and lifecycle commands during review. */
  export function observeNativeCommand(props: {
    cwd: string;
    state: IEvidenceBenchmarkRunState;
    goal: IEvidenceBenchmarkGoalRecord;
    method: "item/started" | "item/completed";
    item: Record<string, unknown>;
    active: Set<string>;
  }): void {
    if (
      props.goal.name !== "backend-review" &&
      props.goal.name !== "backend-final"
    )
      return;
    if (props.item.type !== "commandExecution") return;
    const id: unknown = props.item.id;
    if (typeof id !== "string")
      throw new Error("Codex emitted a command without a stable item ID.");
    if (props.method === "item/completed") {
      props.active.delete(id);
      return;
    }
    const runnerCommand: IEvidenceBenchmarkReviewCommand | undefined =
      props.state.reviewLedgers
        ?.find((ledger) => ledger.goalIndex === props.goal.index)
        ?.commands?.findLast((entry) => entry.status === "running");
    if (runnerCommand !== undefined)
      throw new Error(
        `Codex started native command ${id} while runner-owned backend command ${runnerCommand.index} remained active.`,
      );
    if (props.active.size !== 0)
      throw new Error(
        `Codex started command ${id} while ${[...props.active].join(", ")} remained active.`,
      );
    const command: unknown = props.item.command;
    if (typeof command !== "string")
      throw new Error("Codex emitted a command without exact command text.");
    if (isBackendLifecycleCommand(command))
      throw new Error(
        "Backend generators and gates must run through review_run_backend_command, not the native shell.",
      );
    if (isBackendResidentCommand(command)) {
      if (props.goal.name !== "backend-final")
        throw new Error(
          "The resident backend dev server is allowed only after Backend Final proof.",
        );
      assertDry({ cwd: props.cwd, state: props.state, goal: props.goal });
      return;
    }
    props.active.add(id);
  }

  export function assertDry(props: {
    cwd: string;
    state: IEvidenceBenchmarkRunState;
    goal: IEvidenceBenchmarkGoalRecord;
  }): void {
    if (
      props.goal.name !== "backend-review" &&
      props.goal.name !== "backend-final"
    )
      return;
    const ledger: IEvidenceBenchmarkReviewLedger | undefined =
      props.state.reviewLedgers?.find(
        (candidate) => candidate.goalIndex === props.goal.index,
      );
    const round: IEvidenceBenchmarkReviewRound | undefined =
      ledger?.rounds.at(-1);
    if (round === undefined || round.status !== "dry")
      throw new Error(
        `${props.goal.name} completed without a runner-owned dry review round.`,
      );
    const current = manifest(props.cwd);
    if (current.sha256 !== round.manifestSha256)
      throw new Error(
        `${props.goal.name} changed after its runner-owned dry review round.`,
      );
    const ledgerCommands: IEvidenceBenchmarkReviewCommand[] =
      ledger?.commands ?? [];
    const finalCommands: IEvidenceBenchmarkReviewCommand[] =
      ledgerCommands.filter(
        (command) =>
          command.phase === "final" &&
          command.startedAt >= (round.finishedAt ?? "") &&
          command.manifestSha256 === round.manifestSha256,
      );
    const watcher: IEvidenceBenchmarkReviewCommand | undefined =
      finalCommands.at(-2);
    const test: IEvidenceBenchmarkReviewCommand | undefined =
      finalCommands.at(-1);
    if (
      watcher?.command !== "check-watch" ||
      watcher.status !== "succeeded" ||
      test?.command !== "test" ||
      test.status !== "succeeded"
    )
      throw new Error(
        `${props.goal.name} completed without runner-owned unchanged check-watch and test gates after its dry round.`,
      );
  }

  const startRound = (props: {
    cwd: string;
    state: IEvidenceBenchmarkRunState;
    goal: IEvidenceBenchmarkGoalRecord;
    call: IToolCall;
  }): IToolResult => {
    const ledger: IEvidenceBenchmarkReviewLedger = getLedger(
      props.state,
      props.goal,
    );
    const previous: IEvidenceBenchmarkReviewRound | undefined =
      ledger.rounds.at(-1);
    const current = manifest(props.cwd);
    if (previous?.status === "reading") {
      if (previous.manifestSha256 === current.sha256)
        return failure(
          `Round ${previous.index} is still active at ${previous.reads.length}/${previous.manifest.length} reads. Finish it before starting another round.`,
        );
      invalidate(
        previous,
        "The scoped workspace changed before the active round finished.",
      );
    } else if (previous?.status === "dry") {
      if (previous.manifestSha256 === current.sha256)
        return failure(
          `Round ${previous.index} is already dry. Run unchanged final gates and complete the Goal.`,
        );
      invalidate(
        previous,
        "The scoped workspace changed after the round was declared dry.",
      );
    } else if (previous?.status === "clean") {
      const calibration: IEvidenceBenchmarkReviewCalibration | undefined =
        ledger.calibrations?.at(-1);
      if (
        previous.manifestSha256 === current.sha256 &&
        (calibration?.status !== "passed" ||
          calibration.baselineManifestSha256 !== current.sha256 ||
          calibration.startedAt < (previous.finishedAt ?? ""))
      )
        return failure(
          `Round ${previous.index} is a clean candidate. Complete fail-restore-pass calibration before starting the qualifying round.`,
        );
      if (previous.manifestSha256 !== current.sha256)
        invalidate(
          previous,
          "The scoped workspace changed after the round was declared clean.",
        );
    }
    const round: IEvidenceBenchmarkReviewRound = {
      index: (previous?.index ?? 0) + 1,
      startedAt: new Date().toISOString(),
      manifestSha256: current.sha256,
      manifest: current.entries,
      reads: [],
      status: "reading",
    };
    ledger.rounds.push(round);
    return success(
      [
        `RUNNER REVIEW ROUND ${round.index}`,
        `manifest-sha256: ${round.manifestSha256}`,
        `files: ${round.manifest.length}`,
        "Read only through review_read_file, exactly in this order:",
        ...round.manifest.map((entry) => entry.path),
      ].join("\n"),
    );
  };

  const readFile = (props: {
    cwd: string;
    state: IEvidenceBenchmarkRunState;
    goal: IEvidenceBenchmarkGoalRecord;
    call: IToolCall;
  }): IToolResult => {
    const values: Record<string, unknown> | undefined = record(
      props.call.arguments,
    );
    if (typeof values?.path !== "string")
      return failure("review_read_file requires one string path.");
    const ledger: IEvidenceBenchmarkReviewLedger = getLedger(
      props.state,
      props.goal,
    );
    const round: IEvidenceBenchmarkReviewRound | undefined =
      ledger.rounds.at(-1);
    if (round === undefined || round.status !== "reading")
      return failure("No runner-owned review round is active.");
    const current = manifest(props.cwd);
    if (current.sha256 !== round.manifestSha256) {
      invalidate(
        round,
        "The scoped workspace changed during the reading phase.",
      );
      return failure(
        "The active round is invalid because the scoped workspace changed. Correct as needed, then call review_start_round for a fresh manifest.",
      );
    }
    const expected = round.manifest[round.reads.length];
    if (expected === undefined)
      return failure(
        "Every manifest file is already read. Call review_finish_round.",
      );
    if (values.path !== expected.path)
      return failure(
        `Out-of-order review read. Expected exactly ${expected.path}.`,
      );
    const absolute: string = resolveManifestPath(props.cwd, expected.path);
    const bytes: Buffer = fs.readFileSync(absolute);
    const digest: string = sha256(bytes);
    if (bytes.length !== expected.bytes || digest !== expected.sha256) {
      invalidate(round, `Manifest file changed before read: ${expected.path}`);
      return failure(
        "The active round is invalid because its next file changed. Call review_start_round after corrections.",
      );
    }
    round.reads.push({
      path: expected.path,
      bytes: bytes.length,
      sha256: digest,
      callId: props.call.callId,
      turnId: props.call.turnId,
      readAt: new Date().toISOString(),
    });
    return {
      success: true,
      contentItems: [
        {
          type: "inputText",
          text: `RUNNER REVIEW FILE ${round.reads.length}/${round.manifest.length}\npath: ${expected.path}\nbytes: ${bytes.length}\nsha256: ${digest}`,
        },
        { type: "inputText", text: bytes.toString("utf8") },
      ],
    };
  };

  const finishRound = (props: {
    cwd: string;
    state: IEvidenceBenchmarkRunState;
    goal: IEvidenceBenchmarkGoalRecord;
    call: IToolCall;
  }): IToolResult => {
    const values: Record<string, unknown> | undefined = record(
      props.call.arguments,
    );
    const result: unknown = values?.result;
    const findings: unknown = values?.findings;
    if (
      (result !== "findings" && result !== "clean" && result !== "dry") ||
      !Array.isArray(findings) ||
      findings.some(
        (finding) => typeof finding !== "string" || finding.trim().length === 0,
      )
    )
      return failure(
        "review_finish_round requires result=findings|clean|dry and string findings.",
      );
    const normalized: string[] = findings.map((finding) =>
      (finding as string).trim(),
    );
    if (
      ((result === "clean" || result === "dry") && normalized.length !== 0) ||
      (result === "findings" && normalized.length === 0)
    )
      return failure(
        "A clean or dry round must have zero findings; a findings round must report at least one.",
      );
    const ledger: IEvidenceBenchmarkReviewLedger = getLedger(
      props.state,
      props.goal,
    );
    const round: IEvidenceBenchmarkReviewRound | undefined =
      ledger.rounds.at(-1);
    if (round === undefined || round.status !== "reading")
      return failure("No runner-owned review round is active.");
    if (round.reads.length !== round.manifest.length)
      return failure(
        `The active round has only ${round.reads.length}/${round.manifest.length} credited reads.`,
      );
    const current = manifest(props.cwd);
    if (current.sha256 !== round.manifestSha256) {
      invalidate(
        round,
        "The scoped workspace changed before the round finished.",
      );
      return failure(
        "The active round is invalid because the scoped workspace changed. Correct as needed, then start a fresh round.",
      );
    }
    if (result === "dry") {
      const calibration: IEvidenceBenchmarkReviewCalibration | undefined =
        ledger.calibrations?.at(-1);
      if (
        calibration?.status !== "passed" ||
        calibration.baselineManifestSha256 !== round.manifestSha256 ||
        calibration.passCommandIndex === undefined ||
        calibration.startedAt >= round.startedAt
      )
        return failure(
          "A dry round requires a runner-proven fail-restore-pass calibration against the same scope before this round started.",
        );
    }
    round.status = result;
    round.findings = normalized;
    round.finishedAt = new Date().toISOString();
    return success(
      result === "dry"
        ? `Round ${round.index} is externally sealed dry at ${round.manifestSha256}. Keep the scoped workspace unchanged through final gates and Goal completion.`
        : result === "clean"
          ? `Round ${round.index} is a pre-calibration clean candidate at ${round.manifestSha256}. Calibrate, then perform a fresh full round that may be sealed dry.`
          : `Round ${round.index} is sealed with ${normalized.length} finding(s). Fix every consequence, run affected generators and gates separately, then calibrate and start a new full round.`,
    );
  };

  const startCalibration = (props: {
    cwd: string;
    state: IEvidenceBenchmarkRunState;
    goal: IEvidenceBenchmarkGoalRecord;
    call: IToolCall;
  }): IToolResult => {
    const ledger: IEvidenceBenchmarkReviewLedger = getLedger(
      props.state,
      props.goal,
    );
    const round: IEvidenceBenchmarkReviewRound | undefined =
      ledger.rounds.at(-1);
    if (round === undefined)
      return failure(
        "Complete and finish one full review round before calibration.",
      );
    if (round?.status === "reading")
      return failure(
        "Finish the active runner-owned reading round before calibration.",
      );
    if (round?.status === "dry")
      return failure(
        "Calibration must precede the qualifying dry round, not follow it.",
      );
    if (round.status === "invalid")
      return failure(
        "Complete a fresh full review round before calibration; the latest round is invalid.",
      );
    const current = manifest(props.cwd);
    if (round.status === "clean" && round.manifestSha256 !== current.sha256) {
      invalidate(
        round,
        "The scoped workspace changed after the round was declared clean.",
      );
      return failure(
        "The clean candidate changed before calibration. Complete a fresh full review round.",
      );
    }
    const previous: IEvidenceBenchmarkReviewCalibration | undefined =
      ledger.calibrations?.at(-1);
    if (
      previous !== undefined &&
      previous.status !== "passed" &&
      previous.status !== "invalid"
    )
      invalidateCalibration(
        previous,
        "A new calibration replaced the unfinished calibration.",
      );
    const calibration: IEvidenceBenchmarkReviewCalibration = {
      index: (previous?.index ?? 0) + 1,
      startedAt: new Date().toISOString(),
      baselineManifestSha256: current.sha256,
      status: "sealed",
    };
    ledger.calibrations!.push(calibration);
    return success(
      [
        `RUNNER CALIBRATION ${calibration.index}`,
        `baseline-manifest-sha256: ${calibration.baselineManifestSha256}`,
        "Temporarily break one material reviewed behavior, then call review_run_backend_command with command=test and phase=calibration-fail.",
        "Restore the exact baseline bytes, then call the same tool with command=test and phase=calibration-pass before starting a fresh full round.",
      ].join("\n"),
    );
  };

  const runBackendCommand = async (props: {
    cwd: string;
    state: IEvidenceBenchmarkRunState;
    goal: IEvidenceBenchmarkGoalRecord;
    call: IToolCall;
    onChange?: () => Promise<void>;
    signal?: AbortSignal;
  }): Promise<IToolResult> => {
    const values: Record<string, unknown> | undefined = record(
      props.call.arguments,
    );
    const command: unknown = values?.command;
    const phase: unknown = values?.phase;
    if (!isReviewCommand(command) || !isReviewCommandPhase(phase))
      return failure(
        "review_run_backend_command requires one allowed command and phase.",
      );
    const ledger: IEvidenceBenchmarkReviewLedger = getLedger(
      props.state,
      props.goal,
    );
    const round: IEvidenceBenchmarkReviewRound | undefined =
      ledger.rounds.at(-1);
    if (round?.status === "reading")
      return failure(
        "Runner-owned backend commands are forbidden during a reading phase.",
      );
    const current = manifest(props.cwd);
    const calibration: IEvidenceBenchmarkReviewCalibration | undefined =
      ledger.calibrations?.at(-1);
    const validation: string | undefined = validateCommandPhase({
      command,
      phase,
      round,
      calibration,
      currentManifestSha256: current.sha256,
      commands: ledger.commands!,
    });
    if (validation !== undefined) return failure(validation);
    const entry: IEvidenceBenchmarkReviewCommand = {
      index: ledger.commands!.length + 1,
      command,
      phase,
      callId: props.call.callId,
      turnId: props.call.turnId,
      startedAt: new Date().toISOString(),
      manifestSha256: current.sha256,
      status: "running",
    };
    ledger.commands!.push(entry);
    await props.onChange?.();
    const outcome: ICommandResult = await executeBackendCommand(
      props.cwd,
      command,
      (processId) => {
        entry.processId = processId;
        return props.onChange?.();
      },
      props.signal,
    );
    const combined: Buffer = Buffer.concat([
      Buffer.from("stdout\n", "utf8"),
      outcome.stdout,
      Buffer.from("\nstderr\n", "utf8"),
      outcome.stderr,
    ]);
    entry.finishedAt = new Date().toISOString();
    entry.exitCode = outcome.exitCode;
    entry.signal = outcome.signal;
    entry.outputBytes = combined.length;
    entry.outputSha256 = sha256(combined);
    entry.outputLimited = outcome.outputLimited;
    entry.cleanupForced = outcome.cleanupForced;
    const expectedFailure: boolean = phase === "calibration-fail";
    const actualSuccess: boolean =
      command === "check-watch"
        ? outcome.watchClean &&
          !outcome.watchErrors &&
          !outcome.timedOut &&
          !outcome.outputLimited
        : outcome.exitCode === 0 && !outcome.timedOut && !outcome.outputLimited;
    const normalExpectedFailure: boolean =
      !outcome.timedOut &&
      !outcome.outputLimited &&
      outcome.signal === null &&
      outcome.exitCode !== null &&
      outcome.exitCode !== 0;
    const accepted: boolean = expectedFailure
      ? normalExpectedFailure
      : actualSuccess;
    entry.status = outcome.timedOut
      ? "timed-out"
      : accepted
        ? expectedFailure
          ? "expected-failure"
          : "succeeded"
        : "failed";
    if (phase === "calibration-fail" && calibration !== undefined) {
      if (entry.status === "expected-failure") {
        calibration.status = "failure-proven";
        calibration.failureCommandIndex = entry.index;
      } else
        invalidateCalibration(
          calibration,
          "The deliberately broken behavior did not produce a bounded failing test.",
        );
    } else if (phase === "calibration-pass" && calibration !== undefined) {
      if (entry.status === "succeeded") {
        calibration.status = "passed";
        calibration.passCommandIndex = entry.index;
      } else
        invalidateCalibration(
          calibration,
          "The exact restored baseline did not pass its bounded test.",
        );
    } else if (phase === "final" && entry.status !== "succeeded") {
      if (round?.status === "dry")
        invalidate(round, `Runner-owned final gate failed: ${command}.`);
    }
    await props.onChange?.();
    const transcript: string = [
      `RUNNER BACKEND COMMAND ${entry.index}`,
      `command: ${command}`,
      `phase: ${phase}`,
      `status: ${entry.status}`,
      `exit-code: ${String(entry.exitCode)}`,
      `signal: ${String(entry.signal)}`,
      `output-limited: ${outcome.outputLimited}`,
      `output-bytes: ${entry.outputBytes}`,
      `output-sha256: ${entry.outputSha256}`,
      "stdout:",
      renderCommandOutput(outcome.stdout),
      "stderr:",
      renderCommandOutput(outcome.stderr),
    ].join("\n");
    return {
      success: accepted,
      contentItems: [{ type: "inputText", text: transcript }],
    };
  };

  const getLedger = (
    state: IEvidenceBenchmarkRunState,
    goal: IEvidenceBenchmarkGoalRecord,
  ): IEvidenceBenchmarkReviewLedger => {
    state.reviewLedgers ??= [];
    let ledger: IEvidenceBenchmarkReviewLedger | undefined =
      state.reviewLedgers.find(
        (candidate) => candidate.goalIndex === goal.index,
      );
    if (ledger === undefined) {
      ledger = {
        goalIndex: goal.index,
        goalName: goal.name as "backend-review" | "backend-final",
        rounds: [],
        commands: [],
        calibrations: [],
      };
      state.reviewLedgers.push(ledger);
    }
    ledger.commands ??= [];
    ledger.calibrations ??= [];
    return ledger;
  };

  const manifest = (
    cwd: string,
  ): {
    entries: IEvidenceBenchmarkReviewManifestEntry[];
    sha256: string;
  } => {
    const groups: {
      section: IEvidenceBenchmarkReviewManifestEntry["section"];
      paths: string[];
    }[] = [
      { section: "requirements", paths: listFiles(cwd, "docs/analysis") },
      {
        section: "schema",
        paths: listFiles(cwd, "packages/backend/prisma/schema"),
      },
      {
        section: "api",
        paths: [
          ...listFiles(cwd, "packages/api/src"),
          requiredFile(cwd, "packages/api/swagger.json"),
        ],
      },
      {
        section: "backend",
        paths: listFiles(cwd, "packages/backend/src").filter(
          (file) =>
            !file.startsWith("packages/backend/src/prisma/") &&
            !file.includes("/prisma/generated/"),
        ),
      },
      { section: "tests", paths: listFiles(cwd, "packages/backend/test") },
      {
        section: "configuration",
        paths: CONFIGURATION_PATHS.map((file) => requiredFile(cwd, file)),
      },
    ];
    const seen: Set<string> = new Set();
    const entries: IEvidenceBenchmarkReviewManifestEntry[] = [];
    for (const group of groups)
      for (const relative of group.paths.sort(comparePaths)) {
        if (seen.has(relative))
          throw new Error(
            `Backend review scope contains a duplicate: ${relative}`,
          );
        seen.add(relative);
        const absolute: string = resolveManifestPath(cwd, relative);
        const bytes: Buffer = fs.readFileSync(absolute);
        entries.push({
          section: group.section,
          path: relative,
          bytes: bytes.length,
          sha256: sha256(bytes),
        });
      }
    return {
      entries,
      sha256: sha256(Buffer.from(JSON.stringify(entries), "utf8")),
    };
  };

  const listFiles = (cwd: string, relative: string): string[] => {
    const root: string = resolveManifestPath(cwd, relative);
    if (!fs.statSync(root).isDirectory())
      throw new Error(`Backend review scope is not a directory: ${relative}`);
    const output: string[] = [];
    const visit = (directory: string): void => {
      for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const absolute: string = path.join(directory, entry.name);
        if (entry.isDirectory()) visit(absolute);
        else if (entry.isFile())
          output.push(path.relative(cwd, absolute).split(path.sep).join("/"));
      }
    };
    visit(root);
    return output;
  };

  const requiredFile = (cwd: string, relative: string): string => {
    const absolute: string = resolveManifestPath(cwd, relative);
    if (!fs.statSync(absolute).isFile())
      throw new Error(`Backend review scope is not a file: ${relative}`);
    return relative;
  };

  const resolveManifestPath = (cwd: string, relative: string): string => {
    if (
      relative.length === 0 ||
      path.isAbsolute(relative) ||
      relative.includes("\\") ||
      relative.split("/").includes("..")
    )
      throw new Error(`Invalid backend review path: ${relative}`);
    const root: string = path.resolve(cwd);
    const absolute: string = path.resolve(root, ...relative.split("/"));
    if (absolute !== root && !absolute.startsWith(`${root}${path.sep}`))
      throw new Error(`Backend review path escapes the workspace: ${relative}`);
    return absolute;
  };

  const invalidate = (
    round: IEvidenceBenchmarkReviewRound,
    reason: string,
  ): void => {
    round.status = "invalid";
    round.invalidatedAt = new Date().toISOString();
    round.invalidation = reason;
  };

  const invalidateCalibration = (
    calibration: IEvidenceBenchmarkReviewCalibration,
    reason: string,
  ): void => {
    calibration.status = "invalid";
    calibration.invalidatedAt = new Date().toISOString();
    calibration.invalidation = reason;
  };

  const validateCommandPhase = (props: {
    command: ReviewCommand;
    phase: ReviewCommandPhase;
    round: IEvidenceBenchmarkReviewRound | undefined;
    calibration: IEvidenceBenchmarkReviewCalibration | undefined;
    currentManifestSha256: string;
    commands: IEvidenceBenchmarkReviewCommand[];
  }): string | undefined => {
    if (props.phase === "correction") {
      if (props.round?.status !== "findings")
        return "Correction commands require the latest completed round to contain findings.";
      return undefined;
    }
    if (props.phase === "calibration-fail") {
      if (props.command !== "test")
        return "Calibration failure proof must run command=test.";
      if (props.calibration?.status !== "sealed")
        return "Call review_start_calibration before the calibration failure test.";
      if (
        props.calibration.baselineManifestSha256 === props.currentManifestSha256
      )
        return "The calibration workspace still matches its baseline; break one material reviewed behavior first.";
      return undefined;
    }
    if (props.phase === "calibration-pass") {
      if (props.command !== "test")
        return "Calibration restore proof must run command=test.";
      if (props.calibration?.status !== "failure-proven")
        return "A runner-owned failing calibration test has not been proven.";
      if (
        props.calibration.baselineManifestSha256 !== props.currentManifestSha256
      )
        return "The calibration workspace does not match the exact sealed baseline.";
      return undefined;
    }
    if (props.round?.status !== "dry")
      return "Final gates require a current runner-owned dry round.";
    if (props.round.manifestSha256 !== props.currentManifestSha256)
      return "The workspace changed after the dry round.";
    const finalCommands: IEvidenceBenchmarkReviewCommand[] =
      props.commands.filter(
        (entry) =>
          entry.phase === "final" &&
          entry.startedAt >= (props.round?.finishedAt ?? ""),
      );
    if (finalCommands.length === 0 && props.command !== "check-watch")
      return "The first final gate must be command=check-watch.";
    if (
      finalCommands.length === 1 &&
      (finalCommands[0]!.command !== "check-watch" ||
        finalCommands[0]!.status !== "succeeded" ||
        props.command !== "test")
    )
      return "A successful check-watch must be followed by command=test.";
    if (finalCommands.length >= 2)
      return "The unchanged final check-watch and test sequence is already recorded.";
    return undefined;
  };

  const executeBackendCommand = async (
    cwd: string,
    command: ReviewCommand,
    onStarted: (processId: number) => void | Promise<void>,
    signal?: AbortSignal,
  ): Promise<ICommandResult> => {
    const entrypoint: string | undefined = process.env.npm_execpath;
    if (entrypoint === undefined)
      throw new Error(
        "Runner-owned backend commands require the pnpm npm_execpath.",
      );
    const backend: string = path.join(cwd, "packages", "backend");
    const timeoutMs: number =
      command === "build-sdk" ? 10 * 60_000 : 5 * 60_000;
    const outputLimit: number = 4 * 1024 * 1024;
    return new Promise<ICommandResult>((resolve, reject) => {
      const child = spawn(
        process.execPath,
        [entrypoint, "run", commandScript(command)],
        {
          cwd: backend,
          env: process.env,
          detached: process.platform !== "win32",
          shell: false,
          stdio: ["ignore", "pipe", "pipe"],
          windowsHide: true,
        },
      );
      if (child.pid === undefined) {
        reject(new Error("Runner-owned backend command omitted its PID."));
        return;
      }
      const stdout: Buffer[] = [];
      const stderr: Buffer[] = [];
      let outputBytes = 0;
      let timedOut = false;
      let outputLimited = false;
      let cleanupForced = false;
      let watchClean = false;
      let watchErrors = false;
      let watchOutput = "";
      let cleanup: Promise<void> = Promise.resolve();
      let stopping = false;
      const stop = (): Promise<void> => {
        if (stopping) return cleanup;
        stopping = true;
        cleanupForced = true;
        cleanup = terminateProcessTree(child.pid!);
        return cleanup;
      };
      const abort = (): void => {
        void stop();
      };
      signal?.addEventListener("abort", abort, { once: true });
      if (signal?.aborted === true) abort();
      const append = (target: Buffer[], chunk: Buffer | string): void => {
        const value: Buffer = Buffer.isBuffer(chunk)
          ? chunk
          : Buffer.from(chunk, "utf8");
        target.push(value);
        outputBytes += value.length;
        if (command === "check-watch") {
          watchOutput = `${watchOutput}${value.toString("utf8")}`.slice(
            -65_536,
          );
          if (
            /Found\s+0\s+errors?\.\s+Watching for file changes\./iu.test(
              watchOutput,
            )
          ) {
            watchClean = true;
            void stop();
          } else if (
            /Found\s+[1-9][0-9]*\s+errors?\.\s+Watching for file changes\./iu.test(
              watchOutput,
            )
          ) {
            watchErrors = true;
            void stop();
          }
        }
        if (outputBytes > outputLimit) {
          outputLimited = true;
          void stop();
        }
      };
      child.stdout!.on("data", (chunk: Buffer) => append(stdout, chunk));
      child.stderr!.on("data", (chunk: Buffer) => append(stderr, chunk));
      child.once("error", reject);
      void Promise.resolve(onStarted(child.pid)).catch(
        async (error: unknown) => {
          await stop();
          reject(error);
        },
      );
      const timer: NodeJS.Timeout = setTimeout(() => {
        timedOut = true;
        void stop();
      }, timeoutMs);
      child.once("close", async (exitCode, exitSignal) => {
        clearTimeout(timer);
        signal?.removeEventListener("abort", abort);
        await cleanup;
        resolve({
          exitCode,
          signal: exitSignal,
          stdout: Buffer.concat(stdout),
          stderr: Buffer.concat(stderr),
          timedOut,
          outputLimited,
          cleanupForced,
          watchClean,
          watchErrors,
        });
      });
    });
  };

  const terminateProcessTree = async (processId: number): Promise<void> => {
    if (process.platform !== "win32") {
      try {
        process.kill(-processId, "SIGKILL");
      } catch {
        try {
          process.kill(processId, "SIGKILL");
        } catch {
          // The bounded command exited between observation and cleanup.
        }
      }
      return;
    }
    await new Promise<void>((resolve) => {
      const cleanup = spawn(
        "taskkill.exe",
        ["/pid", String(processId), "/T", "/F"],
        {
          shell: false,
          stdio: "ignore",
          windowsHide: true,
        },
      );
      cleanup.once("error", () => resolve());
      cleanup.once("close", () => resolve());
    });
  };

  const commandScript = (command: ReviewCommand): string =>
    command === "build-prisma"
      ? "build:prisma"
      : command === "build-main"
        ? "build:main"
        : command === "build-sdk"
          ? "build:sdk"
          : command === "build-test"
            ? "build:test"
            : command === "check-watch"
              ? "check:watch"
              : command;

  const isReviewCommand = (value: unknown): value is ReviewCommand =>
    value === "build-prisma" ||
    value === "build-main" ||
    value === "schema" ||
    value === "build-sdk" ||
    value === "build-test" ||
    value === "check-watch" ||
    value === "lint" ||
    value === "format" ||
    value === "test";

  const isReviewCommandPhase = (value: unknown): value is ReviewCommandPhase =>
    value === "correction" ||
    value === "calibration-fail" ||
    value === "calibration-pass" ||
    value === "final";

  const isBackendLifecycleCommand = (command: string): boolean => {
    return shellSegments(command).some((segment) => {
      const tokens: string[] = shellTokens(segment);
      if (tokens.length === 0) return false;
      const executable: string = executableName(tokens[0]!);
      if (executable === "powershell" || executable === "pwsh") {
        const commandIndex: number = tokens.findIndex(
          (token, index) =>
            index > 0 && (token.toLowerCase() === "-command" || token === "-c"),
        );
        return (
          commandIndex !== -1 &&
          isBackendLifecycleCommand(tokens.slice(commandIndex + 1).join(" "))
        );
      }
      if (executable === "cmd") {
        const commandIndex: number = tokens.findIndex(
          (token, index) => index > 0 && token.toLowerCase() === "/c",
        );
        return (
          commandIndex !== -1 &&
          isBackendLifecycleCommand(tokens.slice(commandIndex + 1).join(" "))
        );
      }
      if (["bash", "sh", "zsh"].includes(executable)) {
        const commandIndex: number = tokens.findIndex(
          (token, index) => index > 0 && /^-[a-z]*c[a-z]*$/iu.test(token),
        );
        return (
          commandIndex !== -1 &&
          isBackendLifecycleCommand(tokens.slice(commandIndex + 1).join(" "))
        );
      }
      if (["pnpm", "npm", "yarn", "bun"].includes(executable)) {
        const actionIndex: number = skipCommandOptions(tokens, 1);
        const action: string | undefined = tokens[actionIndex]?.toLowerCase();
        if (action === undefined) return false;
        if (action === "run" || action === "run-script")
          return isBackendScript(tokens[actionIndex + 1]);
        if (isBackendScript(action)) return true;
        const toolIndex: number = ["exec", "dlx", "x"].includes(action)
          ? skipCommandOptions(tokens, actionIndex + 1)
          : actionIndex;
        return isBackendTool(tokens.slice(toolIndex));
      }
      if (executable === "npx")
        return isBackendTool(tokens.slice(skipCommandOptions(tokens, 1)));
      return isBackendTool(tokens);
    });
  };

  const isBackendResidentCommand = (command: string): boolean =>
    shellSegments(command).some((segment) => {
      const tokens: string[] = shellTokens(segment);
      if (tokens.length === 0) return false;
      const executable: string = executableName(tokens[0]!);
      if (executable === "powershell" || executable === "pwsh") {
        const commandIndex: number = tokens.findIndex(
          (token, index) =>
            index > 0 && (token.toLowerCase() === "-command" || token === "-c"),
        );
        return (
          commandIndex !== -1 &&
          isBackendResidentCommand(tokens.slice(commandIndex + 1).join(" "))
        );
      }
      if (executable === "cmd") {
        const commandIndex: number = tokens.findIndex(
          (token, index) => index > 0 && token.toLowerCase() === "/c",
        );
        return (
          commandIndex !== -1 &&
          isBackendResidentCommand(tokens.slice(commandIndex + 1).join(" "))
        );
      }
      if (["bash", "sh", "zsh"].includes(executable)) {
        const commandIndex: number = tokens.findIndex(
          (token, index) => index > 0 && /^-[a-z]*c[a-z]*$/iu.test(token),
        );
        return (
          commandIndex !== -1 &&
          isBackendResidentCommand(tokens.slice(commandIndex + 1).join(" "))
        );
      }
      if (!["pnpm", "npm", "yarn", "bun"].includes(executable)) return false;
      const actionIndex: number = skipCommandOptions(tokens, 1);
      const action: string | undefined = tokens[actionIndex]?.toLowerCase();
      return action === "dev"
        ? true
        : (action === "run" || action === "run-script") &&
            tokens[actionIndex + 1]?.toLowerCase() === "dev";
    });

  const isBackendScript = (value: string | undefined): boolean =>
    value !== undefined &&
    /^(?:build(?::(?:prisma|sdk|main|test))?|schema|check:watch|test|lint|format)$/u.test(
      value.toLowerCase(),
    );

  const isBackendTool = (tokens: string[]): boolean => {
    const executable: string | undefined = tokens[0];
    if (executable === undefined) return false;
    const name: string = executableName(executable);
    if (name === "prisma") return tokens[1]?.toLowerCase() === "generate";
    if (name === "nestia") return tokens[1]?.toLowerCase() === "all";
    if (name === "ttsc") return true;
    return (
      name === "ttsx" && tokens.slice(1).some((token) => /schema/iu.test(token))
    );
  };

  const skipCommandOptions = (tokens: string[], start: number): number => {
    const optionsWithValues: Set<string> = new Set([
      "--dir",
      "--filter",
      "--prefix",
      "--cwd",
      "-c",
      "-f",
    ]);
    let index: number = start;
    while (tokens[index]?.startsWith("-") === true) {
      const option: string = tokens[index]!.toLowerCase();
      index += 1;
      if (!option.includes("=") && optionsWithValues.has(option)) index += 1;
    }
    return index;
  };

  const executableName = (value: string): string =>
    value
      .split(/[\\/]/u)
      .at(-1)!
      .toLowerCase()
      .replace(/\.(?:cmd|exe)$/u, "");

  const shellSegments = (command: string): string[] => {
    const output: string[] = [];
    let current = "";
    let quote: "'" | '"' | undefined;
    for (let index = 0; index < command.length; index++) {
      const character: string = command[index]!;
      if (character === "`" && index + 1 < command.length) {
        current += `${character}${command[++index]!}`;
      } else if (quote !== undefined) {
        current += character;
        if (character === quote) quote = undefined;
      } else if (character === "'" || character === '"') {
        quote = character;
        current += character;
      } else if (character === ";" || character === "|" || character === "&") {
        if (current.trim().length !== 0) output.push(current);
        current = "";
      } else current += character;
    }
    if (current.trim().length !== 0) output.push(current);
    return output;
  };

  const shellTokens = (command: string): string[] => {
    const output: string[] = [];
    let current = "";
    let quote: "'" | '"' | undefined;
    const push = (): void => {
      if (current.length === 0) return;
      output.push(current);
      current = "";
    };
    for (let index = 0; index < command.length; index++) {
      const character: string = command[index]!;
      if (character === "`" && index + 1 < command.length)
        current += command[++index]!;
      else if (quote !== undefined) {
        if (character === quote) quote = undefined;
        else current += character;
      } else if (character === "'" || character === '"') quote = character;
      else if (/\s/u.test(character)) push();
      else current += character;
    }
    push();
    return output;
  };

  const success = (text: string): IToolResult => ({
    contentItems: [{ type: "inputText", text }],
    success: true,
  });

  const failure = (text: string): IToolResult => ({
    contentItems: [{ type: "inputText", text }],
    success: false,
  });

  const record = (value: unknown): Record<string, unknown> | undefined =>
    typeof value === "object" && value !== null
      ? (value as Record<string, unknown>)
      : undefined;

  const comparePaths = (x: string, y: string): number =>
    x < y ? -1 : x > y ? 1 : 0;

  const sha256 = (value: Buffer): string =>
    crypto.createHash("sha256").update(value).digest("hex");

  const renderCommandOutput = (value: Buffer): string => {
    const limit: number = 64 * 1024;
    if (value.length <= limit) return value.toString("utf8");
    const head: Buffer = value.subarray(0, 16 * 1024);
    const tail: Buffer = value.subarray(value.length - 48 * 1024);
    return `${head.toString("utf8")}\n... runner omitted ${value.length - head.length - tail.length} output bytes ...\n${tail.toString("utf8")}`;
  };
}
