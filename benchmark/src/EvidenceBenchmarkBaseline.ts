import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import { EvidenceBenchmarkAtomic } from "./EvidenceBenchmarkAtomic.ts";
import { EvidenceBenchmarkHash } from "./EvidenceBenchmarkHash.ts";
import { EvidenceBenchmarkProcess } from "./EvidenceBenchmarkProcess.ts";
import { EvidenceBenchmarkTemplate } from "./EvidenceBenchmarkTemplate.ts";
import type { IEvidenceBenchmarkBaseline } from "./structures/IEvidenceBenchmarkBaseline.ts";
import type { IEvidenceBenchmarkMaterialization } from "./structures/IEvidenceBenchmarkMaterialization.ts";

/** Admits one neutral scaffold revision before any benchmark cell can start. */
export namespace EvidenceBenchmarkBaseline {
  /**
   * Installs and exercises the arm-free scaffold, retaining every setup log.
   *
   * No evidence package, arm overlay, requirement corpus, lint invocation, or
   * coding agent enters this gate. Arm-specific native compilation therefore
   * remains after t0 as measured mechanism cost.
   */
  export async function prepare(
    request: IEvidenceBenchmarkBaseline.IRequest,
  ): Promise<IEvidenceBenchmarkBaseline> {
    const repository: string = path.resolve(request.repository);
    const output: string = path.resolve(request.output);
    const parent: string = path.dirname(output);
    if (output === path.parse(output).root)
      throw new Error(
        "Neutral scaffold admission output cannot be a filesystem root.",
      );
    if (fs.existsSync(output))
      throw new Error(
        `Neutral scaffold admission refuses to overwrite: ${output}.`,
      );
    fs.mkdirSync(parent, { recursive: true });
    const stage: string = fs.mkdtempSync(
      path.join(parent, `.${path.basename(output)}.${process.pid}.`),
    );
    const workspace: string = path.join(stage, "workspace");
    const logs: string = path.join(stage, "logs");
    const variables: IEvidenceBenchmarkMaterialization.IVariables = {
      name: "benchmark-neutral",
      apiPackageName: "@benchmark-neutral/api",
      backendPackageName: "@benchmark-neutral/backend",
      frontendPackageName: "@benchmark-neutral/frontend",
    };
    const steps: Partial<
      Record<IEvidenceBenchmarkBaseline.Step, IEvidenceBenchmarkBaseline.IStep>
    > = {};
    let baseTreeSha256: string | undefined;
    let renderedTreeSha256: string | undefined;
    let lockSha256: string | undefined;
    try {
      const composition: EvidenceBenchmarkTemplate.IBaseComposition =
        EvidenceBenchmarkTemplate.composeBase({
          template: path.join(repository, "benchmark", "template"),
          variables,
        });
      baseTreeSha256 = composition.baseTreeSha256;
      renderedTreeSha256 = EvidenceBenchmarkHash.tree(composition.files);
      writeTree(workspace, composition.files);
      fs.mkdirSync(logs, { recursive: false });
      const cache: string = path.join(stage, "cache");
      const environment: NodeJS.ProcessEnv = {
        ...process.env,
        CI: "1",
        API_PORT: String(38_000 + (process.pid % 1_000)),
        JWT_SECRET_KEY: "benchmark-neutral-secret-at-least-32-characters",
        JWT_ACCESS_TTL_SECONDS: "3600",
        JWT_REFRESH_TTL_SECONDS: "2592000",
        PLAYWRIGHT_TEST_PORT: String(42_000 + (process.pid % 1_000)),
        PLAYWRIGHT_BROWSERS_PATH: path.join(cache, "playwright"),
        npm_config_store_dir: path.join(cache, "pnpm-store"),
        TTSC_CACHE_DIR: path.join(cache, "ttsc"),
        TTSC_GO_CACHE_DIR: path.join(cache, "go-build"),
        GOCACHE: path.join(cache, "go-build"),
        GOTMPDIR: path.join(cache, "go-tmp"),
      };
      EvidenceBenchmarkProcess.pinEnvironment(
        environment,
        path.join(cache, "toolchain-bin"),
      );
      for (const location of [
        environment.PLAYWRIGHT_BROWSERS_PATH,
        environment.npm_config_store_dir,
        environment.TTSC_CACHE_DIR,
        environment.TTSC_GO_CACHE_DIR,
        environment.GOTMPDIR,
      ])
        fs.mkdirSync(location!, { recursive: true });

      steps["pnpm-version"] = await runStep({
        step: "pnpm-version",
        arguments: ["--version"],
        workspace,
        logs,
        environment,
      });
      const versionLog: string = fs
        .readFileSync(path.join(stage, steps["pnpm-version"].stdout), "utf8")
        .trim();
      if (versionLog !== EvidenceBenchmarkProcess.PNPM_VERSION)
        throw new Error(
          `Neutral scaffold admission requires pnpm ${EvidenceBenchmarkProcess.PNPM_VERSION}, received ${versionLog}.`,
        );
      steps.lock = await runStep({
        step: "lock",
        arguments: ["install", "--lockfile-only", "--no-frozen-lockfile"],
        workspace,
        logs,
        environment,
      });
      const lockfile: string = path.join(workspace, "pnpm-lock.yaml");
      if (!fs.existsSync(lockfile))
        throw new Error(
          "Neutral scaffold admission did not produce pnpm-lock.yaml.",
        );
      lockSha256 = EvidenceBenchmarkHash.file(lockfile);
      steps.install = await runStep({
        step: "install",
        arguments: ["install", "--frozen-lockfile"],
        workspace,
        logs,
        environment,
      });
      if (EvidenceBenchmarkHash.file(lockfile) !== lockSha256)
        throw new Error(
          "Neutral scaffold frozen install changed its admitted lockfile.",
        );

      const beforeFormat: string = sourceTreeHash(workspace);
      steps.format = await runStep({
        step: "format",
        arguments: ["format"],
        workspace,
        logs,
        environment,
      });
      const afterFormat: string = sourceTreeHash(workspace);
      if (beforeFormat !== afterFormat)
        throw new Error(
          "Neutral scaffold format changed tracked input bytes; format the template before admission.",
        );
      steps.build = await runStep({
        step: "build",
        arguments: ["build"],
        workspace,
        logs,
        environment,
      });
      steps.database = await runStep({
        step: "database",
        arguments: ["prepare:database"],
        workspace,
        logs,
        environment,
      });
      steps["backend-test"] = await runStep({
        step: "backend-test",
        arguments: ["test:backend"],
        workspace,
        logs,
        environment,
      });
      steps["browser-install"] = await runStep({
        step: "browser-install",
        arguments: [
          "--filter",
          variables.frontendPackageName,
          "playwright:install",
        ],
        workspace,
        logs,
        environment,
      });
      steps["frontend-test"] = await runStep({
        step: "frontend-test",
        arguments: ["test:frontend"],
        workspace,
        logs,
        environment,
      });

      const record: Omit<IEvidenceBenchmarkBaseline, "root" | "workspace"> = {
        baseTreeSha256,
        renderedTreeSha256,
        lockSha256,
        pnpmVersion: EvidenceBenchmarkProcess.PNPM_VERSION,
        completedAt: new Date().toISOString(),
        steps: completeSteps(steps),
      };
      fs.writeFileSync(
        path.join(stage, "baseline.json"),
        `${JSON.stringify(record, null, 2)}\n`,
        { encoding: "utf8", flag: "wx" },
      );
      await EvidenceBenchmarkAtomic.publish(stage, output);
      return {
        root: output,
        workspace: path.join(output, "workspace"),
        ...record,
      };
    } catch (error) {
      const failure = {
        status: "failed",
        failedAt: new Date().toISOString(),
        baseTreeSha256,
        renderedTreeSha256,
        lockSha256,
        steps,
        error:
          error instanceof Error
            ? { name: error.name, message: error.message, stack: error.stack }
            : { message: String(error) },
      };
      fs.writeFileSync(
        path.join(stage, "baseline.failure.json"),
        `${JSON.stringify(failure, null, 2)}\n`,
        { encoding: "utf8", flag: "wx" },
      );
      await EvidenceBenchmarkAtomic.publish(stage, output);
      throw new Error(
        `Neutral scaffold admission failed; diagnostics are preserved at ${output}.`,
        { cause: error },
      );
    }
  }

  async function runStep(props: {
    step: IEvidenceBenchmarkBaseline.Step;
    arguments: readonly string[];
    workspace: string;
    logs: string;
    environment: NodeJS.ProcessEnv;
  }): Promise<IEvidenceBenchmarkBaseline.IStep> {
    const result = await EvidenceBenchmarkProcess.pnpm(props.arguments, {
      cwd: props.workspace,
      env: props.environment,
      label: `neutral scaffold ${props.step}`,
      allowFailure: true,
    });
    const stdout: string = path.posix.join("logs", `${props.step}.stdout.log`);
    const stderr: string = path.posix.join("logs", `${props.step}.stderr.log`);
    fs.writeFileSync(
      path.join(props.logs, `${props.step}.stdout.log`),
      result.stdout,
      { encoding: "utf8", flag: "wx" },
    );
    fs.writeFileSync(
      path.join(props.logs, `${props.step}.stderr.log`),
      result.stderr,
      { encoding: "utf8", flag: "wx" },
    );
    if (result.status !== 0)
      throw new Error(
        `Neutral scaffold ${props.step} failed with status ${String(result.status)}; inspect ${stdout} and ${stderr}.`,
      );
    return { elapsedMs: result.elapsedMs, stdout, stderr };
  }

  function completeSteps(
    steps: Partial<
      Record<IEvidenceBenchmarkBaseline.Step, IEvidenceBenchmarkBaseline.IStep>
    >,
  ): Readonly<
    Record<IEvidenceBenchmarkBaseline.Step, IEvidenceBenchmarkBaseline.IStep>
  > {
    for (const step of [
      "pnpm-version",
      "lock",
      "install",
      "format",
      "build",
      "database",
      "backend-test",
      "browser-install",
      "frontend-test",
    ] as const)
      if (steps[step] === undefined)
        throw new Error(`Neutral scaffold admission did not run ${step}.`);
    return steps as Record<
      IEvidenceBenchmarkBaseline.Step,
      IEvidenceBenchmarkBaseline.IStep
    >;
  }

  function sourceTreeHash(workspace: string): string {
    const files: Map<string, Uint8Array> = new Map();
    collectSourceTree(workspace, "", files);
    return EvidenceBenchmarkHash.tree(files);
  }

  function collectSourceTree(
    workspace: string,
    relative: string,
    files: Map<string, Uint8Array>,
  ): void {
    const directory: string = path.join(
      workspace,
      ...relative.split("/").filter((segment) => segment.length !== 0),
    );
    for (const entry of fs
      .readdirSync(directory, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name, "en"))) {
      if (
        entry.name === "node_modules" ||
        (relative.length === 0 && entry.name === "pnpm-lock.yaml")
      )
        continue;
      const child: string =
        relative.length === 0
          ? entry.name
          : path.posix.join(relative, entry.name);
      const location: string = path.join(workspace, ...child.split("/"));
      if (entry.isSymbolicLink())
        throw new Error(
          `Neutral scaffold source cannot contain a symbolic link: ${child}.`,
        );
      if (entry.isDirectory()) collectSourceTree(workspace, child, files);
      else if (entry.isFile()) files.set(child, fs.readFileSync(location));
      else
        throw new Error(
          `Neutral scaffold source must contain only files and directories: ${child}.`,
        );
    }
  }

  function writeTree(
    root: string,
    files: ReadonlyMap<string, Uint8Array>,
  ): void {
    fs.mkdirSync(root, { recursive: true });
    for (const [relative, content] of files) {
      const location: string = path.join(root, ...relative.split("/"));
      fs.mkdirSync(path.dirname(location), { recursive: true });
      fs.writeFileSync(location, content, { flag: "wx" });
    }
  }
}
