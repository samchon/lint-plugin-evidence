import { spawn, spawnSync } from "node:child_process";
import type { ChildProcessWithoutNullStreams } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import path from "node:path";
import type { WriteStream } from "node:fs";

import { EvidenceBenchmarkHash } from "../EvidenceBenchmarkHash.ts";
import { EvidenceBenchmarkProcess } from "../EvidenceBenchmarkProcess.ts";
import { EvidenceBenchmarkProtocolValidator } from "../EvidenceBenchmarkProtocolValidator.ts";
import type { IEvidenceBenchmarkQualityGate } from "../structures/IEvidenceBenchmarkQualityGate.ts";

/** Owns a fresh generated-app runtime for one measured quality milestone. */
export namespace EvidenceBenchmarkRuntimeLease {
  const protocolRoot: string = path.resolve(
    import.meta.dirname,
    "../../protocol",
  );
  /** Inputs bound into the exact runtime lifecycle provenance. */
  export interface IAcquire {
    /** Generated project root. */
    workspace: string;
    /** Harness-owned directory outside the generated project. */
    runtimeRoot: string;
    /** Outer benchmark run identity. */
    runId: string;
    /** Subject whose generated application is running. */
    subject: IEvidenceBenchmarkQualityGate.Subject;
    /** Evidence or plain comparison arm. */
    arm: "evidence" | "plain";
    /** Snapshot milestone receiving a fresh runtime. */
    milestone: "t_done" | "t_dry";
    /** Exact run manifest digest. */
    runManifestSha256: string;
    /** Exact source snapshot digest. */
    workspaceSourceTreeSha256: string;
    /** Effective cell environment, including pinned caches and toolchain. */
    environment?: NodeJS.ProcessEnv;
    /** Relative pristine SQLite file copied for this milestone. */
    databaseSource?: string;
    /** Maximum readiness wait per process. */
    readinessTimeoutMs?: number;
    /** Grace period before owned child trees receive forced termination. */
    terminationGraceMs?: number;
  }

  /** Acquires two ephemeral ports, a database clone, and owned child trees. */
  export async function acquire(
    input: IAcquire,
  ): Promise<IEvidenceBenchmarkQualityGate.IRuntimeLease> {
    const workspace: string = regularDirectory(input.workspace, "workspace");
    assertSupportedHost();
    const runtimeRoot: string = outsideWorkspace(
      workspace,
      path.resolve(input.runtimeRoot),
    );
    digest(input.runManifestSha256, "run manifest");
    digest(input.workspaceSourceTreeSha256, "workspace source tree");
    nonblank(input.runId, "run ID");
    if (!["todo", "reddit", "shopping", "erp"].includes(input.subject))
      throw new Error("Runtime subject is unsupported.");
    if (input.arm !== "evidence" && input.arm !== "plain")
      throw new Error("Runtime arm is unsupported.");
    const instanceId: string = [
      safeToken(input.runId),
      input.milestone,
      crypto.randomUUID(),
    ].join("-");
    const leaseId: string = crypto.randomUUID();
    const terminationGraceMs: number = input.terminationGraceMs ?? 10_000;
    if (
      !Number.isInteger(terminationGraceMs) ||
      terminationGraceMs < 100 ||
      terminationGraceMs > 30_000
    )
      throw new Error(
        "Runtime termination grace must be 100..30,000 milliseconds.",
      );
    fs.mkdirSync(runtimeRoot, { recursive: true });
    const instanceRoot: string = path.join(runtimeRoot, instanceId);
    fs.mkdirSync(instanceRoot, { recursive: false });
    const privateRegistryRoot: string = path.join(
      runtimeRoot,
      "private-registry",
    );
    fs.mkdirSync(privateRegistryRoot, { recursive: true });
    const privateRegistryPath: string = path.join(
      privateRegistryRoot,
      `${leaseId}.json`,
    );
    const initialRegistryBytes: Buffer = canonical({
      schemaVersion: 1,
      state: "acquiring",
      instanceId,
      leaseId,
      runId: input.runId,
      subject: input.subject,
      arm: input.arm,
      milestone: input.milestone,
      control: null,
    });
    validateCanonicalArtifact(
      initialRegistryBytes,
      "schema/runtime-private-registry.schema.json",
      "initial runtime private recovery registry",
    );
    fs.writeFileSync(privateRegistryPath, initialRegistryBytes, {
      flag: "wx",
    });
    const databaseDirectory: string = path.join(instanceRoot, "database");
    fs.mkdirSync(databaseDirectory);
    const sourceRelative: string =
      input.databaseSource ?? "packages/backend/prisma/db.sqlite";
    const databaseSource: string = confinedRegularFile(
      workspace,
      sourceRelative,
      "pristine database",
    );
    const databaseClone: string = path.join(databaseDirectory, "db.sqlite");
    const databaseSidecars: string[] = ["-wal", "-shm", "-journal"].map(
      (suffix) => `${databaseSource}${suffix}`,
    );
    for (const sidecar of databaseSidecars)
      if (fs.existsSync(sidecar))
        throw new Error(
          `Pristine database has an unowned sidecar: ${path.basename(sidecar)}.`,
        );
    fs.copyFileSync(databaseSource, databaseClone, fs.constants.COPYFILE_EXCL);
    const databaseContentSha256: string =
      EvidenceBenchmarkHash.file(databaseClone);
    const databaseProvenanceBytes: Buffer = canonical({
      schemaVersion: 1,
      instanceId,
      leaseId,
      runId: input.runId,
      subject: input.subject,
      arm: input.arm,
      milestone: input.milestone,
      source: sourceRelative.replaceAll("\\", "/"),
      sourceSha256: EvidenceBenchmarkHash.file(databaseSource),
      clone: "database/db.sqlite",
      cloneContentSha256: databaseContentSha256,
    });
    const databaseCloneSha256: string = EvidenceBenchmarkHash.bytes(
      databaseProvenanceBytes,
    );
    validateCanonicalArtifact(
      databaseProvenanceBytes,
      "schema/runtime-database-provenance.schema.json",
      "runtime database provenance",
    );
    fs.writeFileSync(
      path.join(instanceRoot, "database-provenance.json"),
      databaseProvenanceBytes,
      { flag: "wx" },
    );
    let apiOrigin = "";
    let backendOrigin = "";
    let browserOrigin = "";
    let environment: NodeJS.ProcessEnv = {};
    let children: IChild[] = [];
    const retiredChildren: IChild[] = [];
    let portAllocationAttempts = 0;
    let cleaned: ICleanup | undefined;
    let requestProxy: IRequestProxy | undefined;
    let backendSocket: IBackendSocketIdentity | undefined;
    let promoted: IEvidenceBenchmarkQualityGate.IRuntimeEvidence | undefined =
      undefined;
    try {
      for (
        portAllocationAttempts = 1;
        portAllocationAttempts <= 4;
        ++portAllocationAttempts
      ) {
        const reservations: [
          IPortReservation,
          IPortReservation,
          IPortReservation,
        ] = await distinctPortReservations();
        const backendPort: number = reservations[0].port;
        const apiPort: number = reservations[1].port;
        const browserPort: number = reservations[2].port;
        backendOrigin = `http://127.0.0.1:${backendPort}`;
        apiOrigin = `http://127.0.0.1:${apiPort}`;
        browserOrigin = `http://127.0.0.1:${browserPort}`;
        environment = {
          ...allowlistedEnvironment(input.environment),
          API_PORT: String(backendPort),
          VITE_API_HOST: apiOrigin,
          VITE_API_SIMULATE: "false",
          CI: "1",
          NO_COLOR: "1",
        };
        fs.copyFileSync(databaseClone, databaseSource);
        const apiInvocation: EvidenceBenchmarkProcess.IInvocation =
          EvidenceBenchmarkProcess.pnpmInvocation(["run", "start"]);
        const browserInvocation: EvidenceBenchmarkProcess.IInvocation =
          EvidenceBenchmarkProcess.pnpmInvocation([
            "run",
            "dev:frontend",
            "--",
            "--host",
            "127.0.0.1",
            "--port",
            String(browserPort),
            "--strictPort",
          ]);
        children = [];
        try {
          await reservations[0].release();
          children.push(
            launch({
              role: "api",
              invocation: apiInvocation,
              workspace,
              environment,
              instanceRoot,
              attempt: portAllocationAttempts,
            }),
          );
          await reservations[1].release();
          requestProxy = await startRequestProxy({
            apiOrigin,
            backendOrigin,
          });
          await reservations[2].release();
          children.push(
            launch({
              role: "frontend",
              invocation: browserInvocation,
              workspace,
              environment,
              instanceRoot,
              attempt: portAllocationAttempts,
            }),
          );
          const apiChild: IChild | undefined = children[0];
          const browserChild: IChild | undefined = children[1];
          if (apiChild === undefined || browserChild === undefined)
            throw new Error("Runner failed to retain both owned processes.");
          await Promise.all([
            waitForOrigin(
              backendOrigin,
              apiChild,
              input.readinessTimeoutMs ?? 120_000,
            ),
            waitForOrigin(
              browserOrigin,
              browserChild,
              input.readinessTimeoutMs ?? 120_000,
            ),
          ]);
          backendSocket = validateBackendSocketOwnership(
            Number(new URL(backendOrigin).port),
            apiChild.process.pid,
          );
          const proxyReadiness: Response = await fetch(apiOrigin, {
            redirect: "manual",
            signal: AbortSignal.timeout(10_000),
          });
          await proxyReadiness.arrayBuffer();
          if (proxyReadiness.status >= 500)
            throw new Error("Runner request proxy did not reach the API.");
          break;
        } catch (error) {
          await Promise.all(
            reservations.map((reservation) => reservation.release()),
          );
          for (const child of children) {
            child.termination = await terminate(
              child.process,
              terminationGraceMs,
            );
            await child.logsClosed;
          }
          if (requestProxy !== undefined) {
            await requestProxy.close();
            requestProxy = undefined;
          }
          retiredChildren.push(...children);
          if (portAllocationAttempts >= 4 || !children.some(portCollision))
            throw error;
        }
      }
      if (
        children.length !== 2 ||
        portAllocationAttempts > 4 ||
        requestProxy === undefined ||
        backendSocket === undefined
      )
        throw new Error("Runtime failed to acquire collision-free ports.");
      const toolchain: IToolchainIdentity[] = resolveToolchain(
        EvidenceBenchmarkProcess.pnpmInvocation([]),
        environment,
      );
      const processControlBytes: Buffer = canonical({
        schemaVersion: 1,
        instanceId,
        leaseId,
        runId: input.runId,
        subject: input.subject,
        arm: input.arm,
        milestone: input.milestone,
        requestedProcesses: children.map((child) => ({
          role: child.role,
          command: child.command,
          arguments: child.arguments,
        })),
        effectiveEnvironment: Object.fromEntries(
          Object.entries(environment).sort(([left], [right]) =>
            Buffer.compare(
              Buffer.from(left, "utf8"),
              Buffer.from(right, "utf8"),
            ),
          ),
        ),
        toolchain: toolchain.map((entry) => ({
          role: entry.role,
          requested: entry.requested,
          realpath: entry.realpath,
          sha256: entry.sha256,
          version: entry.version,
        })),
      });
      validateCanonicalArtifact(
        processControlBytes,
        "schema/runtime-process-control.schema.json",
        "runtime private process control",
      );
      fs.writeFileSync(
        path.join(instanceRoot, "process-control-provenance.json"),
        processControlBytes,
        { flag: "wx" },
      );
      const privateControlPath: string = path.join(
        instanceRoot,
        "process-control-provenance.json",
      );
      const privateRegistryBytes: Buffer = canonical({
        schemaVersion: 1,
        state: "retained",
        instanceId,
        leaseId,
        runId: input.runId,
        subject: input.subject,
        arm: input.arm,
        milestone: input.milestone,
        control: {
          path: privateControlPath,
          byteLength: processControlBytes.byteLength,
          sha256: EvidenceBenchmarkHash.bytes(processControlBytes),
        },
      });
      validateCanonicalArtifact(
        privateRegistryBytes,
        "schema/runtime-private-registry.schema.json",
        "runtime private recovery registry",
      );
      fs.writeFileSync(privateRegistryPath, privateRegistryBytes, {
        flag: "w",
      });
      const publicToolchain = toolchain.map((entry) => ({
        role: entry.role,
        basename: path.basename(entry.realpath),
        sha256: entry.sha256,
        version: entry.version,
      }));
      const inheritedEnvironment: NodeJS.ProcessEnv = allowlistedEnvironment(
        input.environment,
      );
      const environmentPolicy = {
        policyId: "benchmark-runtime-environment-allowlist-v1",
        inheritedKeys: Object.keys(inheritedEnvironment).sort(compareUtf8),
        privateInherited: {
          count: Object.keys(inheritedEnvironment).length,
          confinementVerified: true,
        },
        injected: {
          API_PORT: environment.API_PORT,
          CI: "1",
          NO_COLOR: "1",
          VITE_API_HOST: apiOrigin,
          VITE_API_SIMULATE: "false",
        },
        rejectedSecretNamePattern:
          "(?:^|_)(?:API_KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL)(?:_|$)",
      };
      const processProvenanceBytes: Buffer = canonical({
        schemaVersion: 1,
        instanceId,
        leaseId,
        runId: input.runId,
        subject: input.subject,
        arm: input.arm,
        milestone: input.milestone,
        runManifestSha256: input.runManifestSha256,
        workspaceSourceTreeSha256: input.workspaceSourceTreeSha256,
        database: {
          source: sourceRelative.replaceAll("\\", "/"),
          cloneProvenanceSha256: databaseCloneSha256,
          cloneContentSha256: databaseContentSha256,
        },
        origins: {
          api: apiOrigin,
          backend: backendOrigin,
          browser: browserOrigin,
        },
        requestProxy: {
          sessionId: requestProxy.sessionId,
          nonce: requestProxy.nonce,
        },
        backendSocket,
        localAuditControlSha256:
          EvidenceBenchmarkHash.bytes(processControlBytes),
        packageManager: `pnpm@${EvidenceBenchmarkProcess.PNPM_VERSION}`,
        toolchain: publicToolchain,
        toolchainManifestSha256: EvidenceBenchmarkHash.bytes(
          canonical(publicToolchain),
        ),
        environmentPolicy,
        environmentPolicySha256: EvidenceBenchmarkHash.bytes(
          canonical(environmentPolicy),
        ),
        portAllocationAttempts,
        retiredPortCollisionProcesses: retiredChildren.map((child) => ({
          role: child.role,
          pid: child.process.pid,
          stdoutSha256: EvidenceBenchmarkHash.file(child.stdout),
          stderrSha256: EvidenceBenchmarkHash.file(child.stderr),
        })),
        processes: children.map((child) => ({
          role: child.role,
          command: path.basename(child.command),
          arguments: child.arguments.map((argument) =>
            path.isAbsolute(argument) ? path.basename(argument) : argument,
          ),
          cwd: ".",
          pid: child.process.pid,
          environment: Object.entries(environment)
            .map(([name, value]) => ({
              name,
              ...(Object.hasOwn(environmentPolicy.injected, name)
                ? {
                    classification: "injected_public",
                    value: value ?? "",
                  }
                : { classification: "inherited_private" }),
            }))
            .sort((left, right) =>
              Buffer.compare(
                Buffer.from(left.name, "utf8"),
                Buffer.from(right.name, "utf8"),
              ),
            ),
          stdout: path.basename(child.stdout),
          stderr: path.basename(child.stderr),
        })),
      });
      const processProvenanceSha256: string = EvidenceBenchmarkHash.bytes(
        processProvenanceBytes,
      );
      validatePublicProcessProvenance(processProvenanceBytes);
      fs.writeFileSync(
        path.join(instanceRoot, "process-provenance.json"),
        processProvenanceBytes,
        { flag: "wx" },
      );
      const cleanup = async (): Promise<{
        cleanupSealBytes: Uint8Array;
        cleanupSealSha256: string;
        serverRequestLedgerBytes: Uint8Array;
        serverRequestLedgerSha256: string;
      }> => {
        cleaned ??= await cleanupOwned({
          instanceId,
          leaseId,
          runId: input.runId,
          subject: input.subject,
          arm: input.arm,
          milestone: input.milestone,
          instanceRoot,
          databaseSource,
          databaseClone,
          databaseSidecars,
          expectedDatabaseSha256: databaseContentSha256,
          children: [...retiredChildren, ...children],
          requestProxy,
          backendSocket,
          terminationGraceMs,
        });
        return {
          cleanupSealBytes: cleaned.bytes,
          cleanupSealSha256: cleaned.sha256,
          serverRequestLedgerBytes: cleaned.serverRequestLedgerBytes,
          serverRequestLedgerSha256: cleaned.serverRequestLedgerSha256,
        };
      };
      const promoteEvidence = async (
        output: string,
      ): Promise<IEvidenceBenchmarkQualityGate.IRuntimeEvidence> => {
        if (promoted !== undefined) {
          validatePromotedEvidence(output, promoted);
          return promoted;
        }
        const seal = await cleanup();
        promoted = promoteRuntimeEvidence({
          output,
          instanceId,
          leaseId,
          runId: input.runId,
          subject: input.subject,
          arm: input.arm,
          milestone: input.milestone,
          runManifestSha256: input.runManifestSha256,
          workspaceSourceTreeSha256: input.workspaceSourceTreeSha256,
          database: {
            bytes: databaseProvenanceBytes,
            sha256: databaseCloneSha256,
          },
          process: {
            bytes: processProvenanceBytes,
            sha256: processProvenanceSha256,
          },
          cleanup: {
            bytes: seal.cleanupSealBytes,
            sha256: seal.cleanupSealSha256,
          },
          serverRequestLedger: {
            bytes: seal.serverRequestLedgerBytes,
            sha256: seal.serverRequestLedgerSha256,
          },
          instanceRoot,
        });
        validatePromotedEvidence(output, promoted);
        return promoted;
      };
      return {
        instanceId,
        leaseId,
        runId: input.runId,
        subject: input.subject,
        arm: input.arm,
        milestone: input.milestone,
        apiOrigin,
        browserOrigin,
        requestNonce: requestProxy.nonce,
        databaseCloneSha256,
        processProvenanceBytes,
        processProvenanceSha256,
        privateControlEvidence: {
          path: privateControlPath,
          registryPath: privateRegistryPath,
          byteLength: processControlBytes.byteLength,
          sha256: EvidenceBenchmarkHash.bytes(processControlBytes),
        },
        assertFresh: async (): Promise<void> => {
          if (cleaned !== undefined)
            throw new Error("Runtime lease was already cleaned.");
          if (
            !fs.existsSync(databaseClone) ||
            EvidenceBenchmarkHash.file(databaseClone) !== databaseContentSha256
          )
            throw new Error("Runtime database clone is absent or drifted.");
          if (
            EvidenceBenchmarkHash.bytes(databaseProvenanceBytes) !==
              databaseCloneSha256 ||
            EvidenceBenchmarkHash.file(
              path.join(instanceRoot, "database-provenance.json"),
            ) !== databaseCloneSha256
          )
            throw new Error("Runtime database provenance drifted.");
          if (
            EvidenceBenchmarkHash.bytes(processProvenanceBytes) !==
              processProvenanceSha256 ||
            EvidenceBenchmarkHash.file(
              path.join(instanceRoot, "process-provenance.json"),
            ) !== processProvenanceSha256
          )
            throw new Error("Runtime process provenance drifted.");
          for (const child of children)
            if (
              child.process.pid === undefined ||
              child.process.exitCode !== null ||
              child.process.signalCode !== null
            )
              throw new Error(
                `Runner-owned ${child.role} process is no longer fresh.`,
              );
        },
        cleanup,
        promoteEvidence,
      };
    } catch (error) {
      let cleanupFailure: unknown;
      try {
        await cleanupOwned({
          instanceId,
          leaseId,
          runId: input.runId,
          subject: input.subject,
          arm: input.arm,
          milestone: input.milestone,
          instanceRoot,
          databaseSource,
          databaseClone,
          databaseSidecars,
          expectedDatabaseSha256: databaseContentSha256,
          children: [...retiredChildren, ...children],
          requestProxy,
          backendSocket,
          terminationGraceMs,
        });
      } catch (cleanupError) {
        cleanupFailure = cleanupError;
      }
      const aggregate = new AggregateError(
        [error, cleanupFailure].filter((entry) => entry !== undefined),
        `Runtime acquisition failed; retained instance: ${instanceRoot}; private recovery registry: ${privateRegistryPath}.`,
      );
      if (
        cleanupFailure instanceof Error &&
        cleanupFailure.name === "EvidenceBenchmarkRuntimeLivenessUnknownError"
      )
        aggregate.name = "EvidenceBenchmarkRuntimeLivenessUnknownError";
      else aggregate.name = "EvidenceBenchmarkRuntimeAcquireError";
      throw aggregate;
    }
  }

  interface IChild {
    role: "api" | "frontend";
    command: string;
    arguments: string[];
    process: ChildProcessWithoutNullStreams;
    stdout: string;
    stderr: string;
    logsClosed: Promise<void>;
    failure: Error | undefined;
    termination: ITerminationAudit | undefined;
  }

  interface ICleanup {
    bytes: Buffer;
    sha256: string;
    serverRequestLedgerBytes: Buffer;
    serverRequestLedgerSha256: string;
  }

  interface IRequestProxy {
    nonce: string;
    sessionId: string;
    requests: IServerRequest[];
    close(): Promise<void>;
  }

  interface IServerRequest {
    sequence: number;
    nonce: string;
    method: string;
    path: string;
    status: number;
  }

  interface IBackendSocketIdentity {
    port: number;
    ownerPid: number;
    rootPid: number;
    ancestry: number[];
  }

  interface ITerminationAudit {
    method: "already_closed" | "taskkill" | "process_group_signal";
    forced: boolean;
    commandStatus: number | null;
    stderrSha256: string;
  }

  interface IToolchainIdentity {
    role: "node" | "corepack_launcher" | "corepack_entrypoint";
    requested: string;
    realpath: string;
    sha256: string;
    version: string;
  }

  interface IPromotedSource {
    bytes: Uint8Array;
    sha256: string;
  }

  interface IRuntimeBinding {
    instanceId: string;
    leaseId: string;
    runId: string;
    subject: IEvidenceBenchmarkQualityGate.Subject;
    arm: "evidence" | "plain";
    milestone: "t_done" | "t_dry";
  }

  function launch(input: {
    role: IChild["role"];
    invocation: EvidenceBenchmarkProcess.IInvocation;
    workspace: string;
    environment: NodeJS.ProcessEnv;
    instanceRoot: string;
    attempt: number;
  }): IChild {
    const child: ChildProcessWithoutNullStreams = spawn(
      input.invocation.command,
      input.invocation.arguments,
      {
        cwd: input.workspace,
        env: input.environment,
        detached: process.platform !== "win32",
        shell: false,
        windowsHide: true,
        stdio: "pipe",
      },
    );
    const stdout: string = path.join(
      input.instanceRoot,
      `attempt-${input.attempt}-${input.role}.stdout.log`,
    );
    const stderr: string = path.join(
      input.instanceRoot,
      `attempt-${input.attempt}-${input.role}.stderr.log`,
    );
    const stdoutStream: WriteStream = fs.createWriteStream(stdout, {
      flags: "wx",
    });
    const stderrStream: WriteStream = fs.createWriteStream(stderr, {
      flags: "wx",
    });
    child.stdout.pipe(stdoutStream);
    child.stderr.pipe(stderrStream);
    const logsClosed: Promise<void> = Promise.all([
      streamFinished(stdoutStream),
      streamFinished(stderrStream),
    ]).then(() => undefined);
    const output: IChild = {
      role: input.role,
      command: input.invocation.command,
      arguments: [...input.invocation.arguments],
      process: child,
      stdout,
      stderr,
      logsClosed,
      failure: undefined,
      termination: undefined,
    };
    child.once("error", (error: Error) => {
      output.failure = error;
    });
    return output;
  }

  async function waitForOrigin(
    origin: string,
    child: IChild,
    timeoutMs: number,
  ): Promise<void> {
    if (
      !Number.isInteger(timeoutMs) ||
      timeoutMs < 1_000 ||
      timeoutMs > 600_000
    )
      throw new Error(
        "Runtime readiness timeout must be 1,000..600,000 milliseconds.",
      );
    const deadline: number = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (
        child.failure !== undefined ||
        child.process.exitCode !== null ||
        child.process.signalCode !== null
      )
        throw new Error(
          `Runner-owned ${child.role} process exited before readiness${
            child.failure === undefined ? "." : `: ${child.failure.message}`
          }`,
        );
      try {
        const response: Response = await fetch(origin, {
          redirect: "manual",
          signal: AbortSignal.timeout(2_000),
        });
        await response.body?.cancel();
        return;
      } catch {
        await new Promise<void>((resolve) => setTimeout(resolve, 100));
      }
    }
    throw new Error(
      `Runner-owned ${child.role} process did not become ready at ${origin}.`,
    );
  }

  function portCollision(child: IChild): boolean {
    return [child.stdout, child.stderr].some(
      (file) =>
        fs.existsSync(file) &&
        /EADDRINUSE|address already in use|port is already in use/iu.test(
          fs.readFileSync(file, "utf8"),
        ),
    );
  }

  async function cleanupOwned(input: {
    instanceId: string;
    leaseId: string;
    runId: string;
    subject: IEvidenceBenchmarkQualityGate.Subject;
    arm: "evidence" | "plain";
    milestone: "t_done" | "t_dry";
    instanceRoot: string;
    databaseSource: string;
    databaseClone: string;
    databaseSidecars: string[];
    expectedDatabaseSha256: string;
    children: IChild[];
    requestProxy: IRequestProxy | undefined;
    backendSocket: IBackendSocketIdentity | undefined;
    terminationGraceMs: number;
  }): Promise<ICleanup> {
    const processResults = [];
    const failures: string[] = [];
    for (const child of [...input.children].reverse()) {
      try {
        child.termination ??= await terminate(
          child.process,
          input.terminationGraceMs,
        );
        if (!(await closesWithin(child.logsClosed, 10_000)))
          throw livenessUnknown(
            child.process.pid ?? process.pid,
            "owned process log pipes did not close after termination",
          );
      } catch (error) {
        failures.push(
          `${child.role}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
      processResults.push({
        role: child.role,
        pid: child.process.pid,
        exitCode: child.process.exitCode,
        signalCode: child.process.signalCode,
        termination: child.termination,
      });
    }
    failures.push(
      ...(await waitForLivenessGone(
        input.children,
        input.backendSocket,
        10_000,
      )),
    );
    if (failures.length !== 0)
      throw livenessUnknown(
        input.children[0]?.process.pid ?? process.pid,
        `one or more owned child trees remain unproved: ${failures.join(
          " | ",
        )}`,
      );
    if (input.requestProxy === undefined) {
      for (const sidecar of input.databaseSidecars)
        if (fs.existsSync(sidecar)) fs.rmSync(sidecar, { force: false });
      if (fs.existsSync(input.databaseClone)) {
        fs.copyFileSync(input.databaseClone, input.databaseSource);
        fs.rmSync(input.databaseClone, { force: false });
      }
      throw new Error("Runtime request proxy was not retained.");
    }
    await input.requestProxy.close();
    const serverRequestLedgerBytes: Buffer = canonical({
      schemaVersion: 1,
      instanceId: input.instanceId,
      leaseId: input.leaseId,
      runId: input.runId,
      subject: input.subject,
      arm: input.arm,
      milestone: input.milestone,
      sessionId: input.requestProxy.sessionId,
      nonce: input.requestProxy.nonce,
      requests: [...input.requestProxy.requests].sort(
        (left, right) => left.sequence - right.sequence,
      ),
    });
    validateCanonicalArtifact(
      serverRequestLedgerBytes,
      "schema/runtime-server-request-ledger.schema.json",
      "runtime server request ledger",
    );
    const serverRequestLedgerSha256: string = EvidenceBenchmarkHash.bytes(
      serverRequestLedgerBytes,
    );
    const serverLedgerPath: string = path.join(
      input.instanceRoot,
      "server-request-ledger.json",
    );
    if (!fs.existsSync(serverLedgerPath))
      fs.writeFileSync(serverLedgerPath, serverRequestLedgerBytes, {
        flag: "wx",
      });
    else if (
      EvidenceBenchmarkHash.file(serverLedgerPath) !== serverRequestLedgerSha256
    )
      throw new Error(
        "Runtime server request ledger changed after publication.",
      );
    let databaseRemoved = false;
    const observedSidecars = input.databaseSidecars
      .filter((sidecar) => fs.existsSync(sidecar))
      .map((sidecar) => ({
        path: path.basename(sidecar),
        sha256: EvidenceBenchmarkHash.file(sidecar),
      }));
    for (const sidecar of input.databaseSidecars)
      if (fs.existsSync(sidecar)) fs.rmSync(sidecar, { force: false });
    if (fs.existsSync(input.databaseClone)) {
      assertChildPath(input.instanceRoot, input.databaseClone);
      fs.copyFileSync(input.databaseClone, input.databaseSource);
      fs.rmSync(input.databaseClone, { force: false });
      databaseRemoved = !fs.existsSync(input.databaseClone);
    } else databaseRemoved = true;
    const databaseRestoredSha256: string = EvidenceBenchmarkHash.file(
      input.databaseSource,
    );
    if (databaseRestoredSha256 !== input.expectedDatabaseSha256)
      throw new Error("Runtime database restoration digest drifted.");
    if (input.databaseSidecars.some((sidecar) => fs.existsSync(sidecar)))
      throw new Error("Runtime database sidecar survived cleanup.");
    const logFiles = input.children
      .flatMap((child) => [child.stdout, child.stderr])
      .map((file) => ({
        path: path.basename(file),
        sha256: fs.existsSync(file)
          ? EvidenceBenchmarkHash.file(file)
          : EvidenceBenchmarkHash.bytes(Buffer.alloc(0)),
      }))
      .sort((left, right) =>
        Buffer.compare(
          Buffer.from(left.path, "utf8"),
          Buffer.from(right.path, "utf8"),
        ),
      );
    const bytes: Buffer = canonical({
      schemaVersion: 1,
      instanceId: input.instanceId,
      leaseId: input.leaseId,
      runId: input.runId,
      subject: input.subject,
      arm: input.arm,
      milestone: input.milestone,
      serverRequestLedgerSha256,
      databaseRemoved,
      databaseRestore: {
        restoredSha256: databaseRestoredSha256,
        journalMode: observedSidecars.some((entry) =>
          entry.path.endsWith("-wal"),
        )
          ? "wal"
          : observedSidecars.some((entry) => entry.path.endsWith("-journal"))
            ? "delete"
            : "none-observed",
        removedSidecars: observedSidecars,
      },
      processes: processResults,
      logs: logFiles,
    });
    validateCanonicalArtifact(
      bytes,
      "schema/runtime-cleanup-seal.schema.json",
      "runtime cleanup seal",
    );
    const sha256: string = EvidenceBenchmarkHash.bytes(bytes);
    const artifact: string = path.join(input.instanceRoot, "cleanup-seal.json");
    if (fs.existsSync(artifact)) {
      if (EvidenceBenchmarkHash.file(artifact) !== sha256)
        throw new Error("Runtime cleanup seal changed after publication.");
    } else fs.writeFileSync(artifact, bytes, { flag: "wx" });
    return {
      bytes,
      sha256,
      serverRequestLedgerBytes,
      serverRequestLedgerSha256,
    };
  }

  async function terminate(
    child: ChildProcessWithoutNullStreams,
    graceMs: number,
  ): Promise<ITerminationAudit> {
    if (
      child.pid === undefined ||
      child.exitCode !== null ||
      child.signalCode !== null
    )
      return {
        method: "already_closed",
        forced: false,
        commandStatus: null,
        stderrSha256: EvidenceBenchmarkHash.bytes(Buffer.alloc(0)),
      };
    const closed: Promise<void> = new Promise((resolve) =>
      child.once("close", () => resolve()),
    );
    if (process.platform === "win32") {
      const killed = spawnSync(
        "taskkill",
        ["/pid", String(child.pid), "/t", "/f"],
        {
          timeout: 10_000,
          shell: false,
          windowsHide: true,
          encoding: "utf8",
          stdio: "pipe",
        },
      );
      if (killed.error !== undefined)
        throw livenessUnknown(child.pid, killed.error.message);
      if (!(await closesOrTreeGone(child.pid, closed, 10_000)))
        throw livenessUnknown(
          child.pid,
          `taskkill status ${String(
            killed.status,
          )} did not close the owned process tree`,
        );
      return {
        method: "taskkill",
        forced: true,
        commandStatus: killed.status,
        stderrSha256: EvidenceBenchmarkHash.bytes(killed.stderr ?? ""),
      };
    } else {
      try {
        process.kill(-child.pid, "SIGTERM");
      } catch {
        child.kill("SIGTERM");
      }
    }
    let forced = false;
    if (!(await closesWithin(closed, graceMs))) {
      forced = true;
      try {
        process.kill(-child.pid, "SIGKILL");
      } catch {
        child.kill("SIGKILL");
      }
      if (!(await closesWithin(closed, 10_000)))
        throw livenessUnknown(
          child.pid,
          "owned process tree did not close after forced termination",
        );
    }
    return {
      method: "process_group_signal",
      forced,
      commandStatus: null,
      stderrSha256: EvidenceBenchmarkHash.bytes(Buffer.alloc(0)),
    };
  }

  async function closesWithin(
    closed: Promise<void>,
    timeoutMs: number,
  ): Promise<boolean> {
    return Promise.race([
      closed.then(() => true),
      new Promise<boolean>((resolve) =>
        setTimeout(() => resolve(false), timeoutMs),
      ),
    ]);
  }

  async function closesOrTreeGone(
    rootPid: number,
    closed: Promise<void>,
    timeoutMs: number,
  ): Promise<boolean> {
    const deadline: number = Date.now() + timeoutMs;
    for (;;) {
      if (!processTreeContains(rootPid)) return true;
      if (await closesWithin(closed, Math.min(100, timeoutMs))) return true;
      if (Date.now() >= deadline) return false;
    }
  }

  async function waitForLivenessGone(
    children: IChild[],
    backendSocket: IBackendSocketIdentity | undefined,
    timeoutMs: number,
  ): Promise<string[]> {
    const deadline: number = Date.now() + timeoutMs;
    for (;;) {
      const failures: string[] = [];
      for (const child of children)
        if (
          child.process.pid !== undefined &&
          processTreeContains(child.process.pid)
        )
          failures.push(
            `${child.role}: owned process tree ${child.process.pid} remains alive`,
          );
      if (
        backendSocket !== undefined &&
        socketOwnerSnapshot(backendSocket.port).owners.length !== 0
      )
        failures.push(
          `api: backend listener ${backendSocket.port} remains alive`,
        );
      if (failures.length === 0 || Date.now() >= deadline) return failures;
      await new Promise<void>((resolve) => setTimeout(resolve, 100));
    }
  }

  function livenessUnknown(pid: number, reason: string): Error {
    const error = new Error(
      `Runtime cleanup liveness_unknown for owned PID ${pid}: ${reason}.`,
    );
    error.name = "EvidenceBenchmarkRuntimeLivenessUnknownError";
    return error;
  }

  interface IPortReservation {
    port: number;
    release(): Promise<void>;
  }

  async function distinctPortReservations(): Promise<
    [IPortReservation, IPortReservation, IPortReservation]
  > {
    const reservations: IPortReservation[] = [];
    while (reservations.length < 3) {
      const candidate: IPortReservation = await reservePort();
      if (reservations.some((entry) => entry.port === candidate.port))
        await candidate.release();
      else reservations.push(candidate);
    }
    const first = reservations[0];
    const second = reservations[1];
    const third = reservations[2];
    if (first === undefined || second === undefined || third === undefined)
      throw new Error("Runtime did not retain three distinct ports.");
    return [first, second, third];
  }

  async function startRequestProxy(input: {
    apiOrigin: string;
    backendOrigin: string;
  }): Promise<IRequestProxy> {
    const nonce: string = crypto.randomBytes(32).toString("hex");
    const sessionId: string = crypto.randomUUID();
    const requests: IServerRequest[] = [];
    let nextSequence = 1;
    const backend: URL = new URL(input.backendOrigin);
    const api: URL = new URL(input.apiOrigin);
    const server: http.Server = http.createServer((request, response) => {
      const target = http.request(
        {
          hostname: backend.hostname,
          port: Number(backend.port),
          method: request.method,
          path: request.url,
          headers: {
            ...request.headers,
            host: backend.host,
            "x-evidence-runtime-session": sessionId,
          },
        },
        (upstream) => {
          const sequence: number = nextSequence++;
          const headers = {
            ...upstream.headers,
            "access-control-expose-headers": [
              upstream.headers["access-control-expose-headers"],
              "x-evidence-runtime-nonce",
            ]
              .filter((value) => value !== undefined)
              .join(", "),
            "x-evidence-runtime-nonce": nonce,
          };
          response.writeHead(upstream.statusCode ?? 502, headers);
          upstream.pipe(response);
          upstream.once("end", () =>
            requests.push({
              sequence,
              nonce,
              method: request.method ?? "GET",
              path: `${new URL(request.url ?? "/", input.apiOrigin).pathname}${new URL(request.url ?? "/", input.apiOrigin).search}`,
              status: upstream.statusCode ?? 502,
            }),
          );
        },
      );
      target.once("error", () => {
        response.writeHead(502, {
          "content-type": "text/plain",
          "x-evidence-runtime-nonce": nonce,
        });
        response.end("runtime backend unavailable\n");
        requests.push({
          sequence: nextSequence++,
          nonce,
          method: request.method ?? "GET",
          path: `${new URL(request.url ?? "/", input.apiOrigin).pathname}${new URL(request.url ?? "/", input.apiOrigin).search}`,
          status: 502,
        });
      });
      request.pipe(target);
    });
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(Number(api.port), api.hostname, resolve);
    });
    let closed = false;
    return {
      nonce,
      sessionId,
      requests,
      close: async (): Promise<void> => {
        if (closed) return;
        closed = true;
        await new Promise<void>((resolve, reject) =>
          server.close((error) =>
            error === undefined ? resolve() : reject(error),
          ),
        );
      },
    };
  }

  /** Proves that a listening backend socket belongs to the spawned child tree. */
  export function validateBackendSocketOwnership(
    port: number,
    rootPid: number | undefined,
  ): IBackendSocketIdentity {
    if (
      !Number.isInteger(port) ||
      port < 1 ||
      port > 65_535 ||
      rootPid === undefined ||
      !Number.isInteger(rootPid) ||
      rootPid < 1
    )
      throw new Error("Backend socket ownership input is invalid.");
    const ownership = socketOwnerSnapshot(port);
    for (const ownerPid of ownership.owners) {
      const ancestry: number[] = [];
      let current: number | undefined = ownerPid;
      const seen: Set<number> = new Set();
      while (current !== undefined && current > 0 && !seen.has(current)) {
        ancestry.push(current);
        if (current === rootPid) return { port, ownerPid, rootPid, ancestry };
        seen.add(current);
        current = ownership.parents.get(current) ?? processParent(current);
      }
    }
    throw new Error(
      `Backend listener on port ${port} is not owned by child tree ${rootPid}.`,
    );
  }

  function socketOwnerSnapshot(port: number): {
    owners: number[];
    parents: Map<number, number>;
  } {
    if (process.platform === "win32") return windowsSocketOwnership(port);
    if (process.platform === "linux") return procSocketOwnership(port);
    if (process.platform === "darwin")
      return {
        owners: lsofSocketOwners(port),
        parents: psProcessParents(),
      };
    throw new Error(
      `Runtime socket ownership is unsupported on ${process.platform}.`,
    );
  }

  function processTreeContains(rootPid: number): boolean {
    const parents: Map<number, number> =
      process.platform === "win32"
        ? windowsProcessParents()
        : process.platform === "linux"
          ? procProcessParents()
          : process.platform === "darwin"
            ? psProcessParents()
            : new Map();
    for (const pid of parents.keys()) {
      let current: number | undefined = pid;
      const seen: Set<number> = new Set();
      while (current !== undefined && current > 0 && !seen.has(current)) {
        if (current === rootPid) return true;
        seen.add(current);
        current = parents.get(current);
      }
    }
    return false;
  }

  function windowsProcessParents(): Map<number, number> {
    const result = spawnSync(
      "powershell",
      [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        "Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId | ConvertTo-Json -Compress",
      ],
      {
        encoding: "utf8",
        shell: false,
        windowsHide: true,
        timeout: 10_000,
      },
    );
    if (result.error !== undefined || result.status !== 0)
      throw new Error("Windows process tree could not be read.");
    const parsed = JSON.parse(result.stdout) as
      | { ProcessId: number; ParentProcessId: number }
      | { ProcessId: number; ParentProcessId: number }[];
    const rows = Array.isArray(parsed) ? parsed : [parsed];
    return new Map(
      rows.map((entry) => [entry.ProcessId, entry.ParentProcessId]),
    );
  }

  function procProcessParents(): Map<number, number> {
    const output: Map<number, number> = new Map();
    for (const entry of fs.readdirSync("/proc"))
      if (/^[0-9]+$/u.test(entry)) {
        const pid: number = Number(entry);
        const parent: number | undefined = processParent(pid);
        if (parent !== undefined) output.set(pid, parent);
      }
    return output;
  }

  function lsofSocketOwners(port: number): number[] {
    const result = spawnSync(
      "lsof",
      ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-F", "p"],
      {
        encoding: "utf8",
        shell: false,
        timeout: 10_000,
      },
    );
    if (
      result.error !== undefined ||
      (result.status !== 0 && result.status !== 1)
    )
      throw new Error("macOS backend socket ownership could not be read.");
    return result.stdout
      .split("\n")
      .filter((line) => /^p[0-9]+$/u.test(line))
      .map((line) => Number(line.slice(1)));
  }

  function psProcessParents(): Map<number, number> {
    const result = spawnSync("ps", ["-axo", "pid=,ppid="], {
      encoding: "utf8",
      shell: false,
      timeout: 10_000,
    });
    if (result.error !== undefined || result.status !== 0)
      throw new Error("macOS process tree could not be read.");
    return new Map(
      result.stdout
        .split("\n")
        .map((line) => line.trim().split(/\s+/u))
        .filter(
          (columns) =>
            columns.length === 2 &&
            /^[0-9]+$/u.test(columns[0] ?? "") &&
            /^[0-9]+$/u.test(columns[1] ?? ""),
        )
        .map((columns) => [Number(columns[0]), Number(columns[1])]),
    );
  }

  function assertSupportedHost(): void {
    if (!["win32", "linux", "darwin"].includes(process.platform))
      throw new Error(
        `Benchmark runtime ownership proof is unsupported on ${process.platform}.`,
      );
    if (process.platform === "linux" && !fs.existsSync("/proc/net/tcp"))
      throw new Error(
        "Benchmark runtime ownership proof requires Linux procfs.",
      );
  }

  function windowsSocketOwnership(port: number): {
    owners: number[];
    parents: Map<number, number>;
  } {
    const script = [
      `$owners=@(Get-NetTCPConnection -State Listen -LocalPort ${port} -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess)`,
      "$processes=@(Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId)",
      "@{owners=$owners;processes=$processes}|ConvertTo-Json -Compress -Depth 4",
    ].join(";");
    const result = spawnSync(
      "powershell",
      ["-NoProfile", "-NonInteractive", "-Command", script],
      {
        encoding: "utf8",
        shell: false,
        windowsHide: true,
        timeout: 10_000,
      },
    );
    if (result.error !== undefined || result.status !== 0)
      throw new Error("Windows backend socket ownership could not be read.");
    const parsed = JSON.parse(result.stdout) as {
      owners: number | number[];
      processes: {
        ProcessId: number;
        ParentProcessId: number;
      }[];
    };
    const owners: number[] = Array.isArray(parsed.owners)
      ? parsed.owners
      : [parsed.owners];
    const parents: Map<number, number> = new Map(
      (Array.isArray(parsed.processes)
        ? parsed.processes
        : [parsed.processes]
      ).map((entry) => [entry.ProcessId, entry.ParentProcessId]),
    );
    return {
      owners: owners.filter((owner) => Number.isInteger(owner)),
      parents,
    };
  }

  function procSocketOwnership(port: number): {
    owners: number[];
    parents: Map<number, number>;
  } {
    if (!fs.existsSync("/proc/net/tcp"))
      throw new Error("POSIX backend socket ownership requires /proc.");
    const portHex: string = port.toString(16).toUpperCase().padStart(4, "0");
    const inodes: Set<string> = new Set();
    for (const table of ["/proc/net/tcp", "/proc/net/tcp6"])
      if (fs.existsSync(table))
        for (const line of fs.readFileSync(table, "utf8").split("\n")) {
          const columns: string[] = line.trim().split(/\s+/u);
          if (
            columns[1]?.endsWith(`:${portHex}`) === true &&
            columns[3] === "0A" &&
            columns[9] !== undefined
          )
            inodes.add(columns[9]);
        }
    const output: Map<number, number> = new Map();
    for (const entry of fs.readdirSync("/proc"))
      if (/^[0-9]+$/u.test(entry)) {
        const pid: number = Number(entry);
        const descriptors: string = `/proc/${entry}/fd`;
        try {
          if (
            fs.readdirSync(descriptors).some((descriptor) => {
              try {
                const target: string = fs.readlinkSync(
                  path.join(descriptors, descriptor),
                );
                const match: RegExpMatchArray | null = target.match(
                  /^socket:\[([0-9]+)\]$/u,
                );
                return match !== null && inodes.has(match[1] ?? "");
              } catch {
                return false;
              }
            })
          )
            output.set(pid, processParent(pid) ?? 0);
        } catch {
          // Processes can exit or deny fd enumeration during the snapshot.
        }
      }
    return { owners: [...output.keys()], parents: output };
  }

  function processParent(pid: number): number | undefined {
    if (process.platform === "win32") return undefined;
    try {
      const stat: string = fs.readFileSync(`/proc/${pid}/stat`, "utf8");
      const suffix: string = stat.slice(stat.lastIndexOf(")") + 2);
      const fields: string[] = suffix.split(" ");
      const parent: number = Number(fields[1]);
      return Number.isInteger(parent) && parent > 0 ? parent : undefined;
    } catch {
      return undefined;
    }
  }

  function streamFinished(stream: WriteStream): Promise<void> {
    return new Promise((resolve, reject) => {
      stream.once("error", reject);
      stream.once("close", resolve);
    });
  }

  async function reservePort(): Promise<IPortReservation> {
    const server: net.Server = net.createServer();
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    const address: net.AddressInfo | string | null = server.address();
    if (address === null || typeof address === "string") {
      server.close();
      throw new Error("Ephemeral runtime port allocation failed.");
    }
    let released = false;
    return {
      port: address.port,
      release: async (): Promise<void> => {
        if (released) return;
        released = true;
        await new Promise<void>((resolve, reject) =>
          server.close((error) =>
            error === undefined ? resolve() : reject(error),
          ),
        );
      },
    };
  }

  /** Re-reads every public runtime artifact and rejects substitution or escape. */
  export function validatePromotedEvidence(
    output: string,
    evidence: IEvidenceBenchmarkQualityGate.IRuntimeEvidence,
  ): void {
    exactObjectKeys(
      evidence as unknown as Record<string, unknown>,
      [
        "instanceId",
        "leaseId",
        "runId",
        "subject",
        "arm",
        "milestone",
        "runManifestSha256",
        "workspaceSourceTreeSha256",
        "inventory",
        "databaseProvenance",
        "processProvenance",
        "cleanupSeal",
        "serverRequestLedger",
        "logs",
      ],
      "runtime evidence",
    );
    const references: IEvidenceBenchmarkQualityGate.IArtifactReference[] = [
      evidence.inventory,
      evidence.databaseProvenance,
      evidence.processProvenance,
      evidence.cleanupSeal,
      evidence.serverRequestLedger,
      ...evidence.logs.map(({ role: _role, ...reference }) => reference),
    ];
    for (const reference of references) validateReference(output, reference);
    for (const reference of [
      evidence.inventory,
      evidence.databaseProvenance,
      evidence.processProvenance,
      evidence.cleanupSeal,
      evidence.serverRequestLedger,
    ])
      exactObjectKeys(
        reference as unknown as Record<string, unknown>,
        ["path", "byteLength", "sha256"],
        "runtime evidence reference",
      );
    for (const reference of evidence.logs)
      exactObjectKeys(
        reference as unknown as Record<string, unknown>,
        ["role", "path", "byteLength", "sha256"],
        "runtime log reference",
      );
    const databaseBytes = fs.readFileSync(
      referenceLocation(output, evidence.databaseProvenance.path),
    );
    const processBytes = fs.readFileSync(
      referenceLocation(output, evidence.processProvenance.path),
    );
    const cleanupBytes = fs.readFileSync(
      referenceLocation(output, evidence.cleanupSeal.path),
    );
    const serverBytes = fs.readFileSync(
      referenceLocation(output, evidence.serverRequestLedger.path),
    );
    const database = validateRuntimeArtifact<
      IRuntimeBinding & {
        cloneContentSha256: string;
        sourceSha256: string;
      }
    >(
      databaseBytes,
      "schema/runtime-database-provenance.schema.json",
      "promoted runtime database provenance",
    );
    validatePublicProcessProvenance(processBytes);
    const processRecord = validateRuntimeArtifact<
      IRuntimeBinding & {
        database: { cloneProvenanceSha256: string; cloneContentSha256: string };
        requestProxy: { sessionId: string; nonce: string };
        origins: { backend: string };
        backendSocket: IBackendSocketIdentity;
        runManifestSha256: string;
        workspaceSourceTreeSha256: string;
        processes: {
          role: string;
          pid: number;
          environment: { name: string }[];
        }[];
        toolchain: { role: string }[];
      }
    >(
      processBytes,
      "schema/runtime-process-provenance.schema.json",
      "promoted runtime process provenance",
    );
    const cleanup = validateRuntimeArtifact<
      IRuntimeBinding & {
        serverRequestLedgerSha256: string;
        databaseRestore: { restoredSha256: string };
        logs: { path: string; sha256: string }[];
      }
    >(
      cleanupBytes,
      "schema/runtime-cleanup-seal.schema.json",
      "promoted runtime cleanup seal",
    );
    const server = validateRuntimeArtifact<
      IRuntimeBinding & {
        sessionId: string;
        nonce: string;
        requests: IServerRequest[];
      }
    >(
      serverBytes,
      "schema/runtime-server-request-ledger.schema.json",
      "promoted runtime server request ledger",
    );
    const inventoryBytes: Buffer = fs.readFileSync(
      referenceLocation(output, evidence.inventory.path),
    );
    const inventory = EvidenceBenchmarkProtocolValidator.validateBytes<{
      instanceId: string;
      leaseId: string;
      runId: string;
      subject: IEvidenceBenchmarkQualityGate.Subject;
      arm: "evidence" | "plain";
      milestone: "t_done" | "t_dry";
      runManifestSha256: string;
      workspaceSourceTreeSha256: string;
      artifacts: {
        kind: string;
        role: string | null;
        path: string;
        byteLength: number;
        sha256: string;
      }[];
    }>(
      protocolRoot,
      "schema/runtime-evidence-inventory.schema.json",
      inventoryBytes,
      "runtime evidence inventory",
    );
    if (!canonical(inventory).equals(inventoryBytes))
      throw new Error("Runtime evidence inventory bytes are not canonical.");
    if (
      inventory.instanceId !== evidence.instanceId ||
      inventory.leaseId !== evidence.leaseId ||
      inventory.runId !== evidence.runId ||
      inventory.subject !== evidence.subject ||
      inventory.arm !== evidence.arm ||
      inventory.milestone !== evidence.milestone ||
      inventory.runManifestSha256 !== evidence.runManifestSha256 ||
      inventory.workspaceSourceTreeSha256 !== evidence.workspaceSourceTreeSha256
    )
      throw new Error("Runtime evidence inventory names another lease.");
    const expected = [
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
    if (JSON.stringify(inventory.artifacts) !== JSON.stringify(expected))
      throw new Error("Runtime evidence inventory does not bind its result.");
    const bindings: IRuntimeBinding[] = [
      database,
      processRecord,
      cleanup,
      server,
    ];
    if (
      bindings.some(
        (binding) =>
          binding.instanceId !== evidence.instanceId ||
          binding.leaseId !== evidence.leaseId ||
          binding.runId !== evidence.runId ||
          binding.subject !== evidence.subject ||
          binding.arm !== evidence.arm ||
          binding.milestone !== evidence.milestone ||
          !sameRuntimeBinding(binding, bindings[0]),
      )
    )
      throw new Error("Promoted runtime artifacts splice different leases.");
    if (
      processRecord.database.cloneProvenanceSha256 !==
        evidence.databaseProvenance.sha256 ||
      processRecord.database.cloneContentSha256 !==
        database.cloneContentSha256 ||
      database.sourceSha256 !== database.cloneContentSha256 ||
      cleanup.databaseRestore.restoredSha256 !== database.cloneContentSha256 ||
      cleanup.serverRequestLedgerSha256 !==
        evidence.serverRequestLedger.sha256 ||
      processRecord.requestProxy.sessionId !== server.sessionId ||
      processRecord.requestProxy.nonce !== server.nonce ||
      processRecord.runManifestSha256 !== evidence.runManifestSha256 ||
      processRecord.workspaceSourceTreeSha256 !==
        evidence.workspaceSourceTreeSha256 ||
      processRecord.runId !== evidence.runId ||
      processRecord.subject !== evidence.subject ||
      processRecord.arm !== evidence.arm ||
      processRecord.milestone !== evidence.milestone
    )
      throw new Error(
        "Promoted runtime artifact digest chain is inconsistent.",
      );
    const apiProcess = processRecord.processes.find(
      (entry) => entry.role === "api",
    );
    if (
      apiProcess === undefined ||
      processRecord.backendSocket.port !==
        Number(new URL(processRecord.origins.backend).port) ||
      processRecord.backendSocket.rootPid !== apiProcess.pid ||
      processRecord.backendSocket.ancestry[0] !==
        processRecord.backendSocket.ownerPid ||
      processRecord.backendSocket.ancestry.at(-1) !==
        processRecord.backendSocket.rootPid
    )
      throw new Error("Promoted backend socket ownership chain is invalid.");
    const expectedLogs = evidence.logs.map(({ role, sha256 }) => ({
      path: role,
      sha256,
    }));
    if (JSON.stringify(cleanup.logs) !== JSON.stringify(expectedLogs))
      throw new Error("Promoted runtime cleanup omitted or replaced logs.");
    if (
      new Set(processRecord.toolchain.map((entry) => entry.role)).size !== 3 ||
      new Set(processRecord.processes.map((entry) => entry.role)).size !== 2 ||
      processRecord.processes.some(
        (entry) =>
          new Set(entry.environment.map((variable) => variable.name)).size !==
          entry.environment.length,
      )
    )
      throw new Error("Promoted runtime process identities are not unique.");
    if (
      server.requests.length === 0 ||
      server.requests.some(
        (request) =>
          request.nonce !== server.nonce ||
          request.sequence < 1 ||
          request.status < 100 ||
          request.status > 599,
      )
    )
      throw new Error("Promoted runtime server request chain is invalid.");
  }

  /** Validates the local-only absolute-vector recovery registry and preimage. */
  export function validatePrivateControlEvidence(
    evidence: IEvidenceBenchmarkQualityGate.IRuntimeLease["privateControlEvidence"],
    publicEvidence: IEvidenceBenchmarkQualityGate.IRuntimeEvidence,
    output: string,
  ): void {
    for (const location of [evidence.path, evidence.registryPath])
      if (
        !path.isAbsolute(location) ||
        !fs.existsSync(location) ||
        fs.lstatSync(location).isSymbolicLink() ||
        !fs.statSync(location).isFile()
      )
        throw new Error(
          "Private runtime control evidence is absent or unsafe.",
        );
    const controlBytes: Buffer = fs.readFileSync(evidence.path);
    if (
      controlBytes.byteLength !== evidence.byteLength ||
      EvidenceBenchmarkHash.bytes(controlBytes) !== evidence.sha256
    )
      throw new Error("Private runtime control evidence was substituted.");
    const control = validateRuntimeArtifact<IRuntimeBinding>(
      controlBytes,
      "schema/runtime-process-control.schema.json",
      "private runtime control evidence",
    );
    const registry = validateRuntimeArtifact<{
      instanceId: string;
      leaseId: string;
      runId: string;
      subject: IEvidenceBenchmarkQualityGate.Subject;
      arm: "evidence" | "plain";
      milestone: "t_done" | "t_dry";
      state: "acquiring" | "retained";
      control: { path: string; byteLength: number; sha256: string } | null;
    }>(
      fs.readFileSync(evidence.registryPath),
      "schema/runtime-private-registry.schema.json",
      "private runtime recovery registry",
    );
    if (
      registry.state !== "retained" ||
      registry.control === null ||
      !sameRuntimeBinding(control, registry) ||
      control.instanceId !== publicEvidence.instanceId ||
      control.leaseId !== publicEvidence.leaseId ||
      control.runId !== publicEvidence.runId ||
      control.subject !== publicEvidence.subject ||
      control.arm !== publicEvidence.arm ||
      control.milestone !== publicEvidence.milestone ||
      registry.control.path !== evidence.path ||
      registry.control.byteLength !== evidence.byteLength ||
      registry.control.sha256 !== evidence.sha256
    )
      throw new Error(
        "Private runtime registry does not bind its control bytes.",
      );
    const process = validateRuntimeArtifact<{
      localAuditControlSha256: string;
    }>(
      fs.readFileSync(
        referenceLocation(output, publicEvidence.processProvenance.path),
      ),
      "schema/runtime-process-provenance.schema.json",
      "public runtime process provenance for private audit",
    );
    if (process.localAuditControlSha256 !== evidence.sha256)
      throw new Error("Public runtime evidence names another private audit.");
  }

  function promoteRuntimeEvidence(input: {
    output: string;
    instanceId: string;
    leaseId: string;
    runId: string;
    subject: IEvidenceBenchmarkQualityGate.Subject;
    arm: "evidence" | "plain";
    milestone: "t_done" | "t_dry";
    runManifestSha256: string;
    workspaceSourceTreeSha256: string;
    database: IPromotedSource;
    process: IPromotedSource;
    cleanup: IPromotedSource;
    serverRequestLedger: IPromotedSource;
    instanceRoot: string;
  }): IEvidenceBenchmarkQualityGate.IRuntimeEvidence {
    const cleanup = EvidenceBenchmarkProtocolValidator.validateBytes<{
      logs: { path: string; sha256: string }[];
    }>(
      protocolRoot,
      "schema/runtime-cleanup-seal.schema.json",
      input.cleanup.bytes,
      "runtime cleanup seal promotion",
    );
    const databaseProvenance = publishCas(
      input.output,
      input.database.bytes,
      input.database.sha256,
    );
    const processProvenance = publishCas(
      input.output,
      input.process.bytes,
      input.process.sha256,
    );
    const cleanupSeal = publishCas(
      input.output,
      input.cleanup.bytes,
      input.cleanup.sha256,
    );
    const serverRequestLedger = publishCas(
      input.output,
      input.serverRequestLedger.bytes,
      input.serverRequestLedger.sha256,
    );
    const logs = cleanup.logs.map((entry) => {
      const source: string = path.join(input.instanceRoot, entry.path);
      assertChildPath(input.instanceRoot, source);
      if (
        !fs.existsSync(source) ||
        fs.lstatSync(source).isSymbolicLink() ||
        !fs.statSync(source).isFile()
      )
        throw new Error(`Runtime evidence source is absent: ${entry.path}.`);
      return {
        role: entry.path,
        ...publishCas(input.output, fs.readFileSync(source), entry.sha256),
      };
    });
    const artifacts = [
      {
        kind: "database_provenance",
        role: null,
        ...databaseProvenance,
      },
      {
        kind: "process_provenance",
        role: null,
        ...processProvenance,
      },
      { kind: "cleanup_seal", role: null, ...cleanupSeal },
      {
        kind: "server_request_ledger",
        role: null,
        ...serverRequestLedger,
      },
      ...logs.map(({ role, ...reference }) => ({
        kind: "process_log",
        role,
        ...reference,
      })),
    ];
    const inventoryBytes: Buffer = canonical({
      schemaVersion: 1,
      instanceId: input.instanceId,
      leaseId: input.leaseId,
      runId: input.runId,
      subject: input.subject,
      arm: input.arm,
      milestone: input.milestone,
      runManifestSha256: input.runManifestSha256,
      workspaceSourceTreeSha256: input.workspaceSourceTreeSha256,
      artifacts,
    });
    validateCanonicalArtifact(
      inventoryBytes,
      "schema/runtime-evidence-inventory.schema.json",
      "runtime evidence inventory",
    );
    return {
      instanceId: input.instanceId,
      leaseId: input.leaseId,
      runId: input.runId,
      subject: input.subject,
      arm: input.arm,
      milestone: input.milestone,
      runManifestSha256: input.runManifestSha256,
      workspaceSourceTreeSha256: input.workspaceSourceTreeSha256,
      inventory: publishCas(
        input.output,
        inventoryBytes,
        EvidenceBenchmarkHash.bytes(inventoryBytes),
      ),
      databaseProvenance,
      processProvenance,
      cleanupSeal,
      serverRequestLedger,
      logs,
    };
  }

  function publishCas(
    output: string,
    bytes: Uint8Array,
    expectedSha256: string,
  ): IEvidenceBenchmarkQualityGate.IArtifactReference {
    const content: Buffer = Buffer.from(bytes);
    if (EvidenceBenchmarkHash.bytes(content) !== expectedSha256)
      throw new Error(
        "Runtime evidence source digest drifted before promotion.",
      );
    const root: string = regularOutputDirectory(output);
    const relative: string = `runtime/cas/sha256/${expectedSha256}.bin`;
    const target: string = path.join(root, ...relative.split("/"));
    fs.mkdirSync(path.dirname(target), { recursive: true });
    if (fs.existsSync(target)) {
      if (
        fs.lstatSync(target).isSymbolicLink() ||
        !fs.statSync(target).isFile() ||
        EvidenceBenchmarkHash.file(target) !== expectedSha256
      )
        throw new Error("Runtime CAS member was substituted.");
    } else {
      const temporary: string = path.join(
        path.dirname(target),
        `.promote-${crypto.randomUUID()}.tmp`,
      );
      fs.writeFileSync(temporary, content, { flag: "wx" });
      try {
        fs.renameSync(temporary, target);
      } catch (error) {
        if (!fs.existsSync(target)) throw error;
        if (EvidenceBenchmarkHash.file(target) !== expectedSha256) throw error;
        fs.rmSync(temporary, { force: false });
      }
    }
    return {
      path: relative,
      byteLength: content.byteLength,
      sha256: expectedSha256,
    };
  }

  function validateReference(
    output: string,
    reference: IEvidenceBenchmarkQualityGate.IArtifactReference,
  ): void {
    digest(reference.sha256, "runtime evidence reference");
    if (!Number.isSafeInteger(reference.byteLength) || reference.byteLength < 0)
      throw new Error("Runtime evidence byte length is invalid.");
    const expectedPath = `runtime/cas/sha256/${reference.sha256}.bin`;
    if (reference.path !== expectedPath)
      throw new Error("Runtime evidence reference is foreign or unconfined.");
    const location: string = referenceLocation(output, reference.path);
    if (
      !fs.existsSync(location) ||
      fs.lstatSync(location).isSymbolicLink() ||
      !fs.statSync(location).isFile()
    )
      throw new Error(
        `Runtime evidence artifact is absent: ${reference.path}.`,
      );
    const bytes: Buffer = fs.readFileSync(location);
    if (
      bytes.byteLength !== reference.byteLength ||
      EvidenceBenchmarkHash.bytes(bytes) !== reference.sha256
    )
      throw new Error(`Runtime evidence artifact drifted: ${reference.path}.`);
  }

  function referenceLocation(output: string, relative: string): string {
    if (
      relative.length === 0 ||
      relative.includes("\\") ||
      path.posix.isAbsolute(relative) ||
      relative.split("/").some((part) => part === "" || part === "..")
    )
      throw new Error("Runtime evidence reference is foreign or unconfined.");
    const root: string = regularOutputDirectory(output);
    const location: string = path.resolve(root, ...relative.split("/"));
    assertChildPath(root, location);
    let current: string = root;
    for (const segment of relative.split("/")) {
      current = path.join(current, segment);
      if (fs.existsSync(current) && fs.lstatSync(current).isSymbolicLink())
        throw new Error("Runtime evidence reference crossed a symbolic link.");
    }
    return location;
  }

  function regularOutputDirectory(output: string): string {
    const root: string = path.resolve(output);
    if (
      !fs.existsSync(root) ||
      fs.lstatSync(root).isSymbolicLink() ||
      !fs.statSync(root).isDirectory()
    )
      throw new Error("Runtime evidence output root is absent or symbolic.");
    return root;
  }

  function resolveToolchain(
    invocation: EvidenceBenchmarkProcess.IInvocation,
    environment: NodeJS.ProcessEnv,
  ): IToolchainIdentity[] {
    const nodePath: string = fs.realpathSync(process.execPath);
    const launcherPath: string = resolveExecutable(
      invocation.command,
      environment,
    );
    const entrypointPath: string =
      process.platform === "win32" && invocation.arguments[0] !== undefined
        ? fs.realpathSync(invocation.arguments[0])
        : launcherPath;
    const corepackVersion: string = invocationVersion(
      invocation.command,
      [...(process.platform === "win32" ? [entrypointPath] : []), "--version"],
      environment,
    );
    return [
      fileIdentity("node", process.execPath, nodePath, process.version),
      fileIdentity(
        "corepack_launcher",
        invocation.command,
        launcherPath,
        corepackVersion,
      ),
      fileIdentity(
        "corepack_entrypoint",
        process.platform === "win32"
          ? (invocation.arguments[0] ?? "")
          : invocation.command,
        entrypointPath,
        corepackVersion,
      ),
    ];
  }

  function fileIdentity(
    role: IToolchainIdentity["role"],
    requested: string,
    realpath: string,
    version: string,
  ): IToolchainIdentity {
    if (
      !path.isAbsolute(realpath) ||
      !fs.existsSync(realpath) ||
      !fs.statSync(realpath).isFile()
    )
      throw new Error(`Runtime ${role} did not resolve to a regular file.`);
    return {
      role,
      requested,
      realpath,
      sha256: EvidenceBenchmarkHash.file(realpath),
      version: nonblank(version, `${role} version`),
    };
  }

  function resolveExecutable(
    command: string,
    environment: NodeJS.ProcessEnv,
  ): string {
    if (path.isAbsolute(command)) return fs.realpathSync(command);
    const pathValue: string = environmentValue(environment, "PATH") ?? "";
    const extensions: string[] =
      process.platform === "win32"
        ? (environmentValue(environment, "PATHEXT") ?? ".COM;.EXE;.BAT;.CMD")
            .split(";")
            .filter((extension) => extension.length !== 0)
        : [""];
    for (const directory of pathValue.split(path.delimiter))
      for (const extension of extensions) {
        const candidate: string = path.join(
          directory,
          process.platform === "win32" && path.extname(command).length === 0
            ? `${command}${extension}`
            : command,
        );
        if (fs.existsSync(candidate) && fs.statSync(candidate).isFile())
          return fs.realpathSync(candidate);
      }
    throw new Error(
      `Runtime executable did not resolve through PATH: ${command}.`,
    );
  }

  function invocationVersion(
    command: string,
    arguments_: string[],
    environment: NodeJS.ProcessEnv,
  ): string {
    const result = spawnSync(command, arguments_, {
      env: environment,
      shell: false,
      windowsHide: true,
      encoding: "utf8",
      timeout: 10_000,
    });
    if (result.error !== undefined || result.status !== 0)
      throw new Error("Runtime Corepack version could not be established.");
    return nonblank(result.stdout.trim(), "Corepack version");
  }

  function canonical(value: unknown): Buffer {
    return Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
  }

  function exactObjectKeys(
    value: Record<string, unknown>,
    keys: string[],
    label: string,
  ): void {
    const actual: string[] = Object.keys(value).sort(compareUtf8);
    const expected: string[] = [...keys].sort(compareUtf8);
    if (JSON.stringify(actual) !== JSON.stringify(expected))
      throw new Error(`${label} fields are not the exact expected set.`);
  }

  function validateRuntimeArtifact<T>(
    bytes: Uint8Array,
    schema: string,
    label: string,
  ): T {
    const value: T = EvidenceBenchmarkProtocolValidator.validateBytes<T>(
      protocolRoot,
      schema,
      bytes,
      label,
    );
    if (!canonical(value).equals(Buffer.from(bytes)))
      throw new Error(`${label} bytes are not canonical.`);
    return value;
  }

  function sameRuntimeBinding(
    left: IRuntimeBinding,
    right: IRuntimeBinding | undefined,
  ): boolean {
    return (
      right !== undefined &&
      left.instanceId === right.instanceId &&
      left.leaseId === right.leaseId &&
      left.runId === right.runId &&
      left.subject === right.subject &&
      left.arm === right.arm &&
      left.milestone === right.milestone
    );
  }

  /** Validates public process evidence without consulting private control bytes. */
  export function validatePublicProcessProvenance(bytes: Uint8Array): void {
    const value = EvidenceBenchmarkProtocolValidator.validateBytes<{
      origins: { api: string; backend: string };
      toolchain: { role: string }[];
      toolchainManifestSha256: string;
      environmentPolicy: {
        inheritedKeys: string[];
        privateInherited: {
          count: number;
          confinementVerified: boolean;
        };
        injected: Record<string, string>;
        rejectedSecretNamePattern: string;
      };
      environmentPolicySha256: string;
      processes: {
        environment: {
          name: string;
          classification: "inherited_private" | "injected_public";
          value?: string;
        }[];
      }[];
    }>(
      protocolRoot,
      "schema/runtime-process-provenance.schema.json",
      bytes,
      "runtime process provenance",
    );
    if (!canonical(value).equals(Buffer.from(bytes)))
      throw new Error("Runtime process provenance bytes are not canonical.");
    if (
      EvidenceBenchmarkHash.bytes(canonical(value.toolchain)) !==
      value.toolchainManifestSha256
    )
      throw new Error("Runtime public toolchain manifest digest drifted.");
    if (
      EvidenceBenchmarkHash.bytes(canonical(value.environmentPolicy)) !==
      value.environmentPolicySha256
    )
      throw new Error("Runtime public environment policy digest drifted.");
    if (
      value.environmentPolicy.injected.API_PORT !==
        new URL(value.origins.backend).port ||
      value.environmentPolicy.injected.VITE_API_HOST !== value.origins.api
    )
      throw new Error("Runtime public environment policy mismatches origins.");
    const expectedNames: string[] = [
      ...value.environmentPolicy.inheritedKeys,
      ...Object.keys(value.environmentPolicy.injected),
    ].sort(compareUtf8);
    const secretPattern = new RegExp(
      value.environmentPolicy.rejectedSecretNamePattern,
      "iu",
    );
    if (
      new Set(value.toolchain.map((entry) => entry.role)).size !== 3 ||
      value.processes.some((entry) => {
        const names = entry.environment
          .map((variable) => variable.name)
          .sort(compareUtf8);
        const values = new Map(
          entry.environment.map((variable) => [variable.name, variable.value]),
        );
        return (
          value.environmentPolicy.privateInherited.confinementVerified !==
            true ||
          value.environmentPolicy.privateInherited.count !==
            value.environmentPolicy.inheritedKeys.length ||
          JSON.stringify(names) !== JSON.stringify(expectedNames) ||
          names.some((name) => secretPattern.test(name)) ||
          entry.environment.some(
            (variable) =>
              (Object.hasOwn(value.environmentPolicy.injected, variable.name) &&
                variable.classification !== "injected_public") ||
              (!Object.hasOwn(
                value.environmentPolicy.injected,
                variable.name,
              ) &&
                (variable.classification !== "inherited_private" ||
                  variable.value !== undefined)),
          ) ||
          Object.entries(value.environmentPolicy.injected).some(
            ([name, expected]) => values.get(name) !== expected,
          )
        );
      })
    )
      throw new Error("Runtime public environment manifest is inconsistent.");
  }

  function compareUtf8(left: string, right: string): number {
    return Buffer.compare(
      Buffer.from(left, "utf8"),
      Buffer.from(right, "utf8"),
    );
  }

  function validateCanonicalArtifact(
    bytes: Buffer,
    schema: string,
    label: string,
  ): void {
    const value: unknown =
      EvidenceBenchmarkProtocolValidator.validateBytes<unknown>(
        protocolRoot,
        schema,
        bytes,
        label,
      );
    if (!canonical(value).equals(bytes))
      throw new Error(`${label} bytes are not canonical.`);
  }

  function allowlistedEnvironment(
    override: NodeJS.ProcessEnv | undefined,
  ): NodeJS.ProcessEnv {
    const allowed = [
      "APPDATA",
      "COMSPEC",
      "GOCACHE",
      "GOTMPDIR",
      "HOME",
      "LOCALAPPDATA",
      "npm_config_store_dir",
      "PATH",
      "PATHEXT",
      "SHELL",
      "SystemRoot",
      "TEMP",
      "TMP",
      "TMPDIR",
      "TTSC_CACHE_DIR",
      "TTSC_GO_CACHE_DIR",
      "USERPROFILE",
    ];
    const output: NodeJS.ProcessEnv = {};
    for (const key of allowed) {
      const value =
        environmentValue(override, key) ?? environmentValue(process.env, key);
      if (value !== undefined) output[key] = value;
    }
    return output;
  }

  function environmentValue(
    source: NodeJS.ProcessEnv | undefined,
    expected: string,
  ): string | undefined {
    if (source === undefined) return undefined;
    const key = Object.keys(source).find(
      (candidate) => candidate.toLowerCase() === expected.toLowerCase(),
    );
    return key === undefined ? undefined : source[key];
  }

  function confinedRegularFile(
    root: string,
    relative: string,
    label: string,
  ): string {
    if (
      relative.length === 0 ||
      relative.includes("\\") ||
      path.posix.isAbsolute(relative) ||
      relative.split("/").some((part) => part === "" || part === "..")
    )
      throw new Error(`${label} path is not confined.`);
    const location: string = path.resolve(root, ...relative.split("/"));
    assertChildPath(root, location);
    if (
      !fs.existsSync(location) ||
      fs.lstatSync(location).isSymbolicLink() ||
      !fs.statSync(location).isFile()
    )
      throw new Error(`${label} is absent or symbolic.`);
    return location;
  }

  function regularDirectory(input: string, label: string): string {
    const value: string = path.resolve(input);
    if (
      !fs.existsSync(value) ||
      fs.lstatSync(value).isSymbolicLink() ||
      !fs.statSync(value).isDirectory()
    )
      throw new Error(`${label} is absent or symbolic.`);
    return value;
  }

  function outsideWorkspace(workspace: string, runtimeRoot: string): string {
    const relation: string = path.relative(workspace, runtimeRoot);
    const reverse: string = path.relative(runtimeRoot, workspace);
    if (
      relation === "" ||
      (!path.isAbsolute(relation) &&
        relation !== ".." &&
        !relation.startsWith(`..${path.sep}`)) ||
      (!path.isAbsolute(reverse) &&
        reverse !== ".." &&
        !reverse.startsWith(`..${path.sep}`))
    )
      throw new Error("Runtime artifact root must not overlap the workspace.");
    return runtimeRoot;
  }

  function assertChildPath(root: string, child: string): void {
    const relation: string = path.relative(
      path.resolve(root),
      path.resolve(child),
    );
    if (
      relation === "" ||
      path.isAbsolute(relation) ||
      relation === ".." ||
      relation.startsWith(`..${path.sep}`)
    )
      throw new Error("Runtime lifecycle path escaped its owned root.");
  }

  function safeToken(input: string): string {
    const output: string = input.replaceAll(/[^A-Za-z0-9_.-]/gu, "-");
    return output.length === 0 ? "run" : output.slice(0, 80);
  }

  function nonblank(input: string, label: string): string {
    if (typeof input !== "string" || input.trim().length === 0)
      throw new Error(`${label} must be nonblank.`);
    return input;
  }

  function digest(input: string, label: string): void {
    if (!/^[a-f0-9]{64}$/u.test(input))
      throw new Error(`${label} must be a lowercase SHA-256 digest.`);
  }
}
