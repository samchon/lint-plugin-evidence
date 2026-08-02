import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { collectEvidenceBenchmarkApiCost } from "../../../benchmark/src/EvidenceBenchmarkApiCost.ts";
import { renderEvidenceBenchmarkDashboard } from "../../../benchmark/src/EvidenceBenchmarkDashboard.ts";
import { writeEvidenceBenchmarkReport } from "../../../benchmark/src/EvidenceBenchmarkReport.ts";
import { auditEvidenceBenchmarkSuspensions } from "../../../benchmark/src/EvidenceBenchmarkSuspensionAudit.ts";
import type {
  IEvidenceBenchmarkReport,
  IEvidenceBenchmarkReportCell,
} from "../../../benchmark/src/structures/IEvidenceBenchmarkReport.ts";

/**
 * Verifies the dashboard reports only the latest launched run for each cell.
 *
 * The pull-request body is the operator's live control surface. A stale run,
 * reconstructed progress, or incorrect active-process time can trigger an
 * unnecessary paid restart, so this fixture uses real Git worktrees and
 * retained event records rather than synthetic rendered rows.
 *
 * 1. Create two real benchmark worktrees and retained run records.
 * 2. Give one cell an older run and a newer active run with later output.
 * 3. Render the summary table and stage-level cost, time, and shares.
 * 4. Publish deterministic aggregate and per-cell JSON plus SVG charts.
 * 5. Assert stale and unlaunched cells never appear.
 */
const main = (): void => {
  const repository: string = fs.mkdtempSync(
    path.join(os.tmpdir(), "evidence-benchmark-dashboard-"),
  );
  try {
    assert.equal(renderEvidenceBenchmarkDashboard(repository), "\n");

    const plainWorkspace: string = createWorkspace(
      repository,
      "plain-workspace",
      true,
    );
    const evidenceWorkspace: string = createWorkspace(
      repository,
      "evidence-workspace",
      false,
    );
    writeRun({
      repository,
      subject: "todo",
      arm: "plain",
      runId: "old",
      workspace: plainWorkspace,
      launchedAt: "2026-07-31T00:00:00.000Z",
      status: "completed",
      nextInstructionIndex: 8,
      totalTokens: 900_000,
      goals: [goal(7, "overall-final", 900_000, 60_000)],
      processes: [{ elapsedMs: 60_000, exitCode: 0, signal: null }],
      outputEvents: [],
    });
    writeRun({
      repository,
      subject: "todo",
      arm: "plain",
      runId: "mismatched-cost",
      workspace: plainWorkspace,
      launchedAt: "2026-07-30T00:00:00.000Z",
      status: "completed",
      nextInstructionIndex: 8,
      totalTokens: 100_000,
      requests: [tokenUsage(90_000)],
      goals: [goal(7, "overall-final", 100_000, 60_000)],
      processes: [{ elapsedMs: 60_000, exitCode: 0, signal: null }],
      outputEvents: [],
    });
    writeRun({
      repository,
      subject: "reddit",
      arm: "plain",
      runId: "terra",
      workspace: evidenceWorkspace,
      launchedAt: "2026-07-31T03:00:00.000Z",
      status: "interrupted",
      nextInstructionIndex: 0,
      totalTokens: 1_100_000,
      goals: [goal(0, "backend-start", 1_100_000, 120_000)],
      processes: [{ elapsedMs: 120_000, exitCode: 1, signal: null }],
      outputEvents: [],
      model: "gpt-5.6-terra",
    });
    writeRun({
      repository,
      subject: "todo",
      arm: "plain",
      runId: "latest",
      workspace: plainWorkspace,
      launchedAt: "2026-07-31T01:00:00.000Z",
      status: "running",
      nextInstructionIndex: 1,
      totalTokens: 1_600_000,
      tokenUsage: tokenUsage(1_600_000),
      initialTokenUsage: tokenUsage(900_000),
      requests: [tokenUsage(700_000)],
      nativeThreadStartInstructionIndex: 1,
      goals: [
        goal(0, "backend-start", 900_000, 61_000, 120, tokenUsage(900_000)),
        goal(1, "backend-review", 0, 0),
      ],
      processes: [{ elapsedMs: 10_000, exitCode: null, signal: null }],
      outputEvents: [{ processIndex: 0, elapsedMs: 65_000 }],
      inheritedProcessElapsedMs: 61_000,
      inheritedWallElapsedMs: 30 * 60 * 1_000,
      checkpointSourceRunId: "old",
      supervisionPauses: [
        {
          pausedAt: "2026-07-31T02:00:00.000Z",
          resumedAt: "2026-07-31T02:15:00.000Z",
        },
      ],
    });
    writeRun({
      repository,
      subject: "todo",
      arm: "plain",
      runId: "detached",
      workspace: plainWorkspace,
      launchedAt: "2026-07-31T00:30:00.000Z",
      status: "running",
      nextInstructionIndex: 1,
      totalTokens: 700_000,
      requests: [tokenUsage(700_000)],
      nativeThreadStartInstructionIndex: 1,
      reviewLedger: "backend",
      goals: [
        goal(0, "backend-start", 900_000, 61_000, 120, tokenUsage(900_000)),
        goal(1, "backend-review", 0, 0),
      ],
      processes: [{ elapsedMs: 10_000, exitCode: null, signal: null }],
      outputEvents: [{ processIndex: 0, elapsedMs: 65_000 }],
      inheritedProcessElapsedMs: 61_000,
      inheritedWallElapsedMs: 30 * 60 * 1_000,
      checkpointSourceRunId: "old",
    });
    writeRun({
      repository,
      subject: "todo",
      arm: "evidence",
      runId: "evidence",
      workspace: evidenceWorkspace,
      launchedAt: "2026-07-31T02:00:00.000Z",
      status: "completed",
      nextInstructionIndex: 6,
      totalTokens: 400_000,
      tokenUsage: {
        totalTokens: 400_000,
        inputTokens: 300_000,
        cachedInputTokens: 190_000,
        cacheWriteInputTokens: 10_000,
        outputTokens: 100_000,
        reasoningOutputTokens: 25_000,
      },
      requests: [
        {
          totalTokens: 53_000,
          inputTokens: 28_000,
          cachedInputTokens: 10_000,
          cacheWriteInputTokens: 0,
          outputTokens: 25_000,
          reasoningOutputTokens: 5_000,
        },
        {
          totalTokens: 347_000,
          inputTokens: 272_000,
          cachedInputTokens: 180_000,
          cacheWriteInputTokens: 10_000,
          outputTokens: 75_000,
          reasoningOutputTokens: 20_000,
        },
      ],
      goals: [
        goal(0, "backend-start", 50_000, 300_000),
        goal(1, "backend-review", 50_000, 400_000),
        goal(2, "backend-final", 25_000, 200_000),
        goal(3, "frontend-start", 75_000, 500_000),
        goal(4, "frontend-review", 50_000, 600_000),
        goal(5, "frontend-final", 150_000, 1_660_000),
      ],
      processes: [{ elapsedMs: 3_660_000, exitCode: 0, signal: null }],
      outputEvents: [{ processIndex: 0, elapsedMs: 3_660_000 }],
    });
    const audit = auditEvidenceBenchmarkSuspensions(
      repository,
      [
        {
          startedAt: "2026-07-31T02:06:00.000Z",
          endedAt: "2026-07-31T02:07:00.000Z",
        },
        {
          startedAt: "2026-07-31T02:40:00.000Z",
          endedAt: "2026-07-31T02:41:40.000Z",
        },
        {
          startedAt: "2026-07-31T03:00:50.000Z",
          endedAt: "2026-07-31T03:01:00.000Z",
        },
      ],
      ["evidence"],
    );
    assert.deepEqual(audit, { runs: 1, intervals: 3, added: 2 });
    assert.equal(
      auditEvidenceBenchmarkSuspensions(
        repository,
        [
          {
            startedAt: "2026-07-31T02:06:00.000Z",
            endedAt: "2026-07-31T02:07:00.000Z",
          },
          {
            startedAt: "2026-07-31T02:40:00.000Z",
            endedAt: "2026-07-31T02:41:40.000Z",
          },
        ],
        ["evidence"],
      ).added,
      0,
    );
    fs.mkdirSync(
      path.join(
        repository,
        "benchmark",
        "output",
        "shopping",
        "codex",
        "plain",
        "runs",
        "not-launched",
      ),
      { recursive: true },
    );

    const evidenceRaw: string = path.join(
      repository,
      "benchmark",
      "output",
      "todo",
      "codex",
      "evidence",
      "runs",
      "evidence",
      "raw.log",
    );
    const heldRaw: string = `${evidenceRaw}.held`;
    fs.renameSync(evidenceRaw, heldRaw);
    const dashboard: string = renderEvidenceBenchmarkDashboard(repository);
    fs.renameSync(heldRaw, evidenceRaw);
    assert.equal((dashboard.match(/^## /gmu) ?? []).length, 2);
    assert.match(dashboard, /^## GPT-5\.6-Luna$/mu);
    assert.match(dashboard, /^## GPT-5\.6-Terra$/mu);
    assert.match(
      dashboard,
      /^\| Cell \| Stage \| Progress \| Cost \| Work time \|$/mu,
    );
    assert.doesNotMatch(dashboard, /\| Elapsed \|/u);
    assert.match(
      dashboard,
      /^\| Todo Plain \| `backend-review` · running \| 2 files · \+2\/−0 LOC \| 2M \| 2m \|$/mu,
    );
    assert.match(
      dashboard,
      /^\| Todo Evidence \| `frontend-final` · completed \| 0 files · \+0\/−0 LOC \| 0M \| 58m \|$/mu,
    );
    assert.match(
      dashboard,
      /^\| Reddit Plain \| `backend-start` · interrupted \| 0 files · \+0\/−0 LOC \| 1M \| 2m \|$/mu,
    );
    assert.match(dashboard, /^- \*\*Todo Plain stages\*\*$/mu);
    assert.match(
      dashboard,
      /^  - `backend-start`: 1M · 2m · 56% tokens · 95% time$/mu,
    );
    assert.match(
      dashboard,
      /^  - `backend-review`: 1M · 0m · 44% tokens · 5% time$/mu,
    );
    assert.match(
      dashboard,
      /^  - `frontend-final`: 0M · 26m · 38% tokens · 45% time$/mu,
    );
    assert.match(
      dashboard,
      /^  - `backend-start`: 1M · 2m · 100% tokens · 100% time$/mu,
    );
    assert.equal(dashboard.includes("900000"), false);
    assert.equal(dashboard.includes("Shopping"), false);
    assert.ok(
      dashboard.indexOf("| Todo Plain |") <
        dashboard.indexOf("| Todo Evidence |"),
    );
    assert.ok(
      dashboard.indexOf("## GPT-5.6-Luna") <
        dashboard.indexOf("## GPT-5.6-Terra"),
    );

    const generatedAt: Date = new Date("2026-07-31T04:00:00.000Z");
    const reportOutput: string = path.join(repository, "published");
    fs.mkdirSync(reportOutput);
    for (const file of [
      "tokens.png",
      "time.png",
      "work-time.svg",
      "work-time.png",
      "wall-time.svg",
      "wall-time.png",
      "obsolete.svg",
    ])
      fs.writeFileSync(path.join(reportOutput, file), "stale");
    const report: IEvidenceBenchmarkReport = writeEvidenceBenchmarkReport({
      repository,
      output: reportOutput,
      generatedAt,
    });
    assert.equal(report.schemaVersion, 3);
    assert.equal(report.generatedAt, generatedAt.toISOString());
    assert.equal(report.cells.length, 3);
    const todoPlain: IEvidenceBenchmarkReportCell | undefined =
      report.cells.find(
        (cell) => cell.subject === "todo" && cell.arm === "plain",
      );
    assert.ok(todoPlain);
    assert.equal(todoPlain.runId, "latest");
    assert.equal(todoPlain.benchmarkRevision, "fixture-revision");
    assert.equal(todoPlain.effort, "high");
    assert.equal(todoPlain.status, "running");
    assert.equal(todoPlain.stage, "backend-review");
    assert.equal(todoPlain.tokens, 1_600_000);
    assert.equal(todoPlain.suspendedMs, 0);
    assert.deepEqual(todoPlain.suspensions, []);
    assert.deepEqual(todoPlain.tokenUsage, {
      totalTokens: 1_600_000,
      inputTokens: 1_200_000,
      cachedInputTokens: 800_000,
      cacheWriteInputTokens: 0,
      outputTokens: 400_000,
      reasoningOutputTokens: 100_000,
    });
    assert.deepEqual(todoPlain.apiCost, {
      provider: "openrouter",
      pricingAsOf: "2026-08-01",
      priceSource: "https://openrouter.ai/api/v1/models",
      currency: "USD",
      amountUsd: 0.456,
      requests: 2,
      shortContextRequests: 0,
      longContextRequests: 2,
      longContextThresholdTokens: 272_000,
    });
    const todoEvidence: IEvidenceBenchmarkReportCell | undefined =
      report.cells.find(
        (cell) => cell.subject === "todo" && cell.arm === "evidence",
      );
    assert.ok(todoEvidence);
    assert.equal(todoEvidence.suspendedMs, 160_000);
    assert.deepEqual(
      todoEvidence.suspensions.map((suspension) => suspension.elapsedMs),
      [60_000, 100_000],
    );
    assert.equal(todoEvidence.workElapsedMs, 3_500_000);
    assert.deepEqual(todoEvidence.apiCost, {
      provider: "openrouter",
      pricingAsOf: "2026-08-01",
      priceSource: "https://openrouter.ai/api/v1/models",
      currency: "USD",
      amountUsd: 0.1069,
      requests: 2,
      shortContextRequests: 1,
      longContextRequests: 1,
      longContextThresholdTokens: 272_000,
    });
    const redditPlain: IEvidenceBenchmarkReportCell | undefined =
      report.cells.find(
        (cell) => cell.subject === "reddit" && cell.arm === "plain",
      );
    assert.ok(redditPlain);
    assert.equal(redditPlain.apiCost?.amountUsd, 3.135);
    assert.equal(todoPlain.workElapsedMs, 126_000);
    assert.deepEqual(todoPlain.worktree, {
      files: 2,
      additions: 2,
      deletions: 0,
    });
    assert.deepEqual(todoPlain.stages, [
      {
        name: "backend-start",
        tokens: 900_000,
        elapsedMs: 120_000,
        tokenPercent: 56,
        timePercent: 95,
      },
      {
        name: "backend-review",
        tokens: 700_000,
        elapsedMs: 6_000,
        tokenPercent: 44,
        timePercent: 5,
      },
    ]);
    const detached: IEvidenceBenchmarkReport = writeEvidenceBenchmarkReport({
      repository,
      output: path.join(repository, "detached"),
      generatedAt,
      runIds: ["detached"],
    });
    assert.equal(detached.cells[0]?.tokens, 1_600_000);
    assert.deepEqual(
      detached.cells[0]?.stages.map((stage) => stage.tokens),
      [900_000, 700_000],
    );
    assert.deepEqual(
      JSON.parse(
        fs.readFileSync(path.join(reportOutput, "summary.json"), "utf8"),
      ),
      report,
    );
    assert.deepEqual(
      JSON.parse(
        fs.readFileSync(
          path.join(
            reportOutput,
            "cells",
            "gpt-5.6-luna",
            "todo",
            "plain.json",
          ),
          "utf8",
        ),
      ),
      todoPlain,
    );
    const tokensSvg: string = fs.readFileSync(
      path.join(reportOutput, "tokens.svg"),
      "utf8",
    );
    assert.match(tokensSvg, /^<svg /u);
    assert.match(tokensSvg, /Benchmark token usage by project/u);
    assert.match(tokensSvg, />Todo</u);
    assert.match(tokensSvg, />Reddit</u);
    assert.match(tokensSvg, />Plain</u);
    assert.match(tokensSvg, />Evidence</u);
    assert.match(tokensSvg, />Backend Dev</u);
    assert.match(tokensSvg, />Backend Review</u);
    assert.match(tokensSvg, />Frontend Dev</u);
    assert.match(tokensSvg, />Frontend Review</u);
    assert.match(tokensSvg, />Overall Review</u);
    assert.match(
      tokensSvg,
      /data-phase="backend-development" data-tokens="900000"/u,
    );
    assert.match(
      tokensSvg,
      /data-phase="backend-review" data-tokens="700000"/u,
    );
    assert.match(
      tokensSvg,
      /data-phase="frontend-development" data-tokens="75000"/u,
    );
    assert.match(
      tokensSvg,
      /data-phase="frontend-review" data-tokens="200000"/u,
    );
    assert.match(tokensSvg, /1\.6M tokens/u);
    assert.match(tokensSvg, /400k tokens \(-75%\)/u);
    assert.match(tokensSvg, /Token counter details/u);
    assert.match(tokensSvg, />API cost</u);
    assert.match(tokensSvg, />\$0\.46</u);
    assert.match(tokensSvg, />\$0\.11</u);
    assert.match(tokensSvg, /API cost \$0\.11</u);
    assert.doesNotMatch(tokensSvg, /API cost [^<]* vs /u);
    assert.match(tokensSvg, />Cached input</u);
    assert.match(tokensSvg, />1,600,000</u);
    assert.match(tokensSvg, />1,200,000</u);
    assert.match(tokensSvg, />800,000</u);
    assert.match(tokensSvg, />400,000</u);
    assert.match(tokensSvg, />100,000</u);
    assert.match(tokensSvg, />10,000</u);
    assert.match(tokensSvg, /#4c78a8/u);
    assert.match(tokensSvg, /#f58518/u);
    assert.equal(tokensSvg.includes("old"), false);
    assert.equal(tokensSvg.includes("Shopping"), false);
    const timeSvg: string = fs.readFileSync(
      path.join(reportOutput, "time.svg"),
      "utf8",
    );
    assert.match(timeSvg, /^<svg /u);
    assert.match(timeSvg, /Benchmark work time by project/u);
    assert.match(timeSvg, /Work Time details/u);
    assert.match(timeSvg, />API cost</u);
    assert.match(timeSvg, />\$0\.46</u);
    assert.match(timeSvg, /API cost \$0\.11</u);
    assert.doesNotMatch(timeSvg, /API cost [^<]* vs /u);
    assert.match(timeSvg, /data-phase="backend-development" data-ms="300000"/u);
    assert.match(timeSvg, /data-phase="backend-review" data-ms="540000"/u);
    assert.match(
      timeSvg,
      /data-phase="frontend-development" data-ms="500000"/u,
    );
    assert.match(timeSvg, /data-phase="frontend-review" data-ms="2160000"/u);
    assert.match(timeSvg, />58m</u);
    assert.match(timeSvg, /Verified system suspensions are excluded/u);
    assert.equal(timeSvg.includes("Stage: backend-review"), false);
    const svgChartFiles: readonly string[] = ["tokens.svg", "time.svg"];
    for (const file of [
      "tokens.png",
      "time.png",
      "work-time.svg",
      "work-time.png",
      "wall-time.svg",
      "wall-time.png",
      "obsolete.svg",
    ])
      assert.equal(fs.existsSync(path.join(reportOutput, file)), false);
    const repeatedOutput: string = path.join(repository, "published-again");
    writeEvidenceBenchmarkReport({
      repository,
      output: repeatedOutput,
      generatedAt,
    });
    for (const file of [
      "summary.json",
      ...svgChartFiles,
      path.join("cells", "gpt-5.6-luna", "todo", "plain.json"),
    ])
      assert.deepEqual(
        fs.readFileSync(path.join(repeatedOutput, file)),
        fs.readFileSync(path.join(reportOutput, file)),
      );
    assert.match(
      fs.readFileSync(path.join(reportOutput, "tokens.svg"), "utf8"),
      /1\.6M tokens/u,
    );
    assert.match(
      fs.readFileSync(path.join(reportOutput, "time.svg"), "utf8"),
      />2m</u,
    );
    const historicalOutput: string = path.join(repository, "historical");
    const historical: IEvidenceBenchmarkReport = writeEvidenceBenchmarkReport({
      repository,
      output: historicalOutput,
      generatedAt,
      runIds: ["old", "evidence"],
    });
    assert.deepEqual(
      historical.cells.map((cell) => cell.runId),
      ["old", "evidence"],
    );
    assert.equal(
      fs.existsSync(path.join(historicalOutput, "tokens.svg")),
      true,
    );
    assert.equal(fs.existsSync(path.join(historicalOutput, "time.svg")), true);
    assert.throws(
      () =>
        writeEvidenceBenchmarkReport({
          repository,
          output: path.join(repository, "missing-run"),
          generatedAt,
          runIds: ["missing"],
        }),
      /Unknown benchmark report run IDs: missing/u,
    );
    assert.throws(
      () =>
        writeEvidenceBenchmarkReport({
          repository,
          output: path.join(repository, "duplicate-run"),
          generatedAt,
          runIds: ["old", "old"],
        }),
      /run IDs must be unique/u,
    );
    assert.throws(
      () =>
        writeEvidenceBenchmarkReport({
          repository,
          output: path.join(repository, "mismatched-cost"),
          generatedAt,
          runIds: ["mismatched-cost"],
        }),
      /Cannot calculate exact API cost: per-request usage .* does not match retained usage/u,
    );

    const solRaw: string = path.join(repository, "sol-raw.log");
    const solUsage: ReturnType<typeof tokenUsage> = tokenUsage(100_000);
    writeRawUsage(solRaw, [solUsage]);
    fs.appendFileSync(
      solRaw,
      `${JSON.stringify({
        method: "thread/tokenUsage/updated",
        params: {
          tokenUsage: {
            total: solUsage,
            last: {
              totalTokens: 14_448,
              inputTokens: 0,
              cachedInputTokens: 0,
              cacheWriteInputTokens: 0,
              outputTokens: 0,
              reasoningOutputTokens: 0,
            },
            modelContextWindow: 258_400,
          },
        },
      })}\n`,
    );
    assert.deepEqual(
      collectEvidenceBenchmarkApiCost({
        rawLog: solRaw,
        model: "gpt-5.6-sol",
        expected: solUsage,
        strict: true,
      }),
      {
        provider: "openrouter",
        pricingAsOf: "2026-08-01",
        priceSource: "https://openrouter.ai/api/v1/models",
        currency: "USD",
        amountUsd: 0.9,
        requests: 1,
        shortContextRequests: 1,
        longContextRequests: 0,
        longContextThresholdTokens: 272_000,
      },
    );
    assert.equal(
      collectEvidenceBenchmarkApiCost({
        rawLog: solRaw,
        model: "gpt-5.6-sol",
        expected: tokenUsage(90_000),
        strict: false,
      }),
      null,
    );
  } finally {
    fs.rmSync(repository, { recursive: true, force: true });
  }
};

const createWorkspace = (
  repository: string,
  name: string,
  modify: boolean,
): string => {
  const workspace: string = path.join(repository, name);
  fs.mkdirSync(workspace, { recursive: true });
  git(workspace, ["init", "-b", "benchmark"]);
  git(workspace, ["config", "user.name", "Benchmark Fixture"]);
  git(workspace, ["config", "user.email", "fixture@example.com"]);
  fs.writeFileSync(path.join(workspace, "tracked.txt"), "baseline\n");
  git(workspace, ["add", "-A"]);
  git(workspace, ["commit", "-m", "baseline"]);
  if (modify) {
    fs.writeFileSync(
      path.join(workspace, "tracked.txt"),
      "baseline\nchanged\n",
    );
    fs.writeFileSync(path.join(workspace, "untracked.txt"), "new\n");
  }
  return workspace;
};

const writeRun = (props: {
  repository: string;
  subject: string;
  arm: "plain" | "evidence";
  runId: string;
  workspace: string;
  launchedAt: string;
  status:
    | "ready"
    | "running"
    | "checkpointed"
    | "awaiting-supervision"
    | "rejected"
    | "interrupted"
    | "completed";
  nextInstructionIndex: number;
  totalTokens: number;
  tokenUsage?: ReturnType<typeof tokenUsage>;
  initialTokenUsage?: ReturnType<typeof tokenUsage>;
  requests?: ReturnType<typeof tokenUsage>[];
  goals: {
    elapsedMs: number;
    goal?: { timeUsedSeconds: number };
    index: number;
    name: string;
    tokenUsage: { totalTokens: number } | ReturnType<typeof tokenUsage>;
    tokenUsageEnd?: ReturnType<typeof tokenUsage>;
  }[];
  processes: {
    elapsedMs: number;
    exitCode: number | null;
    signal: NodeJS.Signals | null;
  }[];
  outputEvents: { processIndex: number; elapsedMs: number }[];
  model?: string;
  inheritedProcessElapsedMs?: number;
  inheritedWallElapsedMs?: number;
  checkpointSourceRunId?: string;
  reviewLedger?: "backend";
  nativeThreadStartInstructionIndex?: number;
  supervisionPauses?: {
    pausedAt: string;
    resumedAt?: string;
  }[];
}): void => {
  const root: string = path.join(
    props.repository,
    "benchmark",
    "output",
    props.subject,
    "codex",
    props.arm,
    "runs",
    props.runId,
  );
  fs.mkdirSync(root, { recursive: true });
  const events: string = path.join(root, "events.jsonl");
  const raw: string = path.join(root, "raw.log");
  const expectedUsage: ReturnType<typeof tokenUsage> =
    props.tokenUsage ?? tokenUsage(props.totalTokens);
  let completedAt: number = Date.parse(props.launchedAt);
  const goals = props.goals.map((goal) => {
    completedAt += goal.elapsedMs;
    const complete: boolean = goal.index < props.nextInstructionIndex;
    return {
      ...goal,
      goal: {
        ...goal.goal,
        status: complete ? "complete" : "active",
        updatedAt: Math.floor(completedAt / 1_000),
      },
    };
  });
  writeRawUsage(
    raw,
    props.requests ?? [expectedUsage],
    props.initialTokenUsage,
  );
  fs.writeFileSync(
    events,
    [
      JSON.stringify({
        recordedAt: props.launchedAt,
        processIndex: 0,
        elapsedMs: 0,
      }),
      ...props.outputEvents.map((event) =>
        JSON.stringify({
          recordedAt: new Date(
            Date.parse(props.launchedAt) + event.elapsedMs,
          ).toISOString(),
          ...event,
        }),
      ),
      "",
    ].join("\n"),
  );
  fs.writeFileSync(
    path.join(root, "state.json"),
    `${JSON.stringify(
      {
        cell: {
          engine: "codex",
          subject: props.subject,
          arm: props.arm,
          runId: props.runId,
          benchmarkRevision: "fixture-revision",
          model: props.model ?? "gpt-5.6-luna",
          effort: "high",
          ...(props.reviewLedger === undefined
            ? {}
            : { reviewLedger: props.reviewLedger }),
          ...(props.inheritedWallElapsedMs === undefined
            ? {}
            : {
                checkpointSource: {
                  runId: props.checkpointSourceRunId,
                  inheritedWallElapsedMs: props.inheritedWallElapsedMs,
                },
              }),
        },
        records: {
          workspace: props.workspace,
          events,
          raw,
        },
        state: {
          status: props.status,
          nextInstructionIndex: props.nextInstructionIndex,
          threadTokenUsage: expectedUsage,
          nativeThreadStartInstructionIndex:
            props.nativeThreadStartInstructionIndex,
          goals,
          processes: props.processes,
          supervisionPauses: props.supervisionPauses,
          ...(props.inheritedProcessElapsedMs === undefined
            ? {}
            : {
                inheritedProcessElapsedMs: props.inheritedProcessElapsedMs,
              }),
        },
      },
      null,
      2,
    )}\n`,
  );
};

const writeRawUsage = (
  file: string,
  requests: readonly ReturnType<typeof tokenUsage>[],
  initial: ReturnType<typeof tokenUsage> = zeroTokenUsage(),
): void => {
  const cumulative: ReturnType<typeof tokenUsage> = structuredClone(initial);
  fs.writeFileSync(
    file,
    `${requests
      .map((last) => {
        addTokenUsage(cumulative, last);
        return JSON.stringify({
          method: "thread/tokenUsage/updated",
          params: {
            tokenUsage: {
              total: structuredClone(cumulative),
              last,
              modelContextWindow: 258_400,
            },
          },
        });
      })
      .join("\n")}\n`,
  );
};

const goal = (
  index: number,
  name: string,
  totalTokens: number,
  elapsedMs: number,
  timeUsedSeconds?: number,
  tokenUsageEnd?: ReturnType<typeof tokenUsage>,
): {
  elapsedMs: number;
  goal?: { timeUsedSeconds: number };
  index: number;
  name: string;
  tokenUsage: { totalTokens: number } | ReturnType<typeof tokenUsage>;
  tokenUsageEnd?: ReturnType<typeof tokenUsage>;
} => ({
  elapsedMs,
  ...(timeUsedSeconds === undefined ? {} : { goal: { timeUsedSeconds } }),
  index,
  name,
  tokenUsage: tokenUsageEnd ?? { totalTokens },
  ...(tokenUsageEnd === undefined ? {} : { tokenUsageEnd }),
});

const tokenUsage = (totalTokens: number) => {
  const inputTokens: number = Math.round(totalTokens * 0.75);
  const outputTokens: number = totalTokens - inputTokens;
  return {
    totalTokens,
    inputTokens,
    cachedInputTokens: Math.round(totalTokens * 0.5),
    cacheWriteInputTokens: 0,
    outputTokens,
    reasoningOutputTokens: Math.round(outputTokens * 0.25),
  };
};

const zeroTokenUsage = (): ReturnType<typeof tokenUsage> => ({
  totalTokens: 0,
  inputTokens: 0,
  cachedInputTokens: 0,
  cacheWriteInputTokens: 0,
  outputTokens: 0,
  reasoningOutputTokens: 0,
});

const addTokenUsage = (
  target: ReturnType<typeof tokenUsage>,
  source: ReturnType<typeof tokenUsage>,
): void => {
  target.totalTokens += source.totalTokens;
  target.inputTokens += source.inputTokens;
  target.cachedInputTokens += source.cachedInputTokens;
  target.cacheWriteInputTokens += source.cacheWriteInputTokens;
  target.outputTokens += source.outputTokens;
  target.reasoningOutputTokens += source.reasoningOutputTokens;
};

const git = (cwd: string, args: string[]): void => {
  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    shell: false,
    windowsHide: true,
  });
  if (result.status !== 0)
    throw new Error(`git ${args.join(" ")} failed: ${result.stderr}`);
};

main();
