import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { EvidenceBenchmarkHash } from "../EvidenceBenchmarkHash.ts";
import type { IEvidenceBenchmarkQualityGate } from "../structures/IEvidenceBenchmarkQualityGate.ts";
import { EvidenceBenchmarkArtifactInventory } from "./EvidenceBenchmarkArtifactInventory.ts";

/** Runs frozen hidden adapters and rejects incomplete provenance. */
export namespace EvidenceBenchmarkHiddenAcceptance {
  const VIEWPORTS: Readonly<
    Record<
      IEvidenceBenchmarkQualityGate.Viewport,
      { width: number; height: number }
    >
  > = {
    mobile: { width: 390, height: 844 },
    tablet: { width: 768, height: 1024 },
    desktop: { width: 1440, height: 900 },
  };

  /** Reads and validates a frozen subject suite manifest. */
  export function manifest(
    location: string,
  ): IEvidenceBenchmarkQualityGate.IManifest {
    const input: unknown = JSON.parse(fs.readFileSync(location, "utf8"));
    const value: Record<string, unknown> = record(input, "hidden manifest");
    exactKeys(
      value,
      [
        "schemaVersion",
        "suiteId",
        "freezeId",
        "subject",
        "requirementsTreeSha256",
        "acceptanceCatalog",
        "adapter",
        "cases",
      ],
      "hidden manifest",
    );
    if (value.schemaVersion !== 1)
      throw new Error("Hidden manifest schemaVersion must be 1.");
    string(value.suiteId, "hidden manifest suiteId");
    string(value.freezeId, "hidden manifest freezeId");
    if (!["todo", "reddit", "shopping", "erp"].includes(String(value.subject)))
      throw new Error("Hidden manifest subject is unsupported.");
    digest(value.requirementsTreeSha256, "requirements tree digest");
    const catalog: Record<string, unknown> = record(
      value.acceptanceCatalog,
      "acceptance catalog pin",
    );
    exactKeys(catalog, ["sha256", "count"], "acceptance catalog pin");
    digest(catalog.sha256, "acceptance catalog digest");
    positiveInteger(catalog.count, "acceptance catalog count");
    if (!Array.isArray(value.cases) || value.cases.length === 0)
      throw new Error("Hidden manifest must contain at least one case.");
    const ids: Set<string> = new Set();
    for (const unknownCase of value.cases) {
      const test: Record<string, unknown> = record(unknownCase, "hidden case");
      exactKeys(
        test,
        ["id", "criterionIds", "kind", "routeState", "viewports"],
        "hidden case",
      );
      const id: string = string(test.id, "hidden case ID");
      if (ids.has(id)) throw new Error(`Hidden manifest repeats case ${id}.`);
      ids.add(id);
      if (
        !Array.isArray(test.criterionIds) ||
        test.criterionIds.length === 0 ||
        test.criterionIds.some(
          (criterion) =>
            typeof criterion !== "string" || criterion.trim().length === 0,
        ) ||
        new Set(test.criterionIds).size !== test.criterionIds.length
      )
        throw new Error(`Hidden case ${id} criterion IDs are invalid.`);
      if (test.kind !== "http" && test.kind !== "browser")
        throw new Error(`Hidden case ${id} kind is invalid.`);
      if (
        test.kind === "http" &&
        (test.routeState !== null ||
          !Array.isArray(test.viewports) ||
          test.viewports.length !== 0)
      )
        throw new Error(`HTTP case ${id} cannot declare browser state.`);
      if (
        test.kind === "browser" &&
        (typeof test.routeState !== "string" ||
          test.routeState.trim().length === 0 ||
          !Array.isArray(test.viewports) ||
          test.viewports.length === 0 ||
          test.viewports.some(
            (viewport) =>
              typeof viewport !== "string" || !(viewport in VIEWPORTS),
          ) ||
          new Set(test.viewports).size !== test.viewports.length)
      )
        throw new Error(`Browser case ${id} route or viewports are invalid.`);
    }
    if (value.adapter !== null) validateAdapterPin(value.adapter);
    return input as IEvidenceBenchmarkQualityGate.IManifest;
  }

  /** Verifies that a suite still binds the exact frozen requirement corpus. */
  export function verifyCorpus(
    manifest: IEvidenceBenchmarkQualityGate.IManifest,
    requirements: string,
  ): void {
    const files: Map<string, Uint8Array> =
      EvidenceBenchmarkHash.directory(requirements);
    const tree: string = EvidenceBenchmarkArtifactInventory.treeSha256(files);
    if (tree !== manifest.requirementsTreeSha256)
      throw new Error(
        `${manifest.subject} requirements tree drifted from the hidden suite.`,
      );
    const catalogPath: string = path.join(
      requirements,
      "acceptance-criteria.jsonl",
    );
    if (!fs.existsSync(catalogPath))
      throw new Error(`${manifest.subject} acceptance catalog is absent.`);
    if (
      EvidenceBenchmarkHash.file(catalogPath) !==
      manifest.acceptanceCatalog.sha256
    )
      throw new Error(
        `${manifest.subject} acceptance catalog digest has drifted.`,
      );
    const rows: unknown[] = fs
      .readFileSync(catalogPath, "utf8")
      .split("\n")
      .filter((line) => line.length !== 0)
      .map((line) => JSON.parse(line) as unknown);
    if (rows.length !== manifest.acceptanceCatalog.count)
      throw new Error(
        `${manifest.subject} acceptance catalog count has drifted.`,
      );
    const criterionIds: Set<string> = new Set(
      rows.map((row) =>
        string(record(row, "acceptance row").id, "acceptance row ID"),
      ),
    );
    if (criterionIds.size !== rows.length)
      throw new Error(`${manifest.subject} acceptance catalog repeats an ID.`);
    for (const test of manifest.cases)
      for (const id of test.criterionIds)
        if (!criterionIds.has(id))
          throw new Error(
            `Hidden case ${test.id} names unknown criterion ${id}.`,
          );
  }

  /**
   * Executes a pinned adapter.
   *
   * A null pin is an intentional launch blocker, never a passing empty suite.
   */
  export async function run(input: {
    benchmarkRoot: string;
    manifestPath: string;
    requirements: string;
    workspace: string;
    output: string;
  }): Promise<IEvidenceBenchmarkQualityGate.IHiddenOutcome> {
    const suite: IEvidenceBenchmarkQualityGate.IManifest = manifest(
      input.manifestPath,
    );
    verifyCorpus(suite, input.requirements);
    const manifestSha256: string = EvidenceBenchmarkHash.file(
      input.manifestPath,
    );
    if (suite.adapter === null)
      return {
        schemaVersion: 1,
        status: "blocked",
        reason: `No production hidden adapter is pinned for ${suite.subject}.`,
        manifestSha256,
        adapterSha256: null,
        result: null,
      };
    const modulePath: string = adapterPath(
      input.benchmarkRoot,
      suite.adapter.module,
    );
    validateAdapterClosure(input.benchmarkRoot, suite.adapter);
    if (EvidenceBenchmarkHash.file(modulePath) !== suite.adapter.sha256)
      throw new Error(
        `Hidden adapter digest drifted: ${suite.adapter.module}.`,
      );
    const authored: Map<string, Uint8Array> =
      EvidenceBenchmarkArtifactInventory.authoredFiles(input.workspace);
    const workspaceSourceTreeSha256: string =
      EvidenceBenchmarkArtifactInventory.treeSha256(authored);
    fs.mkdirSync(input.output, { recursive: true });
    let result: IEvidenceBenchmarkQualityGate.IAdapterResult;
    try {
      const imported: Record<string, unknown> = (await import(
        `${pathToFileURL(modulePath).href}?sha256=${suite.adapter.sha256}`
      )) as Record<string, unknown>;
      const adapter: IEvidenceBenchmarkQualityGate.IAdapter = imported[
        suite.adapter.exportName
      ] as IEvidenceBenchmarkQualityGate.IAdapter;
      if (
        typeof adapter !== "object" ||
        adapter === null ||
        adapter.schemaVersion !== 1 ||
        typeof adapter.execute !== "function"
      )
        throw new Error("Pinned hidden adapter does not implement version 1.");
      result = await adapter.execute({
        manifest: suite,
        workspace: path.resolve(input.workspace),
        output: path.resolve(input.output),
        workspaceSourceTreeSha256,
      });
      validateResult(suite, workspaceSourceTreeSha256, input.output, result);
      const afterTree: string = EvidenceBenchmarkArtifactInventory.treeSha256(
        EvidenceBenchmarkArtifactInventory.authoredFiles(input.workspace),
      );
      if (afterTree !== workspaceSourceTreeSha256)
        throw new Error("Hidden adapter changed the generated workspace.");
    } catch (error) {
      return {
        schemaVersion: 1,
        status: "failed",
        reason: error instanceof Error ? error.message : String(error),
        manifestSha256,
        adapterSha256: suite.adapter.sha256,
        result: null,
      };
    }
    const failed: boolean = [...result.hidden, ...result.browser].some(
      (observation) => observation.status === "failed",
    );
    return {
      schemaVersion: 1,
      status: failed ? "failed" : "passed",
      reason: failed ? "One or more hidden checks failed." : null,
      manifestSha256,
      adapterSha256: suite.adapter.sha256,
      result,
    };
  }

  function validateResult(
    suite: IEvidenceBenchmarkQualityGate.IManifest,
    sourceTreeSha256: string,
    output: string,
    result: IEvidenceBenchmarkQualityGate.IAdapterResult,
  ): void {
    if (
      result.schemaVersion !== 1 ||
      result.suiteId !== suite.suiteId ||
      result.subject !== suite.subject ||
      result.workspaceSourceTreeSha256 !== sourceTreeSha256 ||
      !Array.isArray(result.hidden) ||
      !Array.isArray(result.browser)
    )
      throw new Error("Hidden adapter result does not bind its frozen inputs.");
    const expectedHttp: Set<string> = new Set(
      suite.cases.filter((test) => test.kind === "http").map((test) => test.id),
    );
    const observedHttp: Set<string> = new Set();
    for (const observation of result.hidden) {
      if (!expectedHttp.has(observation.caseId))
        throw new Error(`Unexpected hidden HTTP result ${observation.caseId}.`);
      if (observedHttp.has(observation.caseId))
        throw new Error(`Duplicate hidden HTTP result ${observation.caseId}.`);
      observedHttp.add(observation.caseId);
      validateStatus(observation.status, observation.caseId);
      validateTime(
        observation.startedMonotonicNs,
        observation.completedMonotonicNs,
        observation.caseId,
      );
      validateArtifact(
        output,
        observation.artifact,
        observation.artifactSha256,
      );
    }
    exactSet(expectedHttp, observedHttp, "hidden HTTP cases");
    const expectedBrowser: Set<string> = new Set();
    for (const test of suite.cases)
      if (test.kind === "browser")
        for (const viewport of test.viewports)
          expectedBrowser.add(`${test.id}\0${viewport}`);
    const observedBrowser: Set<string> = new Set();
    for (const observation of result.browser) {
      const test: IEvidenceBenchmarkQualityGate.IHiddenCase | undefined =
        suite.cases.find(
          (candidate) =>
            candidate.kind === "browser" && candidate.id === observation.caseId,
        );
      const key: string = `${observation.caseId}\0${observation.viewport}`;
      if (
        test === undefined ||
        !test.viewports.includes(observation.viewport) ||
        observedBrowser.has(key)
      )
        throw new Error(`Unexpected or duplicate browser result ${key}.`);
      observedBrowser.add(key);
      if (observation.routeState !== test.routeState)
        throw new Error(`Browser route state drifted for ${key}.`);
      validateStatus(observation.status, key);
      validateTime(
        observation.startedMonotonicNs,
        observation.completedMonotonicNs,
        key,
      );
      localUrl(observation.requestedUrl, `${key} requested URL`);
      localUrl(observation.finalUrl, `${key} final URL`);
      const expectedViewport = VIEWPORTS[observation.viewport];
      if (
        observation.screenshot.width !== expectedViewport.width ||
        observation.screenshot.height !== expectedViewport.height
      )
        throw new Error(`Browser screenshot viewport drifted for ${key}.`);
      const screenshot: string = validateArtifact(
        output,
        observation.screenshot.path,
        observation.screenshot.sha256,
      );
      const dimensions = pngDimensions(fs.readFileSync(screenshot));
      if (
        dimensions.width !== observation.screenshot.width ||
        dimensions.height !== observation.screenshot.height
      )
        throw new Error(`Browser screenshot dimensions drifted for ${key}.`);
      const accessibility: string = validateArtifact(
        output,
        observation.accessibility.artifact,
        observation.accessibility.sha256,
      );
      string(observation.accessibility.engine, `${key} accessibility engine`);
      string(
        observation.accessibility.engineVersion,
        `${key} accessibility engine version`,
      );
      digest(
        observation.accessibility.rulesetSha256,
        `${key} accessibility ruleset`,
      );
      positiveInteger(
        observation.accessibility.violations,
        `${key} accessibility violation count`,
        true,
      );
      const accessibilityRecord: Record<string, unknown> = record(
        JSON.parse(fs.readFileSync(accessibility, "utf8")),
        `${key} accessibility artifact`,
      );
      if (
        accessibilityRecord.engine !== observation.accessibility.engine ||
        accessibilityRecord.engineVersion !==
          observation.accessibility.engineVersion ||
        accessibilityRecord.rulesetSha256 !==
          observation.accessibility.rulesetSha256 ||
        !Array.isArray(accessibilityRecord.violations) ||
        accessibilityRecord.violations.length !==
          observation.accessibility.violations
      )
        throw new Error(`Accessibility artifact does not match result ${key}.`);
    }
    exactSet(expectedBrowser, observedBrowser, "hidden browser cases");
  }

  function validateAdapterPin(input: unknown): void {
    const pin: Record<string, unknown> = record(input, "adapter pin");
    exactKeys(
      pin,
      ["module", "sha256", "closure", "exportName"],
      "adapter pin",
    );
    const module: string = string(pin.module, "adapter module");
    if (
      module.includes("\\") ||
      path.posix.isAbsolute(module) ||
      module.split("/").some((part) => part === "" || part === "..") ||
      !module.startsWith("quality/adapters/") ||
      !module.endsWith(".ts")
    )
      throw new Error(
        "Adapter module must be a confined quality/adapters/*.ts path.",
      );
    digest(pin.sha256, "adapter digest");
    const closure: Record<string, unknown> = record(
      pin.closure,
      "adapter closure",
    );
    exactKeys(closure, ["root", "files", "treeSha256"], "adapter closure");
    const root: string = string(closure.root, "adapter closure root");
    if (
      root.includes("\\") ||
      path.posix.isAbsolute(root) ||
      root.split("/").some((part) => part === "" || part === "..") ||
      !root.startsWith("quality/adapters/")
    )
      throw new Error(
        "Adapter closure root must be confined below quality/adapters.",
      );
    positiveInteger(closure.files, "adapter closure file count");
    digest(closure.treeSha256, "adapter closure tree digest");
    if (
      module !== root &&
      !module.startsWith(`${root.endsWith("/") ? root : `${root}/`}`)
    )
      throw new Error("Adapter module must belong to its pinned closure.");
    if (pin.exportName !== "adapter")
      throw new Error("Adapter exportName must be adapter.");
  }

  function adapterPath(benchmarkRoot: string, relative: string): string {
    const root: string = path.resolve(benchmarkRoot);
    const resolved: string = path.resolve(root, ...relative.split("/"));
    const relation: string = path.relative(root, resolved);
    if (relation === ".." || relation.startsWith(`..${path.sep}`))
      throw new Error(`Adapter path escapes benchmark root: ${relative}.`);
    if (
      !fs.existsSync(resolved) ||
      fs.lstatSync(resolved).isSymbolicLink() ||
      !fs.statSync(resolved).isFile()
    )
      throw new Error(`Pinned hidden adapter is absent: ${relative}.`);
    return resolved;
  }

  function validateAdapterClosure(
    benchmarkRoot: string,
    pin: IEvidenceBenchmarkQualityGate.IAdapterPin,
  ): void {
    const root: string = confinedBenchmarkPath(benchmarkRoot, pin.closure.root);
    if (
      !fs.existsSync(root) ||
      fs.lstatSync(root).isSymbolicLink() ||
      !fs.statSync(root).isDirectory()
    )
      throw new Error(
        `Adapter closure is not a directory: ${pin.closure.root}.`,
      );
    const files: Map<string, Uint8Array> =
      EvidenceBenchmarkHash.directory(root);
    if (
      files.size !== pin.closure.files ||
      EvidenceBenchmarkArtifactInventory.treeSha256(files) !==
        pin.closure.treeSha256
    )
      throw new Error(`Hidden adapter closure drifted: ${pin.closure.root}.`);
  }

  function confinedBenchmarkPath(
    benchmarkRoot: string,
    relative: string,
  ): string {
    const root: string = path.resolve(benchmarkRoot);
    const resolved: string = path.resolve(root, ...relative.split("/"));
    const relation: string = path.relative(root, resolved);
    if (relation === ".." || relation.startsWith(`..${path.sep}`))
      throw new Error(`Harness path escapes benchmark root: ${relative}.`);
    return resolved;
  }

  function validateArtifact(
    output: string,
    relative: string,
    sha256: string,
  ): string {
    digest(sha256, `${relative} digest`);
    if (
      relative.length === 0 ||
      relative.includes("\\") ||
      path.posix.isAbsolute(relative) ||
      relative.split("/").some((part) => part === "" || part === "..")
    )
      throw new Error(`Adapter artifact path is not confined: ${relative}.`);
    const root: string = path.resolve(output);
    const location: string = path.resolve(root, ...relative.split("/"));
    const relation: string = path.relative(root, location);
    if (
      relation === ".." ||
      relation.startsWith(`..${path.sep}`) ||
      !fs.existsSync(location) ||
      fs.lstatSync(location).isSymbolicLink() ||
      !fs.statSync(location).isFile()
    )
      throw new Error(`Adapter artifact is absent or escaped: ${relative}.`);
    if (EvidenceBenchmarkHash.file(location) !== sha256)
      throw new Error(`Adapter artifact digest drifted: ${relative}.`);
    return location;
  }

  function pngDimensions(content: Uint8Array): {
    width: number;
    height: number;
  } {
    const bytes: Buffer = Buffer.from(content);
    if (
      bytes.length < 24 ||
      !bytes
        .subarray(0, 8)
        .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ||
      bytes.subarray(12, 16).toString("ascii") !== "IHDR"
    )
      throw new Error("Browser screenshot is not a PNG with an IHDR.");
    return {
      width: bytes.readUInt32BE(16),
      height: bytes.readUInt32BE(20),
    };
  }

  function localUrl(input: unknown, label: string): void {
    const value: URL = new URL(string(input, label));
    if (
      (value.protocol !== "http:" && value.protocol !== "https:") ||
      !["localhost", "127.0.0.1", "::1", "[::1]"].includes(value.hostname) ||
      value.username.length !== 0 ||
      value.password.length !== 0
    )
      throw new Error(`${label} must use a loopback HTTP origin.`);
  }

  function validateTime(start: string, end: string, label: string): void {
    if (!/^(?:0|[1-9]\d*)$/u.test(start) || !/^(?:0|[1-9]\d*)$/u.test(end))
      throw new Error(`${label} monotonic times must be unsigned integers.`);
    if (BigInt(end) < BigInt(start))
      throw new Error(`${label} completion precedes its start.`);
  }

  function validateStatus(input: string, label: string): void {
    if (input !== "passed" && input !== "failed")
      throw new Error(`${label} status must be passed or failed.`);
  }

  function exactSet(
    expected: ReadonlySet<string>,
    observed: ReadonlySet<string>,
    label: string,
  ): void {
    if (
      expected.size !== observed.size ||
      [...expected].some((entry) => !observed.has(entry))
    )
      throw new Error(`${label} do not form the exact frozen set.`);
  }

  function exactKeys(
    value: Record<string, unknown>,
    keys: readonly string[],
    label: string,
  ): void {
    const actual: string[] = Object.keys(value).sort();
    const expected: string[] = [...keys].sort();
    if (JSON.stringify(actual) !== JSON.stringify(expected))
      throw new Error(`${label} fields are not the exact expected set.`);
  }

  function record(input: unknown, label: string): Record<string, unknown> {
    if (typeof input !== "object" || input === null || Array.isArray(input))
      throw new Error(`${label} must be an object.`);
    return input as Record<string, unknown>;
  }

  function string(input: unknown, label: string): string {
    if (typeof input !== "string" || input.trim().length === 0)
      throw new Error(`${label} must be a nonblank string.`);
    return input;
  }

  function digest(input: unknown, label: string): void {
    if (typeof input !== "string" || !/^[0-9a-f]{64}$/u.test(input))
      throw new Error(`${label} must be a lowercase SHA-256 digest.`);
  }

  function positiveInteger(
    input: unknown,
    label: string,
    allowZero: boolean = false,
  ): number {
    if (
      typeof input !== "number" ||
      !Number.isSafeInteger(input) ||
      input < (allowZero ? 0 : 1)
    )
      throw new Error(
        `${label} must be a ${allowZero ? "non-negative" : "positive"} safe integer.`,
      );
    return input;
  }
}
