import fs from "node:fs";
import path from "node:path";

import { EvidenceBenchmarkHash } from "./EvidenceBenchmarkHash.ts";
import { EvidenceBenchmarkProcess } from "./EvidenceBenchmarkProcess.ts";
import type { IEvidenceBenchmarkMaterialization } from "./structures/IEvidenceBenchmarkMaterialization.ts";

/**
 * Publishes one completed benchmark workspace as a new public GitHub
 * repository.
 */
export namespace EvidenceBenchmarkPublication {
  const ARMS = ["evidence", "plain"] as const;
  const PROJECTS = ["todo", "reddit", "shopping", "erp"] as const;

  /** Explicit publication request parsed from the benchmark command line. */
  export interface IRequest {
    /** GitHub login that must also own the authenticated CLI session. */
    owner: string;

    /** Completed benchmark subject to publish. */
    project: IEvidenceBenchmarkMaterialization.Project;

    /** Completed comparison arm to publish. */
    arm: IEvidenceBenchmarkMaterialization.Arm;

    /** Exact completed run whose workspace becomes the repository source. */
    runId: string;
  }

  /** Observable identity of a repository created and pushed successfully. */
  export interface IResult {
    /** Fully qualified GitHub repository name. */
    repository: string;

    /** Public GitHub URL reported by the authenticated CLI. */
    url: string;

    /** Exact benchmark run published into the repository. */
    runId: string;

    /** Git commit proven equal on the local and remote main branches. */
    commitSha: string;
  }

  /** Process boundary injected by deterministic tests instead of the real CLI. */
  export type Runner = typeof EvidenceBenchmarkProcess.run;

  /** Parses an owner-explicit, public-only publication request. */
  export function parse(arguments_: readonly string[]): IRequest {
    const values: string[] = arguments_.filter((value) => value !== "--");
    const positional: string[] = [];
    let owner: string | undefined;
    let publicConfirmed: boolean = false;
    for (let index: number = 0; index < values.length; index++) {
      const value: string = values[index]!;
      if (value === "--owner") {
        if (owner !== undefined)
          throw new Error("GitHub owner may be specified only once.");
        owner = values[++index];
        if (owner === undefined)
          throw new Error("--owner requires a GitHub login.");
      } else if (value.startsWith("--owner=")) {
        if (owner !== undefined)
          throw new Error("GitHub owner may be specified only once.");
        owner = value.slice("--owner=".length);
      } else if (value === "--public") publicConfirmed = true;
      else if (value.startsWith("--"))
        throw new Error(`Unknown publication option: ${value}.`);
      else positional.push(value);
    }
    if (owner === undefined)
      throw new Error("Publication requires --owner <github-login>.");
    if (!publicConfirmed)
      throw new Error("Publication requires an explicit --public flag.");
    if (!isGitHubLogin(owner))
      throw new Error(`Invalid GitHub owner login: ${owner}.`);
    if (positional.length !== 3)
      throw new Error(
        "Usage: benchmark publish --owner <github-login> --public <project> <arm> <run-id>",
      );
    const [projectInput, armInput, runId] = positional;
    if (!PROJECTS.includes(projectInput as (typeof PROJECTS)[number]))
      throw new Error(`Unknown benchmark project: ${projectInput}.`);
    if (!ARMS.includes(armInput as (typeof ARMS)[number]))
      throw new Error(`Unknown benchmark arm: ${armInput}.`);
    if (
      runId === undefined ||
      !/^[0-9a-f]{12}-[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        runId,
      )
    )
      throw new Error(`Invalid benchmark run ID: ${runId ?? ""}.`);
    return {
      owner,
      project: projectInput as IEvidenceBenchmarkMaterialization.Project,
      arm: armInput as IEvidenceBenchmarkMaterialization.Arm,
      runId,
    };
  }

  /** Returns the stable evidence-default and plain-suffixed repository name. */
  export function repositoryName(
    project: IEvidenceBenchmarkMaterialization.Project,
    arm: IEvidenceBenchmarkMaterialization.Arm,
  ): string {
    return `evidence-benchmark-${project}${arm === "plain" ? "-plain" : ""}`;
  }

  /**
   * Creates and pushes one new public repository, rolling it back on push
   * failure.
   */
  export async function publish(
    sourceRepository: string,
    request: IRequest,
    run: Runner = EvidenceBenchmarkProcess.run,
  ): Promise<IResult> {
    const sourceRoot: string = path.resolve(sourceRepository);
    const resultsRoot: string = path.join(sourceRoot, "benchmark", "result");
    const runRoot: string = path.resolve(
      resultsRoot,
      request.project,
      request.arm,
      "runs",
      request.runId,
    );
    assertInside(resultsRoot, runRoot, "publication run");
    const statePath: string = path.join(runRoot, "run.json");
    if (!fs.existsSync(statePath))
      throw new Error(`Completed benchmark state was not found: ${statePath}.`);
    const state = JSON.parse(fs.readFileSync(statePath, "utf8")) as {
      schemaVersion?: unknown;
      workflow?: unknown;
      project?: unknown;
      arm?: unknown;
      status?: unknown;
      sourceCommit?: unknown;
      instructionsTreeSha256?: unknown;
      turns?: Array<{ name?: unknown; status?: unknown }>;
    };
    if (
      state.schemaVersion !== 3 ||
      state.workflow !== "backend-first-gated-v1" ||
      state.project !== request.project ||
      state.arm !== request.arm ||
      state.status !== "completed" ||
      typeof state.sourceCommit !== "string" ||
      typeof state.instructionsTreeSha256 !== "string" ||
      !Array.isArray(state.turns)
    )
      throw new Error(
        `Publication requires the completed ${request.project}/${request.arm} run ${request.runId}.`,
      );
    const expectedTurns: readonly string[] = [
      "backend-start",
      "backend-review",
      "backend-final",
      "frontend-start",
      "frontend-review",
      "frontend-final",
      "overall-review",
      "overall-final",
    ];
    for (const name of expectedTurns)
      if (
        state.turns.filter((turn) => turn.name === name && turn.status === 0)
          .length !== 1
      )
        throw new Error(
          `Publication requires exactly one successful ${name} turn.`,
        );
    const instructions: string = path.join(runRoot, "inputs", "instructions");
    if (
      EvidenceBenchmarkHash.tree(
        EvidenceBenchmarkHash.directory(instructions),
      ) !== state.instructionsTreeSha256
    )
      throw new Error(
        "Frozen publication instructions failed identity verification.",
      );
    const manifest = JSON.parse(
      fs.readFileSync(path.join(runRoot, "materialization.json"), "utf8"),
    ) as IEvidenceBenchmarkMaterialization.IManifest;
    if (
      manifest.schemaVersion !== 3 ||
      manifest.project !== request.project ||
      manifest.arm !== request.arm ||
      manifest.artifact.sourceCommit !== state.sourceCommit ||
      EvidenceBenchmarkHash.tree(
        EvidenceBenchmarkHash.directory(
          path.join(runRoot, "inputs", "requirements"),
        ),
      ) !== manifest.requirementsTreeSha256
    )
      throw new Error(
        "Publication materialization provenance failed verification.",
      );
    const workspace: string = path.join(runRoot, "workspace");
    const workspaceStat: fs.Stats | undefined = fs.lstatSync(workspace, {
      throwIfNoEntry: false,
    });
    if (!workspaceStat?.isDirectory() || workspaceStat.isSymbolicLink())
      throw new Error(`Completed workspace was not found: ${workspace}.`);
    if (request.arm === "evidence") {
      const relativeArchive: string | undefined =
        manifest.artifact.relativeArchive;
      if (relativeArchive === undefined)
        throw new Error(
          "Evidence publication has no retained product archive.",
        );
      if (
        relativeArchive.includes("\\") ||
        path.posix.isAbsolute(relativeArchive) ||
        relativeArchive
          .split("/")
          .some((part) => part === "" || part === "." || part === "..")
      )
        throw new Error(
          `Evidence publication has an unsafe product archive path: ${relativeArchive}.`,
        );
      const archive: string = path.resolve(
        runRoot,
        "workspace",
        ...relativeArchive.split("/"),
      );
      assertInside(workspace, archive, "publication product archive");
      const archiveStat: fs.Stats | undefined = fs.lstatSync(archive, {
        throwIfNoEntry: false,
      });
      if (
        !archiveStat?.isFile() ||
        archiveStat.isSymbolicLink() ||
        EvidenceBenchmarkHash.bytes(fs.readFileSync(archive)) !==
          manifest.artifact.sha256
      )
        throw new Error(
          "Evidence publication product archive failed verification.",
        );
    }
    rejectSymbolicLinks(workspace);

    const targetName: string = repositoryName(request.project, request.arm);
    const target: string = `${request.owner}/${targetName}`;
    const viewer: string = (
      await run("gh", ["api", "user", "--jq", ".login"], {
        cwd: sourceRoot,
        label: "authenticated GitHub owner",
      })
    ).stdout.trim();
    if (viewer.toLowerCase() !== request.owner.toLowerCase())
      throw new Error(
        `Refusing to publish ${target}: authenticated GitHub login is ${viewer || "unknown"}.`,
      );
    const existing = await run("gh", ["api", `repos/${target}`, "--silent"], {
      cwd: sourceRoot,
      allowFailure: true,
      label: "GitHub publication collision check",
    });
    if (existing.status === 0)
      throw new Error(`Refusing to overwrite existing repository ${target}.`);
    if (!/\bHTTP 404\b|Not Found/i.test(existing.stderr))
      throw new Error(
        `Could not prove that GitHub repository ${target} is absent:\n${existing.stderr.trim()}`,
      );

    const workRoot: string = path.join(sourceRoot, "benchmark", ".work");
    fs.mkdirSync(workRoot, { recursive: true });
    const stage: string = fs.mkdtempSync(
      path.join(workRoot, `publication-${targetName}-`),
    );
    let created: boolean = false;
    try {
      fs.cpSync(workspace, stage, {
        recursive: true,
        filter: shouldPublish,
      });
      writeTrustedWorkflow(sourceRoot, stage);
      await run("git", ["init", "-b", "main"], {
        cwd: stage,
        label: "publication repository initialization",
      });
      await run("git", ["add", "-A"], {
        cwd: stage,
        label: "publication source staging",
      });
      const staged = await run("git", ["diff", "--cached", "--quiet"], {
        cwd: stage,
        allowFailure: true,
        label: "publication source presence",
      });
      if (staged.status !== 1)
        throw new Error(
          staged.status === 0
            ? "Refusing to publish an empty benchmark workspace."
            : "Could not verify the staged publication workspace.",
        );
      await run(
        "git",
        [
          "-c",
          "user.name=Evidence Benchmark",
          "-c",
          "user.email=evidence-benchmark@localhost",
          "commit",
          "-m",
          `Publish ${request.project} ${request.arm} benchmark`,
        ],
        { cwd: stage, label: "publication source commit" },
      );
      const commitSha: string = (
        await run("git", ["rev-parse", "HEAD"], {
          cwd: stage,
          label: "publication source commit identity",
        })
      ).stdout.trim();
      await run(
        "gh",
        [
          "repo",
          "create",
          target,
          "--public",
          "--description",
          `${request.project} benchmark generated in ${request.arm} mode`,
        ],
        { cwd: sourceRoot, label: "public benchmark repository creation" },
      );
      created = true;
      const url: string = (
        await run(
          "gh",
          ["repo", "view", target, "--json", "url", "--jq", ".url"],
          { cwd: sourceRoot, label: "public benchmark repository URL" },
        )
      ).stdout.trim();
      await run("git", ["remote", "add", "origin", url], {
        cwd: stage,
        label: "publication remote configuration",
      });
      await run("git", ["push", "--set-upstream", "origin", "main"], {
        cwd: stage,
        label: "public benchmark repository push",
      });
      const remoteCommit: string = (
        await run(
          "gh",
          ["api", `repos/${target}/commits/main`, "--jq", ".sha"],
          { cwd: sourceRoot, label: "public benchmark remote commit" },
        )
      ).stdout.trim();
      if (remoteCommit !== commitSha)
        throw new Error(
          `Published main commit drifted: local ${commitSha}, remote ${remoteCommit}.`,
        );
      return {
        repository: target,
        url,
        runId: request.runId,
        commitSha,
      };
    } catch (error) {
      if (created)
        try {
          await run("gh", ["repo", "delete", target, "--yes"], {
            cwd: sourceRoot,
            label: "failed publication rollback",
          });
        } catch (rollback) {
          throw new AggregateError(
            [error, rollback],
            `Publication failed and the newly created repository ${target} could not be rolled back.`,
          );
        }
      throw error;
    } finally {
      fs.rmSync(stage, { recursive: true, force: true });
    }
  }

  function isGitHubLogin(value: string): boolean {
    return (
      value.length <= 39 &&
      /^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?$/.test(value) &&
      !value.includes("--")
    );
  }

  function shouldPublish(source: string): boolean {
    const name: string = path.basename(source);
    if ([".git", "node_modules"].includes(name)) return false;
    if (
      name === ".env" ||
      (name.startsWith(".env.") && name !== ".env.example")
    )
      return false;
    return true;
  }

  function rejectSymbolicLinks(root: string): void {
    const visit = (directory: string): void => {
      for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const location: string = path.join(directory, entry.name);
        if (entry.isSymbolicLink())
          throw new Error(
            `Refusing to publish a workspace containing a symbolic link: ${location}.`,
          );
        if (entry.isDirectory() && shouldPublish(location)) visit(location);
        else if (!entry.isDirectory() && !entry.isFile())
          throw new Error(
            `Refusing to publish a non-regular workspace entry: ${location}.`,
          );
      }
    };
    visit(root);
  }

  function writeTrustedWorkflow(sourceRoot: string, stage: string): void {
    const frontendPackagePath: string = path.join(
      stage,
      "packages",
      "frontend",
      "package.json",
    );
    const frontendPackage = JSON.parse(
      fs.readFileSync(frontendPackagePath, "utf8"),
    ) as { name?: unknown };
    if (
      typeof frontendPackage.name !== "string" ||
      !/^@[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*$/.test(
        frontendPackage.name,
      )
    )
      throw new Error(
        "Publication requires a safe scoped frontend package name for CI.",
      );
    const source: string = fs.readFileSync(
      path.join(
        sourceRoot,
        "benchmark",
        "template",
        "base",
        ".github",
        "workflows",
        "ci.yml",
      ),
      "utf8",
    );
    const rendered: string = source.replaceAll(
      "{{frontendPackageName}}",
      frontendPackage.name,
    );
    if (/\{\{[^{}]+\}\}/.test(rendered))
      throw new Error(
        "Publication CI contains an unresolved template variable.",
      );
    const workflows: string = path.join(stage, ".github", "workflows");
    fs.rmSync(workflows, { recursive: true, force: true });
    fs.mkdirSync(workflows, { recursive: true });
    fs.writeFileSync(path.join(workflows, "ci.yml"), rendered, "utf8");
  }

  function assertInside(parent: string, target: string, label: string): void {
    const relative: string = path.relative(parent, target);
    if (
      relative === "" ||
      relative.startsWith(`..${path.sep}`) ||
      path.isAbsolute(relative)
    )
      throw new Error(`${label} escaped its parent: ${target}.`);
  }
}
