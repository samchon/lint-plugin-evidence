import fs from "node:fs";
import net from "node:net";
import path from "node:path";

import type { IEvidenceBenchmarkMaterialization } from "./structures/IEvidenceBenchmarkMaterialization.ts";

/** Assigns and validates process-level resources shared by one benchmark cell. */
export namespace EvidenceBenchmarkRuntime {
  /** Default first port in the eight-cell benchmark allocation. */
  export const DEFAULT_PORT_BASE = 46_000;

  /** Network endpoints reserved for one project and mechanism arm. */
  export interface IAssignment {
    /** Nest application port inherited by backend commands and tests. */
    apiPort: number;

    /** Standalone Swagger generation server port. */
    swaggerPort: number;

    /** Vite development server port used during interactive inspection. */
    viteDevelopmentPort: number;

    /** Vite preview port owned by the Playwright test runner. */
    playwrightPort: number;

    /** Public HTTP origin corresponding to the cell-owned API port. */
    apiHost: string;
  }

  /** Returns a stable, disjoint port block for one benchmark cell. */
  export function assign(
    project: IEvidenceBenchmarkMaterialization.Project,
    arm: IEvidenceBenchmarkMaterialization.Arm,
    portBase: number = DEFAULT_PORT_BASE,
  ): IAssignment {
    const projects: readonly IEvidenceBenchmarkMaterialization.Project[] = [
      "todo",
      "reddit",
      "shopping",
      "erp",
    ];
    const arms: readonly IEvidenceBenchmarkMaterialization.Arm[] = [
      "evidence",
      "plain",
    ];
    const slot: number =
      projects.indexOf(project) * arms.length + arms.indexOf(arm);
    if (
      !Number.isInteger(portBase) ||
      portBase < 1 ||
      portBase + (projects.length * arms.length - 1) * 10 + 3 > 65_535
    )
      throw new Error(
        `Benchmark port base must be an integer between 1 and 65462: ${String(portBase)}.`,
      );
    const base: number = portBase + slot * 10;
    return {
      apiPort: base,
      swaggerPort: base + 1,
      viteDevelopmentPort: base + 2,
      playwrightPort: base + 3,
      apiHost: `http://127.0.0.1:${base}`,
    };
  }

  /** Overrides inherited machine values with the cell-owned endpoints. */
  export function apply(
    environment: NodeJS.ProcessEnv,
    assignment: IAssignment,
  ): void {
    environment.API_PORT = String(assignment.apiPort);
    environment.SWAGGER_PORT = String(assignment.swaggerPort);
    environment.VITE_API_HOST = assignment.apiHost;
    environment.VITE_DEV_PORT = String(assignment.viteDevelopmentPort);
    environment.PLAYWRIGHT_TEST_PORT = String(assignment.playwrightPort);
  }

  /**
   * Persists cell-owned endpoints inside the workspace so commands launched by
   * Codex, Vite, Playwright, and browser tooling share the same allocation.
   */
  export function persist(workspace: string, assignment: IAssignment): void {
    const backend: string = path.join(workspace, "packages", "backend", ".env");
    const frontend: string = path.join(
      workspace,
      "packages",
      "frontend",
      ".env",
    );
    fs.writeFileSync(
      backend,
      [
        `API_PORT=${assignment.apiPort}`,
        `SWAGGER_PORT=${assignment.swaggerPort}`,
        "JWT_SECRET_KEY=benchmark-runtime-secret-at-least-32-characters",
        "JWT_ACCESS_TTL_SECONDS=3600",
        "JWT_REFRESH_TTL_SECONDS=2592000",
        "",
      ].join("\n"),
      { encoding: "utf8", flag: "wx" },
    );
    fs.writeFileSync(
      frontend,
      [
        `VITE_API_HOST=${assignment.apiHost}`,
        "VITE_API_SIMULATE=false",
        `VITE_DEV_PORT=${assignment.viteDevelopmentPort}`,
        `PLAYWRIGHT_TEST_PORT=${assignment.playwrightPort}`,
        "",
      ].join("\n"),
      { encoding: "utf8", flag: "wx" },
    );
  }

  /** Fails before packaging or model use when any selected endpoint is busy. */
  export async function assertAvailable(
    assignments: readonly IAssignment[],
  ): Promise<void> {
    const owners: Map<number, string> = new Map();
    for (const assignment of assignments)
      for (const [name, port] of ports(assignment)) {
        const prior: string | undefined = owners.get(port);
        if (prior !== undefined)
          throw new Error(
            `Benchmark runtime port ${port} is assigned to both ${prior} and ${name}.`,
          );
        owners.set(port, name);
      }
    await Promise.all(
      [...owners].map(([port, name]) => assertPortAvailable(port, name)),
    );
  }

  function ports(assignment: IAssignment): readonly [string, number][] {
    return [
      ["api", assignment.apiPort],
      ["swagger", assignment.swaggerPort],
      ["vite-development", assignment.viteDevelopmentPort],
      ["playwright", assignment.playwrightPort],
    ];
  }

  async function assertPortAvailable(
    port: number,
    name: string,
  ): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const server: net.Server = net.createServer();
      server.unref();
      server.once("error", (cause) =>
        reject(
          new Error(
            `Benchmark ${name} port ${port} is unavailable before launch.`,
            { cause },
          ),
        ),
      );
      server.listen({ host: "127.0.0.1", port, exclusive: true }, () =>
        server.close((cause) =>
          cause === undefined ? resolve() : reject(cause),
        ),
      );
    });
  }
}
