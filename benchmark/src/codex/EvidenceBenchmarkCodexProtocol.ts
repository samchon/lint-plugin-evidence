import type { IEvidenceBenchmarkCodexRun } from "../structures/IEvidenceBenchmarkCodexRun.ts";
import { EvidenceBenchmarkCodexValue } from "./EvidenceBenchmarkCodexValue.ts";

/**
 * Minimal pinned app-server request builders and strict guards around fields
 * the runner measures.
 */
export namespace EvidenceBenchmarkCodexProtocol {
  /** Pinned Codex CLI release admitted by the benchmark manifest. */
  export const CODEX_CLI_VERSION = "0.145.0";

  /** SHA-256 of the sorted experimental schema tree for Codex 0.145.0. */
  export const CODEX_SCHEMA_SHA256 =
    "8fe6831b1434b628a6a6876ba12af8097c4599c7218b9ffcb58f1fbfb5df6e40";

  /** Pinned Codex source commit corresponding to the admitted CLI release. */
  export const CODEX_SOURCE_COMMIT = "25af12f7e61572b0bc18ddb1008be543b91519b0";

  /** JSON-RPC request accepted by the app-server stdio transport. */
  export interface IRequest {
    /** Controller-allocated request identifier. */
    id: number;

    /** Pinned app-server method name. */
    method: string;

    /** Method parameters preserved as JSON. */
    params: Readonly<Record<string, unknown>>;
  }

  /** JSON-RPC notification sent without a response identifier. */
  export interface INotification {
    /** Pinned app-server notification method name. */
    method: string;

    /** Notification parameters preserved as JSON. */
    params: Readonly<Record<string, unknown>>;
  }

  /** Structurally valid server response without method-specific coercion. */
  export interface IResponse {
    /** Request identifier echoed by app-server. */
    id: number;

    /** Successful response payload, absent when `error` is present. */
    result?: unknown;

    /** Error response payload, absent on success. */
    error?: unknown;
  }

  /** Structurally valid server notification with unknown methods preserved. */
  export interface IServerNotification {
    /** App-server notification name, including future unknown methods. */
    method: string;

    /** Unmodified notification parameters. */
    params: Readonly<Record<string, unknown>>;
  }

  /** All source kinds explicitly requested during descendant discovery. */
  export const THREAD_SOURCE_KINDS = [
    "cli",
    "vscode",
    "exec",
    "appServer",
    "subAgent",
    "subAgentReview",
    "subAgentCompact",
    "subAgentThreadSpawn",
    "subAgentOther",
    "unknown",
  ] as const;

  /** Builds the experimental-capability handshake needed for exact raw usage. */
  export function initialize(id: number): IRequest {
    return {
      id,
      method: "initialize",
      params: {
        clientInfo: {
          name: "evidence-benchmark",
          title: "Evidence Benchmark",
          version: CODEX_CLI_VERSION,
        },
        capabilities: {
          experimentalApi: true,
          optOutNotificationMethods: [],
        },
      },
    };
  }

  /** Builds the post-initialize client notification. */
  export function initialized(): INotification {
    return { method: "initialized", params: {} };
  }

  /**
   * Starts a persisted app-server thread under frozen model and workspace
   * inputs.
   */
  export function threadStart(
    id: number,
    options: IEvidenceBenchmarkCodexRun.IOptions,
  ): IRequest {
    return {
      id,
      method: "thread/start",
      params: {
        approvalPolicy: "never",
        cwd: options.workspace,
        ephemeral: false,
        experimentalRawEvents: true,
        allowProviderModelFallback:
          options.manifest.runner.allowProviderModelFallback,
        model: options.manifest.runner.model,
        serviceTier: options.manifest.runner.serviceTier,
        sandbox: "workspace-write",
        config: {
          features: {
            goals: true,
            multi_agent: true,
          },
        },
      },
    };
  }

  /** Rejoins or reloads the persisted primary thread after controller restart. */
  export function threadResume(
    id: number,
    threadId: string,
    options: IEvidenceBenchmarkCodexRun.IOptions,
  ): IRequest {
    return {
      id,
      method: "thread/resume",
      params: {
        approvalPolicy: "never",
        cwd: options.workspace,
        model: options.manifest.runner.model,
        serviceTier: options.manifest.runner.serviceTier,
        sandbox: "workspace-write",
        threadId,
        config: {
          features: {
            goals: true,
            multi_agent: true,
          },
        },
      },
    };
  }

  /** Installs or updates durable Goal state separately from a user message. */
  export function goalSet(
    id: number,
    threadId: string,
    objective: string | undefined,
    status: "active" | "paused" | "complete",
  ): IRequest {
    return {
      id,
      method: "thread/goal/set",
      params: {
        threadId,
        ...(objective === undefined ? {} : { objective }),
        status,
      },
    };
  }

  /** Reads the durable Goal snapshot used to decide resume behavior. */
  export function goalGet(id: number, threadId: string): IRequest {
    return {
      id,
      method: "thread/goal/get",
      params: { threadId },
    };
  }

  /** Starts a new turn whose model and effort remain frozen for later turns. */
  export function turnStart(
    id: number,
    threadId: string,
    text: string,
    manifest: IEvidenceBenchmarkCodexRun.IManifest,
    outputSchema: Readonly<Record<string, unknown>>,
  ): IRequest {
    return {
      id,
      method: "turn/start",
      params: {
        threadId,
        model: manifest.runner.model,
        effort: manifest.runner.effort,
        serviceTier: manifest.runner.serviceTier,
        input: [{ type: "text", text, text_elements: [] }],
        outputSchema,
      },
    };
  }

  /** Interrupts exactly one active turn during watchdog or user abort. */
  export function turnInterrupt(
    id: number,
    threadId: string,
    turnId: string,
  ): IRequest {
    return {
      id,
      method: "turn/interrupt",
      params: { threadId, turnId },
    };
  }

  /** Appends same-turn input while guarding against steering the wrong turn. */
  export function turnSteer(
    id: number,
    threadId: string,
    turnId: string,
    text: string,
  ): IRequest {
    return {
      id,
      method: "turn/steer",
      params: {
        threadId,
        expectedTurnId: turnId,
        input: [{ type: "text", text, text_elements: [] }],
      },
    };
  }

  /**
   * Lists every source kind so persisted descendant threads cannot hide in
   * defaults.
   */
  export function threadList(
    id: number,
    workspace: string,
    cursor?: string,
  ): IRequest {
    return {
      id,
      method: "thread/list",
      params: {
        cwd: workspace,
        cursor: cursor ?? null,
        limit: 100,
        sourceKinds: [...THREAD_SOURCE_KINDS],
        useStateDbOnly: false,
      },
    };
  }

  /**
   * Parses one unknown JSON value as a response or losslessly preserved
   * notification.
   */
  export function serverMessage(
    input: unknown,
  ): IResponse | IServerNotification {
    if (!EvidenceBenchmarkCodexValue.isRecord(input))
      throw new Error("app-server frame must be a JSON object");
    if (typeof input.id === "number") {
      if (!Number.isSafeInteger(input.id) || input.id < 0)
        throw new Error(
          "app-server response id must be a non-negative integer",
        );
      if (input.result !== undefined && input.error !== undefined)
        throw new Error("app-server response cannot contain result and error");
      return {
        id: input.id,
        ...(input.result === undefined ? {} : { result: input.result }),
        ...(input.error === undefined ? {} : { error: input.error }),
      };
    }
    if (
      typeof input.method !== "string" ||
      !EvidenceBenchmarkCodexValue.isRecord(input.params)
    )
      throw new Error("app-server notification requires method and params");
    return { method: input.method, params: input.params };
  }

  /** Extracts a thread object from a start or resume response. */
  export function responseThread(response: IResponse): Record<string, unknown> {
    if (!EvidenceBenchmarkCodexValue.isRecord(response.result))
      throw new Error("thread response result must be an object");
    const thread = response.result.thread;
    if (!EvidenceBenchmarkCodexValue.isRecord(thread))
      throw new Error("thread response requires result.thread");
    EvidenceBenchmarkCodexValue.string(thread.id, "thread.id");
    return thread;
  }

  /** Extracts the turn id from a start or steer response. */
  export function responseTurnId(response: IResponse): string {
    if (!EvidenceBenchmarkCodexValue.isRecord(response.result))
      throw new Error("turn response result must be an object");
    if (typeof response.result.turnId === "string")
      return response.result.turnId;
    if (EvidenceBenchmarkCodexValue.isRecord(response.result.turn))
      return EvidenceBenchmarkCodexValue.string(
        response.result.turn.id,
        "turn.id",
      );
    throw new Error("turn response requires turnId or turn.id");
  }

  /** Extracts a Goal object from goal set/get responses without coercion. */
  export function responseGoal(response: IResponse): Record<string, unknown> {
    if (!EvidenceBenchmarkCodexValue.isRecord(response.result))
      throw new Error("Goal response result must be an object");
    if (!EvidenceBenchmarkCodexValue.isRecord(response.result.goal))
      throw new Error("Goal response requires result.goal");
    return response.result.goal;
  }
}
