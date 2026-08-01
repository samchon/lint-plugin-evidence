import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import type { IEvidenceBenchmarkGoalRecord } from "./structures/IEvidenceBenchmarkGoalRecord.ts";
import type {
  IEvidenceBenchmarkReviewLedger,
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

const CONFIGURATION_PATHS = [
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
        "Finish the active runner-owned round after every manifest file was returned and the workspace stayed unchanged. Report either findings or dry.",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        properties: {
          result: { type: "string", enum: ["findings", "dry"] },
          findings: {
            type: "array",
            items: { type: "string" },
          },
        },
        required: ["result", "findings"],
      },
    },
  ];

  export function handle(props: {
    cwd: string;
    state: IEvidenceBenchmarkRunState;
    goal: IEvidenceBenchmarkGoalRecord;
    call: IToolCall;
  }): IToolResult {
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
    return failure(`Unknown review ledger tool: ${props.call.tool}`);
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
      (result !== "findings" && result !== "dry") ||
      !Array.isArray(findings) ||
      findings.some(
        (finding) => typeof finding !== "string" || finding.trim().length === 0,
      )
    )
      return failure(
        "review_finish_round requires result=findings|dry and nonempty string findings.",
      );
    const normalized: string[] = findings.map((finding) =>
      (finding as string).trim(),
    );
    if (
      (result === "dry" && normalized.length !== 0) ||
      (result === "findings" && normalized.length === 0)
    )
      return failure(
        "A dry round must have zero findings; a findings round must report at least one.",
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
    round.status = result;
    round.findings = normalized;
    round.finishedAt = new Date().toISOString();
    return success(
      result === "dry"
        ? `Round ${round.index} is externally sealed dry at ${round.manifestSha256}. Keep the scoped workspace unchanged through final gates and Goal completion.`
        : `Round ${round.index} is sealed with ${normalized.length} finding(s). Fix every consequence, run affected generators and gates separately, then start a new full round.`,
    );
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
      };
      state.reviewLedgers.push(ledger);
    }
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
          (file) => !file.includes("/prisma/generated/"),
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
}
