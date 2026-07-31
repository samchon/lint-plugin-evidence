import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { renderEvidenceBenchmarkDashboard } from "../../../benchmark/src/EvidenceBenchmarkDashboard.ts";
import { writeEvidenceBenchmarkReport } from "../../../benchmark/src/EvidenceBenchmarkReport.ts";
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
 * 4. Publish deterministic JSON and SVG charts from the same aggregate.
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
      goals: [
        goal(0, "backend-start", 1_000_000, 61_000, 120),
        goal(1, "backend-review", 0, 0),
      ],
      processes: [
        { elapsedMs: 61_000, exitCode: 0, signal: null },
        { elapsedMs: 10_000, exitCode: null, signal: null },
      ],
      outputEvents: [{ processIndex: 1, elapsedMs: 65_000 }],
    });
    writeRun({
      repository,
      subject: "todo",
      arm: "evidence",
      runId: "evidence",
      workspace: evidenceWorkspace,
      launchedAt: "2026-07-31T02:00:00.000Z",
      status: "completed",
      nextInstructionIndex: 8,
      totalTokens: 400_000,
      goals: [goal(7, "overall-final", 400_000, 3_660_000)],
      processes: [{ elapsedMs: 3_660_000, exitCode: 0, signal: null }],
      outputEvents: [],
    });
    fs.mkdirSync(
      path.join(
        repository,
        "benchmark",
        "result",
        "shopping",
        "codex",
        "plain",
        "runs",
        "not-launched",
      ),
      { recursive: true },
    );

    const dashboard: string = renderEvidenceBenchmarkDashboard(repository);
    assert.equal((dashboard.match(/^## /gmu) ?? []).length, 2);
    assert.match(dashboard, /^## GPT-5\.6-Luna$/mu);
    assert.match(dashboard, /^## GPT-5\.6-Terra$/mu);
    assert.match(
      dashboard,
      /^\| Cell \| Stage \| Progress \| Elapsed \| Cost \| Work time \|$/mu,
    );
    assert.match(
      dashboard,
      /^\| Todo Plain \| `backend-review` · running \| 2 files · \+2\/−0 LOC \| (?:\d+h )?\d{1,2}m \| 2M \| 2m \|$/mu,
    );
    assert.match(
      dashboard,
      /^\| Todo Evidence \| `overall-final` · completed \| 0 files · \+0\/−0 LOC \| 0m \| 0M \| 1h 01m \|$/mu,
    );
    assert.match(
      dashboard,
      /^\| Reddit Plain \| `backend-start` · interrupted \| 0 files · \+0\/−0 LOC \| (?:\d+h )?\d{1,2}m \| 1M \| 2m \|$/mu,
    );
    assert.match(dashboard, /^- \*\*Todo Plain stages\*\*$/mu);
    assert.match(
      dashboard,
      /^  - `backend-start`: 1M · 2m · 63% tokens · 95% time$/mu,
    );
    assert.match(
      dashboard,
      /^  - `backend-review`: 1M · 0m · 38% tokens · 5% time$/mu,
    );
    assert.match(
      dashboard,
      /^  - `overall-final`: 0M · 1h 01m · 100% tokens · 100% time$/mu,
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
    const report: IEvidenceBenchmarkReport = writeEvidenceBenchmarkReport({
      repository,
      output: reportOutput,
      generatedAt,
    });
    assert.equal(report.schemaVersion, 1);
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
    assert.equal(todoPlain.workElapsedMs, 126_000);
    assert.equal(todoPlain.wallElapsedMs, 3 * 60 * 60 * 1_000);
    assert.deepEqual(todoPlain.worktree, {
      files: 2,
      additions: 2,
      deletions: 0,
    });
    assert.deepEqual(todoPlain.stages, [
      {
        name: "backend-start",
        tokens: 1_000_000,
        elapsedMs: 120_000,
        tokenPercent: 63,
        timePercent: 95,
      },
      {
        name: "backend-review",
        tokens: 600_000,
        elapsedMs: 6_000,
        tokenPercent: 38,
        timePercent: 5,
      },
    ]);
    assert.deepEqual(
      JSON.parse(
        fs.readFileSync(path.join(reportOutput, "summary.json"), "utf8"),
      ),
      report,
    );
    const chartFiles: readonly string[] = [
      "tokens.svg",
      "work-time.svg",
      "wall-time.svg",
    ];
    for (const file of chartFiles) {
      const svg: string = fs.readFileSync(
        path.join(reportOutput, file),
        "utf8",
      );
      assert.match(svg, /^<svg /u);
      assert.match(svg, /Todo Plain · running/u);
      assert.match(svg, /Todo Evidence · completed/u);
      assert.match(svg, /Reddit Plain · interrupted/u);
      assert.match(svg, /Stage: backend-review/u);
      assert.match(svg, /#4c78a8/u);
      assert.match(svg, /#f58518/u);
      assert.equal(svg.includes("old"), false);
      assert.equal(svg.includes("Shopping"), false);
    }
    const repeatedOutput: string = path.join(repository, "published-again");
    writeEvidenceBenchmarkReport({
      repository,
      output: repeatedOutput,
      generatedAt,
    });
    for (const file of ["summary.json", ...chartFiles])
      assert.deepEqual(
        fs.readFileSync(path.join(repeatedOutput, file)),
        fs.readFileSync(path.join(reportOutput, file)),
      );
    assert.match(
      fs.readFileSync(path.join(reportOutput, "tokens.svg"), "utf8"),
      /1\.6M tokens/u,
    );
    assert.match(
      fs.readFileSync(path.join(reportOutput, "work-time.svg"), "utf8"),
      />2m</u,
    );
    assert.match(
      fs.readFileSync(path.join(reportOutput, "wall-time.svg"), "utf8"),
      />3h 00m</u,
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
  status: "ready" | "running" | "interrupted" | "completed";
  nextInstructionIndex: number;
  totalTokens: number;
  goals: {
    elapsedMs: number;
    goal?: { timeUsedSeconds: number };
    index: number;
    name: string;
    tokenUsage: { totalTokens: number };
  }[];
  processes: {
    elapsedMs: number;
    exitCode: number | null;
    signal: NodeJS.Signals | null;
  }[];
  outputEvents: { processIndex: number; elapsedMs: number }[];
  model?: string;
}): void => {
  const root: string = path.join(
    props.repository,
    "benchmark",
    "result",
    props.subject,
    "codex",
    props.arm,
    "runs",
    props.runId,
  );
  fs.mkdirSync(root, { recursive: true });
  const events: string = path.join(root, "events.jsonl");
  fs.writeFileSync(
    events,
    [
      JSON.stringify({
        recordedAt: props.launchedAt,
        processIndex: 0,
        elapsedMs: 0,
      }),
      ...props.outputEvents.map((event) => JSON.stringify(event)),
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
        },
        records: {
          workspace: props.workspace,
          events,
        },
        state: {
          status: props.status,
          nextInstructionIndex: props.nextInstructionIndex,
          threadTokenUsage: {
            totalTokens: props.totalTokens,
          },
          goals: props.goals,
          processes: props.processes,
        },
      },
      null,
      2,
    )}\n`,
  );
};

const goal = (
  index: number,
  name: string,
  totalTokens: number,
  elapsedMs: number,
  timeUsedSeconds?: number,
): {
  elapsedMs: number;
  goal?: { timeUsedSeconds: number };
  index: number;
  name: string;
  tokenUsage: { totalTokens: number };
} => ({
  elapsedMs,
  ...(timeUsedSeconds === undefined ? {} : { goal: { timeUsedSeconds } }),
  index,
  name,
  tokenUsage: { totalTokens },
});

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
