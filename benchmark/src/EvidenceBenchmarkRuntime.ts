import fs from "node:fs";
import net from "node:net";
import path from "node:path";

/** Assigns and validates process-level resources shared by one benchmark cell. */
export namespace EvidenceBenchmarkRuntime {
  /** Default first port in a benchmark wave allocation. */
  export const DEFAULT_PORT_BASE = 46_000;
  const JWT_SECRET_KEY = "benchmark-runtime-secret-at-least-32-characters";
  const JWT_ACCESS_TTL_SECONDS = "3600";
  const JWT_REFRESH_TTL_SECONDS = "2592000";

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

  /** Validates one retained assignment before it controls a resumed cell. */
  export function assertAssignment(
    value: unknown,
  ): asserts value is IAssignment {
    if (
      typeof value !== "object" ||
      value === null ||
      !("apiPort" in value) ||
      !("swaggerPort" in value) ||
      !("viteDevelopmentPort" in value) ||
      !("playwrightPort" in value) ||
      !("apiHost" in value) ||
      ![
        value.apiPort,
        value.swaggerPort,
        value.viteDevelopmentPort,
        value.playwrightPort,
      ].every(
        (port) =>
          typeof port === "number" &&
          Number.isInteger(port) &&
          port >= 1 &&
          port <= 65_535,
      ) ||
      new Set([
        value.apiPort,
        value.swaggerPort,
        value.viteDevelopmentPort,
        value.playwrightPort,
      ]).size !== 4 ||
      value.apiHost !== `http://127.0.0.1:${String(value.apiPort)}`
    )
      throw new Error("Benchmark retained runtime assignment is invalid.");
  }

  /** Returns a stable, disjoint port block for one wave-local cell slot. */
  export function assign(
    slot: number,
    portBase: number = DEFAULT_PORT_BASE,
  ): IAssignment {
    if (
      !Number.isInteger(slot) ||
      slot < 0 ||
      !Number.isInteger(portBase) ||
      portBase < 1 ||
      portBase + slot * 10 + 3 > 65_535
    )
      throw new Error(
        `Benchmark cell slot and port base must identify ports between 1 and 65535: slot ${String(slot)}, base ${String(portBase)}.`,
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
    environment.JWT_SECRET_KEY = JWT_SECRET_KEY;
    environment.JWT_ACCESS_TTL_SECONDS = JWT_ACCESS_TTL_SECONDS;
    environment.JWT_REFRESH_TTL_SECONDS = JWT_REFRESH_TTL_SECONDS;
    environment.VITE_API_SIMULATE = "false";
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
        `JWT_SECRET_KEY=${JWT_SECRET_KEY}`,
        `JWT_ACCESS_TTL_SECONDS=${JWT_ACCESS_TTL_SECONDS}`,
        `JWT_REFRESH_TTL_SECONDS=${JWT_REFRESH_TTL_SECONDS}`,
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

  /** Rejects mutation of the fixed runtime values while allowing app additions. */
  export function assertRestored(
    workspace: string,
    assignment: IAssignment,
  ): void {
    assertEnvironment(
      path.join(workspace, "packages", "backend", ".env"),
      new Map([
        ["API_PORT", String(assignment.apiPort)],
        ["SWAGGER_PORT", String(assignment.swaggerPort)],
        ["JWT_SECRET_KEY", JWT_SECRET_KEY],
        ["JWT_ACCESS_TTL_SECONDS", JWT_ACCESS_TTL_SECONDS],
        ["JWT_REFRESH_TTL_SECONDS", JWT_REFRESH_TTL_SECONDS],
      ]),
    );
    assertEnvironment(
      path.join(workspace, "packages", "frontend", ".env"),
      new Map([
        ["VITE_API_HOST", assignment.apiHost],
        ["VITE_API_SIMULATE", "false"],
        ["VITE_DEV_PORT", String(assignment.viteDevelopmentPort)],
        ["PLAYWRIGHT_TEST_PORT", String(assignment.playwrightPort)],
      ]),
    );
  }

  function assertEnvironment(
    location: string,
    expected: ReadonlyMap<string, string>,
  ): void {
    const stat: fs.Stats | undefined = fs.lstatSync(location, {
      throwIfNoEntry: false,
    });
    if (!stat?.isFile() || stat.isSymbolicLink())
      throw new Error(
        `Benchmark runtime environment is not a real file: ${location}.`,
      );
    const actual: Map<string, string> = new Map();
    for (const [index, original] of fs
      .readFileSync(location, "utf8")
      .split(/\r?\n/)
      .entries()) {
      const line: string =
        index === 0 ? original.replace(/^\uFEFF/, "") : original;
      if (line.length === 0 || line.startsWith("#")) continue;
      const match: RegExpMatchArray | null = line.match(
        /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)(?:\s*=\s*|:\s+)(.*?)\s*$/,
      );
      if (match === null) continue;
      const key: string = match[1]!.toUpperCase();
      if (controlsExecution(key))
        throw new Error(
          `Benchmark runtime environment may not control execution through ${key}: ${location}.`,
        );
      if (actual.has(key))
        throw new Error(
          `Benchmark runtime environment duplicates ${key}: ${location}.`,
        );
      actual.set(key, match[2]!);
    }
    for (const [key, value] of expected)
      if (actual.get(key) !== value)
        throw new Error(
          `Benchmark runtime environment was not restored: ${location}#${key}.`,
        );
  }

  function controlsExecution(key: string): boolean {
    if (
      [
        "APPDATA",
        "CODEX_API_KEY",
        "CODEX_HOME",
        "COMSPEC",
        "COREPACK_HOME",
        "GOCACHE",
        "GOENV",
        "GOMODCACHE",
        "GOPATH",
        "GOTMPDIR",
        "HOME",
        "LD_PRELOAD",
        "LOCALAPPDATA",
        "NESTIA_SDK_TRANSFORM",
        "NODE_EXTRA_CA_CERTS",
        "NODE_OPTIONS",
        "NODE_PATH",
        "OPENAI_API_KEY",
        "PATH",
        "PATHEXT",
        "PLAYWRIGHT_BROWSERS_PATH",
        "PNPM_HOME",
        "SHELL",
        "TEMP",
        "TMP",
        "TMPDIR",
        "USERPROFILE",
        "XDG_CACHE_HOME",
        "XDG_CONFIG_HOME",
      ].includes(key)
    )
      return true;
    return ["COREPACK_", "DYLD_", "GIT_CONFIG_", "NPM_CONFIG_", "TTSC_"].some(
      (prefix) => key.startsWith(prefix),
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
