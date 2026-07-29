import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { EvidenceBenchmarkProcess } from "@samchon/evidence-benchmark/process";

/** Proves shared controller discovery through a generated-project consumer. */
export namespace BenchmarkControllerDiscovery {
  const FIXTURES: Readonly<Record<string, string>> = {
    "NestedDiscoveryController.ts":
      "packages/backend/src/controllers/nested/NestedDiscoveryController.ts",
    "ControllerHelpers.ts":
      "packages/backend/src/controllers/nested/ControllerHelpers.ts",
    "discovery-proof.ts": "packages/backend/src/executable/discovery-proof.ts",
  };

  /** Adds one nested controller, helper exports, and a runtime proof executable. */
  export const inject = (workspace: string): void => {
    const fixtures: string = path.resolve(
      import.meta.dirname,
      "../fixtures/controller-discovery",
    );
    for (const [source, relative] of Object.entries(FIXTURES)) {
      const target: string = path.join(workspace, ...relative.split("/"));
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.copyFileSync(
        path.join(fixtures, source),
        target,
        fs.constants.COPYFILE_EXCL,
      );
    }
  };

  /** Verifies generator, source-runtime, compiled-runtime, and failure behavior. */
  export const verify = async (
    workspace: string,
    environment: NodeJS.ProcessEnv,
  ): Promise<void> => {
    const backend: string = path.join(workspace, "packages", "backend");
    const api: string = path.join(workspace, "packages", "api");
    await EvidenceBenchmarkProcess.pnpm(["run", "build:prisma"], {
      cwd: backend,
      env: environment,
      label: "controller discovery Prisma build",
    });
    await EvidenceBenchmarkProcess.pnpm(["run", "build"], {
      cwd: api,
      env: environment,
      label: "controller discovery API build",
    });
    await EvidenceBenchmarkProcess.pnpm(["run", "build:main"], {
      cwd: backend,
      env: environment,
      label: "controller discovery backend build",
    });

    for (const command of ["sdk", "swagger", "all"] as const) {
      cleanGenerated(api);
      await EvidenceBenchmarkProcess.pnpm(["exec", "nestia", command], {
        cwd: backend,
        env: environment,
        label: `controller discovery nestia ${command}`,
      });
      assertGenerated(api, command);
    }

    await EvidenceBenchmarkProcess.pnpm(["run", "build"], {
      cwd: workspace,
      env: environment,
      label: "benchmark template full build",
    });
    await EvidenceBenchmarkProcess.pnpm(
      ["exec", "ttsx", "src/executable/discovery-proof.ts"],
      {
        cwd: backend,
        env: {
          ...environment,
          DISCOVERY_PROOF_SOURCE: "1",
        },
        label: "source controller discovery proof",
      },
    );
    await EvidenceBenchmarkProcess.run(
      process.execPath,
      ["lib/executable/discovery-proof.js"],
      {
        cwd: backend,
        env: environment,
        label: "compiled controller discovery proof",
      },
    );
  };

  const cleanGenerated = (api: string): void => {
    for (const relative of ["src/functional", "src/module.ts", "swagger.json"])
      fs.rmSync(path.join(api, ...relative.split("/")), {
        recursive: true,
        force: true,
      });
  };

  const assertGenerated = (
    api: string,
    command: "sdk" | "swagger" | "all",
  ): void => {
    const functional: string = path.join(api, "src", "functional");
    const swagger: string = path.join(api, "swagger.json");
    const expectsSdk: boolean = command !== "swagger";
    const expectsSwagger: boolean = command !== "sdk";
    assert.equal(fs.existsSync(functional), expectsSdk);
    assert.equal(fs.existsSync(swagger), expectsSwagger);
    if (expectsSdk) {
      const source: string = readTextTree(functional);
      assert.match(source, /\/discovery\/nested/);
      assert.doesNotMatch(
        source,
        /CONTROLLER_EVIDENCE_EXCLUDE|DISCOVERY_HELPER|DiscoveryHelper|discoveryHelper/,
      );
    }
    if (expectsSwagger) {
      const document = JSON.parse(fs.readFileSync(swagger, "utf8")) as {
        paths?: Record<string, unknown>;
      };
      assert.deepEqual(Object.keys(document.paths ?? {}).sort(), [
        "/discovery/nested",
        "/health",
      ]);
      assert.doesNotMatch(
        JSON.stringify(document),
        /CONTROLLER_EVIDENCE_EXCLUDE|DISCOVERY_HELPER|DiscoveryHelper|discoveryHelper/,
      );
    }
  };

  const readTextTree = (root: string): string =>
    fs
      .readdirSync(root, { withFileTypes: true })
      .flatMap((entry) => {
        const location: string = path.join(root, entry.name);
        if (entry.isDirectory()) return [readTextTree(location)];
        return entry.isFile() && entry.name.endsWith(".ts")
          ? [fs.readFileSync(location, "utf8")]
          : [];
      })
      .join("\n");
}
