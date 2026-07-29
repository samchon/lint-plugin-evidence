import net from "node:net";

import type { IEvidenceBenchmarkMaterialization } from "./structures/IEvidenceBenchmarkMaterialization.ts";

/** Assigns and validates process-level resources shared by one benchmark cell. */
export namespace EvidenceBenchmarkRuntime {
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
    const base: number = 46_000 + slot * 10;
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
