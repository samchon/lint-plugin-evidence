import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";

import { EvidenceBenchmarkHash } from "./EvidenceBenchmarkHash.ts";
import { EvidenceBenchmarkProcess } from "./EvidenceBenchmarkProcess.ts";
import type { IEvidenceBenchmarkMaterialization } from "./structures/IEvidenceBenchmarkMaterialization.ts";
import type { IEvidenceBenchmarkSetup } from "./structures/IEvidenceBenchmarkSetup.ts";

/** Freezes and installs one cell's dependency graph with cell-local caches. */
export namespace EvidenceBenchmarkSetup {
  /** Applies every derived cell-local cache path to a process environment. */
  export function configureEnvironment(
    root: string,
    environment: NodeJS.ProcessEnv,
    caches: IEvidenceBenchmarkMaterialization.IManifest["caches"],
  ): void {
    Object.assign(environment, {
      COREPACK_HOME: path.join(root, "cache", "corepack"),
      GOCACHE: caches.go,
      GOMODCACHE: path.join(root, "cache", "go-mod"),
      GOPATH: path.join(root, "cache", "go-path"),
      GOTMPDIR: path.join(root, "cache", "go-tmp"),
      npm_config_cache: path.join(root, "cache", "npm"),
      npm_config_store_dir: caches.pnpm,
      PLAYWRIGHT_BROWSERS_PATH: caches.playwright,
      TTSC_CACHE_DIR: caches.ttsc,
      TTSC_GO_CACHE_DIR: caches.go,
      XDG_CACHE_HOME: path.join(root, "cache", "xdg"),
    });
  }

  /**
   * Creates the lockfile, performs a frozen install, and records setup timing.
   *
   * The native lint binary is deliberately not invoked here: its first source
   * build belongs to measured product cost, while dependency resolution is
   * reported separately as setup overhead.
   */
  export async function prepare(
    request: IEvidenceBenchmarkSetup.IRequest,
  ): Promise<IEvidenceBenchmarkSetup> {
    const started: bigint = process.hrtime.bigint();
    const workspace: string = request.materialization.workspace;
    const environment: NodeJS.ProcessEnv = request.materialization.environment;
    EvidenceBenchmarkProcess.pinEnvironment(
      environment,
      path.join(request.materialization.root, "cache", "toolchain-bin"),
    );
    for (const name of [
      "COREPACK_HOME",
      "GOCACHE",
      "GOMODCACHE",
      "GOPATH",
      "GOTMPDIR",
      "npm_config_cache",
      "npm_config_store_dir",
      "PLAYWRIGHT_BROWSERS_PATH",
      "TTSC_CACHE_DIR",
      "TTSC_GO_CACHE_DIR",
      "XDG_CACHE_HOME",
    ] as const) {
      const location: string | undefined = environment[name];
      if (location === undefined)
        throw new Error(`Benchmark setup environment is missing ${name}.`);
      fs.mkdirSync(location, { recursive: true });
    }

    const pnpm = await EvidenceBenchmarkProcess.pnpm(["--version"], {
      cwd: workspace,
      env: environment,
      label: "benchmark pnpm version",
    });
    if (pnpm.stdout.trim() !== EvidenceBenchmarkProcess.PNPM_VERSION)
      throw new Error(
        `Benchmark setup requires pnpm ${EvidenceBenchmarkProcess.PNPM_VERSION}, received ${pnpm.stdout.trim()}.`,
      );
    const lock = await EvidenceBenchmarkProcess.pnpm(
      ["install", "--lockfile-only", "--no-frozen-lockfile"],
      {
        cwd: workspace,
        env: environment,
        label: "benchmark dependency lock",
      },
    );
    const lockfile: string = path.join(workspace, "pnpm-lock.yaml");
    if (!fs.existsSync(lockfile))
      throw new Error("Benchmark setup did not produce pnpm-lock.yaml.");
    const beforeInstall: string = EvidenceBenchmarkHash.file(lockfile);
    const install = await EvidenceBenchmarkProcess.pnpm(
      ["install", "--frozen-lockfile"],
      {
        cwd: workspace,
        env: environment,
        label: "benchmark frozen dependency install",
      },
    );
    const afterInstall: string = EvidenceBenchmarkHash.file(lockfile);
    if (beforeInstall !== afterInstall)
      throw new Error(
        "Benchmark frozen install changed pnpm-lock.yaml after the input hash was recorded.",
      );

    const requireFromWorkspace = createRequire(
      path.join(workspace, "package.json"),
    );
    const ttscVersion: string = readVersion(
      requireFromWorkspace.resolve("ttsc/package.json"),
    );
    const lintVersion: string = readVersion(
      requireFromWorkspace.resolve("@ttsc/lint/package.json"),
    );
    const typescriptVersion: string = readVersion(
      requireFromWorkspace.resolve("typescript/package.json"),
    );
    if (
      ttscVersion !== "0.22.0" ||
      lintVersion !== "0.22.0" ||
      typescriptVersion !== "7.0.2"
    )
      throw new Error(
        `Benchmark toolchain must resolve ttsc/@ttsc/lint/typescript 0.22.0/0.22.0/7.0.2, received ${ttscVersion}/${lintVersion}/${typescriptVersion}.`,
      );

    const packageName = "@samchon/lint-plugin-evidence";
    let productResolved: boolean = true;
    try {
      requireFromWorkspace.resolve(`${packageName}/package.json`);
    } catch {
      productResolved = false;
    }
    if ((request.arm === "evidence") !== productResolved)
      throw new Error(
        `Benchmark ${request.arm} arm package boundary is wrong: ${packageName} resolved=${String(productResolved)}.`,
      );

    const result: IEvidenceBenchmarkSetup = {
      elapsedMs: Number(process.hrtime.bigint() - started) / 1_000_000,
      lockElapsedMs: lock.elapsedMs,
      installElapsedMs: install.elapsedMs,
      lockSha256: afterInstall,
      pnpmVersion: EvidenceBenchmarkProcess.PNPM_VERSION,
      ttscVersion: "0.22.0",
      lintVersion: "0.22.0",
      typescriptVersion: "7.0.2",
    };
    fs.writeFileSync(
      path.join(request.materialization.root, "setup.json"),
      `${JSON.stringify(result, null, 2)}\n`,
      { encoding: "utf8", flag: "wx" },
    );
    return result;
  }

  function readVersion(manifest: string): string {
    const parsed: unknown = JSON.parse(fs.readFileSync(manifest, "utf8"));
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      !("version" in parsed) ||
      typeof parsed.version !== "string"
    )
      throw new Error(
        `Installed package manifest has no version: ${manifest}.`,
      );
    return parsed.version;
  }
}
