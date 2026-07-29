import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { EvidenceBenchmarkProcess } from "@samchon/evidence-benchmark/process";

/** Proves the committed health SDK and live e2e contract as a consumer. */
export namespace BenchmarkHealthScaffold {
  const SDK_ROOT_FILES = [
    "HttpError.ts",
    "IConnection.ts",
    "Primitive.ts",
    "Resolved.ts",
    "module.ts",
  ] as const;

  interface IExecution {
    name: string;
    value?: unknown;
    error: string | null;
  }

  interface IReport {
    executions: IExecution[];
  }

  /**
   * Verifies raw Nestia accessors and the scaffold's canonical SDK exports.
   *
   * This runs before the discovery fixture adds a second controller. Raw Nestia
   * owns the functional tree, while build:sdk owns the normalized module barrel
   * that the scaffold commits and publishes.
   */
  export const verifyCommittedSdk = async (
    workspace: string,
    environment: NodeJS.ProcessEnv,
  ): Promise<void> => {
    const backend: string = path.join(workspace, "packages", "backend");
    const api: string = path.join(workspace, "packages", "api");
    const committed: ReadonlyMap<string, Buffer> = readSdk(api);
    const committedFunctional: ReadonlyMap<string, Buffer> =
      readFunctional(api);
    cleanSdk(api);
    await generateSdk(backend, environment, "committed health SDK");
    assert.deepEqual(
      readFunctional(api),
      committedFunctional,
      "the committed health accessors must be the exact pinned Nestia output",
    );
    await EvidenceBenchmarkProcess.pnpm(["run", "build:sdk"], {
      cwd: backend,
      env: environment,
      label: "canonical health SDK build",
    });
    assert.deepEqual(
      readSdk(api),
      committed,
      "build:sdk must restore the committed canonical SDK exports",
    );
  };

  /**
   * Runs source and compiled health tests, then proves both drift detectors.
   *
   * A return-type mutation must change the generated SDK. A runtime marker
   * mutation keeps the SDK type-compatible and must fail the e2e assertion,
   * proving the two gates observe different failure classes.
   */
  export const verifyRuntimeAndDrift = async (
    workspace: string,
    environment: NodeJS.ProcessEnv,
  ): Promise<void> => {
    const backend: string = path.join(workspace, "packages", "backend");
    const api: string = path.join(workspace, "packages", "api");
    const controller: string = path.join(
      backend,
      "src",
      "controllers",
      "HealthController.ts",
    );
    assertHealthReport(
      await EvidenceBenchmarkProcess.pnpm(["run", "test"], {
        cwd: backend,
        env: environment,
        label: "source health e2e",
      }),
    );
    assertHealthReport(
      await EvidenceBenchmarkProcess.run(
        process.execPath,
        ["bin/test/index.js"],
        {
          cwd: backend,
          env: environment,
          label: "compiled health e2e",
        },
      ),
    );

    const original: string = fs.readFileSync(controller, "utf8");
    const baseline: ReadonlyMap<string, Buffer> = readFunctional(api);
    const savedSdk: ReadonlyMap<string, Buffer> = readSdk(api);
    try {
      fs.writeFileSync(
        controller,
        replaceExactly(original, 'return "OK";', 'return "BROKEN";'),
      );
      const failed: EvidenceBenchmarkProcess.IResult =
        await EvidenceBenchmarkProcess.pnpm(["run", "test"], {
          cwd: backend,
          env: environment,
          label: "health response drift",
          allowFailure: true,
        });
      assert.notEqual(
        failed.status,
        0,
        "a wrong health marker must fail the typed e2e test",
      );
      const execution: IExecution = readHealthExecution(failed);
      assert.match(
        execution.error ?? "",
        /BROKEN|OK|Expected values to be strictly equal/,
      );

      fs.writeFileSync(
        controller,
        replaceExactly(original, "public get(): string", 'public get(): "OK"'),
      );
      cleanSdk(api);
      await generateSdk(backend, environment, "health return-type drift");
      assert.notDeepEqual(
        readFunctional(api),
        baseline,
        "changing the health return type must change the generated SDK",
      );
    } finally {
      fs.writeFileSync(controller, original);
      writeSdk(api, savedSdk);
    }
  };

  const assertHealthReport = (
    result: EvidenceBenchmarkProcess.IResult,
  ): void => {
    const execution: IExecution = readHealthExecution(result);
    assert.equal(execution.error, null);
    assert.equal(
      execution.value,
      1,
      "the health e2e result must report its one exact assertion",
    );
  };

  const readHealthExecution = (
    result: EvidenceBenchmarkProcess.IResult,
  ): IExecution => {
    const match: RegExpMatchArray | null = result.stdout.match(
      /TEST_AUTOMATION_REPORT=(\{[^\r\n]+\})/,
    );
    assert.ok(match, "the dynamic e2e runner did not publish its report");
    const report: IReport = JSON.parse(match[1]!) as IReport;
    const execution: IExecution | undefined = report.executions.find(
      (candidate) => candidate.name === "test_api_health",
    );
    assert.ok(
      execution,
      "the dynamic e2e runner did not discover test_api_health",
    );
    return execution;
  };

  const generateSdk = (
    backend: string,
    environment: NodeJS.ProcessEnv,
    label: string,
  ): Promise<EvidenceBenchmarkProcess.IResult> =>
    EvidenceBenchmarkProcess.pnpm(["nestia", "sdk"], {
      cwd: backend,
      env: environment,
      label,
    });

  const cleanSdk = (api: string): void => {
    fs.rmSync(path.join(api, "src", "functional"), {
      recursive: true,
      force: true,
    });
    for (const file of SDK_ROOT_FILES)
      fs.rmSync(path.join(api, "src", file), { force: true });
  };

  const readSdk = (api: string): ReadonlyMap<string, Buffer> => {
    const source: string = path.join(api, "src");
    const output: Map<string, Buffer> = new Map(readFunctional(api));
    for (const file of SDK_ROOT_FILES) {
      const location: string = path.join(source, file);
      assert.equal(
        fs.existsSync(location),
        true,
        `Nestia did not emit src/${file}`,
      );
      output.set(file, fs.readFileSync(location));
    }
    return output;
  };

  const writeSdk = (api: string, files: ReadonlyMap<string, Buffer>): void => {
    cleanSdk(api);
    const source: string = path.join(api, "src");
    for (const [relative, content] of files) {
      const location: string = path.join(source, ...relative.split("/"));
      fs.mkdirSync(path.dirname(location), { recursive: true });
      fs.writeFileSync(location, content, { flag: "wx" });
    }
  };

  const readFunctional = (api: string): ReadonlyMap<string, Buffer> => {
    const source: string = path.join(api, "src");
    return readTree(path.join(source, "functional"), source);
  };

  const readTree = (directory: string, root: string): Map<string, Buffer> => {
    assert.equal(
      fs.existsSync(directory),
      true,
      `Nestia did not emit ${directory}`,
    );
    const output: Map<string, Buffer> = new Map();
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const location: string = path.join(directory, entry.name);
      if (entry.isDirectory())
        for (const [relative, content] of readTree(location, root))
          output.set(relative, content);
      else if (entry.isFile())
        output.set(
          path.relative(root, location).split(path.sep).join("/"),
          fs.readFileSync(location),
        );
    }
    return output;
  };

  const replaceExactly = (
    source: string,
    before: string,
    after: string,
  ): string => {
    const first: number = source.indexOf(before);
    assert.notEqual(first, -1, `mutation target is missing: ${before}`);
    assert.equal(
      source.indexOf(before, first + before.length),
      -1,
      `mutation target is ambiguous: ${before}`,
    );
    return `${source.slice(0, first)}${after}${source.slice(first + before.length)}`;
  };
}
