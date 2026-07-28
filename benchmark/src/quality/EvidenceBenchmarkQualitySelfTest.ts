import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { EvidenceBenchmarkHash } from "../EvidenceBenchmarkHash.ts";
import type { IEvidenceBenchmarkQualityGate } from "../structures/IEvidenceBenchmarkQualityGate.ts";
import { EvidenceBenchmarkArtifactInventory } from "../quality/EvidenceBenchmarkArtifactInventory.ts";
import { EvidenceBenchmarkCoverage } from "../quality/EvidenceBenchmarkCoverage.ts";
import { EvidenceBenchmarkHiddenAcceptance } from "../quality/EvidenceBenchmarkHiddenAcceptance.ts";
import { EvidenceBenchmarkMutation } from "../quality/EvidenceBenchmarkMutation.ts";
import { EvidenceBenchmarkPublicEndpointSelfTest } from "../quality/EvidenceBenchmarkPublicEndpointSelfTest.ts";
import { EvidenceBenchmarkQualityInput } from "../quality/EvidenceBenchmarkQualityInput.ts";
import { EvidenceBenchmarkQualityInputs } from "../quality/EvidenceBenchmarkQualityInputs.ts";
import { EvidenceBenchmarkRuntimeLease } from "../quality/EvidenceBenchmarkRuntimeLease.ts";

/** Exercises deterministic quality producers without a model or generated app. */
export namespace EvidenceBenchmarkQualitySelfTest {
  const benchmarkRoot: string = path.resolve(import.meta.dirname, "../..");
  const temporary: string = fs.mkdtempSync(
    path.join(os.tmpdir(), "evidence-quality-self-test-"),
  );

  /** Runs valid, invalid, restoration, and production-absence fixtures. */
  export async function main(): Promise<void> {
    let primaryFailure: unknown;
    try {
      verifyFrozenTodoAndReddit();
      const workspace: string = createWorkspace();
      const provenance: EvidenceBenchmarkQualityInput.IBound = qualityInput(
        workspace,
        path.join(benchmarkRoot, "requirements/todo"),
      );
      testQualityInputs(provenance);
      testInventory(workspace, provenance);
      testCoverage(workspace, provenance);
      await testMutation(workspace, provenance);
      await testHiddenAdapter(workspace);
      await testRuntimeLease();
      await EvidenceBenchmarkPublicEndpointSelfTest.run({
        benchmarkRoot,
        workspace,
      });
      console.log("Benchmark deterministic quality self-test passed.");
    } catch (error) {
      primaryFailure = error;
    } finally {
      if (primaryFailure === undefined)
        fs.rmSync(temporary, {
          recursive: true,
          force: true,
          maxRetries: 50,
          retryDelay: 100,
        });
      else
        console.error(
          `Quality self-test retained diagnostics at ${temporary}.`,
        );
    }
    if (primaryFailure !== undefined) throw primaryFailure;
  }

  async function testRuntimeLease(): Promise<void> {
    const workspace: string = path.join(temporary, "runtime-workspace");
    const runtimeRoot: string = path.join(temporary, "runtime-artifacts");
    const publicOutput: string = path.join(temporary, "runtime-public");
    fs.mkdirSync(publicOutput);
    fs.mkdirSync(path.join(workspace, "packages/backend/prisma"), {
      recursive: true,
    });
    write(
      path.join(workspace, "package.json"),
      `${JSON.stringify(
        {
          private: true,
          packageManager: "pnpm@10.10.0",
          scripts: {
            start: "node api.mjs",
            "dev:frontend": "node frontend.mjs",
          },
        },
        null,
        2,
      )}\n`,
    );
    const serverSource = (
      portExpression: string,
      contentType: string,
      ignoreSigterm: boolean = false,
    ): string =>
      [
        'import http from "node:http";',
        'if (process.env.OPENAI_API_KEY) throw new Error("credential leaked");',
        `const port = Number(${portExpression});`,
        "const server = http.createServer((_request, response) => {",
        `  response.writeHead(200, {"content-type": ${JSON.stringify(contentType)}});`,
        `  response.end(${JSON.stringify(contentType === "text/html" ? "<!doctype html><title>ready</title>" : '{"ready":true}\\n')});`,
        "});",
        'server.listen(port, "127.0.0.1");',
        'process.once("SIGINT", () => server.close(() => process.exit(0)));',
        ignoreSigterm
          ? 'process.once("SIGTERM", () => undefined);'
          : 'process.once("SIGTERM", () => server.close(() => process.exit(0)));',
        "",
      ].join("\n");
    write(
      path.join(workspace, "api.mjs"),
      serverSource("process.env.API_PORT", "application/json"),
    );
    write(
      path.join(workspace, "frontend.mjs"),
      serverSource(
        'process.argv[process.argv.indexOf("--port") + 1]',
        "text/html",
        true,
      ),
    );
    fs.writeFileSync(
      path.join(workspace, "packages/backend/prisma/db.sqlite"),
      Buffer.from("fresh-runtime-database\n", "utf8"),
    );
    const leases = [];
    const promotedEvidence: IEvidenceBenchmarkQualityGate.IRuntimeEvidence[] =
      [];
    for (const milestone of ["t_done", "t_dry"] as const) {
      const lease = await EvidenceBenchmarkRuntimeLease.acquire({
        workspace,
        runtimeRoot,
        runId: "runtime-lease-self-test",
        subject: "todo",
        arm: "plain",
        milestone,
        runManifestSha256: "a".repeat(64),
        workspaceSourceTreeSha256: "b".repeat(64),
        environment: { OPENAI_API_KEY: "must-not-reach-child" },
        readinessTimeoutMs: 30_000,
        terminationGraceMs: 100,
      });
      leases.push(lease);
      await lease.assertFresh();
      assert.notEqual(lease.apiOrigin, lease.browserOrigin);
      assert.equal((await fetch(lease.apiOrigin)).status, 200);
      assert.equal((await fetch(lease.browserOrigin)).status, 200);
      const processRecord = JSON.parse(
        Buffer.from(lease.processProvenanceBytes).toString("utf8"),
      ) as { origins: { backend: string } };
      assert.throws(
        () =>
          EvidenceBenchmarkRuntimeLease.validateBackendSocketOwnership(
            Number(new URL(processRecord.origins.backend).port),
            4,
          ),
        /not owned by child tree/u,
      );
      assert.equal(
        EvidenceBenchmarkHash.bytes(lease.processProvenanceBytes),
        lease.processProvenanceSha256,
      );
      assert.doesNotMatch(
        Buffer.from(lease.processProvenanceBytes).toString("utf8"),
        /OPENAI_API_KEY|must-not-reach-child/u,
      );
      assert.doesNotMatch(
        Buffer.from(lease.processProvenanceBytes).toString("utf8"),
        /valueSha256/u,
      );
      for (const key of ["USERPROFILE", "HOME", "PATH"])
        if (process.env[key] !== undefined)
          assert.equal(
            Buffer.from(lease.processProvenanceBytes)
              .toString("utf8")
              .includes(process.env[key]),
            false,
          );
      assert.doesNotMatch(
        Buffer.from(lease.processProvenanceBytes).toString("utf8"),
        new RegExp(
          path
            .dirname(process.execPath)
            .replaceAll(/[.*+?^${}()|[\]\\]/gu, "\\$&"),
          "u",
        ),
      );
      if (milestone === "t_done")
        fs.writeFileSync(
          path.join(workspace, "packages/backend/prisma/db.sqlite-wal"),
          Buffer.from("owned-wal-sidecar\n", "utf8"),
        );
      const cleanup = await lease.cleanup();
      assert.equal(
        EvidenceBenchmarkHash.bytes(cleanup.cleanupSealBytes),
        cleanup.cleanupSealSha256,
      );
      assert.deepEqual(await lease.cleanup(), cleanup);
      assert.match(
        Buffer.from(cleanup.cleanupSealBytes).toString("utf8"),
        /"forced": true/u,
      );
      const evidence = await lease.promoteEvidence(publicOutput);
      promotedEvidence.push(evidence);
      EvidenceBenchmarkRuntimeLease.validatePromotedEvidence(
        publicOutput,
        evidence,
      );
      assert.deepEqual(await lease.promoteEvidence(publicOutput), evidence);
      const privateControl: string = path.join(
        runtimeRoot,
        lease.instanceId,
        "process-control-provenance.json",
      );
      assert.equal(fs.existsSync(privateControl), true);
      assert.match(fs.readFileSync(privateControl, "utf8"), /"realpath":/u);
      EvidenceBenchmarkRuntimeLease.validatePrivateControlEvidence(
        lease.privateControlEvidence,
        evidence,
        publicOutput,
      );
      if (milestone === "t_done") {
        testPublicProcessMutation(lease.processProvenanceBytes);
        const controlBytes: Buffer = fs.readFileSync(
          lease.privateControlEvidence.path,
        );
        fs.rmSync(lease.privateControlEvidence.path, { force: false });
        assert.throws(
          () =>
            EvidenceBenchmarkRuntimeLease.validatePrivateControlEvidence(
              lease.privateControlEvidence,
              evidence,
              publicOutput,
            ),
          /absent or unsafe/u,
        );
        assert.throws(
          () =>
            EvidenceBenchmarkHiddenAcceptance.requirePrivateRuntimeAudit({
              status: "failed",
              evidence: lease.privateControlEvidence,
              reason: "fixture control evidence is absent",
            }),
          /retention failed/u,
        );
        EvidenceBenchmarkRuntimeLease.validatePromotedEvidence(
          publicOutput,
          evidence,
        );
        fs.writeFileSync(lease.privateControlEvidence.path, controlBytes, {
          flag: "wx",
        });
      }
      if (milestone === "t_done") {
        assert.match(
          Buffer.from(cleanup.cleanupSealBytes).toString("utf8"),
          /"journalMode": "wal"/u,
        );
        assert.equal(
          fs.existsSync(
            path.join(workspace, "packages/backend/prisma/db.sqlite-wal"),
          ),
          false,
        );
      }
      await assert.rejects(lease.assertFresh, /already cleaned/u);
    }
    const done = leases[0];
    const dry = leases[1];
    if (done === undefined || dry === undefined)
      throw new Error("Runtime self-test did not retain both milestones.");
    assert.notEqual(done.instanceId, dry.instanceId);
    assert.notEqual(done.databaseCloneSha256, dry.databaseCloneSha256);
    assert.notEqual(done.processProvenanceSha256, dry.processProvenanceSha256);
    const firstEvidence = promotedEvidence[0];
    const secondEvidence = promotedEvidence[1];
    if (firstEvidence === undefined || secondEvidence === undefined)
      throw new Error("Runtime self-test did not retain promoted evidence.");
    testCoherentRuntimeForgeries(publicOutput, firstEvidence, secondEvidence);
    const runtimeInput: IEvidenceBenchmarkQualityGate.IInputProvenance = {
      runId: firstEvidence.runId,
      runManifestSha256: firstEvidence.runManifestSha256,
      milestone: firstEvidence.milestone,
      snapshotRawTree: {
        algorithmId: "sha256-posix-path-nul-bytes-v1",
        sha256: firstEvidence.workspaceSourceTreeSha256,
      },
      subjectRequirementsRawTree: {
        algorithmId: "sha256-posix-path-nul-bytes-v1",
        sha256: "0".repeat(64),
      },
    };
    EvidenceBenchmarkHiddenAcceptance.validateProductionRuntimeBinding(
      firstEvidence,
      runtimeInput,
      firstEvidence.subject,
      firstEvidence.arm,
    );
    assert.throws(
      () =>
        EvidenceBenchmarkHiddenAcceptance.validateProductionRuntimeBinding(
          firstEvidence,
          runtimeInput,
          firstEvidence.subject,
          firstEvidence.arm === "plain" ? "evidence" : "plain",
        ),
      /another quality input/u,
    );
    assert.throws(
      () =>
        EvidenceBenchmarkRuntimeLease.validatePrivateControlEvidence(
          done.privateControlEvidence,
          secondEvidence,
          publicOutput,
        ),
      /does not bind|another private audit/u,
    );
    const clonedDatabases: string[] = [];
    for (const instance of fs.readdirSync(runtimeRoot))
      if (
        fs.existsSync(path.join(runtimeRoot, instance, "database", "db.sqlite"))
      )
        clonedDatabases.push(instance);
    assert.deepEqual(clonedDatabases, []);

    const concurrent = await Promise.all(
      Array.from({ length: 4 }, async (_, index) => {
        const cellWorkspace = path.join(
          temporary,
          `runtime-workspace-cell-${index}`,
        );
        fs.cpSync(workspace, cellWorkspace, { recursive: true });
        return EvidenceBenchmarkRuntimeLease.acquire({
          workspace: cellWorkspace,
          runtimeRoot,
          runId: `runtime-four-cell-${index}`,
          subject: index % 2 === 0 ? "todo" : "reddit",
          arm: index < 2 ? "evidence" : "plain",
          milestone: "t_done",
          runManifestSha256: "c".repeat(64),
          workspaceSourceTreeSha256: "d".repeat(64),
          environment: { OPENAI_API_KEY: "must-not-reach-child" },
          readinessTimeoutMs: 30_000,
          terminationGraceMs: 100,
        });
      }),
    );
    assert.equal(
      new Set(
        concurrent.flatMap((lease) => [lease.apiOrigin, lease.browserOrigin]),
      ).size,
      8,
    );
    await Promise.all(
      concurrent.map(async (lease) => {
        await lease.assertFresh();
        await lease.cleanup();
        await lease.promoteEvidence(publicOutput);
      }),
    );
    await testRuntimeEvidenceFailures(workspace, runtimeRoot, publicOutput);
    await testProductionRuntimeSuccess(workspace, runtimeRoot);
    await testPreAdapterProductionFailure(workspace, runtimeRoot);
    await testAcquireFailureRetention(workspace, runtimeRoot);
  }

  async function testProductionRuntimeSuccess(
    workspace: string,
    runtimeRoot: string,
  ): Promise<void> {
    const fixtureRoot: string = path.join(
      temporary,
      "production-runtime-fixture",
    );
    const adapterRoot: string = path.join(
      fixtureRoot,
      "quality",
      "adapters",
      "runtime",
    );
    const adapterPath: string = path.join(adapterRoot, "index.ts");
    write(
      adapterPath,
      `
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
const digest = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
export const adapter = {
  schemaVersion: 1,
  async execute(input) {
    const runtime = input.runtime;
    await runtime.assertFresh();
    let cleanup;
    let hidden;
    try {
      const started = process.hrtime.bigint().toString();
      const response = await fetch(runtime.apiOrigin);
      const body = await response.text();
      const bytes = Buffer.from(JSON.stringify({ passed: response.status === 200 && body.length > 0 }, null, 2) + "\\n");
      const relative = "http/runtime.json";
      fs.mkdirSync(path.join(input.output, "http"), { recursive: true });
      fs.writeFileSync(path.join(input.output, relative), bytes, { flag: "wx" });
      hidden = {
        caseId: "FIXTURE-RUNTIME-HTTP",
        status: response.status === 200 && body.length > 0 ? "passed" : "failed",
        startedMonotonicNs: started,
        completedMonotonicNs: process.hrtime.bigint().toString(),
        artifact: relative,
        artifactSha256: digest(bytes),
      };
    } finally {
      cleanup = await runtime.cleanup();
    }
    return {
      schemaVersion: 1,
      input: input.input,
      suiteId: input.manifest.suiteId,
      subject: input.manifest.subject,
      workspaceSourceTreeSha256: input.workspaceSourceTreeSha256,
      runtime: {
        instanceId: runtime.instanceId,
        leaseId: runtime.leaseId,
        databaseCloneSha256: runtime.databaseCloneSha256,
        processProvenanceSha256: runtime.processProvenanceSha256,
        cleanupSealSha256: cleanup.cleanupSealSha256,
        serverRequestLedgerSha256: cleanup.serverRequestLedgerSha256,
        evidence: null,
      },
      hidden: [hidden],
      browser: [],
    };
  },
};
`.trimStart(),
    );
    const requirements: string = path.join(fixtureRoot, "requirements");
    write(
      path.join(requirements, "acceptance-criteria.jsonl"),
      '{"id":"REQ.FIX"}\n',
    );
    const manifestPath: string = path.join(
      fixtureRoot,
      "quality",
      "hidden",
      "todo.manifest.json",
    );
    const requirementsFiles: Map<string, Uint8Array> =
      EvidenceBenchmarkHash.directory(requirements);
    const adapterFiles: Map<string, Uint8Array> =
      EvidenceBenchmarkHash.directory(adapterRoot);
    write(
      manifestPath,
      `${JSON.stringify(
        {
          schemaVersion: 2,
          materializerManifestSchemaVersion: 2,
          suiteId: "runtime-production-fixture-v1",
          freezeId: "runtime-production-fixture-freeze",
          subject: "todo",
          subjectRequirementsRawTree: {
            algorithmId: "sha256-posix-path-nul-bytes-v1",
            sha256: EvidenceBenchmarkHash.tree(requirementsFiles),
          },
          acceptanceCatalog: {
            sha256: EvidenceBenchmarkHash.file(
              path.join(requirements, "acceptance-criteria.jsonl"),
            ),
            count: 1,
          },
          adapter: {
            module: "quality/adapters/runtime/index.ts",
            sha256: EvidenceBenchmarkHash.file(adapterPath),
            closure: {
              root: "quality/adapters/runtime",
              files: adapterFiles.size,
              treeSha256: EvidenceBenchmarkHash.tree(adapterFiles),
            },
            exportName: "adapter",
          },
          cases: [
            {
              id: "FIXTURE-RUNTIME-HTTP",
              criterionIds: ["REQ.FIX"],
              kind: "http",
              routeState: null,
              viewports: [],
            },
          ],
        },
        null,
        2,
      )}\n`,
    );
    const bound: EvidenceBenchmarkQualityInput.IBound = qualityInput(
      workspace,
      requirements,
    );
    const output: string = path.join(temporary, "production-runtime-output");
    const production = await EvidenceBenchmarkHiddenAcceptance.runProduction({
      benchmarkRoot: fixtureRoot,
      manifestPath,
      requirements,
      workspace,
      output,
      runtimeRoot,
      subject: "todo",
      arm: "plain",
      qualityInput: bound,
      readinessTimeoutMs: 30_000,
    });
    assert.equal(production.outcome.status, "passed");
    assert.equal(production.privateRuntimeAudit.status, "retained");
    assert.notEqual(production.outcome.runtimeEvidence, null);
    assert.deepEqual(
      production.outcome.runtimeEvidence,
      production.outcome.result?.runtime?.evidence,
    );
  }

  async function testAcquireFailureRetention(
    workspace: string,
    runtimeRoot: string,
  ): Promise<void> {
    const failing: string = path.join(
      temporary,
      "runtime-workspace-acquire-failure",
    );
    fs.cpSync(workspace, failing, { recursive: true });
    const packageJson = JSON.parse(
      fs.readFileSync(path.join(failing, "package.json"), "utf8"),
    ) as { scripts: Record<string, string> };
    packageJson.scripts.start = 'node -e "process.exit(23)"';
    write(
      path.join(failing, "package.json"),
      `${JSON.stringify(packageJson, null, 2)}\n`,
    );
    await assert.rejects(
      EvidenceBenchmarkRuntimeLease.acquire({
        workspace: failing,
        runtimeRoot,
        runId: "runtime-acquire-failure",
        subject: "todo",
        arm: "plain",
        milestone: "t_done",
        runManifestSha256: "1".repeat(64),
        workspaceSourceTreeSha256: "2".repeat(64),
        readinessTimeoutMs: 5_000,
        terminationGraceMs: 100,
      }),
      (error: unknown) => {
        assert.equal(error instanceof AggregateError, true);
        const aggregate = error as AggregateError;
        assert.equal(aggregate.name, "EvidenceBenchmarkRuntimeAcquireError");
        assert.match(aggregate.message, /retained instance:/u);
        assert.match(aggregate.message, /private recovery registry:/u);
        assert.ok(aggregate.errors.length >= 1);
        return true;
      },
    );
  }

  async function testPreAdapterProductionFailure(
    workspace: string,
    runtimeRoot: string,
  ): Promise<void> {
    const manifestPath: string = path.join(
      temporary,
      "invalid-production-manifest.json",
    );
    write(manifestPath, '{"schemaVersion":2,"schemaVersion":2}\n');
    const output: string = path.join(temporary, "pre-adapter-failure-output");
    const requirements: string = path.join(benchmarkRoot, "requirements/todo");
    const bound: EvidenceBenchmarkQualityInput.IBound = qualityInput(
      workspace,
      requirements,
    );
    await assert.rejects(
      EvidenceBenchmarkHiddenAcceptance.runProduction({
        benchmarkRoot,
        manifestPath,
        requirements,
        workspace,
        output,
        runtimeRoot,
        subject: "todo",
        arm: "plain",
        qualityInput: bound,
        readinessTimeoutMs: 30_000,
      }),
      (error: unknown) => {
        assert.equal(error instanceof AggregateError, true);
        const aggregate = error as AggregateError;
        assert.match(aggregate.message, /runtime evidence inventory:/u);
        assert.match(aggregate.message, /private recovery registry:/u);
        assert.match(String(aggregate.errors[0]), /strict JSON|duplicate/u);
        return true;
      },
    );
    assert.equal(
      fs.existsSync(path.join(output, "runtime", "cas", "sha256")),
      true,
    );
    assert.ok(
      fs
        .readdirSync(path.join(runtimeRoot, "private-registry"))
        .some((file) => file.endsWith(".json")),
    );
  }

  function testPublicProcessMutation(bytes: Uint8Array): void {
    const toolchain = JSON.parse(Buffer.from(bytes).toString("utf8")) as {
      toolchain: { sha256: string }[];
      environmentPolicy: { policyId: string };
    };
    const first = toolchain.toolchain[0];
    if (first === undefined)
      throw new Error("Runtime toolchain fixture is empty.");
    first.sha256 = "0".repeat(64);
    assert.throws(
      () =>
        EvidenceBenchmarkRuntimeLease.validatePublicProcessProvenance(
          Buffer.from(`${JSON.stringify(toolchain, null, 2)}\n`, "utf8"),
        ),
      /toolchain manifest digest drifted/u,
    );
    const environment = JSON.parse(Buffer.from(bytes).toString("utf8")) as {
      environmentPolicy: { policyId: string };
    };
    environment.environmentPolicy.policyId =
      "benchmark-runtime-environment-allowlist-v2";
    assert.throws(
      () =>
        EvidenceBenchmarkRuntimeLease.validatePublicProcessProvenance(
          Buffer.from(`${JSON.stringify(environment, null, 2)}\n`, "utf8"),
        ),
      /must be equal to constant|environment policy digest drifted/u,
    );
  }

  function testCoherentRuntimeForgeries(
    output: string,
    first: IEvidenceBenchmarkQualityGate.IRuntimeEvidence,
    second: IEvidenceBenchmarkQualityGate.IRuntimeEvidence,
  ): void {
    const splice = {
      ...first,
      processProvenance: second.processProvenance,
    };
    splice.inventory = writeRuntimeInventory(output, splice);
    assert.throws(
      () =>
        EvidenceBenchmarkRuntimeLease.validatePromotedEvidence(output, splice),
      /splice different leases/u,
    );

    const invalidBytes: Buffer = Buffer.from('{"schemaVersion":1}\n', "utf8");
    const invalidSha256: string = EvidenceBenchmarkHash.bytes(invalidBytes);
    const invalidPath: string = path.join(
      output,
      "runtime",
      "cas",
      "sha256",
      `${invalidSha256}.bin`,
    );
    fs.writeFileSync(invalidPath, invalidBytes, { flag: "wx" });
    const invalid = {
      ...first,
      databaseProvenance: {
        path: `runtime/cas/sha256/${invalidSha256}.bin`,
        byteLength: invalidBytes.byteLength,
        sha256: invalidSha256,
      },
    };
    invalid.inventory = writeRuntimeInventory(output, invalid);
    assert.throws(
      () =>
        EvidenceBenchmarkRuntimeLease.validatePromotedEvidence(output, invalid),
      /must have required property/u,
    );
  }

  function writeRuntimeInventory(
    output: string,
    evidence: IEvidenceBenchmarkQualityGate.IRuntimeEvidence,
  ): IEvidenceBenchmarkQualityGate.IArtifactReference {
    const artifacts = [
      {
        kind: "database_provenance",
        role: null,
        ...evidence.databaseProvenance,
      },
      {
        kind: "process_provenance",
        role: null,
        ...evidence.processProvenance,
      },
      { kind: "cleanup_seal", role: null, ...evidence.cleanupSeal },
      {
        kind: "server_request_ledger",
        role: null,
        ...evidence.serverRequestLedger,
      },
      ...evidence.logs.map(({ role, ...reference }) => ({
        kind: "process_log",
        role,
        ...reference,
      })),
    ];
    const bytes: Buffer = Buffer.from(
      `${JSON.stringify(
        {
          schemaVersion: 1,
          instanceId: evidence.instanceId,
          leaseId: evidence.leaseId,
          runId: evidence.runId,
          subject: evidence.subject,
          arm: evidence.arm,
          milestone: evidence.milestone,
          runManifestSha256: evidence.runManifestSha256,
          workspaceSourceTreeSha256: evidence.workspaceSourceTreeSha256,
          artifacts,
        },
        null,
        2,
      )}\n`,
      "utf8",
    );
    const sha256: string = EvidenceBenchmarkHash.bytes(bytes);
    const location: string = path.join(
      output,
      "runtime",
      "cas",
      "sha256",
      `${sha256}.bin`,
    );
    if (!fs.existsSync(location))
      fs.writeFileSync(location, bytes, { flag: "wx" });
    return {
      path: `runtime/cas/sha256/${sha256}.bin`,
      byteLength: bytes.byteLength,
      sha256,
    };
  }

  async function testRuntimeEvidenceFailures(
    workspace: string,
    runtimeRoot: string,
    publicOutput: string,
  ): Promise<void> {
    const acquire = () =>
      EvidenceBenchmarkRuntimeLease.acquire({
        workspace,
        runtimeRoot,
        runId: "runtime-negative",
        subject: "todo",
        arm: "plain",
        milestone: "t_done",
        runManifestSha256: "e".repeat(64),
        workspaceSourceTreeSha256: "f".repeat(64),
        readinessTimeoutMs: 30_000,
        terminationGraceMs: 100,
      });
    const missing = await acquire();
    await missing.cleanup();
    const missingRoot: string = path.join(runtimeRoot, missing.instanceId);
    const missingLog: string | undefined = fs
      .readdirSync(missingRoot)
      .find((file) => file.endsWith(".stdout.log"));
    if (missingLog === undefined)
      throw new Error("Runtime negative fixture did not create a log.");
    fs.rmSync(path.join(missingRoot, missingLog), { force: false });
    await assert.rejects(
      missing.promoteEvidence(publicOutput),
      /source is absent/u,
    );

    const lease = await acquire();
    await lease.cleanup();
    const evidence = await lease.promoteEvidence(publicOutput);
    assert.throws(
      () =>
        EvidenceBenchmarkRuntimeLease.validatePromotedEvidence(publicOutput, {
          ...evidence,
          inventory: { ...evidence.inventory, path: "../foreign.json" },
        }),
      /foreign or unconfined/u,
    );
    assert.throws(
      () =>
        EvidenceBenchmarkRuntimeLease.validatePromotedEvidence(publicOutput, {
          ...evidence,
          databaseProvenance: {
            ...evidence.cleanupSeal,
          },
        }),
      /failed protocol validation|inventory does not bind/u,
    );
    const inventoryLocation: string = path.join(
      publicOutput,
      ...evidence.inventory.path.split("/"),
    );
    const inventoryBytes: Buffer = fs.readFileSync(inventoryLocation);
    fs.rmSync(inventoryLocation, { force: false });
    assert.throws(
      () =>
        EvidenceBenchmarkRuntimeLease.validatePromotedEvidence(
          publicOutput,
          evidence,
        ),
      /artifact is absent/u,
    );
    fs.writeFileSync(inventoryLocation, inventoryBytes, { flag: "wx" });
    fs.writeFileSync(inventoryLocation, Buffer.from("substitution\n"), {
      flag: "w",
    });
    assert.throws(
      () =>
        EvidenceBenchmarkRuntimeLease.validatePromotedEvidence(
          publicOutput,
          evidence,
        ),
      /artifact drifted/u,
    );
    fs.writeFileSync(inventoryLocation, inventoryBytes, { flag: "w" });
  }

  function testQualityInputs(
    input: EvidenceBenchmarkQualityInput.IBound,
  ): void {
    const producer = EvidenceBenchmarkQualityInputs.producer({
      producer: "fixture-producer",
      version: "1.0.0",
      configBytes: Buffer.from('{"config":true}\n', "utf8"),
      resultBytes: Buffer.from('{"result":true}\n', "utf8"),
    });
    const qualityInputs = {
      schemaVersion: 2 as const,
      runId: "todo-plain-quality-self-test",
      runManifestSha256: input.provenance.runManifestSha256,
      milestone: "t_done" as const,
      snapshotRawTree: input.provenance.snapshotRawTree,
      hiddenAcceptance: producer,
      coverage: producer,
      sampledMutation: producer,
      visualCapture: {
        producer: "fixture-browser",
        version: "1.0.0",
        configSha256: "a".repeat(64),
        routeInventorySha256: "b".repeat(64),
        stateSeedSha256: "c".repeat(64),
        sampleSeed: "fixture-seed",
        viewports: [390, 834, 1440] as [390, 834, 1440],
        browser: "chromium-fixture",
        artifactsSha256: "d".repeat(64),
      },
    };
    const serialized = EvidenceBenchmarkQualityInputs.serialize(qualityInputs);
    assert.deepEqual(
      EvidenceBenchmarkQualityInputs.parse(serialized),
      qualityInputs,
    );
    assert.equal(
      producer.resultSha256,
      EvidenceBenchmarkHash.bytes('{"result":true}\n'),
    );
    assert.throws(
      () =>
        EvidenceBenchmarkQualityInputs.validate({
          ...qualityInputs,
          generationCoreSealSha256: "e".repeat(64),
        }),
      /fields are not the exact expected set/u,
    );
    assert.throws(
      () =>
        EvidenceBenchmarkQualityInputs.validate({
          ...qualityInputs,
          visualCapture: {
            ...qualityInputs.visualCapture,
            viewports: [390, 768, 1440],
          },
        }),
      /viewports must bind widths 390, 834, and 1440/u,
    );
    assert.throws(
      () =>
        EvidenceBenchmarkQualityInputs.parse(
          Buffer.from(JSON.stringify(qualityInputs), "utf8"),
        ),
      /canonical byte form/u,
    );
    assert.throws(
      () =>
        EvidenceBenchmarkQualityInputs.parse(
          Buffer.from('{"schemaVersion":2,"schemaVersion":2}\n', "utf8"),
        ),
      /strict JSON/u,
    );
    assert.throws(
      () =>
        EvidenceBenchmarkQualityInputs.parse(
          Buffer.from([0x7b, 0x22, 0x78, 0x22, 0x3a, 0xff, 0x7d]),
        ),
      /not UTF-8/u,
    );
  }

  function verifyFrozenTodoAndReddit(): void {
    for (const subject of ["todo", "reddit"] as const) {
      const manifest = EvidenceBenchmarkHiddenAcceptance.manifest(
        path.join(
          benchmarkRoot,
          "quality",
          "hidden",
          `${subject}.manifest.json`,
        ),
      );
      EvidenceBenchmarkHiddenAcceptance.verifyCorpus(
        manifest,
        path.join(benchmarkRoot, "requirements", subject),
      );
      assert.equal(
        EvidenceBenchmarkHiddenAcceptance.launchManifest(
          benchmarkRoot,
          subject,
          "wave1",
        ).manifest.subject,
        subject,
      );
    }
    for (const subject of ["shopping", "erp"] as const)
      assert.throws(
        () =>
          EvidenceBenchmarkHiddenAcceptance.launchManifest(
            benchmarkRoot,
            subject,
            "wave2",
          ),
        /hidden suite is not frozen/u,
      );
    assert.throws(
      () =>
        EvidenceBenchmarkHiddenAcceptance.launchManifest(
          benchmarkRoot,
          "shopping",
          "wave1",
        ),
      /does not belong to selected benchmark wave1/u,
    );
  }

  function createWorkspace(): string {
    const workspace: string = path.join(temporary, "workspace");
    write(
      path.join(workspace, "package.json"),
      `${JSON.stringify(
        {
          private: true,
          scripts: {
            build: "tsc --noEmit",
            test: "node tests/check.mjs",
            "test:disabled": "node tests/check.mjs || true",
          },
        },
        null,
        2,
      )}\n`,
    );
    write(
      path.join(workspace, "packages/app/src/domain.ts"),
      [
        "export const enabled: boolean = true;",
        "export const accepts = (value: number): boolean => value >= 1;",
        "// TODO: fixture inventory witness",
        "",
      ].join("\n"),
    );
    write(
      path.join(workspace, "packages/app/tests/domain.spec.ts"),
      [
        'import { test } from "node:test";',
        'test.skip("fixture skipped witness", () => undefined);',
        "",
      ].join("\n"),
    );
    write(
      path.join(workspace, "tests/check.mjs"),
      'process.stdout.write("fixture test\\n");\n',
    );
    return workspace;
  }

  function testInventory(
    workspace: string,
    provenance: EvidenceBenchmarkQualityInput.IBound,
  ): void {
    const inventory = EvidenceBenchmarkArtifactInventory.inspect(
      workspace,
      provenance,
    );
    assert.ok(inventory.files >= 4);
    assert.ok(inventory.sourceFiles >= 3);
    assert.ok(inventory.testFiles >= 2);
    assert.ok(
      inventory.findings.some((finding) => finding.category === "todo"),
    );
    assert.ok(
      inventory.findings.some((finding) => finding.category === "skipped_test"),
    );
    assert.ok(
      inventory.findings.some(
        (finding) => finding.category === "disabled_gate",
      ),
    );
    assert.throws(
      () =>
        EvidenceBenchmarkArtifactInventory.inspect(workspace, {
          ...provenance,
          runManifestBytes: Buffer.from('{"drift":true}\n', "utf8"),
        }),
      /run manifest bytes have drifted/u,
    );
    assert.throws(
      () =>
        EvidenceBenchmarkArtifactInventory.inspect(workspace, {
          ...provenance,
          sourceSnapshotFiles: new Map([
            ...provenance.sourceSnapshotFiles,
            ["drift.txt", Buffer.from("drift", "utf8")],
          ]),
        }),
      /source snapshot raw-byte tree has drifted/u,
    );
    assert.throws(
      () =>
        EvidenceBenchmarkArtifactInventory.inspect(workspace, {
          ...provenance,
          subjectRequirementFiles: new Map([
            ...provenance.subjectRequirementFiles,
            ["drift.txt", Buffer.from("drift", "utf8")],
          ]),
        }),
      /subject requirements raw-byte tree has drifted/u,
    );
    assert.throws(
      () =>
        EvidenceBenchmarkQualityInput.validateProvenance({
          ...provenance.provenance,
          generationCoreSealSha256: "a".repeat(64),
        } as never),
      /fields are not the exact expected set/u,
    );
  }

  function testCoverage(
    workspace: string,
    provenance: EvidenceBenchmarkQualityInput.IBound,
  ): void {
    const source: string = path.join(workspace, "packages/app/src/domain.ts");
    const istanbulPath: string = path.join(
      workspace,
      "coverage",
      "coverage-final.json",
    );
    write(
      istanbulPath,
      `${JSON.stringify({
        [source]: {
          path: source,
          statementMap: {
            "0": {
              start: { line: 1, column: 0 },
              end: { line: 1, column: 37 },
            },
            "1": {
              start: { line: 2, column: 0 },
              end: { line: 2, column: 70 },
            },
          },
          fnMap: {
            "0": {
              name: "accepts",
              decl: {
                start: { line: 2, column: 13 },
                end: { line: 2, column: 20 },
              },
              loc: {
                start: { line: 2, column: 23 },
                end: { line: 2, column: 70 },
              },
            },
          },
          branchMap: {
            "0": {
              type: "binary-expr",
              locations: [
                {
                  start: { line: 2, column: 60 },
                  end: { line: 2, column: 61 },
                },
                {
                  start: { line: 2, column: 64 },
                  end: { line: 2, column: 65 },
                },
              ],
            },
          },
          s: { "0": 1, "1": 0 },
          f: { "0": 1 },
          b: { "0": [1, 0] },
        },
      })}\n`,
    );
    const istanbul = EvidenceBenchmarkCoverage.istanbul(
      workspace,
      istanbulPath,
      provenance,
    );
    assert.deepEqual(istanbul.lines, { covered: 1, total: 2, ratio: 0.5 });
    assert.deepEqual(istanbul.branches, {
      covered: 1,
      total: 2,
      ratio: 0.5,
    });
    assert.deepEqual(istanbul.functions, {
      covered: 1,
      total: 1,
      ratio: 1,
    });
    const lcovPath: string = path.join(workspace, "coverage", "lcov.info");
    write(
      lcovPath,
      [
        `SF:${source}`,
        "FNDA:1,accepts",
        "DA:1,1",
        "DA:2,0",
        "BRDA:2,0,0,1",
        "BRDA:2,0,1,-",
        "end_of_record",
        "",
      ].join("\n"),
    );
    const lcov = EvidenceBenchmarkCoverage.lcov(
      workspace,
      lcovPath,
      provenance,
    );
    assert.equal(lcov.statements, null);
    assert.equal(lcov.lines.ratio, 0.5);
    const escaped: string = path.join(
      workspace,
      "coverage",
      "escaped-coverage.json",
    );
    write(
      escaped,
      `${JSON.stringify({
        [path.join(temporary, "outside.ts")]: {
          statementMap: {},
          s: {},
          f: {},
          b: {},
        },
      })}\n`,
    );
    assert.throws(
      () => EvidenceBenchmarkCoverage.istanbul(workspace, escaped, provenance),
      /escapes the workspace/u,
    );
    const generatedSource: string = path.join(
      workspace,
      ".next",
      "generated.ts",
    );
    write(generatedSource, "export const generated = true;\n");
    const generatedCoverage: string = path.join(
      workspace,
      "coverage",
      "generated-coverage.json",
    );
    write(
      generatedCoverage,
      `${JSON.stringify({
        [generatedSource]: {
          path: generatedSource,
          statementMap: {},
          s: {},
          fnMap: {},
          f: {},
          branchMap: {},
          b: {},
        },
      })}\n`,
    );
    assert.throws(
      () =>
        EvidenceBenchmarkCoverage.istanbul(
          workspace,
          generatedCoverage,
          provenance,
        ),
      /outside the authored snapshot/u,
    );
    assert.throws(
      () =>
        EvidenceBenchmarkCoverage.lcov(workspace, lcovPath, {
          ...provenance,
          provenance: {
            ...provenance.provenance,
            snapshotRawTree: {
              ...provenance.provenance.snapshotRawTree,
              algorithmId: "unqualified" as never,
            },
          },
        }),
      /source snapshot algorithm/u,
    );
  }

  async function testMutation(
    workspace: string,
    provenance: EvidenceBenchmarkQualityInput.IBound,
  ): Promise<void> {
    const plan = EvidenceBenchmarkMutation.plan({
      workspace,
      seed: "quality-self-test-v1",
      sampleSize: 2,
      qualityInput: provenance,
    });
    assert.equal(plan.mutations.length, 2);
    const originalTree: string = plan.workspaceSourceTreeSha256;
    await assert.rejects(
      () =>
        EvidenceBenchmarkMutation.execute({
          workspace,
          output: path.join(temporary, "mutation-extra-field"),
          plan: { ...plan, extra: true } as never,
          qualityInput: provenance,
          test: {
            command: process.execPath,
            arguments: ["-e", "process.exit(1)"],
            cwd: workspace,
            timeoutMs: 5_000,
          },
        }),
      /mutation plan fields are not the exact expected set/u,
    );
    const killed = await EvidenceBenchmarkMutation.execute({
      workspace,
      output: path.join(temporary, "mutation-killed"),
      plan,
      qualityInput: provenance,
      test: {
        command: process.execPath,
        arguments: ["-e", "process.exit(1)"],
        cwd: workspace,
        timeoutMs: 5_000,
      },
    });
    assert.ok(killed.every((result) => result.status === "killed"));
    assert.ok(killed.every((result) => result.restored));
    const survived = await EvidenceBenchmarkMutation.execute({
      workspace,
      output: path.join(temporary, "mutation-survived"),
      plan,
      qualityInput: provenance,
      test: {
        command: process.execPath,
        arguments: ["-e", "process.exit(0)"],
        cwd: workspace,
        timeoutMs: 5_000,
      },
    });
    assert.ok(survived.every((result) => result.status === "survived"));
    const recoveryMutation = plan.mutations[0]!;
    const recoverySource: string = path.join(
      workspace,
      ...recoveryMutation.path.split("/"),
    );
    const recoveryOriginal: Buffer = fs.readFileSync(recoverySource);
    const recoveryOutput: string = path.join(temporary, "mutation-recovery");
    const recoveryBackup: string = path.join(
      recoveryOutput,
      "backups",
      `${recoveryMutation.id}.source`,
    );
    fs.mkdirSync(path.dirname(recoveryBackup), { recursive: true });
    fs.writeFileSync(recoveryBackup, recoveryOriginal);
    write(
      path.join(recoveryOutput, "mutation-recovery.json.stage"),
      `${JSON.stringify(
        {
          schemaVersion: 1,
          mutationId: recoveryMutation.id,
          relative: recoveryMutation.path,
          sourceSha256: recoveryMutation.sourceSha256,
          backup: `backups/${recoveryMutation.id}.source`,
        },
        null,
        2,
      )}\n`,
    );
    const recoveryText: string = recoveryOriginal.toString("utf8");
    fs.writeFileSync(
      recoverySource,
      recoveryText.slice(0, recoveryMutation.start) +
        recoveryMutation.after +
        recoveryText.slice(recoveryMutation.end),
      "utf8",
    );
    assert.equal(
      EvidenceBenchmarkMutation.recover(workspace, recoveryOutput),
      true,
    );
    assert.equal(
      EvidenceBenchmarkHash.file(recoverySource),
      recoveryMutation.sourceSha256,
    );
    assert.equal(
      EvidenceBenchmarkArtifactInventory.treeSha256(
        EvidenceBenchmarkArtifactInventory.authoredFiles(workspace),
      ),
      originalTree,
    );
  }

  async function testHiddenAdapter(workspace: string): Promise<void> {
    const fixtureBenchmark: string = path.join(temporary, "benchmark");
    const requirements: string = path.join(fixtureBenchmark, "requirements");
    write(
      path.join(requirements, "01.md"),
      "# Fixture\n\n## Area\n\n### REQ-ONE\n\nFixture.\n",
    );
    write(
      path.join(requirements, "acceptance-criteria.jsonl"),
      [
        JSON.stringify({
          id: "REQ-ONE.AC-01",
          requirement: "REQ-ONE",
          source: "01.md",
          criterion: "HTTP behavior works.",
        }),
        JSON.stringify({
          id: "REQ-ONE.AC-02",
          requirement: "REQ-ONE",
          source: "01.md",
          criterion: "Browser behavior works.",
        }),
        "",
      ].join("\n"),
    );
    const adapterPath: string = path.join(
      fixtureBenchmark,
      "quality/adapters/fixture/index.ts",
    );
    write(adapterPath, fakeAdapterSource());
    const adapterRoot: string = path.dirname(adapterPath);
    const requirementsTreeSha256: string =
      EvidenceBenchmarkArtifactInventory.treeSha256(
        EvidenceBenchmarkHash.directory(requirements),
      );
    const provenance: EvidenceBenchmarkQualityInput.IBound = qualityInput(
      workspace,
      requirements,
    );
    const catalogPath: string = path.join(
      requirements,
      "acceptance-criteria.jsonl",
    );
    const manifestPath: string = path.join(
      fixtureBenchmark,
      "quality/hidden/fixture.manifest.json",
    );
    write(
      manifestPath,
      `${JSON.stringify(
        {
          schemaVersion: 2,
          materializerManifestSchemaVersion: 2,
          suiteId: "fixture-hidden-v1",
          freezeId: "fixture-freeze-v1",
          subject: "todo",
          subjectRequirementsRawTree: {
            algorithmId: EvidenceBenchmarkHash.TREE_ALGORITHM,
            sha256: requirementsTreeSha256,
          },
          acceptanceCatalog: {
            sha256: EvidenceBenchmarkHash.file(catalogPath),
            count: 2,
          },
          adapter: {
            module: "quality/adapters/fixture/index.ts",
            sha256: EvidenceBenchmarkHash.file(adapterPath),
            closure: {
              root: "quality/adapters/fixture",
              files: 1,
              treeSha256: EvidenceBenchmarkArtifactInventory.treeSha256(
                EvidenceBenchmarkHash.directory(adapterRoot),
              ),
            },
            exportName: "adapter",
          },
          cases: [
            {
              id: "FIXTURE-HTTP",
              criterionIds: ["REQ-ONE.AC-01"],
              kind: "http",
              routeState: null,
              viewports: [],
            },
            {
              id: "FIXTURE-BROWSER",
              criterionIds: ["REQ-ONE.AC-02"],
              kind: "browser",
              routeState: "fixture-state",
              viewports: ["mobile", "tablet", "desktop"],
            },
          ],
        },
        null,
        2,
      )}\n`,
    );
    const valid = await EvidenceBenchmarkHiddenAcceptance.run({
      benchmarkRoot: fixtureBenchmark,
      manifestPath,
      requirements,
      workspace,
      output: path.join(temporary, "hidden-valid"),
      qualityInput: provenance,
    });
    assert.equal(valid.status, "passed");
    assert.equal(valid.result?.browser.length, 3);
    await assert.rejects(
      () =>
        EvidenceBenchmarkHiddenAcceptance.run({
          benchmarkRoot: fixtureBenchmark,
          manifestPath,
          requirements,
          workspace,
          output: path.join(workspace, "hidden-overlap"),
          qualityInput: provenance,
        }),
      /must not overlap/u,
    );
    await assert.rejects(
      () =>
        EvidenceBenchmarkHiddenAcceptance.run({
          benchmarkRoot: fixtureBenchmark,
          manifestPath,
          requirements,
          workspace,
          output: path.join(temporary, "hidden-valid"),
          qualityInput: provenance,
        }),
      /output root must be new/u,
    );
    const missingPublicContract = await EvidenceBenchmarkHiddenAcceptance.run({
      benchmarkRoot,
      manifestPath: path.join(
        benchmarkRoot,
        "quality/hidden/todo.manifest.json",
      ),
      requirements: path.join(benchmarkRoot, "requirements/todo"),
      workspace,
      output: path.join(temporary, "hidden-missing-public-contract"),
      qualityInput: qualityInput(
        workspace,
        path.join(benchmarkRoot, "requirements/todo"),
      ),
    });
    assert.equal(missingPublicContract.status, "failed");
    assert.match(
      missingPublicContract.reason ?? "",
      /must expose one OpenAPI JSON document/u,
    );
    assert.equal(missingPublicContract.result, null);
    const incompleteManifest: Record<string, unknown> = JSON.parse(
      fs.readFileSync(manifestPath, "utf8"),
    ) as Record<string, unknown>;
    incompleteManifest.suiteId = "fixture-incomplete-v1";
    const incompletePath: string = path.join(
      fixtureBenchmark,
      "quality/hidden/incomplete.manifest.json",
    );
    write(incompletePath, `${JSON.stringify(incompleteManifest, null, 2)}\n`);
    const incomplete = await EvidenceBenchmarkHiddenAcceptance.run({
      benchmarkRoot: fixtureBenchmark,
      manifestPath: incompletePath,
      requirements,
      workspace,
      output: path.join(temporary, "hidden-incomplete"),
      qualityInput: provenance,
    });
    assert.equal(incomplete.status, "failed");
    assert.match(incomplete.reason ?? "", /exact frozen set/u);
    const extraManifest: Record<string, unknown> =
      structuredClone(incompleteManifest);
    extraManifest.suiteId = "fixture-extra-v1";
    const extraPath: string = path.join(
      fixtureBenchmark,
      "quality/hidden/extra.manifest.json",
    );
    write(extraPath, `${JSON.stringify(extraManifest, null, 2)}\n`);
    const extra = await EvidenceBenchmarkHiddenAcceptance.run({
      benchmarkRoot: fixtureBenchmark,
      manifestPath: extraPath,
      requirements,
      workspace,
      output: path.join(temporary, "hidden-extra"),
      qualityInput: provenance,
    });
    assert.equal(extra.status, "failed");
    assert.match(extra.reason ?? "", /fields are not the exact expected set/u);
    const invalidManifest: Record<string, unknown> =
      structuredClone(incompleteManifest);
    invalidManifest.cases = [];
    const invalidPath: string = path.join(
      fixtureBenchmark,
      "quality/hidden/invalid.manifest.json",
    );
    write(invalidPath, `${JSON.stringify(invalidManifest, null, 2)}\n`);
    assert.throws(
      () => EvidenceBenchmarkHiddenAcceptance.manifest(invalidPath),
      /at least one case/u,
    );
  }

  function fakeAdapterSource(): string {
    return `
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const digest = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
const viewports = {
  mobile: { width: 390, height: 844 },
  tablet: { width: 834, height: 1112 },
  desktop: { width: 1440, height: 900 },
};
const write = (location, bytes) => {
  fs.mkdirSync(path.dirname(location), { recursive: true });
  fs.writeFileSync(location, bytes);
};
const png = (width, height) => {
  const bytes = Buffer.alloc(24);
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(bytes, 0);
  bytes.writeUInt32BE(13, 8);
  bytes.write("IHDR", 12, "ascii");
  bytes.writeUInt32BE(width, 16);
  bytes.writeUInt32BE(height, 20);
  return bytes;
};
export const adapter = {
  schemaVersion: 1,
  async execute(input) {
    const hidden = [];
    const browser = [];
    if (input.manifest.suiteId.includes("incomplete"))
      return {
        schemaVersion: 1,
        input: input.input,
        suiteId: input.manifest.suiteId,
        subject: input.manifest.subject,
        workspaceSourceTreeSha256: input.workspaceSourceTreeSha256,
        runtime: null,
        hidden,
        browser,
      };
    for (const test of input.manifest.cases) {
      if (test.kind === "http") {
        const relative = "http/" + test.id + ".json";
        const content = Buffer.from(JSON.stringify({ passed: true }) + "\\n");
        write(path.join(input.output, relative), content);
        hidden.push({
          caseId: test.id,
          status: "passed",
          startedMonotonicNs: "1",
          completedMonotonicNs: "2",
          artifact: relative,
          artifactSha256: digest(content),
        });
      } else for (const viewport of test.viewports) {
        const dimensions = viewports[viewport];
        const screenshotRelative = "browser/" + test.id + "-" + viewport + ".png";
        const screenshot = png(dimensions.width, dimensions.height);
        write(path.join(input.output, screenshotRelative), screenshot);
        const axeRelative = "browser/" + test.id + "-" + viewport + ".axe.json";
        const axe = Buffer.from(JSON.stringify({
          engine: "axe-core",
          engineVersion: "4.10.0",
          rulesetSha256: "${"a".repeat(64)}",
          violations: [],
        }, null, 2) + "\\n");
        write(path.join(input.output, axeRelative), axe);
        const apiRelative = "browser/" + test.id + "-" + viewport + ".api.json";
        const api = Buffer.from(JSON.stringify({
          apiOrigin: "http://127.0.0.1:37001",
          requests: [{ method: "GET", path: "/api/profile", status: 200, nonce: "${"f".repeat(64)}" }],
        }, null, 2) + "\\n");
        write(path.join(input.output, apiRelative), api);
        const probes = [];
        if (viewport === "mobile") {
          for (const probe of [
            { kind: "reflow_320", width: 320, suffix: "reflow-320" },
            { kind: "text_zoom_200", width: 390, suffix: "text-zoom-200" },
          ]) {
            const relative = "browser/" + test.id + "-" + viewport + "." + probe.suffix + ".png";
            const content = png(probe.width, 844);
            write(path.join(input.output, relative), content);
            probes.push({
              kind: probe.kind,
              path: relative,
              sha256: digest(content),
              width: probe.width,
              height: 844,
              passed: true,
            });
          }
        }
        browser.push({
          caseId: test.id,
          viewport,
          routeState: test.routeState,
          requestedUrl: "http://127.0.0.1:4173/",
          finalUrl: "http://127.0.0.1:4173/",
          status: "passed",
          startedMonotonicNs: "3",
          completedMonotonicNs: "4",
          screenshot: {
            path: screenshotRelative,
            sha256: digest(screenshot),
            width: dimensions.width,
            height: dimensions.height,
          },
          accessibility: {
            artifact: axeRelative,
            sha256: digest(axe),
            engine: "axe-core",
            engineVersion: "4.10.0",
            rulesetSha256: "${"a".repeat(64)}",
            violations: 0,
          },
          integration: {
            artifact: apiRelative,
            sha256: digest(api),
            requests: 1,
          },
          probes,
        });
      }
    }
    const result = {
      schemaVersion: 1,
      input: input.input,
      suiteId: input.manifest.suiteId,
      subject: input.manifest.subject,
      workspaceSourceTreeSha256: input.workspaceSourceTreeSha256,
      runtime: null,
      hidden,
      browser,
    };
    if (input.manifest.suiteId.includes("extra")) result.extra = true;
    return result;
  },
};
`.trimStart();
  }

  function write(location: string, content: string): void {
    fs.mkdirSync(path.dirname(location), { recursive: true });
    fs.writeFileSync(location, content, "utf8");
  }

  function qualityInput(
    workspace: string,
    requirements: string,
  ): EvidenceBenchmarkQualityInput.IBound {
    return EvidenceBenchmarkQualityInput.create({
      runId: "todo-plain-quality-self-test",
      runManifestBytes: Buffer.from('{"fixture":true}\n', "utf8"),
      milestone: "t_done",
      sourceSnapshotFiles:
        EvidenceBenchmarkArtifactInventory.authoredFiles(workspace),
      subjectRequirementFiles: EvidenceBenchmarkHash.directory(requirements),
    });
  }
}
