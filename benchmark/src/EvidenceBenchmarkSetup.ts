import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";

import { EvidenceBenchmarkHash } from "./EvidenceBenchmarkHash.ts";
import { EvidenceBenchmarkProcess } from "./EvidenceBenchmarkProcess.ts";
import type { IEvidenceBenchmarkSetup } from "./structures/IEvidenceBenchmarkSetup.ts";

/** Freezes and installs one cell's dependency graph with cell-local caches. */
export namespace EvidenceBenchmarkSetup {
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
    fs.mkdirSync(environment.npm_config_store_dir!, { recursive: true });
    fs.mkdirSync(environment.TTSC_CACHE_DIR!, { recursive: true });
    fs.mkdirSync(environment.TTSC_GO_CACHE_DIR!, { recursive: true });
    fs.mkdirSync(environment.GOTMPDIR!, { recursive: true });
    fs.mkdirSync(environment.PLAYWRIGHT_BROWSERS_PATH!, { recursive: true });
    fs.mkdirSync(environment.COREPACK_HOME!, { recursive: true });
    fs.mkdirSync(environment.GOMODCACHE!, { recursive: true });
    fs.mkdirSync(environment.GOPATH!, { recursive: true });
    fs.mkdirSync(environment.npm_config_cache!, { recursive: true });
    fs.mkdirSync(environment.XDG_CACHE_HOME!, { recursive: true });

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
