import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import typia from "typia";

import type { IEvidenceBenchmarkWorkspaceArtifact } from "./structures/IEvidenceBenchmarkWorkspaceArtifact.ts";
import { EvidenceBenchmarkRuntime } from "./EvidenceBenchmarkRuntime.ts";
import type { IEvidenceBenchmarkWorkspaceRequest } from "./structures/IEvidenceBenchmarkWorkspaceRequest.ts";
import type { IEvidenceBenchmarkWorkspaceResult } from "./structures/IEvidenceBenchmarkWorkspaceResult.ts";
import type { IEvidenceBenchmarkWorkspaceVariables } from "./structures/IEvidenceBenchmarkWorkspaceVariables.ts";

/**
 * Materializes one immutable benchmark workspace before native model work.
 *
 * It applies the selected template treatment, copies opaque requirements,
 * installs dependencies, commits the neutral baseline, and publishes the
 * workspace with one atomic rename.
 */
export namespace EvidenceBenchmarkWorkspace {
  /** Renders the current non-product agent instruction surface. */
  export function prepareInstructionSurface(request: {
    repository: string;
    arm: "plain" | "evidence";
    variables: IEvidenceBenchmarkWorkspaceVariables;
  }): string {
    const root: string = fs.mkdtempSync(
      path.join(os.tmpdir(), "evidence-benchmark-instructions-"),
    );
    try {
      const template: string = path.resolve(
        request.repository,
        "benchmark/template",
      );
      fs.copyFileSync(
        path.join(template, "base", "AGENTS.md"),
        path.join(root, "AGENTS.md"),
      );
      fs.cpSync(
        path.join(template, "base", ".agents"),
        path.join(root, ".agents"),
        { recursive: true },
      );
      renderBase(root, request.variables);
      applyOverlay(
        path.join(template, request.arm),
        root,
        request.variables,
        (relative) =>
          relative === "AGENTS.md" || relative.startsWith(".agents/"),
      );
      return root;
    } catch (error) {
      fs.rmSync(root, { recursive: true, force: true });
      throw error;
    }
  }

  /** Reinstalls ignored dependencies after a checkpoint workspace is restored. */
  export async function installDependencies(workspace: string): Promise<void> {
    const environment: NodeJS.ProcessEnv = { ...process.env };
    for (const name of Object.keys(environment))
      if (name.toUpperCase() === "EVIDENCE_BENCHMARK_ARCHIVE")
        delete environment[name];
    // Restoring a checkpoint installs the same way preparation does, so it must
    // strip the launching agent's identity for the same reason.
    EvidenceBenchmarkRuntime.stripLauncherIdentity(environment);
    await pnpm(
      ["install", "--no-frozen-lockfile"],
      path.resolve(workspace),
      environment,
    );
  }

  /**
   * Builds and atomically publishes the prepared workspace for one cell.
   *
   * Failure removes only the private stage directory and never exposes a
   * partially prepared final run path.
   */
  export async function prepareWorkspace(
    request: IEvidenceBenchmarkWorkspaceRequest,
  ): Promise<IEvidenceBenchmarkWorkspaceResult> {
    const output: string = path.resolve(request.output);
    if (fs.existsSync(output))
      throw new Error(`Benchmark workspace already exists: ${output}.`);
    const parent: string = path.dirname(output);
    fs.mkdirSync(parent, { recursive: true });
    const stage: string = fs.mkdtempSync(path.join(parent, ".tmp-"));
    const workspace: string = path.join(stage, "workspace");
    // Set once the rename succeeds, so a later failure cleans the settled tree
    // rather than a staging directory that no longer exists.
    let settled: string | undefined;
    try {
      const template: string = path.resolve(
        request.repository,
        "benchmark/template",
      );
      fs.cpSync(path.join(template, "base"), workspace, { recursive: true });
      renderBase(workspace, request.variables);
      applyOverlay(
        path.join(template, request.arm),
        workspace,
        request.variables,
      );
      const requirements: string = path.resolve(
        request.repository,
        "benchmark/requirements",
        request.project,
      );
      const analysis: string = path.join(workspace, "docs", "analysis");
      fs.mkdirSync(path.dirname(analysis), { recursive: true });
      fs.cpSync(requirements, analysis, { recursive: true });
      if (request.arm === "evidence") {
        if (request.artifact === undefined)
          throw new Error("Evidence workspace requires a package artifact.");
        injectEvidence(workspace, request.artifact);
      }
      const environment: NodeJS.ProcessEnv = { ...process.env };
      for (const name of Object.keys(environment))
        if (name.toUpperCase() === "EVIDENCE_BENCHMARK_ARCHIVE")
          delete environment[name];
      // Preparation runs the same package manager the cell will, so it must not
      // carry the launching agent's identity either.
      EvidenceBenchmarkRuntime.stripLauncherIdentity(environment);
      // Settle the workspace before installing into it. A package manager links
      // a workspace dependency by absolute path — pnpm writes a junction on
      // Windows — so an install that runs while the tree is still staged leaves
      // every `packages/*/node_modules/<dep>` pointing at a staging directory
      // the rename then destroys. The delivered tree resolves nothing, and the
      // agent's first act is a repair it should never have had to make.
      fs.renameSync(stage, output);
      settled = path.join(output, "workspace");
      await pnpm(["install", "--no-frozen-lockfile"], settled, environment);
      await run("git", ["init", "-b", "benchmark"], settled, environment);
      await run("git", ["add", "-A"], settled, environment);
      await run(
        "git",
        [
          "-c",
          "user.name=Benchmark Runner",
          "-c",
          "user.email=benchmark-runner@localhost",
          "commit",
          "-m",
          "Prepare benchmark workspace",
        ],
        settled,
        environment,
      );
      return {
        root: output,
        workspace: settled,
      };
    } catch (error) {
      fs.rmSync(settled === undefined ? stage : output, {
        recursive: true,
        force: true,
      });
      throw error;
    }
  }
  function renderBase(
    root: string,
    variables: IEvidenceBenchmarkWorkspaceVariables,
  ): void {
    visitFiles(root, (file) => {
      const source: string = fs.readFileSync(file, "utf8");
      fs.writeFileSync(file, render(source, variables));
    });
  }
  function applyOverlay(
    overlay: string,
    workspace: string,
    variables: IEvidenceBenchmarkWorkspaceVariables,
    accept: (relative: string) => boolean = () => true,
  ): void {
    if (!fs.existsSync(overlay)) return;
    visitFiles(overlay, (source, relative) => {
      if (!accept(relative)) return;
      const target: string = path.join(workspace, ...relative.split("/"));
      let content: string = fs.readFileSync(source, "utf8");
      if (content.includes("{{base}}")) {
        if (path.extname(source).toLowerCase() !== ".md")
          throw new Error(
            `Only Markdown overlays may splice {{base}}: ${relative}.`,
          );
        const body: string = markdownBody(fs.readFileSync(target, "utf8"));
        const marker = "<!-- benchmark-template-splice: base-body -->";
        content = content
          .replaceAll(`${marker}\n{{base}}`, () => body)
          .replaceAll(`${marker}\r\n{{base}}`, () => body);
      }
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, render(content, variables));
    });
  }
  function markdownBody(source: string): string {
    const withoutFrontmatter: string = source.replace(
      /^(?:\uFEFF)?---\r?\n[\s\S]*?\r?\n---\r?\n/,
      "",
    );
    return withoutFrontmatter.replace(/^# [^\r\n]*(?:\r?\n){1,2}/, "");
  }
  function render(
    source: string,
    variables: IEvidenceBenchmarkWorkspaceVariables,
  ): string {
    let output: string = source;
    for (const [name, value] of Object.entries(variables))
      output = output.replaceAll(`{{${name}}}`, () => value);
    return output;
  }
  function injectEvidence(
    workspace: string,
    artifact: IEvidenceBenchmarkWorkspaceArtifact,
  ): void {
    const dependency: string = ".benchmark-deps/evidence.tgz";
    const target: string = path.join(workspace, ...dependency.split("/"));
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(path.resolve(artifact.archive), target);
    const location: string = path.join(workspace, "package.json");
    const manifest = typia.assert<{
      devDependencies?: Record<string, string>;
    }>(JSON.parse(fs.readFileSync(location, "utf8")));
    manifest.devDependencies ??= {};
    manifest.devDependencies[artifact.name] = `file:${dependency}`;
    fs.writeFileSync(location, `${JSON.stringify(manifest, null, 2)}\n`);
  }
  function visitFiles(
    root: string,
    closure: (file: string, relative: string) => void,
  ): void {
    const visit = (directory: string, relative: string): void => {
      for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const child: string = path.posix.join(relative, entry.name);
        const location: string = path.join(root, ...child.split("/"));
        if (entry.isDirectory()) visit(location, child);
        else if (entry.isFile()) closure(location, child);
        else throw new Error(`Template entry is not a regular file: ${child}.`);
      }
    };
    visit(root, "");
  }
  async function pnpm(
    arguments_: readonly string[],
    workspace: string,
    environment: NodeJS.ProcessEnv,
  ): Promise<void> {
    const entrypoint: string | undefined = process.env.npm_execpath;
    if (entrypoint === undefined)
      throw new Error("prepareWorkspace must be launched through pnpm.");
    return run(
      process.execPath,
      [entrypoint, ...arguments_],
      workspace,
      environment,
    );
  }
  async function run(
    command: string,
    arguments_: readonly string[],
    cwd: string,
    environment: NodeJS.ProcessEnv,
  ): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const child = spawn(command, arguments_, {
        cwd,
        env: environment,
        shell: false,
        windowsHide: true,
        stdio: "inherit",
      });
      child.once("error", reject);
      child.once("close", (status) =>
        status === 0
          ? resolve()
          : reject(
              new Error(`${command} exited with status ${String(status)}.`),
            ),
      );
    });
  }
}
