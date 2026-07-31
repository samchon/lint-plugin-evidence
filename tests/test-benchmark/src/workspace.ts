import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { EvidenceBenchmarkWorkspace } from "../../../benchmark/src/EvidenceBenchmarkWorkspace.ts";

/**
 * Verifies Plain workspace preparation keeps staging and treatment bounded.
 *
 * The former stage name embedded the requested UUID, PID, and another UUID,
 * producing an 84-85 character basename before dependency installation. The
 * fake package manager observes the real install cwd and accepts only the
 * bounded `.tmp-XXXXXX` sibling form.
 *
 * 1. Prepare a plain workspace from a minimal fake repository.
 * 2. Let the real production path install through the fake entrypoint and create
 *    the git baseline.
 * 3. Assert the stage was renamed atomically to the exact requested output.
 * 4. Assert only the Plain overlay was copied and no Evidence artifact exists.
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
    const plainOverlay: string = path.join(
      repository,
      "benchmark",
      "template",
      "plain",
    );
    fs.mkdirSync(path.join(plainOverlay, ".agents", "skills", "campaign"), {
      recursive: true,
    });
    fs.writeFileSync(
      path.join(plainOverlay, ".agents", "skills", "campaign", "SKILL.md"),
      "# Plain campaign\n",
    );
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
    fs.mkdirSync(
      path.join(repository, "benchmark", "requirements", "fixture"),
      { recursive: true },
    );

    const fakePnpm: string = path.join(root, "fake-pnpm.mjs");
    fs.writeFileSync(
      fakePnpm,
      [
        'import fs from "node:fs";',
        'import path from "node:path";',
        "const stage = path.basename(path.dirname(process.cwd()));",
        'if (!stage.startsWith(".tmp-") || stage.length !== 11) {',
        "  console.error(`Rejected unbounded stage basename: ${stage}`);",
        "  process.exitCode = 73;",
        "} else {",
        '  fs.writeFileSync(path.join(process.cwd(), ".fixture-install.json"), JSON.stringify({ stage }));',
        "}",
        "",
      ].join("\n"),
    );
    process.env.npm_execpath = fakePnpm;

    const outputParent: string = path.join(root, "outputs");
    const output: string = path.join(
      outputParent,
      "00000000-0000-4000-8000-000000000000",
    );
    const prepared = await EvidenceBenchmarkWorkspace.prepareWorkspace({
      repository,
      output,
      project: "fixture",
      arm: "plain",
      variables: {
        name: "fixture",
        apiPackageName: "@fixture/api",
        backendPackageName: "@fixture/backend",
        frontendPackageName: "@fixture/frontend",
      },
    });

    assert.equal(prepared.root, path.resolve(output));
    assert.equal(
      prepared.workspace,
      path.join(path.resolve(output), "workspace"),
    );
    assert.equal(fs.existsSync(prepared.root), true);
    assert.equal(fs.existsSync(prepared.workspace), true);
    assert.equal(fs.existsSync(path.join(prepared.workspace, ".git")), true);
    assert.equal(
      fs.existsSync(
        path.join(
          prepared.workspace,
          ".agents",
          "skills",
          "campaign",
          "SKILL.md",
        ),
      ),
      true,
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
    const install = JSON.parse(
      fs.readFileSync(
        path.join(prepared.workspace, ".fixture-install.json"),
        "utf8",
      ),
    ) as { stage: string };
    assert.match(install.stage, /^\.tmp-.{6}$/);
    assert.deepEqual(fs.readdirSync(outputParent), [path.basename(output)]);
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
