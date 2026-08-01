import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { EvidenceBenchmarkCheckpoint } from "../../../benchmark/src/EvidenceBenchmarkCheckpoint.ts";
import { EvidenceBenchmarkWorkspace } from "../../../benchmark/src/EvidenceBenchmarkWorkspace.ts";

/**
 * Verifies workspace preparation keeps staging, arm treatment, and artifacts
 * bounded.
 *
 * The former stage name embedded the requested UUID, PID, and another UUID,
 * producing an 84-85 character basename before dependency installation. The
 * fake package manager observes the real install cwd and accepts only the
 * bounded `.tmp-XXXXXX` sibling form.
 *
 * 1. Prepare Plain and Evidence workspaces from one minimal fake repository.
 * 2. Let the real production path install through the fake entrypoint and create
 *    the git baseline.
 * 3. Assert variables, requirements, overlays, and Markdown splicing are exact.
 * 4. Assert only Evidence receives the immutable package archive and dependency.
 * 5. Snapshot and restore material files without dependencies or runtime noise.
 * 6. Assert each bounded stage is atomically renamed to its requested output.
 */
const main = async (): Promise<void> => {
  const root: string = fs.mkdtempSync(
    path.join(os.tmpdir(), "evidence-benchmark-workspace-"),
  );
  const originalEntrypoint: string | undefined = process.env.npm_execpath;
  try {
    const repository: string = path.join(root, "repository");
    const base: string = path.join(repository, "benchmark", "template", "base");
    fs.mkdirSync(base, { recursive: true });
    fs.writeFileSync(
      path.join(base, "package.json"),
      `${JSON.stringify(
        {
          name: "{{name}}",
          private: true,
        },
        null,
        2,
      )}\n`,
    );
    fs.writeFileSync(
      path.join(base, "AGENTS.md"),
      "# AGENTS.md\n\nBase guidance for {{name}}.\n",
    );
    const plainOverlay: string = path.join(
      repository,
      "benchmark",
      "template",
      "plain",
    );
    fs.mkdirSync(plainOverlay, { recursive: true });
    fs.writeFileSync(path.join(plainOverlay, "plain-only.txt"), "plain\n");
    const evidenceOverlay: string = path.join(
      repository,
      "benchmark",
      "template",
      "evidence",
    );
    fs.mkdirSync(path.join(evidenceOverlay, ".agents", "skills", "evidence"), {
      recursive: true,
    });
    fs.writeFileSync(
      path.join(evidenceOverlay, ".agents", "skills", "evidence", "SKILL.md"),
      "# Evidence graph\n\n@evidence forbidden\n",
    );
    fs.writeFileSync(
      path.join(evidenceOverlay, "AGENTS.md"),
      [
        "# AGENTS.md",
        "",
        "<!-- benchmark-template-splice: base-body -->",
        "{{base}}",
        "",
        "Evidence guidance for {{apiPackageName}}.",
        "",
      ].join("\n"),
    );
    fs.mkdirSync(
      path.join(repository, "benchmark", "requirements", "fixture"),
      { recursive: true },
    );
    const requirement: Buffer = Buffer.from(
      "# 요구사항\r\n\r\nOpaque bytes stay exact.\r\n",
      "utf8",
    );
    fs.writeFileSync(
      path.join(repository, "benchmark", "requirements", "fixture", "spec.md"),
      requirement,
    );
    for (const arm of ["plain", "evidence"] as const) {
      const instructions: string = path.join(
        repository,
        "benchmark",
        "instructions",
        arm,
      );
      fs.mkdirSync(path.join(instructions, "backend"), { recursive: true });
      fs.writeFileSync(path.join(instructions, "continue.md"), "Continue.\n");
      fs.writeFileSync(
        path.join(instructions, "backend", "start.md"),
        "# Backend Start\n",
      );
    }

    const fakePnpm: string = path.join(root, "fake-pnpm.mjs");
    fs.writeFileSync(
      fakePnpm,
      [
        'import fs from "node:fs";',
        'import path from "node:path";',
        "const stage = path.basename(path.dirname(process.cwd()));",
        'const restored = fs.existsSync(path.join(process.cwd(), ".git"));',
        'if (!restored && (!stage.startsWith(".tmp-") || stage.length !== 11)) {',
        "  console.error(`Rejected unbounded stage basename: ${stage}`);",
        "  process.exitCode = 73;",
        "} else if (!restored) {",
        '  fs.writeFileSync(path.join(process.cwd(), ".fixture-install.json"), JSON.stringify({ stage }));',
        "}",
        "",
      ].join("\n"),
    );
    process.env.npm_execpath = fakePnpm;

    const outputParent: string = path.join(root, "outputs");
    const plainOutput: string = path.join(
      outputParent,
      "00000000-0000-4000-8000-000000000000",
    );
    const prepared = await EvidenceBenchmarkWorkspace.prepareWorkspace({
      repository,
      output: plainOutput,
      project: "fixture",
      arm: "plain",
      variables: {
        name: "fixture",
        apiPackageName: "@fixture/api",
        backendPackageName: "@fixture/backend",
        frontendPackageName: "@fixture/frontend",
      },
    });

    assert.equal(prepared.root, path.resolve(plainOutput));
    assert.equal(
      prepared.workspace,
      path.join(path.resolve(plainOutput), "workspace"),
    );
    assert.equal(fs.existsSync(prepared.root), true);
    assert.equal(fs.existsSync(prepared.workspace), true);
    assert.equal(fs.existsSync(path.join(prepared.workspace, ".git")), true);
    assert.equal(
      fs.readFileSync(path.join(prepared.workspace, "plain-only.txt"), "utf8"),
      "plain\n",
    );
    assert.equal(
      fs.existsSync(
        path.join(
          prepared.workspace,
          ".agents",
          "skills",
          "evidence",
          "SKILL.md",
        ),
      ),
      false,
    );
    assert.equal(
      fs.existsSync(path.join(prepared.workspace, ".benchmark-deps")),
      false,
    );
    assert.deepEqual(
      fs.readFileSync(
        path.join(prepared.workspace, "docs", "analysis", "spec.md"),
      ),
      requirement,
    );
    assert.equal(
      (
        JSON.parse(
          fs.readFileSync(
            path.join(prepared.workspace, "package.json"),
            "utf8",
          ),
        ) as { name: string }
      ).name,
      "fixture",
    );
    const install = JSON.parse(
      fs.readFileSync(
        path.join(prepared.workspace, ".fixture-install.json"),
        "utf8",
      ),
    ) as { stage: string };
    assert.match(install.stage, /^\.tmp-.{6}$/);

    const artifact: string = path.join(root, "evidence.tgz");
    const artifactBytes: Buffer = Buffer.from("immutable evidence archive");
    fs.writeFileSync(artifact, artifactBytes);
    const evidenceOutput: string = path.join(
      outputParent,
      "11111111-1111-4111-8111-111111111111",
    );
    const evidence = await EvidenceBenchmarkWorkspace.prepareWorkspace({
      repository,
      output: evidenceOutput,
      project: "fixture",
      arm: "evidence",
      variables: {
        name: "fixture",
        apiPackageName: "@fixture/api",
        backendPackageName: "@fixture/backend",
        frontendPackageName: "@fixture/frontend",
      },
      artifact: {
        name: "@samchon/lint-plugin-evidence",
        archive: artifact,
      },
    });
    assert.equal(
      fs.existsSync(
        path.join(
          evidence.workspace,
          ".agents",
          "skills",
          "evidence",
          "SKILL.md",
        ),
      ),
      true,
    );
    assert.equal(
      fs.existsSync(path.join(evidence.workspace, "plain-only.txt")),
      false,
    );
    assert.deepEqual(
      fs.readFileSync(
        path.join(evidence.workspace, ".benchmark-deps", "evidence.tgz"),
      ),
      artifactBytes,
    );
    assert.deepEqual(
      fs.readFileSync(
        path.join(evidence.workspace, "docs", "analysis", "spec.md"),
      ),
      requirement,
    );
    const evidencePackage = JSON.parse(
      fs.readFileSync(path.join(evidence.workspace, "package.json"), "utf8"),
    ) as {
      name: string;
      devDependencies: Record<string, string>;
    };
    assert.equal(evidencePackage.name, "fixture");
    assert.equal(
      evidencePackage.devDependencies["@samchon/lint-plugin-evidence"],
      "file:.benchmark-deps/evidence.tgz",
    );
    assert.equal(
      fs.readFileSync(path.join(evidence.workspace, "AGENTS.md"), "utf8"),
      [
        "# AGENTS.md",
        "",
        "Base guidance for fixture.",
        "",
        "",
        "Evidence guidance for @fixture/api.",
        "",
      ].join("\n"),
    );

    const inputBefore = EvidenceBenchmarkCheckpoint.identifyInputs({
      repository,
      subject: "fixture",
      arm: "plain",
    });
    fs.writeFileSync(path.join(plainOverlay, "plain-only.txt"), "changed\n");
    const inputAfter = EvidenceBenchmarkCheckpoint.identifyInputs({
      repository,
      subject: "fixture",
      arm: "plain",
    });
    assert.notEqual(inputAfter.templateSha256, inputBefore.templateSha256);
    assert.equal(inputAfter.requirementsSha256, inputBefore.requirementsSha256);
    assert.equal(inputAfter.instructionsSha256, inputBefore.instructionsSha256);

    fs.writeFileSync(
      path.join(prepared.workspace, "AGENTS.md"),
      "# AGENTS.md\n\nCheckpoint guidance.\n",
    );
    fs.rmSync(path.join(prepared.workspace, "plain-only.txt"));
    fs.writeFileSync(
      path.join(prepared.workspace, "feature.ts"),
      "export {};\n",
    );
    fs.appendFileSync(
      path.join(prepared.workspace, ".git", "info", "exclude"),
      ".env\nignored.log\nnode_modules/\n",
    );
    fs.writeFileSync(path.join(prepared.workspace, ".env"), "SECRET=test\n");
    fs.writeFileSync(path.join(prepared.workspace, "ignored.log"), "noise\n");
    fs.mkdirSync(path.join(prepared.workspace, "node_modules"));
    fs.writeFileSync(
      path.join(prepared.workspace, "node_modules", "dependency.js"),
      "ignored\n",
    );
    const checkpoint = EvidenceBenchmarkCheckpoint.createWorkspaceSnapshot({
      runRoot: prepared.root,
      workspace: prepared.workspace,
      inheritedWallElapsedMs: 2_000,
    });
    assert.equal(checkpoint.workspaceFileCount > 0, true);
    assert.equal(checkpoint.inheritedWallElapsedMs, 2_000);
    fs.writeFileSync(path.join(prepared.workspace, "feature.ts"), "changed\n");
    const restoredRoot: string = path.join(outputParent, "checkpoint-restored");
    const restored: string =
      EvidenceBenchmarkCheckpoint.restoreWorkspaceSnapshot({
        sourceRunRoot: prepared.root,
        workspaceRelativePath: checkpoint.workspaceRelativePath,
        workspaceSha256: checkpoint.workspaceSha256,
        destinationRunRoot: restoredRoot,
      });
    await EvidenceBenchmarkWorkspace.installDependencies(restored);
    EvidenceBenchmarkCheckpoint.assertRestoredWorkspace({
      workspace: restored,
      materialSha256: checkpoint.workspaceMaterialSha256,
      gitHead: checkpoint.workspaceGitHead,
      gitStatus: checkpoint.workspaceGitStatus,
    });
    assert.equal(
      fs.readFileSync(path.join(restored, "feature.ts"), "utf8"),
      "export {};\n",
    );
    assert.equal(
      fs.readFileSync(path.join(restored, ".env"), "utf8"),
      "SECRET=test\n",
    );
    assert.equal(fs.existsSync(path.join(restored, "ignored.log")), false);
    assert.equal(fs.existsSync(path.join(restored, "node_modules")), false);
    assert.equal(fs.existsSync(path.join(restored, "plain-only.txt")), false);
    const repeated = EvidenceBenchmarkCheckpoint.createWorkspaceSnapshot({
      runRoot: prepared.root,
      workspace: prepared.workspace,
      inheritedWallElapsedMs: 3_000,
    });
    assert.equal(repeated.workspaceSha256, checkpoint.workspaceSha256);
    assert.equal(repeated.inheritedWallElapsedMs, 2_000);
    await assert.rejects(
      EvidenceBenchmarkWorkspace.prepareWorkspace({
        repository,
        output: path.join(outputParent, "missing-artifact"),
        project: "fixture",
        arm: "evidence",
        variables: {
          name: "fixture",
          apiPackageName: "@fixture/api",
          backendPackageName: "@fixture/backend",
          frontendPackageName: "@fixture/frontend",
        },
      }),
      /requires a package artifact/u,
    );
    assert.equal(
      fs.existsSync(path.join(outputParent, "missing-artifact")),
      false,
    );
    assert.deepEqual(fs.readdirSync(outputParent).sort(), [
      path.basename(plainOutput),
      path.basename(evidenceOutput),
      "checkpoint-restored",
    ]);
  } finally {
    if (originalEntrypoint === undefined) delete process.env.npm_execpath;
    else process.env.npm_execpath = originalEntrypoint;
    fs.rmSync(root, { recursive: true, force: true });
  }
};

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
