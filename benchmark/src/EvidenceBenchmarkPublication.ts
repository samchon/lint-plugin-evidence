import fs from "node:fs";
import path from "node:path";

import { EvidenceBenchmarkHash } from "./EvidenceBenchmarkHash.ts";
import { EvidenceBenchmarkProcess } from "./EvidenceBenchmarkProcess.ts";
import type { IEvidenceBenchmarkMaterialization } from "./structures/IEvidenceBenchmarkMaterialization.ts";

/**
 * Publishes one accepted benchmark workspace into an explicit consolidated
 * result repository.
 */
export namespace EvidenceBenchmarkPublication {
  const ARMS = ["evidence", "plain"] as const;
  const PROJECTS = ["todo", "reddit", "shopping", "erp"] as const;
  /** Explicit publication request parsed from the benchmark command line. */
  export interface IRequest {
    /** Existing public GitHub repository in owner/name form. */
    repository: string;

    /** Clean local checkout of the result repository. */
    checkout: string;

    /** Completed benchmark subject to publish. */
    project: IEvidenceBenchmarkMaterialization.Project;

    /** Completed comparison arm to publish. */
    arm: IEvidenceBenchmarkMaterialization.Arm;

    /** Exact completed run whose workspace becomes the repository source. */
    runId: string;
  }

  /** Observable identity of a result commit pushed successfully. */
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

  /** Identifies the exact publishable bytes of one completed workspace. */
  export function workspaceSha256(root: string): string {
    const files: Map<string, Uint8Array> = new Map();
    const visit = (directory: string, relative: string): void => {
      for (const entry of fs
        .readdirSync(directory, { withFileTypes: true })
        .sort((left, right) => left.name.localeCompare(right.name))) {
        const location: string = path.join(directory, entry.name);
        if (!shouldPublish(location)) continue;
        const child: string =
          relative.length === 0
            ? entry.name
            : path.posix.join(relative, entry.name);
        if (entry.isSymbolicLink())
          throw new Error(
            `Refusing to identify a workspace containing a symbolic link: ${location}.`,
          );
        if (entry.isDirectory()) visit(location, child);
        else if (entry.isFile()) files.set(child, fs.readFileSync(location));
        else
          throw new Error(
            `Refusing to identify a non-regular workspace entry: ${location}.`,
          );
      }
    };
    visit(path.resolve(root), "");
    return EvidenceBenchmarkHash.tree(files);
  }

  /** Parses an explicit result-repository publication request. */
  export function parse(arguments_: readonly string[]): IRequest {
    const values: string[] = arguments_.filter((value) => value !== "--");
    const positional: string[] = [];
    let repository: string | undefined;
    let checkout: string | undefined;
    let publicConfirmed: boolean = false;
    for (let index: number = 0; index < values.length; index++) {
      const value: string = values[index]!;
      if (value === "--repository") {
        if (repository !== undefined)
          throw new Error("Result repository may be specified only once.");
        repository = values[++index];
        if (repository === undefined)
          throw new Error("--repository requires owner/name.");
      } else if (value.startsWith("--repository=")) {
        if (repository !== undefined)
          throw new Error("Result repository may be specified only once.");
        repository = value.slice("--repository=".length);
      } else if (value === "--checkout") {
        if (checkout !== undefined)
          throw new Error("Result checkout may be specified only once.");
        checkout = values[++index];
        if (checkout === undefined)
          throw new Error("--checkout requires a local path.");
      } else if (value.startsWith("--checkout=")) {
        if (checkout !== undefined)
          throw new Error("Result checkout may be specified only once.");
        checkout = value.slice("--checkout=".length);
      } else if (value === "--public") publicConfirmed = true;
      else if (value.startsWith("--"))
        throw new Error(`Unknown publication option: ${value}.`);
      else positional.push(value);
    }
    if (repository === undefined)
      throw new Error("Publication requires --repository <owner/name>.");
    if (checkout === undefined)
      throw new Error("Publication requires --checkout <local-path>.");
    if (!publicConfirmed)
      throw new Error("Publication requires an explicit --public flag.");
    if (!isGitHubRepository(repository))
      throw new Error(`Invalid GitHub repository: ${repository}.`);
    if (positional.length !== 3)
      throw new Error(
        "Usage: benchmark publish --repository <owner/name> --checkout <local-path> --public <project> <arm> <run-id>",
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
      repository,
      checkout,
      project: projectInput as IEvidenceBenchmarkMaterialization.Project,
      arm: armInput as IEvidenceBenchmarkMaterialization.Arm,
      runId,
    };
  }

  /**
   * Replaces one accepted leaf and pushes one commit to the explicit public
   * result repository.
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
      engine?: unknown;
      model?: unknown;
      effort?: unknown;
      cliVersion?: unknown;
      status?: unknown;
      sourceCommit?: unknown;
      instructionsTreeSha256?: unknown;
      completedWorkspaceTreeSha256?: unknown;
      turns?: Array<{
        name?: unknown;
        status?: unknown;
        invocation?: unknown;
      }>;
    };
    if (
      state.schemaVersion !== 5 ||
      state.workflow !== "backend-first-gated-v2" ||
      state.project !== request.project ||
      state.arm !== request.arm ||
      state.engine !== "codex" ||
      state.model !== "gpt-5.6-terra" ||
      state.effort !== "high" ||
      typeof state.cliVersion !== "string" ||
      state.cliVersion.length === 0 ||
      state.status !== "completed" ||
      typeof state.sourceCommit !== "string" ||
      !/^[0-9a-f]{40}$/i.test(state.sourceCommit) ||
      typeof state.instructionsTreeSha256 !== "string" ||
      typeof state.completedWorkspaceTreeSha256 !== "string" ||
      !Array.isArray(state.turns)
    )
      throw new Error(
        `Publication requires the completed ${request.project}/${request.arm} run ${request.runId}.`,
      );
    const expectedTurns: readonly string[] = [
      "skills-contract",
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
        state.turns.filter(
          (turn) =>
            turn.name === name &&
            turn.status === 0 &&
            Array.isArray(turn.invocation) &&
            turn.invocation.every((value) => typeof value === "string"),
        ).length !== 1
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
    ) as Omit<IEvidenceBenchmarkMaterialization.IManifest, "schemaVersion"> & {
      schemaVersion: unknown;
    };
    if (
      (manifest.schemaVersion !== 3 && manifest.schemaVersion !== 4) ||
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
    if (workspaceSha256(workspace) !== state.completedWorkspaceTreeSha256)
      throw new Error(
        "Completed benchmark workspace failed identity verification.",
      );

    const report: string = path.join(runRoot, "benchmark-report.json");
    const reportStat: fs.Stats | undefined = fs.lstatSync(report, {
      throwIfNoEntry: false,
    });
    if (!reportStat?.isFile() || reportStat.isSymbolicLink())
      throw new Error(
        `Operator-accepted benchmark report was not found: ${report}.`,
      );
    const reportValue: unknown = JSON.parse(fs.readFileSync(report, "utf8"));
    if (
      typeof reportValue !== "object" ||
      reportValue === null ||
      Array.isArray(reportValue)
    )
      throw new Error("Benchmark report must be a JSON object.");

    const target: string = request.repository;
    const [owner] = target.split("/");
    const checkout: string = path.resolve(request.checkout);
    assertSeparateRepositories(sourceRoot, checkout);
    const viewer: string = (
      await run("gh", ["api", "user", "--jq", ".login"], {
        cwd: sourceRoot,
        label: "authenticated GitHub owner",
      })
    ).stdout.trim();
    if (viewer.toLowerCase() !== owner!.toLowerCase())
      throw new Error(
        `Refusing to publish ${target}: authenticated GitHub login is ${viewer || "unknown"}.`,
      );
    const visibility: string = (
      await run("gh", ["api", `repos/${target}`, "--jq", ".visibility"], {
        cwd: sourceRoot,
        label: "public result repository verification",
      })
    ).stdout.trim();
    if (visibility.toLowerCase() !== "public")
      throw new Error(
        `Refusing to publish ${target}: repository visibility is ${visibility || "unknown"}.`,
      );
    const branch: string = await assertCheckout(run, checkout, target);

    const workRoot: string = path.join(sourceRoot, "benchmark", ".work");
    fs.mkdirSync(workRoot, { recursive: true });
    const stage: string = fs.mkdtempSync(
      path.join(workRoot, `publication-${request.project}-${request.arm}-`),
    );
    const relativeLeaf: string = [
      String(state.engine),
      slug(String(state.model)),
      request.project,
      request.arm,
    ].join("/");
    const leaf: string = path.join(checkout, ...relativeLeaf.split("/"));
    assertInside(checkout, leaf, "publication leaf");
    const backup: string = path.join(stage, "previous");
    const prepared: string = path.join(stage, "prepared");
    const baseCommit: string = (
      await run("git", ["rev-parse", "HEAD"], {
        cwd: checkout,
        label: "result repository base commit",
      })
    ).stdout.trim();
    let leafMutated: boolean = false;
    let pushed: boolean = false;
    try {
      fs.cpSync(workspace, prepared, {
        recursive: true,
        filter: shouldPublish,
      });
      fs.rmSync(path.join(prepared, ".github", "workflows"), {
        recursive: true,
        force: true,
      });
      fs.copyFileSync(report, path.join(prepared, "benchmark-report.json"));
      fs.writeFileSync(
        path.join(prepared, "benchmark.json"),
        `${JSON.stringify(
          {
            schemaVersion: 1,
            agent: state.engine,
            model: slug(String(state.model)),
            providerModel: state.model,
            effort: state.effort,
            project: request.project,
            mode: request.arm,
            status: "accepted",
            runId: request.runId,
            sourceCommit: state.sourceCommit,
            instructionsTreeSha256: state.instructionsTreeSha256,
            requirementsTreeSha256: manifest.requirementsTreeSha256,
            completedWorkspaceTreeSha256: state.completedWorkspaceTreeSha256,
          },
          null,
          2,
        )}\n`,
        "utf8",
      );
      rejectSymbolicLinks(prepared);
      if (fs.existsSync(leaf)) fs.cpSync(leaf, backup, { recursive: true });
      leafMutated = true;
      fs.rmSync(leaf, { recursive: true, force: true });
      fs.mkdirSync(path.dirname(leaf), { recursive: true });
      fs.renameSync(prepared, leaf);
      await run("node", ["scripts/discover-results.mjs"], {
        cwd: checkout,
        label: "consolidated result inventory validation",
      });
      await run("git", ["add", "-A", "--", relativeLeaf], {
        cwd: checkout,
        label: "result leaf staging",
      });
      const staged = await run("git", ["diff", "--cached", "--quiet"], {
        cwd: checkout,
        allowFailure: true,
        label: "result change presence",
      });
      if (staged.status !== 1)
        throw new Error(
          staged.status === 0
            ? "Refusing to publish an unchanged benchmark result."
            : "Could not verify the staged benchmark result.",
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
          `Publish ${state.engine} ${state.model} ${request.project} ${request.arm}`,
        ],
        { cwd: checkout, label: "benchmark result commit" },
      );
      const commitSha: string = (
        await run("git", ["rev-parse", "HEAD"], {
          cwd: checkout,
          label: "benchmark result commit identity",
        })
      ).stdout.trim();
      const url: string = (
        await run(
          "gh",
          ["repo", "view", target, "--json", "url", "--jq", ".url"],
          { cwd: sourceRoot, label: "public benchmark repository URL" },
        )
      ).stdout.trim();
      const push = await run("git", ["push", "origin", branch], {
        cwd: checkout,
        allowFailure: true,
        label: "consolidated benchmark result push",
      });
      pushed = push.status === 0;
      const remote = await run(
        "gh",
        ["api", `repos/${target}/commits/${branch}`, "--jq", ".sha"],
        {
          cwd: sourceRoot,
          allowFailure: true,
          label: "public benchmark remote commit",
        },
      );
      const remoteCommit: string = remote.stdout.trim();
      if (remote.status === 0 && remoteCommit === commitSha) pushed = true;
      if (push.status !== 0 && !pushed)
        throw new Error(
          `Benchmark result push failed and the remote branch remained at ${remoteCommit || "an unverified revision"}:\n${push.stderr.trim()}`,
        );
      if (remoteCommit !== commitSha)
        throw new Error(
          `Published ${branch} commit drifted: local ${commitSha}, remote ${remoteCommit}.`,
        );
      return {
        repository: target,
        url,
        runId: request.runId,
        commitSha,
      };
    } catch (error) {
      if (!pushed && leafMutated)
        try {
          await run("git", ["reset", "--mixed", baseCommit], {
            cwd: checkout,
            label: "failed result commit rollback",
          });
          fs.rmSync(leaf, { recursive: true, force: true });
          if (fs.existsSync(backup)) {
            fs.mkdirSync(path.dirname(leaf), { recursive: true });
            fs.cpSync(backup, leaf, { recursive: true });
          }
        } catch (rollback) {
          throw new AggregateError(
            [error, rollback],
            `Publication failed and the local result leaf ${relativeLeaf} could not be rolled back.`,
          );
        }
      throw error;
    } finally {
      fs.rmSync(stage, { recursive: true, force: true });
    }
  }

  function isGitHubRepository(value: string): boolean {
    const parts: string[] = value.split("/");
    return (
      parts.length === 2 &&
      parts[0]!.length <= 39 &&
      /^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?$/.test(parts[0]!) &&
      !parts[0]!.includes("--") &&
      parts[1]!.length <= 100 &&
      /^[A-Za-z0-9_.-]+$/.test(parts[1]!) &&
      parts[1] !== "." &&
      parts[1] !== ".."
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

  async function assertCheckout(
    run: Runner,
    checkout: string,
    repository: string,
  ): Promise<string> {
    const topLevel: string = (
      await run("git", ["rev-parse", "--show-toplevel"], {
        cwd: checkout,
        label: "result checkout root",
      })
    ).stdout.trim();
    if (path.resolve(topLevel) !== checkout)
      throw new Error(`Result checkout root is ${topLevel}, not ${checkout}.`);
    const status: string = (
      await run("git", ["status", "--porcelain"], {
        cwd: checkout,
        label: "result checkout cleanliness",
      })
    ).stdout.trim();
    if (status.length !== 0)
      throw new Error("Result checkout must be clean before publication.");
    const branch: string = (
      await run("git", ["branch", "--show-current"], {
        cwd: checkout,
        label: "result checkout branch",
      })
    ).stdout.trim();
    if (branch !== "main" && branch !== "master")
      throw new Error(
        `Result checkout must use main or master, found ${branch}.`,
      );
    const remote: string = (
      await run("git", ["remote", "get-url", "origin"], {
        cwd: checkout,
        label: "result checkout origin",
      })
    ).stdout.trim();
    if (
      normalizeGitHubRemote(remote).toLowerCase() !== repository.toLowerCase()
    )
      throw new Error(
        `Result checkout origin is ${remote}, not GitHub repository ${repository}.`,
      );
    await run("git", ["fetch", "origin", branch], {
      cwd: checkout,
      label: "result checkout remote refresh",
    });
    const [local, upstream] = await Promise.all([
      run("git", ["rev-parse", "HEAD"], {
        cwd: checkout,
        label: "result checkout local revision",
      }),
      run("git", ["rev-parse", `origin/${branch}`], {
        cwd: checkout,
        label: "result checkout remote revision",
      }),
    ]);
    if (local.stdout.trim() !== upstream.stdout.trim())
      throw new Error("Result checkout must exactly match its remote branch.");
    await run("node", ["scripts/discover-results.mjs"], {
      cwd: checkout,
      label: "existing consolidated result inventory validation",
    });
    return branch;
  }

  function normalizeGitHubRemote(value: string): string {
    const match: RegExpExecArray | null =
      /^(?:https:\/\/github\.com\/|git@github\.com:)([^/]+\/[^/]+?)(?:\.git)?$/i.exec(
        value,
      );
    if (match === null)
      throw new Error(
        `Result checkout origin is not a GitHub repository: ${value}.`,
      );
    return match[1]!;
  }

  function slug(value: string): string {
    const output: string = value
      .toLowerCase()
      .replace(/[^a-z0-9.-]+/g, "-")
      .replace(/^[.-]+|[.-]+$/g, "");
    if (output.length === 0)
      throw new Error(`Cannot derive a filesystem slug from model ${value}.`);
    return output;
  }

  function assertSeparateRepositories(
    sourceRepository: string,
    resultRepository: string,
  ): void {
    const sourceToResult: string = path.relative(
      sourceRepository,
      resultRepository,
    );
    const resultToSource: string = path.relative(
      resultRepository,
      sourceRepository,
    );
    if (
      sourceToResult === "" ||
      (!sourceToResult.startsWith(`..${path.sep}`) &&
        !path.isAbsolute(sourceToResult)) ||
      (!resultToSource.startsWith(`..${path.sep}`) &&
        !path.isAbsolute(resultToSource))
    )
      throw new Error(
        "The benchmark source and consolidated result checkout must be separate repositories.",
      );
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
