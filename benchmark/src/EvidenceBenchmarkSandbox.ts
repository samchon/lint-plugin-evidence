import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { EvidenceBenchmarkProcess } from "./EvidenceBenchmarkProcess.ts";

/** Runs model-authored commands inside the same deny-by-default sandbox. */
export namespace EvidenceBenchmarkSandbox {
  /** Filesystem authorities needed by one isolated workspace. */
  export interface IAuthority {
    /** Only writable source tree. */
    workspace: string;

    /** Retained exact-version package-manager launcher directory. */
    toolchain: string;

    /** Retained Corepack payload directory. */
    corepack: string;

    /** Empty retained npm configuration. */
    npmConfig: string;

    /** Empty retained Git configuration. */
    gitConfig: string;
  }

  /** Resolved Codex launcher and any Node entrypoint prefix. */
  export interface IExecutable {
    /** Direct executable. */
    command: string;

    /** Arguments before the Codex subcommand. */
    prefix: string[];
  }

  /** Derives a collision-resistant run-scoped name from frozen authorities. */
  export function permissionProfileName(
    authority: IAuthority,
    access: "bootstrap" | "read" | "write" = "write",
  ): string {
    const identity: string = crypto
      .createHash("sha256")
      .update(
        JSON.stringify({
          access,
          workspace: path.resolve(authority.workspace),
          toolchain: path.resolve(authority.toolchain),
          corepack: path.resolve(authority.corepack),
          npmConfig: path.resolve(authority.npmConfig),
          gitConfig: path.resolve(authority.gitConfig),
        }),
      )
      .digest("hex")
      .slice(0, 24);
    return `benchmark-${access}-${identity}`;
  }

  /** Exact permission-profile arguments shared by model and gate launches. */
  export function permissionProfileArguments(
    authority: IAuthority,
    access: "bootstrap" | "read" | "write" = "write",
  ): string[] {
    const profile: string = permissionProfileName(authority, access);
    const permissionRead = (location: string): string =>
      `permissions.${profile}.filesystem.${JSON.stringify(path.resolve(location))}="read"`;
    const permissionWrite = (location: string): string =>
      `permissions.${profile}.filesystem.${JSON.stringify(path.resolve(location))}="write"`;
    return [
      "--config",
      `default_permissions="${profile}"`,
      "--config",
      `permissions.${profile}.extends="${access === "write" ? ":workspace" : ":minimal"}"`,
      "--config",
      `permissions.${profile}.filesystem.":root"="deny"`,
      "--config",
      `permissions.${profile}.filesystem.":minimal"="read"`,
      "--config",
      `permissions.${profile}.filesystem.":slash_tmp"="deny"`,
      ...(access !== "write"
        ? ["--config", permissionRead(authority.workspace)]
        : []),
      "--config",
      permissionRead(authority.toolchain),
      "--config",
      access === "bootstrap"
        ? permissionWrite(authority.corepack)
        : permissionRead(authority.corepack),
      "--config",
      permissionRead(authority.npmConfig),
      "--config",
      permissionRead(authority.gitConfig),
      "--config",
      permissionRead(process.execPath),
      "--config",
      permissionRead(EvidenceBenchmarkProcess.corepackEntrypoint()),
      "--config",
      `permissions.${profile}.network.enabled=true`,
      "--config",
      `permissions.${profile}.network.domains."*"="allow"`,
      "--config",
      `permissions.${profile}.network.domains."127.0.0.1"="allow"`,
      "--config",
      `permissions.${profile}.network.domains."localhost"="allow"`,
    ];
  }

  /** Builds an exact sandbox wrapper around one untrusted command. */
  export function argumentsFor(
    authority: IAuthority,
    command: string,
    arguments_: readonly string[],
    access: "bootstrap" | "write" = "write",
  ): string[] {
    const profile: string = permissionProfileName(authority, access);
    return [
      "sandbox",
      "--permission-profile",
      profile,
      "--include-managed-config",
      "--cd",
      authority.workspace,
      ...permissionProfileArguments(authority, access),
      "--",
      command,
      ...arguments_,
    ];
  }

  /** Runs one untrusted command with only the declared authority. */
  export function run(
    authority: IAuthority,
    command: string,
    arguments_: readonly string[],
    options: EvidenceBenchmarkProcess.IOptions,
    access: "bootstrap" | "write" = "write",
  ): Promise<EvidenceBenchmarkProcess.IResult> {
    const executable: IExecutable = resolveExecutable();
    return EvidenceBenchmarkProcess.run(
      executable.command,
      [
        ...executable.prefix,
        ...argumentsFor(authority, command, arguments_, access),
      ],
      options,
    );
  }

  /** Resolves the installed native Codex launcher or its npm entrypoint. */
  export function resolveExecutable(): IExecutable {
    if (process.platform !== "win32") return { command: "codex", prefix: [] };
    const executable: string | undefined = findExecutableOnPath("codex.exe");
    if (executable !== undefined) return { command: executable, prefix: [] };
    const appData: string | undefined = process.env.APPDATA;
    if (appData === undefined)
      throw new Error("Codex launch on Windows requires APPDATA.");
    const entrypoint: string = path.join(
      appData,
      "npm",
      "node_modules",
      "@openai",
      "codex",
      "bin",
      "codex.js",
    );
    if (!fs.existsSync(entrypoint))
      throw new Error(`Codex CLI entrypoint was not found: ${entrypoint}.`);
    return { command: process.execPath, prefix: [entrypoint] };
  }

  /** Returns the installed Codex CLI version used by this campaign. */
  export function version(): string {
    const executable: IExecutable = resolveExecutable();
    const result = spawnSync(
      executable.command,
      [...executable.prefix, "--version"],
      {
        encoding: "utf8",
        shell: false,
        windowsHide: true,
      },
    );
    if (result.status !== 0)
      throw new Error(
        `Unable to read Codex CLI version: ${(result.stderr ?? "").trim()}`,
      );
    const version: string = (result.stdout ?? "").trim();
    if (version.length === 0)
      throw new Error("Codex CLI returned an empty version.");
    return version;
  }

  function findExecutableOnPath(name: string): string | undefined {
    const search: string = process.env.PATH ?? process.env.Path ?? "";
    for (const directory of search.split(path.delimiter)) {
      const root: string = directory.replace(/^"(.*)"$/, "$1");
      if (root.length === 0) continue;
      const candidate: string = path.join(root, name);
      const stat: fs.Stats | undefined = fs.lstatSync(candidate, {
        throwIfNoEntry: false,
      });
      if (stat?.isFile()) return fs.realpathSync(candidate);
    }
    return undefined;
  }
}
