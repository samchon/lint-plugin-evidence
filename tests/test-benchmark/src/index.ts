import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { EvidenceBenchmarkCorpus } from "@samchon/evidence-benchmark/corpus";
import type { IEvidenceBenchmarkMaterialization } from "@samchon/evidence-benchmark/materialization";
import { EvidenceBenchmarkProcess } from "@samchon/evidence-benchmark/process";
import { EvidenceBenchmarkTemplate } from "@samchon/evidence-benchmark/template";

import { BenchmarkControllerDiscovery } from "./BenchmarkControllerDiscovery.ts";
import { BenchmarkHealthScaffold } from "./BenchmarkHealthScaffold.ts";

const repository: string = path.resolve(import.meta.dirname, "../../..");
const template: string = path.join(repository, "benchmark", "template");
const variables: IEvidenceBenchmarkMaterialization.IVariables = {
  name: "benchmark-template-proof",
  apiPackageName: "@benchmark-template-proof/api",
  backendPackageName: "@benchmark-template-proof/backend",
  frontendPackageName: "@benchmark-template-proof/frontend",
};

/**
 * Verifies the frozen benchmark template composes both arms and that the
 * consumer-shaped plain scaffold discovers and builds outside this workspace.
 *
 * A source-level check cannot detect a missing catalog dependency, an invalid
 * Prisma or Nestia configuration, runtime discovery, or a package script that
 * only works through repository hoisting. The build mode therefore materializes
 * the cheapest subject exactly once in an isolated temporary directory.
 *
 * 1. Compose and validate both overlays with one evidence-only workflow skill.
 * 2. Copy the complete Todo corpus into the plain scaffold.
 * 3. Add a nested controller and non-controller exports without module edits.
 * 4. Generate a lockfile, install it frozen, and run each Nestia generator.
 * 5. Run the full build and source plus compiled runtime discovery proofs.
 */
const main = async (): Promise<void> => {
  const evidence = EvidenceBenchmarkTemplate.compose({
    template,
    arm: "evidence",
    variables,
  });
  const plain = EvidenceBenchmarkTemplate.compose({
    template,
    arm: "plain",
    variables,
  });
  const evidenceOnly = ".agents/skills/evidence/SKILL.md";
  assert.equal(evidence.files.has(evidenceOnly), true);
  assert.equal(plain.files.has(evidenceOnly), false);
  assert.deepEqual(
    [...evidence.files.keys()].filter((key) => key !== evidenceOnly).sort(),
    [...plain.files.keys()].sort(),
    "benchmark arms may differ only by the evidence workflow skill",
  );
  for (const relative of [
    "packages/api/src/functional/health/index.ts",
    "packages/api/src/functional/index.ts",
    "packages/backend/src/controllers/HealthController.ts",
    "packages/backend/test/features/api/health/test_api_health.ts",
  ])
    assert.deepEqual(
      evidence.files.get(relative),
      plain.files.get(relative),
      `${relative} must be the same base asset in both arms`,
    );
  for (const [arm, files] of [
    ["evidence", evidence.files],
    ["plain", plain.files],
  ] as const) {
    const legacyController: string = ["Heal", "Controller"].join("");
    const legacy: string[] = [...files]
      .filter(
        ([relative, content]) =>
          relative.includes(legacyController) ||
          Buffer.from(content).includes(legacyController),
      )
      .map(([relative]) => relative);
    assert.deepEqual(
      legacy,
      [],
      `${arm} template retains the misspelled legacy controller contract`,
    );
  }
  EvidenceBenchmarkTemplate.validate(evidence.files);
  EvidenceBenchmarkTemplate.validate(plain.files);

  if (!process.argv.includes("--build")) {
    console.log(
      `Benchmark template composition passed for ${plain.files.size} shared files and one evidence workflow skill.`,
    );
    return;
  }

  const temporary: string = fs.mkdtempSync(
    path.join(os.tmpdir(), "evidence-template-build-"),
  );
  const evidenceWorkspace: string = path.join(temporary, "evidence-workspace");
  const workspace: string = path.join(temporary, "workspace");
  try {
    writeTree(evidenceWorkspace, evidence.files);
    writeTree(workspace, plain.files);
    for (const relative of [
      "packages/api/src/functional/health/index.ts",
      "packages/backend/src/controllers/HealthController.ts",
      "packages/backend/test/features/api/health/test_api_health.ts",
    ])
      assert.deepEqual(
        fs.readFileSync(path.join(evidenceWorkspace, ...relative.split("/"))),
        fs.readFileSync(path.join(workspace, ...relative.split("/"))),
        `${relative} drifted between materialized arms`,
      );
    const corpus = EvidenceBenchmarkCorpus.read(
      path.join(repository, "benchmark", "requirements", "todo"),
    );
    writeTree(path.join(workspace, "docs", "analysis"), corpus.files);

    const environment: NodeJS.ProcessEnv = {
      ...process.env,
      CI: "1",
      API_PORT: "37001",
      JWT_SECRET_KEY: "benchmark-template-proof-secret-at-least-32-characters",
      JWT_ACCESS_TTL_SECONDS: "3600",
      JWT_REFRESH_TTL_SECONDS: "2592000",
      VITE_API_HOST: "http://127.0.0.1:37001",
      VITE_API_SIMULATE: "true",
    };
    EvidenceBenchmarkProcess.pinEnvironment(
      environment,
      path.join(temporary, "toolchain-bin"),
    );
    await EvidenceBenchmarkProcess.pnpm(
      ["install", "--lockfile-only", "--no-frozen-lockfile"],
      {
        cwd: workspace,
        env: environment,
        label: "benchmark template lockfile",
      },
    );
    const lockfile: string = path.join(workspace, "pnpm-lock.yaml");
    assert.equal(fs.existsSync(lockfile), true);
    const admittedLock: Buffer = fs.readFileSync(lockfile);
    await EvidenceBenchmarkProcess.pnpm(["install", "--frozen-lockfile"], {
      cwd: workspace,
      env: environment,
      label: "benchmark template frozen install",
    });
    assert.deepEqual(
      fs.readFileSync(lockfile),
      admittedLock,
      "frozen template install must preserve the generated lockfile",
    );
    await BenchmarkHealthScaffold.verifyCommittedSdk(workspace, environment);
    BenchmarkControllerDiscovery.inject(workspace);
    await BenchmarkControllerDiscovery.verify(workspace, environment);
    await BenchmarkHealthScaffold.verifyRuntimeAndDrift(workspace, environment);

    for (const relative of [
      "packages/api/lib/index.js",
      "packages/backend/lib/executable/server.js",
      "packages/frontend/dist/index.html",
    ])
      assert.equal(
        fs.existsSync(path.join(workspace, ...relative.split("/"))),
        true,
        `benchmark template build did not produce ${relative}`,
      );
    console.log(
      "Benchmark Todo/plain template installed and built successfully.",
    );
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
};

const writeTree = (
  root: string,
  files: ReadonlyMap<string, Uint8Array>,
): void => {
  for (const [relative, content] of files) {
    const output: string = path.join(root, ...relative.split("/"));
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, content, { flag: "wx" });
  }
};

await main();
