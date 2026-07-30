import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import type { IEvidenceBenchmarkMaterialization } from "@samchon/evidence-benchmark/materialization";
import { EvidenceBenchmarkTemplate } from "@samchon/evidence-benchmark/template";

const repository: string = path.resolve(import.meta.dirname, "../../..");
const suite: string = path.resolve(import.meta.dirname, "..");
const workspace: string = path.join(suite, "workspace");
const variables: IEvidenceBenchmarkMaterialization.IVariables = {
  name: "benchmark-template-proof",
  apiPackageName: "@benchmark-template-proof/api",
  backendPackageName: "@benchmark-template-proof/backend",
  frontendPackageName: "@benchmark-template-proof/frontend",
};

/**
 * Verifies the Plain benchmark template through its real backend test command.
 *
 * This is a consumer proof: it materializes one Plain workspace, installs its
 * declared dependencies, and lets the backend package own every test
 * prerequisite and assertion.
 *
 * 1. Materialize the base template with the Plain overlay.
 * 2. Install the generated workspace.
 * 3. Build and test from its backend package.
 */
const main = async (): Promise<void> => {
  fs.rmSync(workspace, { recursive: true, force: true });
  writeTree(
    workspace,
    EvidenceBenchmarkTemplate.compose({
      template: path.join(repository, "benchmark", "template"),
      arm: "plain",
      variables,
    }).files,
  );
  const environment: NodeJS.ProcessEnv = {
    ...process.env,
    CI: "1",
    API_PORT: "37001",
    JWT_SECRET_KEY: "benchmark-template-proof-secret-at-least-32-characters",
    JWT_ACCESS_TTL_SECONDS: "3600",
    JWT_REFRESH_TTL_SECONDS: "2592000",
    TTSC_CACHE_DIR: path.join(repository, "node_modules", ".cache", "ttsc"),
    VITE_API_HOST: "http://127.0.0.1:37001",
    VITE_API_SIMULATE: "true",
  };
  await pnpm(["install"], workspace, environment);
  await pnpm(
    ["build"],
    path.join(workspace, "packages", "backend"),
    environment,
  );
  await pnpm(
    ["test"],
    path.join(workspace, "packages", "backend"),
    environment,
  );
};

const pnpm = async (
  arguments_: readonly string[],
  cwd: string,
  env: NodeJS.ProcessEnv,
): Promise<void> => {
  const executable: string | undefined = process.env.npm_execpath;
  if (executable === undefined)
    throw new Error("The benchmark template test must be launched by pnpm.");
  const child = spawn(process.execPath, [executable, ...arguments_], {
    cwd,
    env,
    shell: false,
    stdio: "inherit",
    windowsHide: true,
  });
  const status: number | null = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", resolve);
  });
  if (status !== 0)
    throw new Error(
      `pnpm ${arguments_.join(" ")} failed with status ${String(status)}.`,
    );
};

const writeTree = (
  root: string,
  files: ReadonlyMap<string, Uint8Array>,
): void => {
  for (const [relative, content] of files) {
    const output: string = path.join(root, ...relative.split("/"));
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, content, { flag: "wx" });
  }
};

main().catch((error: unknown) => {
  console.log(error);
  process.exit(1);
});
