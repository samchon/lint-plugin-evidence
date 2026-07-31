import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  assertEvidenceBenchmarkRecoveryRevision,
  evidenceBenchmarkRecordPaths,
  parseEvidenceBenchmarkArguments,
  readEvidenceBenchmarkRevision,
  sameEvidenceBenchmarkRecordPaths,
} from "../../../benchmark/src/executable/EvidenceBenchmarkCommandLine.ts";

/**
 * Verifies launch identity parsing and recovery revision safety.
 *
 * These checks run before any paid native process. Accepting a misspelled cell,
 * dirty launch revision, or unrelated resume revision would make retained
 * measurements incomparable even when the runner itself behaves correctly.
 *
 * 1. Accept one complete cell identity and reject every malformed dimension.
 * 2. Resolve a clean Git revision and reject the same repository when dirty.
 * 3. Accept a descendant recovery revision and reject an unknown lineage.
 * 4. Assert retained record paths are deterministic and exact.
 */
const main = (): void => {
  const runId: string = "00000000-0000-4000-8000-000000000000";
  assert.deepEqual(
    parseEvidenceBenchmarkArguments([
      "codex",
      "todo",
      "evidence",
      "gpt-5.6-luna",
      "high",
      runId,
    ]),
    {
      engine: "codex",
      subject: "todo",
      arm: "evidence",
      model: "gpt-5.6-luna",
      effort: "high",
      runId,
    },
  );
  assert.deepEqual(
    parseEvidenceBenchmarkArguments([
      "codex",
      "reddit",
      "plain",
      "gpt-5.6-luna",
      "medium",
    ]),
    {
      engine: "codex",
      subject: "reddit",
      arm: "plain",
      model: "gpt-5.6-luna",
      effort: "medium",
      runId: undefined,
    },
  );
  for (const input of [
    ["codex", "todo", "plain", "gpt-5.6-luna"],
    ["codex", "todo", "plain", "gpt-5.6-luna", "high", runId, "extra"],
    ["claude-code", "todo", "plain", "gpt-5.6-luna", "high"],
    ["codex", "../todo", "plain", "gpt-5.6-luna", "high"],
    ["codex", "todo", "unknown", "gpt-5.6-luna", "high"],
    ["codex", "todo", "plain", "", "high"],
    ["codex", "todo", "plain", "gpt-5.6-luna", "extreme"],
    ["codex", "todo", "plain", "gpt-5.6-luna", "high", "not-a-run"],
  ])
    assert.throws(
      () => parseEvidenceBenchmarkArguments(input),
      `Invalid launch identity was accepted: ${input.join(" ")}`,
    );

  const repository: string = fs.mkdtempSync(
    path.join(os.tmpdir(), "evidence-benchmark-command-"),
  );
  try {
    git(repository, ["init", "-b", "campaign"]);
    git(repository, ["config", "user.name", "Benchmark Fixture"]);
    git(repository, ["config", "user.email", "fixture@example.com"]);
    fs.writeFileSync(path.join(repository, "fixture.txt"), "first\n");
    git(repository, ["add", "-A"]);
    git(repository, ["commit", "-m", "first"]);
    const first: string = git(repository, ["rev-parse", "HEAD"]).trim();
    assert.equal(readEvidenceBenchmarkRevision(repository), first);

    fs.writeFileSync(path.join(repository, "dirty.txt"), "dirty\n");
    assert.throws(
      () => readEvidenceBenchmarkRevision(repository),
      /clean repository/u,
    );
    fs.rmSync(path.join(repository, "dirty.txt"));

    fs.writeFileSync(path.join(repository, "fixture.txt"), "second\n");
    git(repository, ["add", "-A"]);
    git(repository, ["commit", "-m", "second"]);
    const second: string = git(repository, ["rev-parse", "HEAD"]).trim();
    assertEvidenceBenchmarkRecoveryRevision(repository, first, second);
    assert.throws(
      () =>
        assertEvidenceBenchmarkRecoveryRevision(
          repository,
          "0000000000000000000000000000000000000000",
          second,
        ),
      /must descend/u,
    );

    const records = evidenceBenchmarkRecordPaths(
      path.join(repository, "benchmark", "result", runId),
    );
    assert.deepEqual(records, {
      root: path.resolve(repository, "benchmark", "result", runId),
      workspace: path.resolve(
        repository,
        "benchmark",
        "result",
        runId,
        "workspace",
      ),
      state: path.resolve(
        repository,
        "benchmark",
        "result",
        runId,
        "state.json",
      ),
      events: path.resolve(
        repository,
        "benchmark",
        "result",
        runId,
        "events.jsonl",
      ),
      raw: path.resolve(repository, "benchmark", "result", runId, "raw.log"),
    });
    assert.equal(
      sameEvidenceBenchmarkRecordPaths(
        records,
        evidenceBenchmarkRecordPaths(records.root),
      ),
      true,
    );
    assert.equal(
      sameEvidenceBenchmarkRecordPaths(records, {
        ...records,
        raw: path.join(records.root, "other.log"),
      }),
      false,
    );
  } finally {
    fs.rmSync(repository, { recursive: true, force: true });
  }
};

const git = (cwd: string, args: string[]): string => {
  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    shell: false,
    windowsHide: true,
  });
  if (result.status !== 0)
    throw new Error(`git ${args.join(" ")} failed: ${result.stderr}`);
  return result.stdout;
};

main();
