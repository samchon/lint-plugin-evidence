import fs from "node:fs";
import path from "node:path";

import { EvidenceBenchmarkHash } from "./EvidenceBenchmarkHash.ts";
import { EvidenceBenchmarkLintBaseline } from "./EvidenceBenchmarkLintBaseline.ts";
import { EvidenceBenchmarkMaterializer } from "./EvidenceBenchmarkMaterializer.ts";
import { EvidenceBenchmarkProcess } from "./EvidenceBenchmarkProcess.ts";
import { EvidenceBenchmarkProject } from "./EvidenceBenchmarkProject.ts";
import { EvidenceBenchmarkRuntime } from "./EvidenceBenchmarkRuntime.ts";
import { EvidenceBenchmarkSandbox } from "./EvidenceBenchmarkSandbox.ts";
import { EvidenceBenchmarkSetup } from "./EvidenceBenchmarkSetup.ts";
import { EvidenceBenchmarkTurnLedger } from "./EvidenceBenchmarkTurnLedger.ts";
import type { IEvidenceBenchmarkMaterialization } from "./structures/IEvidenceBenchmarkMaterialization.ts";

/**
 * Publishes one accepted benchmark workspace into an explicit consolidated
 * result repository.
 */
export namespace EvidenceBenchmarkPublication {
  const ARMS = ["evidence", "plain"] as const;
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

  /** Clean-install boundary injected by deterministic publication fixtures. */
  export type Reproducer = typeof EvidenceBenchmarkSetup.assertReproducible;

  /** Installed CLI-version boundary injected by deterministic fixtures. */
  export type VersionReader = typeof EvidenceBenchmarkSandbox.version;

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
      project: EvidenceBenchmarkProject.parse(projectInput!),
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
    reproduce: Reproducer = EvidenceBenchmarkSetup.assertReproducible,
    readCliVersion: VersionReader = EvidenceBenchmarkSandbox.version,
  ): Promise<IResult> {
    const sourceRoot: string = path.resolve(sourceRepository);
    EvidenceBenchmarkProject.parse(request.project);
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
      elapsedMs?: unknown;
      controllerPid?: unknown;
      status?: unknown;
      sourceCommit?: unknown;
      instructionsTreeSha256?: unknown;
      completedWorkspaceTreeSha256?: unknown;
      threadId?: unknown;
      lintBaselines?: readonly IEvidenceBenchmarkMaterialization.ILintConfigBaseline[];
      runtime?: EvidenceBenchmarkRuntime.IAssignment;
      turns?: Array<{
        name?: unknown;
        elapsedMs?: unknown;
        status?: unknown;
        stdout?: unknown;
        stderr?: unknown;
        invocation?: unknown;
        accepted?: unknown;
        threadId?: unknown;
        modelPid?: unknown;
        lintRestorationSha256?: unknown;
        installationReproductionSha256?: unknown;
      }>;
    };
    if (
      state.schemaVersion !== 8 ||
      state.workflow !== "backend-first-gated-v2" ||
      state.project !== request.project ||
      state.arm !== request.arm ||
      state.engine !== "codex" ||
      state.model !== "gpt-5.6-terra" ||
      state.effort !== "high" ||
      state.cliVersion !== readCliVersion() ||
      typeof state.elapsedMs !== "number" ||
      !Number.isFinite(state.elapsedMs) ||
      state.elapsedMs < 0 ||
      !Number.isSafeInteger(state.controllerPid) ||
      Number(state.controllerPid) <= 0 ||
      state.status !== "completed" ||
      typeof state.sourceCommit !== "string" ||
      !/^[0-9a-f]{40}$/i.test(state.sourceCommit) ||
      typeof state.instructionsTreeSha256 !== "string" ||
      typeof state.completedWorkspaceTreeSha256 !== "string" ||
      typeof state.threadId !== "string" ||
      state.threadId.length === 0 ||
      !Array.isArray(state.lintBaselines) ||
      !Array.isArray(state.turns)
    )
      throw new Error(
        `Publication requires the completed ${request.project}/${request.arm} run ${request.runId}.`,
      );
    EvidenceBenchmarkRuntime.assertAssignment(state.runtime);
    EvidenceBenchmarkTurnLedger.assertAcceptedOrder(state.turns, true);
    const instructions: string = path.join(runRoot, "inputs", "instructions");
    const instructionFiles: Map<string, Uint8Array> =
      EvidenceBenchmarkHash.directory(instructions);
    const expectedInstructionFiles: readonly string[] = [
      `backend/${request.arm}-final.md`,
      "backend/review.md",
      "backend/start.md",
      `frontend/${request.arm}-final.md`,
      "frontend/review.md",
      "frontend/start.md",
      `overall/${request.arm}-final.md`,
      "overall/review.md",
      "skills-contract.md",
    ];
    if (
      JSON.stringify([...instructionFiles.keys()].sort()) !==
      JSON.stringify([...expectedInstructionFiles].sort())
    )
      throw new Error(
        "Publication requires the exact nine-file frozen instruction inventory.",
      );
    if (
      EvidenceBenchmarkHash.tree(instructionFiles) !==
      state.instructionsTreeSha256
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
      manifest.schemaVersion !== 6 ||
      manifest.project !== request.project ||
      manifest.arm !== request.arm ||
      manifest.artifact.sourceCommit !== state.sourceCommit ||
      !request.runId.startsWith(`${state.sourceCommit.slice(0, 12)}-`) ||
      manifest.inputSha256 !==
        EvidenceBenchmarkHash.object({
          treeAlgorithm: manifest.treeAlgorithm,
          project: manifest.project,
          arm: manifest.arm,
          variables: manifest.variables,
          base: manifest.baseTreeSha256,
          overlay: manifest.armTreeSha256,
          requirements: manifest.requirementsTreeSha256,
          product: manifest.artifact.sha256,
          workspace: manifest.workspaceTreeSha256,
          lintBaselines: manifest.lintBaselines,
        }) ||
      EvidenceBenchmarkHash.object(manifest.lintBaselines) !==
        EvidenceBenchmarkHash.object(state.lintBaselines) ||
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
    EvidenceBenchmarkMaterializer.assertRequirementsRestored(
      workspace,
      runRoot,
    );
    EvidenceBenchmarkMaterializer.npmConfig(runRoot);
    EvidenceBenchmarkMaterializer.gitConfig(runRoot);
    EvidenceBenchmarkRuntime.assertRestored(workspace, state.runtime);
    EvidenceBenchmarkSetup.assertRestored(workspace, runRoot, request.arm);
    const ledger: EvidenceBenchmarkTurnLedger.ISummary =
      EvidenceBenchmarkTurnLedger.assertRetainedEvidence({
        runRoot,
        workspace,
        threadId: state.threadId,
        model: state.model,
        effort: state.effort,
        turns: state.turns,
      });
    if (
      state.turns.some(
        (turn) =>
          turn.accepted === true &&
          (typeof turn.installationReproductionSha256 !== "string" ||
            !/^[0-9a-f]{64}$/.test(turn.installationReproductionSha256)),
      )
    )
      throw new Error(
        "Publication requires a clean frozen-install proof for every accepted turn.",
      );
    const finalTurn = state.turns.findLast(
      (turn) =>
        turn.name === "overall-final" &&
        turn.status === 0 &&
        turn.accepted === true,
    );
    const reproducedInstallation: string = await reproduce(
      workspace,
      runRoot,
      true,
    );
    if (finalTurn?.installationReproductionSha256 !== reproducedInstallation)
      throw new Error(
        "Publication installation no longer matches the clean overall-final proof.",
      );
    EvidenceBenchmarkLintBaseline.assertRestored(
      workspace,
      request.arm,
      state.lintBaselines,
    );
    if (request.arm === "evidence") {
      const infrastructure: string =
        EvidenceBenchmarkLintBaseline.infrastructureDigest(state.lintBaselines);
      const backend: string = EvidenceBenchmarkLintBaseline.digest(
        state.lintBaselines,
        EvidenceBenchmarkLintBaseline.BACKEND_PATHS,
      );
      const complete: string = EvidenceBenchmarkLintBaseline.digest(
        state.lintBaselines,
      );
      for (const turn of state.turns.filter(
        (candidate) => candidate.accepted === true,
      )) {
        if (typeof turn.name !== "string")
          throw new Error(
            "Evidence publication retained an unnamed accepted turn.",
          );
        const expected: string =
          turn.name === "skills-contract"
            ? infrastructure
            : turn.name.startsWith("backend-")
              ? backend
              : complete;
        if (turn.lintRestorationSha256 !== expected)
          throw new Error(
            `Evidence publication ${turn.name} lint restoration proof failed verification.`,
          );
      }
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
    } else {
      const expected: string = EvidenceBenchmarkLintBaseline.digest(
        state.lintBaselines,
      );
      if (
        state.turns.some(
          (turn) =>
            turn.accepted === true && turn.lintRestorationSha256 !== expected,
        )
      )
        throw new Error(
          "Plain publication lint configuration immutability proof failed verification.",
        );
    }
    rejectSymbolicLinks(workspace);
    rejectReservedPublicationFiles(workspace);
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
    assertReport({
      value: reportValue,
      runRoot,
      request,
      state: {
        elapsedMs: state.elapsedMs,
        sourceCommit: state.sourceCommit,
        instructionsTreeSha256: state.instructionsTreeSha256,
        completedWorkspaceTreeSha256: state.completedWorkspaceTreeSha256,
      },
      requirementsTreeSha256: manifest.requirementsTreeSha256,
      ledger,
    });

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

  function assertReport(props: {
    value: unknown;
    runRoot: string;
    request: IRequest;
    state: {
      elapsedMs: number;
      sourceCommit: string;
      instructionsTreeSha256: string;
      completedWorkspaceTreeSha256: string;
    };
    requirementsTreeSha256: string;
    ledger: EvidenceBenchmarkTurnLedger.ISummary;
  }): void {
    const report = object(props.value, "benchmark report");
    if (
      report.schemaVersion !== 1 ||
      report.status !== "accepted" ||
      report.project !== props.request.project ||
      report.arm !== props.request.arm ||
      report.runId !== props.request.runId
    )
      throw new Error(
        "Benchmark report identity does not match the accepted run.",
      );
    if (props.state.elapsedMs < props.ledger.elapsedMs)
      throw new Error(
        "Benchmark controller elapsed time is shorter than its model attempts.",
      );
    const measurement = object(report.measurement, "report measurement");
    exactNumber(
      measurement.totalElapsedMs,
      props.state.elapsedMs,
      "total elapsed time",
    );
    exactNumber(
      measurement.agentElapsedMs,
      props.ledger.elapsedMs,
      "agent elapsed time",
    );
    exactNumber(
      measurement.nonAgentElapsedMs,
      props.state.elapsedMs - props.ledger.elapsedMs,
      "non-agent elapsed time",
    );
    const attempts = object(measurement.attempts, "report attempts");
    exactNumber(attempts.total, props.ledger.attempts, "attempt total");
    exactNumber(attempts.accepted, props.ledger.accepted, "accepted attempts");
    exactNumber(
      attempts.rejected,
      props.ledger.attempts - props.ledger.accepted,
      "rejected attempts",
    );
    const tokens = object(measurement.tokens, "report tokens");
    for (const category of Object.keys(props.ledger.tokens) as Array<
      keyof EvidenceBenchmarkTurnLedger.ISummary["tokens"]
    >)
      exactNumber(
        tokens[category],
        props.ledger.tokens[category],
        `token category ${category}`,
      );
    const pricing = object(measurement.pricingUsdPerMillion, "report pricing");
    const inputPrice: number = finiteNonnegative(
      pricing.input,
      "input-token price",
    );
    const cachedInputPrice: number = finiteNonnegative(
      pricing.cachedInput,
      "cached-input-token price",
    );
    const outputPrice: number = finiteNonnegative(
      pricing.output,
      "output-token price",
    );
    if (inputPrice === 0 || outputPrice === 0)
      throw new Error(
        "Benchmark report requires positive standard input and output token prices.",
      );
    const expectedCost: number =
      ((props.ledger.tokens.input_tokens -
        props.ledger.tokens.cached_input_tokens) *
        inputPrice +
        props.ledger.tokens.cached_input_tokens * cachedInputPrice +
        props.ledger.tokens.output_tokens * outputPrice) /
      1_000_000;
    const actualCost: number = finiteNonnegative(
      measurement.apiEquivalentCostUsd,
      "API-equivalent cost",
    );
    if (
      !Number.isFinite(expectedCost) ||
      Math.abs(actualCost - expectedCost) > 1e-9
    )
      throw new Error(
        "Benchmark report API-equivalent cost does not match native token totals and retained pricing.",
      );
    const gates = object(report.gates, "report gates");
    for (const gate of [
      "build",
      "lint",
      "database",
      "backendTests",
      "frontendTests",
      "runtime",
    ])
      if (gates[gate] !== "passed")
        throw new Error(`Benchmark report gate ${gate} is not passed.`);
    const coverage = object(report.coverage, "report coverage");
    for (const category of ["requirements", "tests"]) {
      const count = object(coverage[category], `${category} coverage`);
      const total: number = nonnegativeInteger(
        count.total,
        `${category} total`,
      );
      const covered: number = nonnegativeInteger(
        count.covered,
        `${category} covered`,
      );
      if (covered > total)
        throw new Error(
          `Benchmark report ${category} coverage exceeds its denominator.`,
        );
    }
    const implementation = object(
      report.implementation,
      "report implementation scale",
    );
    for (const metric of [
      "tables",
      "apiOperations",
      "dtoTypes",
      "dtoProperties",
      "testFunctions",
    ])
      nonnegativeInteger(implementation[metric], `implementation ${metric}`);
    const completion = object(report.completion, "report completion");
    if (
      completion.firstClaimTurn !== null &&
      (typeof completion.firstClaimTurn !== "string" ||
        !EvidenceBenchmarkTurnLedger.NAMES.includes(
          completion.firstClaimTurn as EvidenceBenchmarkTurnLedger.Name,
        ))
    )
      throw new Error("Benchmark report has an invalid first completion turn.");
    if (typeof completion.honest !== "boolean")
      throw new Error(
        "Benchmark report must classify first-claim completion honesty.",
      );
    const quality = object(report.quality, "report quality");
    const score: number = nonnegativeInteger(quality.score, "quality score");
    if (score > 100) throw new Error("Benchmark quality score exceeds 100.");
    if (
      typeof quality.summary !== "string" ||
      quality.summary.trim().length === 0 ||
      !Array.isArray(quality.residualDefects) ||
      quality.residualDefects.some(
        (defect) => typeof defect !== "string" || defect.trim().length === 0,
      )
    )
      throw new Error(
        "Benchmark report requires a quality summary and residual-defect inventory.",
      );
    const frozen = object(report.frozenInputs, "report frozen inputs");
    if (
      frozen.sourceCommit !== props.state.sourceCommit ||
      frozen.instructionsTreeSha256 !== props.state.instructionsTreeSha256 ||
      frozen.requirementsTreeSha256 !== props.requirementsTreeSha256 ||
      frozen.completedWorkspaceTreeSha256 !==
        props.state.completedWorkspaceTreeSha256
    )
      throw new Error(
        "Benchmark report frozen-input identities do not match the retained run.",
      );
    const interventions: string[] = retainedInterventions(
      props.runRoot,
      props.request,
      props.state.sourceCommit,
    );
    if (
      !Array.isArray(report.interventions) ||
      JSON.stringify(report.interventions) !== JSON.stringify(interventions)
    )
      throw new Error(
        "Benchmark report interventions do not match the retained repair ledger.",
      );
  }

  function retainedInterventions(
    runRoot: string,
    request: IRequest,
    sourceCommit: string,
  ): string[] {
    const directory: string = path.join(runRoot, "interventions");
    const stat: fs.Stats | undefined = fs.lstatSync(directory, {
      throwIfNoEntry: false,
    });
    if (stat === undefined) return [];
    if (!stat.isDirectory() || stat.isSymbolicLink())
      throw new Error("Benchmark intervention ledger is not a real directory.");
    const entries: fs.Dirent[] = fs.readdirSync(directory, {
      withFileTypes: true,
    });
    if (
      entries.some(
        (entry) =>
          !entry.isFile() ||
          entry.isSymbolicLink() ||
          !/^[0-9a-f]{64}\.(?:json|patch)$/.test(entry.name),
      )
    )
      throw new Error("Benchmark intervention ledger has an invalid entry.");
    const names: Set<string> = new Set(entries.map((entry) => entry.name));
    const hashes: string[] = [
      ...new Set(entries.map((entry) => entry.name.slice(0, 64))),
    ].sort();
    for (const sha256 of hashes) {
      const json: string = `${sha256}.json`;
      const patchName: string = `${sha256}.patch`;
      if (!names.has(json) || !names.has(patchName))
        throw new Error(
          `Benchmark intervention ${sha256} has no exact patch/record pair.`,
        );
      const patch: Buffer = fs.readFileSync(path.join(directory, patchName));
      const record = object(
        JSON.parse(fs.readFileSync(path.join(directory, json), "utf8")),
        `intervention ${sha256}`,
      );
      const kind: unknown = record.kind;
      if (
        record.schemaVersion !== 1 ||
        (kind !== "operator-intervention" && kind !== "frozen-input-hotfix") ||
        record.patchSha256 !== sha256 ||
        record.patch !== path.posix.join("interventions", patchName) ||
        record.sourceCommit !== sourceCommit ||
        EvidenceBenchmarkHash.bytes(patch) !== sha256 ||
        !Array.isArray(record.scope) ||
        !record.scope.includes(`${request.project}/${request.arm}`) ||
        typeof record.elapsedMs !== "number" ||
        !Number.isFinite(record.elapsedMs) ||
        record.elapsedMs < 0 ||
        record.measurement !==
          (kind === "frozen-input-hotfix"
            ? "clean"
            : "qualified-by-recorded-operator-intervention")
      )
        throw new Error(
          `Benchmark intervention ${sha256} failed provenance verification.`,
        );
    }
    return hashes;
  }

  function object(value: unknown, label: string): Record<string, unknown> {
    if (typeof value !== "object" || value === null || Array.isArray(value))
      throw new Error(`Benchmark ${label} must be a JSON object.`);
    return value as Record<string, unknown>;
  }

  function finiteNonnegative(value: unknown, label: string): number {
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0)
      throw new Error(`Benchmark report ${label} must be nonnegative.`);
    return value;
  }

  function nonnegativeInteger(value: unknown, label: string): number {
    const output: number = finiteNonnegative(value, label);
    if (!Number.isSafeInteger(output))
      throw new Error(`Benchmark report ${label} must be an integer.`);
    return output;
  }

  function exactNumber(value: unknown, expected: number, label: string): void {
    const actual: number = finiteNonnegative(value, label);
    if (actual !== expected)
      throw new Error(
        `Benchmark report ${label} is ${actual}, expected ${expected}.`,
      );
  }

  function shouldPublish(source: string): boolean {
    const name: string = path.basename(source);
    const lower: string = name.toLowerCase();
    if ([".benchmark-cache", ".git", "node_modules"].includes(lower))
      return false;
    if (
      lower === ".env" ||
      (lower.startsWith(".env.") && lower !== ".env.example")
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

  function rejectReservedPublicationFiles(workspace: string): void {
    for (const name of ["benchmark.json", "benchmark-report.json"]) {
      const location: string = path.join(workspace, name);
      if (fs.lstatSync(location, { throwIfNoEntry: false }) !== undefined)
        throw new Error(
          `Completed workspace owns reserved publication path: ${name}.`,
        );
    }
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
