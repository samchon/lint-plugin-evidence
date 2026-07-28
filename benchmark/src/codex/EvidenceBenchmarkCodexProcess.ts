import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";

import type { IEvidenceBenchmarkCodexRecord } from "../structures/IEvidenceBenchmarkCodexRecord.ts";
import { EvidenceBenchmarkCodexLog } from "./EvidenceBenchmarkCodexLog.ts";
import { EvidenceBenchmarkCodexProtocol } from "./EvidenceBenchmarkCodexProtocol.ts";
import { EvidenceBenchmarkCodexValue } from "./EvidenceBenchmarkCodexValue.ts";

/**
 * Long-lived JSONL app-server transport with backpressure-safe drains and
 * request correlation.
 */
export class EvidenceBenchmarkCodexProcess {
  private child?: ChildProcessWithoutNullStreams;
  private requestId: number;
  private readonly pending = new Map<
    number,
    EvidenceBenchmarkCodexProcess.IPending
  >();
  private stdoutDrain?: Promise<void>;
  private stderrDrain?: Promise<void>;
  private exitResult?: Promise<EvidenceBenchmarkCodexProcess.IExit>;
  private resolveExit?: (value: EvidenceBenchmarkCodexProcess.IExit) => void;
  private stdoutBuffer = Buffer.alloc(0);
  private stdoutBufferOffset = 0;
  private stopped = false;

  /**
   * Creates an unstarted process controller.
   *
   * @param options Launch, logging, and event callbacks.
   * @param recoveredRequestId Last persisted request id, or zero.
   */
  public constructor(
    private readonly options: EvidenceBenchmarkCodexProcess.IOptions,
    recoveredRequestId: number,
  ) {
    this.requestId = recoveredRequestId;
  }

  /** Spawns app-server and attaches both drains before any request is sent. */
  public async start(): Promise<void> {
    if (this.child !== undefined)
      throw new Error("app-server process has already started");
    this.exitResult = new Promise<EvidenceBenchmarkCodexProcess.IExit>(
      (resolve): void => {
        this.resolveExit = resolve;
      },
    );
    const child = spawn(this.options.command, [...this.options.arguments], {
      cwd: this.options.cwd,
      env: {
        ...process.env,
        ...this.options.environment,
      },
      detached: process.platform !== "win32",
      shell: false,
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
    this.child = child;
    this.stdoutDrain = this.drainStdout(child);
    this.stderrDrain = this.drainStderr(child);
    child.once("error", (error: Error): void => {
      this.rejectPending(error);
    });
    child.once(
      "close",
      (code: number | null, signal: NodeJS.Signals | null): void => {
        void this.finalizeExit(
          code,
          signal,
          new Error(
            `app-server exited with code ${String(code)} signal ${String(signal)}`,
          ),
        );
      },
    );
    await this.options.log.recordEvent(
      "app_server_started",
      {
        command: this.options.command,
        arguments: [...this.options.arguments],
        pid: child.pid ?? null,
      },
      {
        phase: "setup",
      },
    );
  }

  /** Sends one request and resolves only its matching successful response. */
  public async request(
    method: string,
    params: Readonly<Record<string, unknown>>,
  ): Promise<EvidenceBenchmarkCodexProtocol.IResponse> {
    const id = ++this.requestId;
    const request: EvidenceBenchmarkCodexProtocol.IRequest = {
      id,
      method,
      params,
    };
    let resolveResponse:
      ((value: EvidenceBenchmarkCodexProtocol.IResponse) => void) | undefined;
    let rejectResponse: ((reason: unknown) => void) | undefined;
    const response = new Promise<EvidenceBenchmarkCodexProtocol.IResponse>(
      (resolve, reject): void => {
        resolveResponse = resolve;
        rejectResponse = reject;
      },
    );
    const timeout = setTimeout((): void => {
      this.pending.delete(id);
      rejectResponse?.(
        new Error(
          `app-server request ${method} (${id}) exceeded ${this.options.requestTimeoutMs}ms`,
        ),
      );
    }, this.options.requestTimeoutMs);
    timeout.unref();
    this.pending.set(id, {
      method,
      resolve: (value): void => {
        clearTimeout(timeout);
        resolveResponse?.(value);
      },
      reject: (error): void => {
        clearTimeout(timeout);
        rejectResponse?.(error);
      },
    });
    try {
      await this.writeMessage(request);
    } catch (error) {
      this.pending.delete(id);
      clearTimeout(timeout);
      throw error;
    }
    return response;
  }

  /** Sends one notification without allocating a response slot. */
  public async notify(
    method: string,
    params: Readonly<Record<string, unknown>>,
  ): Promise<void> {
    await this.writeMessage({ method, params });
  }

  /** Returns the last allocated request id for restart checkpointing. */
  public lastRequestId(): number {
    return this.requestId;
  }

  /** Waits for process exit and both raw stream drains. */
  public async wait(): Promise<EvidenceBenchmarkCodexProcess.IExit> {
    if (this.exitResult === undefined)
      throw new Error("app-server process has not started");
    const result = await this.exitResult;
    await Promise.all([this.stdoutDrain, this.stderrDrain]);
    return result;
  }

  /** Gracefully closes stdin, then terminates only this child process tree. */
  public async stop(): Promise<void> {
    const child = this.child;
    if (child === undefined) return;
    this.stopped = true;
    if (child.exitCode === null && child.signalCode === null) {
      child.stdin.end();
      const exited = await Promise.race([
        this.wait().then((): boolean => true),
        new Promise<boolean>((resolve): void => {
          const timer = setTimeout(
            (): void => resolve(false),
            this.options.shutdownGraceMs,
          );
          timer.unref();
        }),
      ]);
      if (!exited) await EvidenceBenchmarkCodexProcess.killTree(child.pid);
    }
    await this.wait();
  }

  private async writeMessage(
    message:
      | EvidenceBenchmarkCodexProtocol.IRequest
      | EvidenceBenchmarkCodexProtocol.INotification,
  ): Promise<void> {
    const child = this.child;
    if (child === undefined || child.stdin.destroyed)
      throw new Error("app-server stdin is unavailable");
    const bytes = Buffer.from(`${JSON.stringify(message)}\n`, "utf8");
    const envelope = await this.options.log.recordRaw("client", bytes);
    await this.options.log.recordEvent(
      "app_server_request",
      {
        id: "id" in message ? message.id : null,
        method: message.method,
      },
      {
        actor: "client",
        rawRef: {
          direction: "client",
          rawFile: envelope.rawFile,
          byteOffset: envelope.byteOffset,
          byteLength: envelope.byteLength,
          sha256: envelope.sha256,
        },
      },
    );
    await new Promise<void>((resolve, reject): void => {
      child.stdin.write(bytes, (error?: Error | null): void => {
        if (error) reject(error);
        else resolve();
      });
    });
  }

  private async drainStdout(
    child: ChildProcessWithoutNullStreams,
  ): Promise<void> {
    for await (const input of child.stdout) {
      const chunk = Buffer.isBuffer(input) ? input : Buffer.from(input);
      const envelope = await this.options.log.recordRaw("server", chunk);
      await this.consumeServerChunk(chunk, envelope.byteOffset);
    }
    if (this.stdoutBuffer.length !== 0)
      await this.options.onProtocolAnomaly(
        `server stream ended with ${this.stdoutBuffer.length} incomplete bytes at offset ${this.stdoutBufferOffset}`,
      );
  }

  private async drainStderr(
    child: ChildProcessWithoutNullStreams,
  ): Promise<void> {
    for await (const input of child.stderr) {
      const chunk = Buffer.isBuffer(input) ? input : Buffer.from(input);
      const envelope = await this.options.log.recordRaw("stderr", chunk);
      await this.options.log.recordEvent(
        "app_server_stderr",
        { byteLength: envelope.byteLength },
        {
          actor: "app-server",
          rawRef: {
            direction: "stderr",
            rawFile: envelope.rawFile,
            byteOffset: envelope.byteOffset,
            byteLength: envelope.byteLength,
            sha256: envelope.sha256,
          },
        },
      );
    }
  }

  private async consumeServerChunk(
    chunk: Buffer,
    chunkOffset: number,
  ): Promise<void> {
    if (this.stdoutBuffer.length === 0) this.stdoutBufferOffset = chunkOffset;
    this.stdoutBuffer = Buffer.concat([this.stdoutBuffer, chunk]);
    while (true) {
      const newline = this.stdoutBuffer.indexOf(0x0a);
      if (newline === -1) break;
      const frameBytes = this.stdoutBuffer.subarray(0, newline);
      const frameOffset = this.stdoutBufferOffset;
      this.stdoutBuffer = this.stdoutBuffer.subarray(newline + 1);
      this.stdoutBufferOffset += newline + 1;
      if (frameBytes.length === 0) continue;
      const frame: IEvidenceBenchmarkCodexRecord.IFrame = {
        receivedAtUtc: new Date().toISOString(),
        byteOffset: frameOffset,
        byteLength: frameBytes.length,
        sha256: EvidenceBenchmarkCodexValue.sha256(frameBytes),
      };
      try {
        frame.value = JSON.parse(frameBytes.toString("utf8"));
      } catch (error) {
        frame.parseError =
          error instanceof Error ? error.message : String(error);
        await this.options.onFrame(frame);
        await this.options.log.recordEvent(
          "app_server_frame",
          { parseError: frame.parseError },
          {
            actor: "app-server",
            rawRef: {
              direction: "server",
              rawFile: "server.raw.jsonl",
              byteOffset: frame.byteOffset,
              byteLength: frame.byteLength,
              sha256: frame.sha256,
            },
          },
        );
        await this.options.onProtocolAnomaly(
          `malformed server JSON at offset ${frameOffset}: ${frame.parseError}`,
        );
        continue;
      }
      await this.options.onFrame(frame);
      await this.options.log.recordEvent(
        "app_server_frame",
        {
          parseError: frame.parseError ?? null,
        },
        {
          actor: "app-server",
          rawRef: {
            direction: "server",
            rawFile: "server.raw.jsonl",
            byteOffset: frame.byteOffset,
            byteLength: frame.byteLength,
            sha256: frame.sha256,
          },
        },
      );
      let message:
        | EvidenceBenchmarkCodexProtocol.IResponse
        | EvidenceBenchmarkCodexProtocol.IServerNotification;
      try {
        message = EvidenceBenchmarkCodexProtocol.serverMessage(frame.value);
      } catch (error) {
        await this.options.onProtocolAnomaly(
          `invalid server frame at offset ${frameOffset}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
        continue;
      }
      if ("id" in message) this.consumeResponse(message);
      else await this.options.onNotification(message, frame);
    }
  }

  private consumeResponse(
    response: EvidenceBenchmarkCodexProtocol.IResponse,
  ): void {
    const pending = this.pending.get(response.id);
    if (pending === undefined) {
      void this.options.onProtocolAnomaly(
        `response ${response.id} has no pending request`,
      );
      return;
    }
    this.pending.delete(response.id);
    if (response.error !== undefined)
      pending.reject(
        new EvidenceBenchmarkCodexProcess.ResponseError(
          pending.method,
          response.id,
          response.error,
        ),
      );
    else pending.resolve(response);
  }

  private rejectPending(error: Error): void {
    for (const pending of this.pending.values()) pending.reject(error);
    this.pending.clear();
  }

  private async finalizeExit(
    code: number | null,
    signal: NodeJS.Signals | null,
    error: Error,
  ): Promise<void> {
    await Promise.allSettled([this.stdoutDrain, this.stderrDrain]);
    this.rejectPending(error);
    this.resolveExit?.({
      code,
      signal,
      expected: this.stopped,
      incompleteServerBytes: this.stdoutBuffer.length,
    });
  }

  private static async killTree(pid: number | undefined): Promise<void> {
    if (pid === undefined) return;
    if (process.platform === "win32") {
      await new Promise<void>((resolve): void => {
        const killer = spawn("taskkill", ["/pid", String(pid), "/t", "/f"], {
          shell: false,
          stdio: "ignore",
          windowsHide: true,
        });
        killer.once("error", (): void => resolve());
        killer.once("close", (): void => resolve());
      });
      return;
    }
    try {
      process.kill(-pid, "SIGTERM");
    } catch {
      return;
    }
    await new Promise<void>((resolve): void => {
      const timer = setTimeout(resolve, 250);
      timer.unref();
    });
    try {
      process.kill(-pid, "SIGKILL");
    } catch {
      // The process group exited during the grace interval.
    }
  }
}

/** Companion contracts and errors for {@link EvidenceBenchmarkCodexProcess}. */
export namespace EvidenceBenchmarkCodexProcess {
  /** Process launch and event callback configuration. */
  export interface IOptions {
    /** Executable path or command name. */
    command: string;

    /** Literal process arguments. */
    arguments: string[];

    /** Absolute workspace used as the process current directory. */
    cwd: string;

    /** Optional isolated environment additions. */
    environment?: Readonly<Record<string, string>>;

    /** Per-request JSON-RPC timeout in milliseconds. */
    requestTimeoutMs: number;

    /** Grace period before process-tree termination in milliseconds. */
    shutdownGraceMs: number;

    /** Durable append-only transport writer. */
    log: EvidenceBenchmarkCodexLog;

    /** Receives every complete JSONL frame, including malformed frames. */
    onFrame: IFrameHandler;

    /**
     * Receives every structurally valid notification, including unknown
     * methods.
     */
    onNotification: INotificationHandler;

    /** Receives protocol anomalies that must remain visible in the final report. */
    onProtocolAnomaly: (message: string) => Promise<void>;
  }

  /** Callback for one complete raw-linked JSONL frame. */
  export type IFrameHandler = (
    frame: IEvidenceBenchmarkCodexRecord.IFrame,
  ) => Promise<void>;

  /** Callback for one structurally valid, possibly unknown notification. */
  export type INotificationHandler = (
    notification: EvidenceBenchmarkCodexProtocol.IServerNotification,
    frame: IEvidenceBenchmarkCodexRecord.IFrame,
  ) => Promise<void>;

  /** Resolved process exit facts kept separate from benchmark status. */
  export interface IExit {
    /** Native exit code, null when a signal ended the process. */
    code: number | null;

    /** Native exit signal, null for ordinary exit. */
    signal: NodeJS.Signals | null;

    /** Whether the controller initiated shutdown. */
    expected: boolean;

    /** Bytes after the last complete server newline. */
    incompleteServerBytes: number;
  }

  /** Pending response callbacks retained only until matching response or exit. */
  export interface IPending {
    /** Request method used in an error message. */
    method: string;

    /** Successful response callback. */
    resolve: (value: EvidenceBenchmarkCodexProtocol.IResponse) => void;

    /** Failed response callback. */
    reject: (reason: unknown) => void;
  }

  /** Typed JSON-RPC error preserving the unmodified app-server payload. */
  export class ResponseError extends Error {
    /** Rejected app-server method. */
    public readonly method: string;

    /** Rejected controller request identifier. */
    public readonly requestId: number;

    /** Unmodified JSON-RPC error payload. */
    public readonly payload: unknown;

    /**
     * Creates an error for one rejected JSON-RPC request.
     *
     * @param method Rejected method.
     * @param requestId Rejected request id.
     * @param payload Unmodified app-server error payload.
     */
    public constructor(method: string, requestId: number, payload: unknown) {
      super(
        `app-server rejected ${method} (${requestId}): ${JSON.stringify(payload)}`,
      );
      this.name = "EvidenceBenchmarkCodexResponseError";
      this.method = method;
      this.requestId = requestId;
      this.payload = payload;
    }
  }
}
