import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";

import { EvidenceBenchmarkHash } from "./EvidenceBenchmarkHash.ts";
import { EvidenceBenchmarkLintBaseline } from "./EvidenceBenchmarkLintBaseline.ts";
import { EvidenceBenchmarkMaterializer } from "./EvidenceBenchmarkMaterializer.ts";
import { EvidenceBenchmarkProcess } from "./EvidenceBenchmarkProcess.ts";
import { EvidenceBenchmarkSandbox } from "./EvidenceBenchmarkSandbox.ts";
import type { IEvidenceBenchmarkMaterialization } from "./structures/IEvidenceBenchmarkMaterialization.ts";
import type { IEvidenceBenchmarkSetup } from "./structures/IEvidenceBenchmarkSetup.ts";

/** Freezes and installs one cell's dependency graph with cell-local caches. */
export namespace EvidenceBenchmarkSetup {
  /** Sandboxed pnpm boundary replaceable only by deterministic self-tests. */
  export type ReproductionRunner = (
    arguments_: readonly string[],
    options: EvidenceBenchmarkProcess.IOptions,
    authority: EvidenceBenchmarkSandbox.IAuthority,
  ) => Promise<EvidenceBenchmarkProcess.IResult>;

  /** Static admission boundary replaceable only by deterministic self-tests. */
  export type ReproductionAdmission = (
    workspace: string,
    root: string,
    manifest: IEvidenceBenchmarkMaterialization.IManifest,
  ) => void;

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
    const environment: NodeJS.ProcessEnv =
      EvidenceBenchmarkMaterializer.untrustedEnvironment(
        request.materialization.environment,
      );
    EvidenceBenchmarkProcess.pinEnvironment(
      environment,
      path.join(request.materialization.root, "cache", "toolchain-bin"),
    );
    fs.mkdirSync(environment.HOME!, { recursive: true });
    fs.mkdirSync(environment.COREPACK_HOME!, { recursive: true });
    fs.mkdirSync(environment.npm_config_store_dir!, { recursive: true });
    fs.mkdirSync(environment.TTSC_CACHE_DIR!, { recursive: true });
    fs.mkdirSync(environment.TTSC_GO_CACHE_DIR!, { recursive: true });
    fs.mkdirSync(environment.GOMODCACHE!, { recursive: true });
    fs.mkdirSync(environment.GOPATH!, { recursive: true });
    fs.mkdirSync(environment.GOTMPDIR!, { recursive: true });
    fs.mkdirSync(environment.PLAYWRIGHT_BROWSERS_PATH!, { recursive: true });
    fs.mkdirSync(environment.TMPDIR!, { recursive: true });

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
      requireInstalledManifest(workspace, requireFromWorkspace, "ttsc"),
    );
    const lintVersion: string = readVersion(
      requireInstalledManifest(workspace, requireFromWorkspace, "@ttsc/lint"),
    );
    const typescriptVersion: string = readVersion(
      requireInstalledManifest(workspace, requireFromWorkspace, "typescript"),
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
    const productResolved: boolean =
      resolvePackageManifest(workspace, requireFromWorkspace, packageName) !==
      undefined;
    if ((request.arm === "evidence") !== productResolved)
      throw new Error(
        `Benchmark ${request.arm} arm package boundary is wrong: ${packageName} resolved=${String(productResolved)}.`,
      );

    const installedSeedPackages: readonly string[] = seedPackages(
      request.materialization.lintBaselines,
    );
    const installed = captureInstalledPackages(
      workspace,
      request.arm,
      installedSeedPackages,
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
      nodeVersion: process.version,
      nodePlatform: process.platform,
      nodeArchitecture: process.arch,
      nodeExecutableSha256: EvidenceBenchmarkHash.file(process.execPath),
      corepackExecutableSha256: EvidenceBenchmarkHash.file(
        EvidenceBenchmarkProcess.corepackEntrypoint(),
      ),
      corepackHomeSha256: EvidenceBenchmarkHash.tree(
        EvidenceBenchmarkHash.directory(environment.COREPACK_HOME!),
      ),
      installedSeedPackages,
      installedPackagesSha256: installed.packages,
      installedPackageResolutions: installed.resolutions,
      installedLaunchersSha256: captureInstalledLaunchers(workspace),
    };
    fs.writeFileSync(
      path.join(request.materialization.root, "setup.json"),
      `${JSON.stringify(result, null, 2)}\n`,
      { encoding: "utf8", flag: "wx" },
    );
    return result;
  }

  /** Rejects hidden mutation of the installed compiler and measured product. */
  export function assertRestored(
    workspace: string,
    root: string,
    arm: IEvidenceBenchmarkMaterialization.Arm,
  ): void {
    const setup = JSON.parse(
      fs.readFileSync(path.join(root, "setup.json"), "utf8"),
    ) as Partial<IEvidenceBenchmarkSetup>;
    if (
      setup.installedPackagesSha256 === undefined ||
      typeof setup.installedPackagesSha256 !== "object" ||
      setup.installedPackagesSha256 === null ||
      Array.isArray(setup.installedPackagesSha256) ||
      !Array.isArray(setup.installedSeedPackages) ||
      setup.installedSeedPackages.length === 0 ||
      !Array.isArray(setup.installedPackageResolutions) ||
      setup.installedPackageResolutions.length === 0 ||
      setup.installedLaunchersSha256 === undefined ||
      typeof setup.installedLaunchersSha256 !== "object" ||
      setup.installedLaunchersSha256 === null ||
      Array.isArray(setup.installedLaunchersSha256)
    )
      throw new Error(
        "Benchmark installed compiler, command launcher, or measured-product payload was not restored.",
      );
    assertNoExcludedCacheReferences(workspace);
    assertInstalledTopology(workspace);
    assertDeclaredInstallation(workspace);
    assertProductBoundary(workspace, arm);
    const actual: Readonly<Record<string, string>> = captureRecordedPackages(
      workspace,
      setup.installedPackagesSha256,
    );
    const launchers: Readonly<Record<string, string>> =
      captureInstalledLaunchers(workspace);
    if (
      setup.nodeVersion !== process.version ||
      setup.nodePlatform !== process.platform ||
      setup.nodeArchitecture !== process.arch ||
      setup.nodeExecutableSha256 !==
        EvidenceBenchmarkHash.file(process.execPath) ||
      setup.corepackExecutableSha256 !==
        EvidenceBenchmarkHash.file(
          EvidenceBenchmarkProcess.corepackEntrypoint(),
        ) ||
      setup.corepackHomeSha256 !==
        EvidenceBenchmarkHash.tree(
          EvidenceBenchmarkHash.directory(path.join(root, "cache", "corepack")),
        ) ||
      EvidenceBenchmarkHash.object(actual) !==
        EvidenceBenchmarkHash.object(setup.installedPackagesSha256) ||
      !resolutionsRestored(
        workspace,
        setup.installedPackagesSha256,
        setup.installedPackageResolutions,
      ) ||
      EvidenceBenchmarkHash.object(launchers) !==
        EvidenceBenchmarkHash.object(setup.installedLaunchersSha256)
    )
      throw new Error(
        "Benchmark installed compiler, command launcher, or measured-product payload was not restored.",
      );
  }

  /**
   * Removes every model-writable cache before controller admission or gates.
   *
   * Recreating only empty owned directories prevents an excluded cache payload
   * from becoming hidden measured authority while preserving tool paths.
   */
  export function resetMutableCaches(workspace: string): void {
    const root: string = path.resolve(workspace);
    const cache: string = path.resolve(root, ".benchmark-cache");
    if (path.dirname(cache) !== root)
      throw new Error(`Benchmark cache reset escaped its workspace: ${cache}.`);
    const stat: fs.Stats | undefined = fs.lstatSync(cache, {
      throwIfNoEntry: false,
    });
    if (stat?.isSymbolicLink())
      throw new Error(`Benchmark cache root is a symbolic link: ${cache}.`);
    if (stat !== undefined && !stat.isDirectory())
      throw new Error(`Benchmark cache root is not a directory: ${cache}.`);
    fs.rmSync(cache, { recursive: true, force: true });
    for (const relative of [
      "pnpm-store",
      "ttsc",
      "go-build",
      "go-modules",
      "go-path",
      "playwright",
      path.join("tmp", "go"),
    ])
      fs.mkdirSync(path.join(cache, relative), { recursive: true });
  }

  function assertNoExcludedCacheReferences(workspace: string): void {
    const forbidden: readonly string[] = [
      ".benchmark-cache",
      ...pathSpellings(path.join(workspace, ".benchmark-cache")),
    ];
    const visit = (directory: string): void => {
      for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        if (
          [".benchmark-cache", ".git", "node_modules"].includes(
            entry.name.toLowerCase(),
          )
        )
          continue;
        const location: string = path.join(directory, entry.name);
        if (entry.isSymbolicLink())
          throw new Error(
            `Benchmark publishable workspace contains a symbolic link: ${location}.`,
          );
        if (entry.isDirectory()) {
          visit(location);
          continue;
        }
        if (!entry.isFile())
          throw new Error(
            `Benchmark publishable workspace contains a non-file entry: ${location}.`,
          );
        const relative: string = path
          .relative(workspace, location)
          .split(path.sep)
          .join("/");
        if (relative === ".gitignore") continue;
        const bytes: Buffer = fs.readFileSync(location);
        if (bytes.includes(0)) continue;
        let content: string = bytes.toString("utf8");
        if (!Buffer.from(content, "utf8").equals(bytes)) continue;
        if (relative === "packages/frontend/vite.config.ts") {
          const canonical: string =
            '  cacheDir: path.resolve(__dirname, "../../.benchmark-cache/vite"),';
          if (content.split(canonical).length !== 2)
            throw new Error(
              "Benchmark frontend cache ownership declaration was not restored.",
            );
          content = content.replace(canonical, "");
        }
        const found: string | undefined = forbidden.find((value) =>
          value === ".benchmark-cache"
            ? content.toLowerCase().includes(value)
            : content.includes(value),
        );
        if (found !== undefined)
          throw new Error(
            `Benchmark publishable file references excluded cache authority ${found}: ${relative}.`,
          );
      }
    };
    visit(workspace);
  }

  /**
   * Reconstructs the current lockfile from a fresh registry store inside a
   * sandbox and compares every pnpm payload, link, and launcher.
   */
  export async function assertReproducible(
    workspace: string,
    root: string,
    verifyGates: boolean = false,
    runPnpm: ReproductionRunner = sandboxedPnpm,
    admit: ReproductionAdmission = admitReproduction,
  ): Promise<string> {
    const parsed: unknown = JSON.parse(
      fs.readFileSync(path.join(root, "materialization.json"), "utf8"),
    );
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      Array.isArray(parsed) ||
      !("schemaVersion" in parsed) ||
      parsed.schemaVersion !== 6
    )
      throw new Error(
        "Benchmark dependency reproduction requires a current materialization manifest.",
      );
    const record = parsed as Record<string, unknown>;
    const variables: unknown = record.variables;
    const frontendPackageName: unknown =
      typeof variables === "object" &&
      variables !== null &&
      !Array.isArray(variables) &&
      "frontendPackageName" in variables
        ? variables.frontendPackageName
        : undefined;
    if (
      typeof frontendPackageName !== "string" ||
      frontendPackageName.length === 0
    )
      throw new Error(
        "Benchmark dependency reproduction requires the rendered frontend package identity.",
      );
    const caches: unknown = record.caches;
    const corepack: unknown =
      typeof caches === "object" &&
      caches !== null &&
      !Array.isArray(caches) &&
      "corepack" in caches
        ? caches.corepack
        : undefined;
    if (
      typeof corepack !== "string" ||
      path.resolve(corepack) !== path.resolve(root, "cache", "corepack")
    )
      throw new Error(
        "Benchmark dependency reproduction requires its canonical Corepack cache authority.",
      );
    const manifest = parsed as IEvidenceBenchmarkMaterialization.IManifest;
    admit(workspace, root, manifest);
    const cache: string = path.join(root, "cache");
    const temporary: string = fs.mkdtempSync(
      path.join(cache, "dependency-proof-"),
    );
    const shadow: string = path.join(temporary, "workspace");
    try {
      fs.cpSync(workspace, shadow, {
        recursive: true,
        filter: (source) =>
          ![".benchmark-cache", ".git", "node_modules"].includes(
            path.basename(source).toLowerCase(),
          ),
      });
      const workspaceCache: string = path.join(shadow, ".benchmark-cache");
      const environment: NodeJS.ProcessEnv =
        EvidenceBenchmarkMaterializer.untrustedEnvironment({
          ...EvidenceBenchmarkMaterializer.hostEnvironment(),
          HOME: path.join(temporary, "cache", "home"),
          USERPROFILE: path.join(temporary, "cache", "home"),
          APPDATA: path.join(temporary, "cache", "home", "appdata", "roaming"),
          LOCALAPPDATA: path.join(
            temporary,
            "cache",
            "home",
            "appdata",
            "local",
          ),
          XDG_CACHE_HOME: path.join(temporary, "cache", "home", ".cache"),
          XDG_CONFIG_HOME: path.join(temporary, "cache", "home", ".config"),
          COREPACK_HOME: corepack,
          CODEX_HOME: path.join(temporary, "cache", "codex-home"),
          npm_config_store_dir: path.join(workspaceCache, "pnpm-store"),
          npm_config_userconfig: EvidenceBenchmarkMaterializer.npmConfig(root),
          npm_config_globalconfig:
            EvidenceBenchmarkMaterializer.npmConfig(root),
          GIT_CONFIG_NOSYSTEM: "1",
          GIT_CONFIG_GLOBAL: EvidenceBenchmarkMaterializer.gitConfig(root),
          TTSC_CACHE_DIR: path.join(workspaceCache, "ttsc"),
          TTSC_GO_CACHE_DIR: path.join(workspaceCache, "go-build"),
          GOCACHE: path.join(workspaceCache, "go-build"),
          GOENV: "off",
          GOMODCACHE: path.join(workspaceCache, "go-modules"),
          GOPATH: path.join(workspaceCache, "go-path"),
          GOTMPDIR: path.join(workspaceCache, "tmp", "go"),
          PLAYWRIGHT_BROWSERS_PATH: path.join(workspaceCache, "playwright"),
          TMPDIR: path.join(workspaceCache, "tmp"),
          TEMP: path.join(workspaceCache, "tmp"),
          TMP: path.join(workspaceCache, "tmp"),
        });
      for (const directory of [
        environment.HOME!,
        environment.APPDATA!,
        environment.LOCALAPPDATA!,
        environment.XDG_CACHE_HOME!,
        environment.XDG_CONFIG_HOME!,
        environment.CODEX_HOME!,
        environment.npm_config_store_dir!,
        environment.TTSC_CACHE_DIR!,
        environment.TTSC_GO_CACHE_DIR!,
        environment.GOMODCACHE!,
        environment.GOPATH!,
        environment.GOTMPDIR!,
        environment.PLAYWRIGHT_BROWSERS_PATH!,
        environment.TMPDIR!,
      ])
        fs.mkdirSync(directory, { recursive: true });
      EvidenceBenchmarkProcess.pinEnvironment(
        environment,
        path.join(root, "cache", "toolchain-bin"),
      );
      const authority: EvidenceBenchmarkSandbox.IAuthority = {
        workspace: shadow,
        toolchain: path.join(root, "cache", "toolchain-bin"),
        corepack,
        npmConfig: EvidenceBenchmarkMaterializer.npmConfig(root),
        gitConfig: EvidenceBenchmarkMaterializer.gitConfig(root),
      };
      await runPnpm(
        ["install", "--frozen-lockfile"],
        {
          cwd: shadow,
          env: environment,
          label: "benchmark clean dependency reproduction",
        },
        authority,
      );
      assertDeclaredInstallation(shadow);
      const actual: Readonly<Record<string, string>> =
        dependencyInstallationLedger(workspace);
      const reproduced: Readonly<Record<string, string>> =
        dependencyInstallationLedger(shadow);
      if (
        EvidenceBenchmarkHash.object(actual) !==
        EvidenceBenchmarkHash.object(reproduced)
      )
        throw new Error(
          `Benchmark installed dependency payloads do not match a clean frozen registry install: ${dependencyInstallationDifference(actual, reproduced)}.`,
        );
      if (verifyGates)
        for (const command of [
          { name: "build", arguments: ["run", "build"] },
          { name: "lint", arguments: ["run", "lint"] },
          {
            name: "prepare:database",
            arguments: ["run", "prepare:database"],
          },
          { name: "test:backend", arguments: ["run", "test:backend"] },
          {
            name: "playwright:install",
            arguments: [
              "--filter",
              frontendPackageName,
              "--fail-if-no-match",
              "playwright:install",
            ],
          },
          { name: "test:frontend", arguments: ["run", "test:frontend"] },
        ] as const)
          await runPnpm(
            command.arguments,
            {
              cwd: shadow,
              env: environment,
              label: `benchmark clean publishable ${command.name} gate`,
            },
            authority,
          );
      return EvidenceBenchmarkHash.object(actual);
    } finally {
      fs.rmSync(temporary, { recursive: true, force: true });
    }
  }

  function sandboxedPnpm(
    arguments_: readonly string[],
    options: EvidenceBenchmarkProcess.IOptions,
    authority: EvidenceBenchmarkSandbox.IAuthority,
  ): Promise<EvidenceBenchmarkProcess.IResult> {
    return EvidenceBenchmarkSandbox.run(
      authority,
      process.execPath,
      [
        EvidenceBenchmarkProcess.corepackEntrypoint(),
        `pnpm@${EvidenceBenchmarkProcess.PNPM_VERSION}`,
        ...arguments_,
      ],
      options,
    );
  }

  function admitReproduction(
    workspace: string,
    root: string,
    manifest: IEvidenceBenchmarkMaterialization.IManifest,
  ): void {
    resetMutableCaches(workspace);
    EvidenceBenchmarkMaterializer.assertRequirementsRestored(workspace, root);
    assertRestored(workspace, root, manifest.arm);
    EvidenceBenchmarkLintBaseline.assertInfrastructureRestored(
      workspace,
      manifest.arm,
      manifest.lintBaselines,
    );
  }

  function captureInstalledPackages(
    workspace: string,
    arm: IEvidenceBenchmarkMaterialization.Arm,
    seeds: readonly string[],
  ): {
    packages: Readonly<Record<string, string>>;
    resolutions: readonly IEvidenceBenchmarkSetup.IResolution[];
  } {
    assertInstalledTopology(workspace);
    const packageRoots = [
      ["workspace:root", workspace],
      ["workspace:config", path.join(workspace, "config")],
      ["workspace:api", path.join(workspace, "packages", "api")],
      ["workspace:backend", path.join(workspace, "packages", "backend")],
      ["workspace:frontend", path.join(workspace, "packages", "frontend")],
    ] as const;
    const resolvers = packageRoots.map(([from, root]) => ({
      from,
      resolver: createRequire(path.join(root, "package.json")),
    }));
    assertProductBoundary(
      workspace,
      arm,
      resolvers.map((entry) => entry.resolver),
    );
    const output: Record<string, string> = {};
    const resolutions: IEvidenceBenchmarkSetup.IResolution[] = [];
    const visited: Set<string> = new Set();
    for (const name of seeds)
      for (const { from, resolver } of resolvers) {
        const manifest: string | undefined = resolvePackageManifest(
          workspace,
          resolver,
          name,
        );
        if (manifest === undefined) continue;
        const identity: string = packageIdentity(workspace, manifest);
        resolutions.push({ from, dependency: name, to: identity });
        capturePackageClosure(
          workspace,
          manifest,
          output,
          resolutions,
          visited,
        );
      }
    return {
      packages: Object.fromEntries(
        Object.entries(output).sort(([left], [right]) =>
          left.localeCompare(right, "en"),
        ),
      ),
      resolutions: resolutions.sort(compareResolution),
    };
  }

  function workspacePackageRoots(
    workspace: string,
  ): readonly [string, string][] {
    return [
      ["workspace:root", workspace],
      ["workspace:config", path.join(workspace, "config")],
      ["workspace:api", path.join(workspace, "packages", "api")],
      ["workspace:backend", path.join(workspace, "packages", "backend")],
      ["workspace:frontend", path.join(workspace, "packages", "frontend")],
    ];
  }

  function assertProductBoundary(
    workspace: string,
    arm: IEvidenceBenchmarkMaterialization.Arm,
    supplied?: readonly NodeJS.Require[],
  ): void {
    const resolvers: readonly NodeJS.Require[] =
      supplied ??
      workspacePackageRoots(workspace).map(([, root]) =>
        createRequire(path.join(root, "package.json")),
      );
    const product: string = "@samchon/lint-plugin-evidence";
    const productManifests: string[] = resolvers.flatMap((resolver) => {
      const manifest: string | undefined = resolvePackageManifest(
        workspace,
        resolver,
        product,
      );
      return manifest === undefined ? [] : [manifest];
    });
    if ((arm === "evidence") !== (productManifests.length !== 0))
      throw new Error(
        `Benchmark ${arm} installed product boundary is wrong: ${product} resolved=${String(productManifests.length !== 0)}.`,
      );
  }

  function seedPackages(
    baselines: readonly IEvidenceBenchmarkMaterialization.ILintConfigBaseline[],
  ): readonly string[] {
    const seeds: Set<string> = new Set(["@ttsc/lint", "ttsc", "typescript"]);
    for (const baseline of baselines)
      for (const scripts of baseline.scripts)
        for (const [identity, specifier] of Object.entries(
          scripts.dependencies,
        )) {
          if (specifier.startsWith("workspace:")) continue;
          const separator: number = identity.indexOf(".");
          if (separator !== -1) seeds.add(identity.slice(separator + 1));
        }
    return [...seeds].sort((left, right) => left.localeCompare(right, "en"));
  }

  function assertInstalledTopology(workspace: string): void {
    const normalize = (location: string): string => {
      const resolved: string = path.resolve(location);
      return process.platform === "win32" ? resolved.toLowerCase() : resolved;
    };
    const allowed: ReadonlySet<string> = new Set(
      [
        workspace,
        path.join(workspace, "config"),
        path.join(workspace, "packages", "api"),
        path.join(workspace, "packages", "backend"),
        path.join(workspace, "packages", "frontend"),
      ].map((root) => normalize(path.join(root, "node_modules"))),
    );
    const visit = (directory: string): void => {
      for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        if (
          entry.name.toLowerCase() === ".benchmark-cache" ||
          entry.name.toLowerCase() === ".git"
        )
          continue;
        const location: string = path.join(directory, entry.name);
        if (entry.name.toLowerCase() === "node_modules") {
          const resolved: string = normalize(location);
          if (!allowed.has(resolved))
            throw new Error(
              `Benchmark workspace contains a shadow dependency root: ${location}.`,
            );
          const stat: fs.Stats = fs.lstatSync(location);
          if (!stat.isDirectory() || stat.isSymbolicLink())
            throw new Error(
              `Benchmark dependency root is not a real directory: ${location}.`,
            );
          continue;
        }
        if (entry.isDirectory()) visit(location);
      }
    };
    visit(workspace);
  }

  function assertDeclaredInstallation(workspace: string): void {
    const lock: ReadonlyMap<string, ILockedDependency> = readLockDependencies(
      path.join(workspace, "pnpm-lock.yaml"),
    );
    const virtualStore: string = path.join(workspace, "node_modules", ".pnpm");
    const hasVirtualStore: boolean = fs.existsSync(virtualStore);
    const reachable: Set<string> = new Set();
    for (const [label, root] of workspacePackageRoots(workspace)) {
      const importer: string =
        label === "workspace:root"
          ? "."
          : path.relative(workspace, root).split(path.sep).join("/");
      const manifest: string = path.join(root, "package.json");
      if (!fs.existsSync(manifest)) continue;
      const declared: ReadonlyMap<string, string> =
        readDeclaredDependencies(manifest);
      for (const [identity, specifier] of declared) {
        const [section, ...nameParts] = identity.split(".");
        const name: string = nameParts.join(".");
        const locked: ILockedDependency | undefined = lock.get(
          `${importer}\0${section}\0${name}`,
        );
        const unlockedPeer: boolean =
          section === "peerDependencies" && locked === undefined;
        const effectiveLocked: ILockedDependency | undefined =
          locked ??
          (unlockedPeer
            ? ["dependencies", "devDependencies", "optionalDependencies"]
                .map((candidate) =>
                  lock.get(`${importer}\0${candidate}\0${name}`),
                )
                .find(
                  (candidate): candidate is ILockedDependency =>
                    candidate !== undefined,
                )
            : undefined);
        if (!unlockedPeer && locked?.specifier !== specifier)
          throw new Error(
            `Benchmark installed dependency is not reproducible from the frozen lockfile: ${importer}#${identity}.`,
          );
        const direct: string = path.join(
          root,
          "node_modules",
          ...name.split("/"),
        );
        const directStat: fs.Stats | undefined = fs.lstatSync(direct, {
          throwIfNoEntry: false,
        });
        if (specifier.startsWith("workspace:")) {
          if (unlockedPeer && directStat === undefined) continue;
          if (
            directStat === undefined ||
            !directStat.isSymbolicLink() ||
            (effectiveLocked !== undefined &&
              !effectiveLocked.version.startsWith("link:"))
          )
            throw new Error(
              `Benchmark workspace dependency is not linked from its frozen lock target: ${importer}#${identity}.`,
            );
          const actual: string = fs.realpathSync(direct);
          const workspaceRoots: ReadonlySet<string> = new Set(
            workspacePackageRoots(workspace).map(([, packageRoot]) =>
              fs.realpathSync(packageRoot),
            ),
          );
          const expected: string | undefined =
            effectiveLocked?.version.startsWith("link:") === true
              ? fs.realpathSync(
                  path.resolve(
                    root,
                    effectiveLocked.version.slice("link:".length),
                  ),
                )
              : undefined;
          if (
            !workspaceRoots.has(actual) ||
            (expected !== undefined && actual !== expected)
          )
            throw new Error(
              `Benchmark workspace dependency link drifted from its frozen lock target: ${importer}#${identity}.`,
            );
          continue;
        }
        if (unlockedPeer && directStat === undefined) continue;
        const resolved: string | undefined = resolvePackageManifest(
          workspace,
          createRequire(manifest),
          name,
        );
        if (resolved === undefined) {
          if (
            section === "optionalDependencies" ||
            section === "peerDependencies"
          )
            continue;
          throw new Error(
            `Benchmark installed dependency is missing from its frozen lock target: ${importer}#${identity}.`,
          );
        }
        if (
          directStat === undefined ||
          (hasVirtualStore && !directStat.isSymbolicLink())
        )
          throw new Error(
            `Benchmark installed dependency is not linked by pnpm: ${importer}#${identity}.`,
          );
        if (effectiveLocked !== undefined)
          assertLockTarget(
            name,
            effectiveLocked.version,
            resolved,
            importer,
            identity,
          );
        collectReachablePackages(workspace, resolved, reachable);
      }
      const modules: string = path.join(root, "node_modules");
      if (!fs.existsSync(modules)) continue;
      for (const name of directPackageNames(modules))
        if (
          [...declared.keys()].some((identity) =>
            identity.endsWith(`.${name}`),
          ) === false
        )
          throw new Error(
            `Benchmark node_modules contains an undeclared direct package: ${importer}#${name}.`,
          );
    }
    if (hasVirtualStore)
      for (const packageRoot of virtualStorePackageRoots(virtualStore))
        if (!reachable.has(fs.realpathSync(packageRoot)))
          throw new Error(
            `Benchmark node_modules contains an orphan installed package payload: ${packageRoot}.`,
          );
    if (hasVirtualStore)
      for (const entry of hoistedPackageEntries(virtualStore))
        if (!reachable.has(fs.realpathSync(entry.location)))
          throw new Error(
            `Benchmark node_modules contains an unreachable hoisted dependency: ${entry.location}.`,
          );
  }

  interface ILockedDependency {
    specifier: string;
    version: string;
  }

  function assertLockTarget(
    dependency: string,
    locked: string,
    manifest: string,
    importer: string,
    identity: string,
  ): void {
    const parsed: Record<string, unknown> = readPackage(manifest);
    const actualName: string = String(parsed.name);
    const actualVersion: string = String(parsed.version);
    const peerless: string = locked.replace(/\(.+$/, "");
    const registryTarget: boolean =
      peerless === actualVersion ||
      peerless === `${actualName}@${actualVersion}` ||
      peerless === `npm:${actualName}@${actualVersion}`;
    const externalTarget: boolean =
      /^(?:file:|https?:|git(?:\+[^:]+)?:|github:|gitlab:|bitbucket:)/.test(
        peerless,
      );
    if (
      !externalTarget &&
      (!registryTarget ||
        (actualName !== dependency &&
          peerless !== `${actualName}@${actualVersion}` &&
          peerless !== `npm:${actualName}@${actualVersion}`))
    )
      throw new Error(
        `Benchmark installed dependency drifted from its frozen lock target: ${importer}#${identity} -> ${locked}.`,
      );
  }

  function collectReachablePackages(
    workspace: string,
    manifest: string,
    visited: Set<string>,
  ): void {
    const real: string = fs.realpathSync(manifest);
    const packageRoot: string = path.dirname(real);
    if (visited.has(packageRoot)) return;
    visited.add(packageRoot);
    const parsed: Record<string, unknown> = readPackage(real);
    const resolver: NodeJS.Require = createRequire(real);
    const dependencies: Set<string> = new Set();
    for (const section of [
      "dependencies",
      "optionalDependencies",
      "peerDependencies",
    ] as const) {
      const value: unknown = parsed[section];
      if (typeof value !== "object" || value === null || Array.isArray(value))
        continue;
      for (const dependency of Object.keys(value)) dependencies.add(dependency);
    }
    for (const dependency of dependencies) {
      const child: string | undefined = resolvePackageManifest(
        workspace,
        resolver,
        dependency,
      );
      if (child !== undefined)
        collectReachablePackages(workspace, child, visited);
    }
  }

  function virtualStorePackageRoots(virtualStore: string): readonly string[] {
    const output: string[] = [];
    for (const virtual of fs.readdirSync(virtualStore, {
      withFileTypes: true,
    })) {
      if (!virtual.isDirectory() || virtual.name === "node_modules") continue;
      const modules: string = path.join(
        virtualStore,
        virtual.name,
        "node_modules",
      );
      if (!fs.existsSync(modules)) continue;
      for (const entry of fs.readdirSync(modules, { withFileTypes: true })) {
        if (entry.name.startsWith("@")) {
          if (!entry.isDirectory()) continue;
          for (const child of fs.readdirSync(path.join(modules, entry.name), {
            withFileTypes: true,
          }))
            if (child.isDirectory() || child.isSymbolicLink())
              output.push(path.join(modules, entry.name, child.name));
        } else if (entry.isDirectory() || entry.isSymbolicLink())
          output.push(path.join(modules, entry.name));
      }
    }
    return output.sort((left, right) => left.localeCompare(right, "en"));
  }

  function hoistedPackageEntries(
    virtualStore: string,
  ): readonly { name: string; location: string }[] {
    const modules: string = path.join(virtualStore, "node_modules");
    if (!fs.existsSync(modules)) return [];
    const output: { name: string; location: string }[] = [];
    for (const entry of fs
      .readdirSync(modules, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name, "en"))) {
      if (entry.name === ".bin") continue;
      if (entry.name.startsWith("."))
        throw new Error(
          `Benchmark hoisted dependency root contains an unowned hidden payload: ${path.join(modules, entry.name)}.`,
        );
      if (entry.name.startsWith("@")) {
        const scope: string = path.join(modules, entry.name);
        if (!entry.isDirectory() || entry.isSymbolicLink())
          throw new Error(
            `Benchmark hoisted dependency scope is not a real directory: ${scope}.`,
          );
        for (const child of fs
          .readdirSync(scope, { withFileTypes: true })
          .sort((left, right) => left.name.localeCompare(right.name, "en"))) {
          const location: string = path.join(scope, child.name);
          if (!fs.lstatSync(location).isSymbolicLink())
            throw new Error(
              `Benchmark hoisted dependency is not linked by pnpm: ${location}.`,
            );
          output.push({
            name: `${entry.name}/${child.name}`,
            location,
          });
        }
        continue;
      }
      const location: string = path.join(modules, entry.name);
      if (!fs.lstatSync(location).isSymbolicLink())
        throw new Error(
          `Benchmark hoisted dependency is not linked by pnpm: ${location}.`,
        );
      output.push({ name: entry.name, location });
    }
    return output;
  }

  function dependencyInstallationLedger(
    workspace: string,
  ): Readonly<Record<string, string>> {
    const output: Record<string, string> = {};
    const virtualStore: string = fs.realpathSync(
      path.join(workspace, "node_modules", ".pnpm"),
    );
    const payloads: ReadonlySet<string> = new Set(
      virtualStorePackageRoots(virtualStore).map((packageRoot) =>
        fs.realpathSync(packageRoot),
      ),
    );
    for (const packageRoot of [...payloads].sort((left, right) =>
      left.localeCompare(right, "en"),
    )) {
      const relative: string = portableRelation(virtualStore, packageRoot);
      for (const [file, content] of normalizedPackageFiles(
        packageRoot,
        workspace,
      ))
        output[`payload/${relative}/${file}`] =
          EvidenceBenchmarkHash.bytes(content);
    }
    for (const entry of hoistedPackageEntries(virtualStore))
      output[`hoisted/${entry.name}`] = normalizedDependencyTarget(
        workspace,
        virtualStore,
        entry.location,
      );
    const hoistedLaunchers: string = path.join(
      virtualStore,
      "node_modules",
      ".bin",
    );
    if (fs.existsSync(hoistedLaunchers))
      for (const entry of fs
        .readdirSync(hoistedLaunchers, { withFileTypes: true })
        .sort((left, right) => left.name.localeCompare(right.name, "en"))) {
        const location: string = path.join(hoistedLaunchers, entry.name);
        const key: string = `hoisted-launcher/${entry.name}`;
        if (entry.isSymbolicLink())
          output[key] = `symlink:${normalizeWorkspacePath(
            fs.readlinkSync(location),
            workspace,
          )}`;
        else if (entry.isFile())
          output[key] = `file:${launcherIdentity(location, workspace)}`;
        else
          throw new Error(
            `Benchmark hoisted dependency launcher is not a file or link: ${location}.`,
          );
      }
    for (const [label, packageRoot] of workspacePackageRoots(workspace)) {
      const modules: string = path.join(packageRoot, "node_modules");
      if (!fs.existsSync(modules)) continue;
      for (const name of directPackageNames(modules)) {
        const direct: string = path.join(modules, ...name.split("/"));
        output[`direct/${label}/${name}`] = normalizedDependencyTarget(
          workspace,
          virtualStore,
          direct,
        );
      }
      const launchers: string = path.join(modules, ".bin");
      if (!fs.existsSync(launchers)) continue;
      for (const entry of fs
        .readdirSync(launchers, { withFileTypes: true })
        .sort((left, right) => left.name.localeCompare(right.name, "en"))) {
        const location: string = path.join(launchers, entry.name);
        const key: string = `launcher/${label}/${entry.name}`;
        if (entry.isSymbolicLink())
          output[key] = `symlink:${normalizeWorkspacePath(
            fs.readlinkSync(location),
            workspace,
          )}`;
        else if (entry.isFile())
          output[key] = `file:${launcherIdentity(location, workspace)}`;
        else
          throw new Error(
            `Benchmark dependency launcher is not a file or link: ${location}.`,
          );
      }
    }
    return Object.fromEntries(
      Object.entries(output).sort(([left], [right]) =>
        left.localeCompare(right, "en"),
      ),
    );
  }

  function normalizedPackageFiles(
    packageRoot: string,
    workspace: string,
  ): ReadonlyMap<string, Uint8Array> {
    return new Map(
      [...EvidenceBenchmarkHash.directory(packageRoot)].map(
        ([relative, content]) => {
          if (content.includes(0)) return [relative, content] as const;
          const text: string = Buffer.from(content).toString("utf8");
          if (!Buffer.from(text, "utf8").equals(content))
            return [relative, content] as const;
          return [
            relative,
            Buffer.from(normalizeWorkspacePath(text, workspace), "utf8"),
          ] as const;
        },
      ),
    );
  }

  function dependencyInstallationDifference(
    actual: Readonly<Record<string, string>>,
    reproduced: Readonly<Record<string, string>>,
  ): string {
    const keys: readonly string[] = [
      ...new Set([...Object.keys(actual), ...Object.keys(reproduced)]),
    ].sort((left, right) => left.localeCompare(right, "en"));
    for (const key of keys) {
      if (!(key in actual)) return `unexpected ${key}`;
      if (!(key in reproduced)) return `missing ${key}`;
      if (actual[key] !== reproduced[key])
        return `changed ${key} (${actual[key]} != ${reproduced[key]})`;
    }
    return "aggregate identity changed without a ledger entry difference";
  }

  function launcherIdentity(location: string, workspace: string): string {
    const bytes: Buffer = fs.readFileSync(location);
    if (bytes.includes(0)) return EvidenceBenchmarkHash.bytes(bytes);
    const content: string = bytes.toString("utf8");
    if (!Buffer.from(content, "utf8").equals(bytes))
      return EvidenceBenchmarkHash.bytes(bytes);
    return EvidenceBenchmarkHash.bytes(
      normalizeWorkspacePath(content, workspace),
    );
  }

  function normalizeWorkspacePath(input: string, workspace: string): string {
    const workspaces: readonly string[] = [
      ...new Set([path.resolve(workspace), fs.realpathSync(workspace)]),
    ];
    const variants: [string, string][] = [
      ...workspaces.flatMap((root) =>
        pathSpellings(root).map(
          (value) => [value, "<workspace>"] as [string, string],
        ),
      ),
      ...workspaces.flatMap((root) =>
        pathSpellings(path.dirname(root)).map(
          (value) => [value, "<cell>"] as [string, string],
        ),
      ),
    ];
    let output: string = input;
    for (const [variant, replacement] of [...new Map(variants).entries()].sort(
      ([left], [right]) => right.length - left.length,
    ))
      output = output.replaceAll(variant, replacement);
    return output;
  }

  function pathSpellings(location: string): string[] {
    const output: string[] = [
      location,
      location.replaceAll("\\", "/"),
      location.replaceAll("/", "\\"),
    ];
    const drive: RegExpMatchArray | null = location.match(
      /^([A-Za-z]):[\\/](.*)$/,
    );
    if (drive !== null)
      output.push(
        `/mnt/${drive[1]!.toLowerCase()}/${drive[2]!.replaceAll("\\", "/")}`,
      );
    return [...new Set(output)];
  }

  function normalizedDependencyTarget(
    workspace: string,
    virtualStore: string,
    direct: string,
  ): string {
    const target: string = fs.realpathSync(direct);
    const virtualRelation: string | undefined = containedRelation(
      virtualStore,
      target,
    );
    if (virtualRelation !== undefined) return `virtual:${virtualRelation}`;
    const workspaceRelation: string | undefined = containedRelation(
      fs.realpathSync(workspace),
      target,
    );
    if (
      workspaceRelation !== undefined &&
      !workspaceRelation
        .split("/")
        .some((segment) => segment === "node_modules")
    )
      return `workspace:${workspaceRelation}`;
    throw new Error(
      `Benchmark direct dependency escaped pnpm and workspace ownership: ${direct} -> ${target}.`,
    );
  }

  function containedRelation(root: string, target: string): string | undefined {
    const relative: string = path.relative(root, target);
    if (
      relative === "" ||
      relative === ".." ||
      relative.startsWith(`..${path.sep}`) ||
      path.isAbsolute(relative)
    )
      return relative === "" ? "." : undefined;
    return relative.split(path.sep).join("/");
  }

  function portableRelation(root: string, target: string): string {
    const relative: string | undefined = containedRelation(root, target);
    if (relative === undefined || relative === ".")
      throw new Error(
        `Benchmark dependency payload escaped its virtual store: ${target}.`,
      );
    return relative;
  }

  function readDeclaredDependencies(
    manifest: string,
  ): ReadonlyMap<string, string> {
    const parsed: unknown = JSON.parse(fs.readFileSync(manifest, "utf8"));
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed))
      throw new Error(
        `Benchmark package manifest is not an object: ${manifest}.`,
      );
    const output: Map<string, string> = new Map();
    const installedSections: Map<string, string> = new Map();
    for (const section of [
      "dependencies",
      "devDependencies",
      "optionalDependencies",
      "peerDependencies",
    ] as const) {
      const value: unknown = (parsed as Record<string, unknown>)[section];
      if (value === undefined) continue;
      if (
        typeof value !== "object" ||
        value === null ||
        Array.isArray(value) ||
        Object.values(value).some((specifier) => typeof specifier !== "string")
      )
        throw new Error(
          `Benchmark package ${section} is not string-valued: ${manifest}.`,
        );
      for (const [name, specifier] of Object.entries(
        value as Record<string, string>,
      )) {
        const installed: string | undefined = installedSections.get(name);
        if (
          section !== "peerDependencies" &&
          installed !== undefined &&
          installed !== "peerDependencies"
        )
          throw new Error(
            `Benchmark package dependency has conflicting installed sections: ${manifest}#${name}.`,
          );
        if (section !== "peerDependencies")
          installedSections.set(name, section);
        else installedSections.set(name, installed ?? section);
        output.set(`${section}.${name}`, specifier);
      }
    }
    return output;
  }

  function directPackageNames(modules: string): readonly string[] {
    const output: string[] = [];
    for (const entry of fs.readdirSync(modules, { withFileTypes: true })) {
      if (entry.name.startsWith(".")) {
        if (
          ![
            ".bin",
            ".modules.yaml",
            ".pnpm",
            ".pnpm-workspace-state.json",
          ].includes(entry.name)
        )
          throw new Error(
            `Benchmark dependency root contains an unowned hidden payload: ${path.join(modules, entry.name)}.`,
          );
        continue;
      }
      if (entry.name.startsWith("@")) {
        if (!entry.isDirectory())
          throw new Error(
            `Benchmark dependency scope is not a directory: ${path.join(modules, entry.name)}.`,
          );
        for (const child of fs.readdirSync(path.join(modules, entry.name), {
          withFileTypes: true,
        })) {
          if (!child.isDirectory() && !child.isSymbolicLink())
            throw new Error(
              `Benchmark direct package is not a directory link: ${path.join(modules, entry.name, child.name)}.`,
            );
          output.push(`${entry.name}/${child.name}`);
        }
      } else {
        if (!entry.isDirectory() && !entry.isSymbolicLink())
          throw new Error(
            `Benchmark direct package is not a directory link: ${path.join(modules, entry.name)}.`,
          );
        output.push(entry.name);
      }
    }
    return output.sort((left, right) => left.localeCompare(right, "en"));
  }

  function readLockDependencies(
    lockfile: string,
  ): ReadonlyMap<string, ILockedDependency> {
    const stat: fs.Stats | undefined = fs.lstatSync(lockfile, {
      throwIfNoEntry: false,
    });
    if (!stat?.isFile() || stat.isSymbolicLink())
      throw new Error("Benchmark installation has no real pnpm-lock.yaml.");
    const partial: Map<string, Partial<ILockedDependency>> = new Map();
    let importers: boolean = false;
    let importer: string | undefined;
    let section: string | undefined;
    let dependency: string | undefined;
    for (const line of fs.readFileSync(lockfile, "utf8").split(/\r?\n/)) {
      if (line.includes("\t"))
        throw new Error("Benchmark pnpm lockfile may not contain tabs.");
      if (line === "importers:") {
        importers = true;
        continue;
      }
      if (!importers) continue;
      if (line.length !== 0 && !line.startsWith(" ")) break;
      const indentation: number = line.match(/^ */)![0].length;
      const trimmed: string = line.trim();
      if (trimmed.length === 0 || trimmed.startsWith("#")) continue;
      if (indentation === 2 && trimmed.endsWith(":")) {
        importer = yamlScalar(trimmed.slice(0, -1));
        section = undefined;
        dependency = undefined;
      } else if (
        indentation === 4 &&
        trimmed.endsWith(":") &&
        [
          "dependencies",
          "devDependencies",
          "optionalDependencies",
          "peerDependencies",
        ].includes(trimmed.slice(0, -1))
      ) {
        section = trimmed.slice(0, -1);
        dependency = undefined;
      } else if (
        indentation === 6 &&
        section !== undefined &&
        trimmed.endsWith(":")
      )
        dependency = yamlScalar(trimmed.slice(0, -1));
      else if (
        indentation === 8 &&
        importer !== undefined &&
        section !== undefined &&
        dependency !== undefined &&
        (trimmed.startsWith("specifier:") || trimmed.startsWith("version:"))
      ) {
        const separator: number = trimmed.indexOf(":");
        const field: keyof ILockedDependency = trimmed.slice(
          0,
          separator,
        ) as keyof ILockedDependency;
        const value: string = yamlScalar(trimmed.slice(separator + 1).trim());
        const key: string = `${importer}\0${section}\0${dependency}`;
        const record: Partial<ILockedDependency> = partial.get(key) ?? {};
        if (record[field] !== undefined)
          throw new Error(
            `Benchmark pnpm lockfile duplicates an importer dependency ${field}: ${importer}#${section}.${dependency}.`,
          );
        record[field] = value;
        partial.set(key, record);
      }
    }
    const output: Map<string, ILockedDependency> = new Map();
    for (const [key, value] of partial) {
      if (value.specifier === undefined || value.version === undefined)
        throw new Error(
          `Benchmark pnpm lockfile has an incomplete importer dependency: ${key.replaceAll("\0", "#")}.`,
        );
      output.set(key, {
        specifier: value.specifier,
        version: value.version,
      });
    }
    return output;
  }

  function yamlScalar(input: string): string {
    if (input.startsWith("'") && input.endsWith("'"))
      return input.slice(1, -1).replaceAll("''", "'");
    if (input.startsWith('"') && input.endsWith('"')) {
      const parsed: unknown = JSON.parse(input);
      if (typeof parsed === "string") return parsed;
    }
    return input;
  }

  function resolvePackageManifest(
    workspace: string,
    resolver: NodeJS.Require,
    name: string,
  ): string | undefined {
    let manifest: string | undefined;
    try {
      manifest = resolver.resolve(`${name}/package.json`);
    } catch {}
    if (manifest === undefined) {
      let entry: string;
      try {
        entry = fs.realpathSync(resolver.resolve(name));
      } catch {
        return undefined;
      }
      let directory: string = path.dirname(entry);
      for (;;) {
        const candidate: string = path.join(directory, "package.json");
        if (fs.existsSync(candidate)) {
          const parsed: unknown = JSON.parse(
            fs.readFileSync(candidate, "utf8"),
          );
          if (
            typeof parsed === "object" &&
            parsed !== null &&
            !Array.isArray(parsed) &&
            "name" in parsed &&
            parsed.name === name
          ) {
            manifest = candidate;
            break;
          }
        }
        const parent: string = path.dirname(directory);
        if (parent === directory) return undefined;
        directory = parent;
      }
    }
    const real: string = fs.realpathSync(manifest);
    if (installedRelation(workspace, real) === undefined)
      throw new Error(
        `Benchmark gate package escaped the cell installation: ${name} at ${real}.`,
      );
    return real;
  }

  function requireInstalledManifest(
    workspace: string,
    resolver: NodeJS.Require,
    name: string,
  ): string {
    const manifest: string | undefined = resolvePackageManifest(
      workspace,
      resolver,
      name,
    );
    if (manifest === undefined)
      throw new Error(`Benchmark gate package is not installed: ${name}.`);
    return manifest;
  }

  function capturePackageClosure(
    workspace: string,
    manifest: string,
    output: Record<string, string>,
    resolutions: IEvidenceBenchmarkSetup.IResolution[],
    visited: Set<string>,
  ): void {
    const real: string = fs.realpathSync(manifest);
    if (visited.has(real)) return;
    visited.add(real);
    const parsed: Record<string, unknown> = readPackage(real);
    const packageRoot: string = path.dirname(real);
    const identity: string = packageIdentity(workspace, real);
    output[identity] = EvidenceBenchmarkHash.tree(
      EvidenceBenchmarkHash.directory(packageRoot),
    );
    const dependencies: Set<string> = new Set();
    for (const section of [
      "dependencies",
      "optionalDependencies",
      "peerDependencies",
    ] as const) {
      const value: unknown =
        section in parsed
          ? (parsed as Record<string, unknown>)[section]
          : undefined;
      if (typeof value !== "object" || value === null || Array.isArray(value))
        continue;
      for (const dependency of Object.keys(value)) dependencies.add(dependency);
    }
    const resolver: NodeJS.Require = createRequire(real);
    for (const dependency of [...dependencies].sort((left, right) =>
      left.localeCompare(right, "en"),
    )) {
      const child: string | undefined = resolvePackageManifest(
        workspace,
        resolver,
        dependency,
      );
      if (child === undefined) continue;
      resolutions.push({
        from: identity,
        dependency,
        to: packageIdentity(workspace, child),
      });
      capturePackageClosure(workspace, child, output, resolutions, visited);
    }
  }

  function captureRecordedPackages(
    workspace: string,
    expected: Readonly<Record<string, string>>,
  ): Readonly<Record<string, string>> {
    const output: Record<string, string> = {};
    for (const identity of Object.keys(expected).sort((left, right) =>
      left.localeCompare(right, "en"),
    )) {
      const packageRoot: string = packageRootFromIdentity(workspace, identity);
      const manifest: string = path.join(packageRoot, "package.json");
      if (packageIdentity(workspace, manifest) !== identity)
        throw new Error(
          `Benchmark installed package identity drifted: ${identity}.`,
        );
      output[identity] = EvidenceBenchmarkHash.tree(
        EvidenceBenchmarkHash.directory(packageRoot),
      );
    }
    return output;
  }

  function resolutionsRestored(
    workspace: string,
    packages: Readonly<Record<string, string>>,
    resolutions: readonly IEvidenceBenchmarkSetup.IResolution[],
  ): boolean {
    const workspaceResolvers: ReadonlyMap<string, NodeJS.Require> = new Map(
      workspacePackageRoots(workspace).map(
        ([label, root]) =>
          [label, createRequire(path.join(root, "package.json"))] as const,
      ),
    );
    for (const resolution of resolutions) {
      if (
        typeof resolution !== "object" ||
        resolution === null ||
        typeof resolution.from !== "string" ||
        typeof resolution.dependency !== "string" ||
        resolution.dependency.length === 0 ||
        typeof resolution.to !== "string" ||
        !(resolution.to in packages)
      )
        return false;
      let resolver: NodeJS.Require | undefined = workspaceResolvers.get(
        resolution.from,
      );
      if (resolver === undefined) {
        if (!(resolution.from in packages)) return false;
        resolver = createRequire(
          path.join(
            packageRootFromIdentity(workspace, resolution.from),
            "package.json",
          ),
        );
      }
      const target: string | undefined = resolvePackageManifest(
        workspace,
        resolver,
        resolution.dependency,
      );
      if (
        target === undefined ||
        packageIdentity(workspace, target) !== resolution.to
      )
        return false;
    }
    return (
      JSON.stringify([...resolutions].sort(compareResolution)) ===
      JSON.stringify(resolutions)
    );
  }

  function packageIdentity(workspace: string, manifest: string): string {
    const real: string = fs.realpathSync(manifest);
    const parsed: Record<string, unknown> = readPackage(real);
    const relative: string | undefined = installedRelation(
      workspace,
      path.dirname(real),
    );
    if (relative === undefined || relative === ".")
      throw new Error(
        `Benchmark installed package identity escaped its installation: ${real}.`,
      );
    return `${String(parsed.name)}@${String(parsed.version)}:${relative}`;
  }

  function packageRootFromIdentity(
    workspace: string,
    identity: string,
  ): string {
    const separator: number = identity.lastIndexOf(":");
    const relative: string =
      separator === -1 ? "" : identity.slice(separator + 1);
    const segments: string[] = relative.split("/");
    if (
      relative.length === 0 ||
      relative.includes("\\") ||
      path.posix.isAbsolute(relative) ||
      path.win32.isAbsolute(relative) ||
      segments.some(
        (segment) =>
          segment.length === 0 || segment === "." || segment === "..",
      )
    )
      throw new Error(
        `Benchmark installed package identity has an unsafe path: ${identity}.`,
      );
    const installed: string = installedRoot(workspace);
    const candidate: string = path.resolve(installed, ...segments);
    const relation: string = path.relative(installed, candidate);
    if (
      relation === "" ||
      relation === ".." ||
      relation.startsWith(`..${path.sep}`) ||
      path.isAbsolute(relation)
    )
      throw new Error(
        `Benchmark installed package identity escaped its installation: ${identity}.`,
      );
    const stat: fs.Stats | undefined = fs.lstatSync(candidate, {
      throwIfNoEntry: false,
    });
    if (!stat?.isDirectory() || stat.isSymbolicLink())
      throw new Error(
        `Benchmark installed package is not a real directory: ${identity}.`,
      );
    return fs.realpathSync(candidate);
  }

  function installedRoot(workspace: string): string {
    const installed: string = path.resolve(workspace, "node_modules");
    const stat: fs.Stats | undefined = fs.lstatSync(installed, {
      throwIfNoEntry: false,
    });
    if (!stat?.isDirectory() || stat.isSymbolicLink())
      throw new Error(
        `Benchmark dependency root is not a real directory: ${installed}.`,
      );
    return installed;
  }

  function installedRelation(
    workspace: string,
    target: string,
  ): string | undefined {
    const installed: string = installedRoot(workspace);
    for (const root of new Set([installed, fs.realpathSync(installed)])) {
      const relative: string | undefined = containedRelation(root, target);
      if (relative !== undefined) return relative;
    }
    return undefined;
  }

  function readPackage(manifest: string): Record<string, unknown> {
    const parsed: unknown = JSON.parse(fs.readFileSync(manifest, "utf8"));
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      Array.isArray(parsed) ||
      !("name" in parsed) ||
      typeof parsed.name !== "string" ||
      !("version" in parsed) ||
      typeof parsed.version !== "string"
    )
      throw new Error(
        `Installed gate package has no name or version: ${manifest}.`,
      );
    return parsed as Record<string, unknown>;
  }

  function compareResolution(
    left: IEvidenceBenchmarkSetup.IResolution,
    right: IEvidenceBenchmarkSetup.IResolution,
  ): number {
    return (
      left.from.localeCompare(right.from, "en") ||
      left.dependency.localeCompare(right.dependency, "en") ||
      left.to.localeCompare(right.to, "en")
    );
  }

  function captureInstalledLaunchers(
    workspace: string,
  ): Readonly<Record<string, string>> {
    const commands: ReadonlySet<string> = new Set([
      "corepack",
      "nestia",
      "node",
      "playwright",
      "pnpm",
      "prisma",
      "rimraf",
      "ttsc",
      "ttsx",
      "vite",
    ]);
    const output: Record<string, string> = {};
    for (const [label, packageRoot] of [
      ["root", workspace],
      ["config", path.join(workspace, "config")],
      ["api", path.join(workspace, "packages", "api")],
      ["backend", path.join(workspace, "packages", "backend")],
      ["frontend", path.join(workspace, "packages", "frontend")],
    ] as const) {
      const root: string = path.join(packageRoot, "node_modules", ".bin");
      if (fs.existsSync(root) === false) continue;
      for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
        const command: string = entry.name.split(".")[0]!;
        if (!commands.has(command)) continue;
        const location: string = path.join(root, entry.name);
        const stat: fs.Stats = fs.lstatSync(location);
        const key: string = `${label}/${entry.name}`;
        if (stat.isSymbolicLink())
          output[key] = EvidenceBenchmarkHash.bytes(
            `symlink\0${fs.readlinkSync(location)}`,
          );
        else if (stat.isFile())
          output[key] = EvidenceBenchmarkHash.file(location);
        else
          throw new Error(
            `Benchmark command launcher is not a file or symbolic link: ${location}.`,
          );
      }
    }
    if (
      Object.keys(output).some(
        (entry) => entry.split("/")[1]!.split(".")[0] === "ttsc",
      ) === false
    )
      throw new Error("Benchmark installation has no ttsc launcher.");
    return Object.fromEntries(
      Object.entries(output).sort(([left], [right]) =>
        left.localeCompare(right, "en"),
      ),
    );
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
