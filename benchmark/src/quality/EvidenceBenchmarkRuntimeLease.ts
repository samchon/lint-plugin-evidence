import { spawn, spawnSync } from "node:child_process";
import type { ChildProcessWithoutNullStreams } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import type { WriteStream } from "node:fs";

import { EvidenceBenchmarkHash } from "../EvidenceBenchmarkHash.ts";
import { EvidenceBenchmarkProcess } from "../EvidenceBenchmarkProcess.ts";
import type { IEvidenceBenchmarkQualityGate } from "../structures/IEvidenceBenchmarkQualityGate.ts";

/** Owns a fresh generated-app runtime for one measured quality milestone. */
export namespace EvidenceBenchmarkRuntimeLease {
  /** Inputs bound into the exact runtime lifecycle provenance. */
  export interface IAcquire {
    /** Generated project root. */
    workspace: string;
    /** Harness-owned directory outside the generated project. */
    runtimeRoot: string;
    /** Outer benchmark run identity. */
    runId: string;
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
    const runtimeRoot: string = outsideWorkspace(
      workspace,
      path.resolve(input.runtimeRoot),
    );
    digest(input.runManifestSha256, "run manifest");
    digest(input.workspaceSourceTreeSha256, "workspace source tree");
    nonblank(input.runId, "run ID");
    const instanceId: string = [
      safeToken(input.runId),
      input.milestone,
      crypto.randomUUID(),
    ].join("-");
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
    fs.copyFileSync(databaseSource, databaseClone, fs.constants.COPYFILE_EXCL);
    const databaseContentSha256: string =
      EvidenceBenchmarkHash.file(databaseClone);
    const databaseProvenanceBytes: Buffer = canonical({
      schemaVersion: 1,
      instanceId,
      runId: input.runId,
      milestone: input.milestone,
      source: sourceRelative.replaceAll("\\", "/"),
      sourceSha256: EvidenceBenchmarkHash.file(databaseSource),
      clone: "database/db.sqlite",
      cloneContentSha256: databaseContentSha256,
    });
    const databaseCloneSha256: string = EvidenceBenchmarkHash.bytes(
      databaseProvenanceBytes,
    );
    fs.writeFileSync(
      path.join(instanceRoot, "database-provenance.json"),
      databaseProvenanceBytes,
      { flag: "wx" },
    );
    let apiOrigin = "";
    let browserOrigin = "";
    let environment: NodeJS.ProcessEnv = {};
    let children: IChild[] = [];
    const retiredChildren: IChild[] = [];
    let portAllocationAttempts = 0;
    let cleaned: ICleanup | undefined;
    try {
      for (
        portAllocationAttempts = 1;
        portAllocationAttempts <= 4;
        ++portAllocationAttempts
      ) {
        const reservations: [IPortReservation, IPortReservation] =
          await distinctPortReservations();
        const apiPort: number = reservations[0].port;
        const browserPort: number = reservations[1].port;
        apiOrigin = `http://127.0.0.1:${apiPort}`;
        browserOrigin = `http://127.0.0.1:${browserPort}`;
        environment = {
          ...allowlistedEnvironment(input.environment),
          API_PORT: String(apiPort),
          VITE_API_HOST: apiOrigin,
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
              apiOrigin,
              apiChild,
              input.readinessTimeoutMs ?? 120_000,
            ),
            waitForOrigin(
              browserOrigin,
              browserChild,
              input.readinessTimeoutMs ?? 120_000,
            ),
          ]);
          break;
        } catch (error) {
          await Promise.all(
            reservations.map((reservation) => reservation.release()),
          );
          for (const child of children) {
            await terminate(child.process, terminationGraceMs);
            await child.logsClosed;
          }
          retiredChildren.push(...children);
          if (portAllocationAttempts >= 4 || !children.some(portCollision))
            throw error;
        }
      }
      if (children.length !== 2 || portAllocationAttempts > 4)
        throw new Error("Runtime failed to acquire collision-free ports.");
      const processProvenanceBytes: Buffer = canonical({
        schemaVersion: 1,
        instanceId,
        runId: input.runId,
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
          browser: browserOrigin,
        },
        portAllocationAttempts,
        retiredPortCollisionProcesses: retiredChildren.map((child) => ({
          role: child.role,
          pid: child.process.pid,
          stdoutSha256: EvidenceBenchmarkHash.file(child.stdout),
          stderrSha256: EvidenceBenchmarkHash.file(child.stderr),
        })),
        processes: children.map((child) => ({
          role: child.role,
          command: child.command,
          arguments: child.arguments,
          cwd: ".",
          pid: child.process.pid,
          environment: {
            ...Object.fromEntries(
              Object.entries(environment).sort(([left], [right]) =>
                Buffer.compare(
                  Buffer.from(left, "utf8"),
                  Buffer.from(right, "utf8"),
                ),
              ),
            ),
          },
          stdout: path.basename(child.stdout),
          stderr: path.basename(child.stderr),
        })),
      });
      const processProvenanceSha256: string = EvidenceBenchmarkHash.bytes(
        processProvenanceBytes,
      );
      fs.writeFileSync(
        path.join(instanceRoot, "process-provenance.json"),
        processProvenanceBytes,
        { flag: "wx" },
      );
      const cleanup = async (): Promise<{
        cleanupSealBytes: Uint8Array;
        cleanupSealSha256: string;
      }> => {
        cleaned ??= await cleanupOwned({
          instanceId,
          instanceRoot,
          databaseSource,
          databaseClone,
          children: [...retiredChildren, ...children],
          terminationGraceMs,
        });
        return {
          cleanupSealBytes: cleaned.bytes,
          cleanupSealSha256: cleaned.sha256,
        };
      };
      return {
        instanceId,
        runId: input.runId,
        milestone: input.milestone,
        apiOrigin,
        browserOrigin,
        databaseCloneSha256,
        processProvenanceBytes,
        processProvenanceSha256,
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
      };
    } catch (error) {
      await cleanupOwned({
        instanceId,
        instanceRoot,
        databaseSource,
        databaseClone,
        children: [...retiredChildren, ...children],
        terminationGraceMs,
      }).catch(() => undefined);
      throw error;
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
  }

  interface ICleanup {
    bytes: Buffer;
    sha256: string;
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
    instanceRoot: string;
    databaseSource: string;
    databaseClone: string;
    children: IChild[];
    terminationGraceMs: number;
  }): Promise<ICleanup> {
    const processResults = [];
    const failures: string[] = [];
    for (const child of [...input.children].reverse()) {
      try {
        await terminate(child.process, input.terminationGraceMs);
        await child.logsClosed;
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
      });
    }
    if (failures.length !== 0)
      throw livenessUnknown(
        input.children[0]?.process.pid ?? process.pid,
        `one or more owned child trees remain unproved: ${failures.join(
          " | ",
        )}`,
      );
    let databaseRemoved = false;
    if (fs.existsSync(input.databaseClone)) {
      assertChildPath(input.instanceRoot, input.databaseClone);
      fs.copyFileSync(input.databaseClone, input.databaseSource);
      fs.rmSync(input.databaseClone, { force: false });
      databaseRemoved = !fs.existsSync(input.databaseClone);
    } else databaseRemoved = true;
    const logFiles = input.children
      .flatMap((child) => [child.stdout, child.stderr])
      .map((file) => ({
        path: path.basename(file),
        sha256: fs.existsSync(file)
          ? EvidenceBenchmarkHash.file(file)
          : EvidenceBenchmarkHash.bytes(Buffer.alloc(0)),
      }))
      .sort((left, right) => left.path.localeCompare(right.path, "en"));
    const bytes: Buffer = canonical({
      schemaVersion: 1,
      instanceId: input.instanceId,
      databaseRemoved,
      processes: processResults,
      logs: logFiles,
    });
    const sha256: string = EvidenceBenchmarkHash.bytes(bytes);
    const artifact: string = path.join(input.instanceRoot, "cleanup-seal.json");
    if (fs.existsSync(artifact)) {
      if (EvidenceBenchmarkHash.file(artifact) !== sha256)
        throw new Error("Runtime cleanup seal changed after publication.");
    } else fs.writeFileSync(artifact, bytes, { flag: "wx" });
    return { bytes, sha256 };
  }

  async function terminate(
    child: ChildProcessWithoutNullStreams,
    graceMs: number,
  ): Promise<void> {
    if (
      child.pid === undefined ||
      child.exitCode !== null ||
      child.signalCode !== null
    )
      return;
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
          stdio: "ignore",
        },
      );
      if (killed.error !== undefined)
        throw livenessUnknown(child.pid, killed.error.message);
    } else {
      try {
        process.kill(-child.pid, "SIGTERM");
      } catch {
        child.kill("SIGTERM");
      }
    }
    if (!(await closesWithin(closed, graceMs))) {
      if (process.platform === "win32") {
        const killed = spawnSync(
          "taskkill",
          ["/pid", String(child.pid), "/t", "/f"],
          {
            timeout: 10_000,
            shell: false,
            windowsHide: true,
            stdio: "ignore",
          },
        );
        if (killed.error !== undefined)
          throw livenessUnknown(child.pid, killed.error.message);
      } else {
        try {
          process.kill(-child.pid, "SIGKILL");
        } catch {
          child.kill("SIGKILL");
        }
      }
      if (!(await closesWithin(closed, 10_000)))
        throw livenessUnknown(
          child.pid,
          "owned process tree did not close after forced termination",
        );
    }
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
    [IPortReservation, IPortReservation]
  > {
    const first: IPortReservation = await reservePort();
    let second: IPortReservation = await reservePort();
    while (second.port === first.port) {
      await second.release();
      second = await reservePort();
    }
    return [first, second];
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

  function canonical(value: unknown): Buffer {
    return Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
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

  function nonblank(input: string, label: string): void {
    if (typeof input !== "string" || input.trim().length === 0)
      throw new Error(`${label} must be nonblank.`);
  }

  function digest(input: string, label: string): void {
    if (!/^[a-f0-9]{64}$/u.test(input))
      throw new Error(`${label} must be a lowercase SHA-256 digest.`);
  }
}
