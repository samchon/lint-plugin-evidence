import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { EvidenceBenchmarkHash } from "./EvidenceBenchmarkHash.ts";
import type { IEvidenceBenchmarkMaterialization } from "./structures/IEvidenceBenchmarkMaterialization.ts";
import type { IEvidenceBenchmarkOperation } from "./structures/IEvidenceBenchmarkOperation.ts";
import type { IEvidenceBenchmarkPackageArtifact } from "./structures/IEvidenceBenchmarkPackageArtifact.ts";
import type { IEvidenceBenchmarkSetup } from "./structures/IEvidenceBenchmarkSetup.ts";

/** Creates, reads, and verifies immutable four-cell operation plans. */
export namespace EvidenceBenchmarkOperationPlan {
  /** Writes a self-hashed plan without replacing an existing experiment input. */
  export function write(
    output: string,
    input: Omit<IEvidenceBenchmarkOperation.IPlan, "planSha256">,
  ): IEvidenceBenchmarkOperation.IPlan {
    const plan: IEvidenceBenchmarkOperation.IPlan = {
      ...input,
      planSha256: EvidenceBenchmarkHash.object(input),
    };
    validate(plan);
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, `${JSON.stringify(plan, null, 2)}\n`, {
      encoding: "utf8",
      flag: "wx",
    });
    return plan;
  }

  /** Reads and fully verifies one immutable plan and its prepared file pins. */
  export function read(input: string): IEvidenceBenchmarkOperation.IPlan {
    const parsed: unknown = JSON.parse(fs.readFileSync(input, "utf8"));
    if (!isObject(parsed))
      throw new Error(`Benchmark plan must be a JSON object: ${input}.`);
    const plan: IEvidenceBenchmarkOperation.IPlan =
      parsed as unknown as IEvidenceBenchmarkOperation.IPlan;
    validate(plan);
    const { planSha256, ...content } = plan;
    const actual: string = EvidenceBenchmarkHash.object(content);
    if (actual !== planSha256)
      throw new Error(
        `Benchmark plan self-hash drifted: expected ${planSha256}, received ${actual}.`,
      );
    for (const cell of plan.cells) {
      verifyFile(
        cell.materializationManifest,
        cell.materializationManifestSha256,
        `${cell.runId} materialization manifest`,
      );
      verifyFile(
        cell.setupRecord,
        cell.setupRecordSha256,
        `${cell.runId} setup record`,
      );
    }
    verifyFile(
      plan.productProvenance,
      plan.productProvenanceSha256,
      "product provenance",
    );
    return plan;
  }

  /** Returns the four canonical cells in deterministic identity order. */
  export function cells(
    blockId: string,
    replicate: number,
    subjects: IEvidenceBenchmarkOperation.IPlan["subjects"],
  ): Array<
    Pick<IEvidenceBenchmarkOperation.ICell, "runId" | "project" | "arm">
  > {
    return subjects.flatMap((project) =>
      (["evidence", "plain"] as const).map((arm) => ({
        runId: `${blockId}-${project}-${arm}-r${replicate}`,
        project,
        arm,
      })),
    );
  }

  /** Produces a deterministic unbiased permutation from a hexadecimal seed. */
  export function randomize<T>(input: readonly T[], seed: string): T[] {
    if (!/^[0-9a-f]{64}$/i.test(seed))
      throw new Error(
        "Benchmark randomization seed must contain exactly 64 hexadecimal characters.",
      );
    const output: T[] = [...input];
    let counter: number = 0;
    let pool: Buffer = Buffer.alloc(0);
    let offset: number = 0;
    const nextByte = (): number => {
      if (offset >= pool.byteLength) {
        pool = crypto
          .createHash("sha256")
          .update(Buffer.from(seed, "hex"))
          .update(String(counter++))
          .digest();
        offset = 0;
      }
      return pool[offset++]!;
    };
    for (let index: number = output.length - 1; index > 0; --index) {
      const choices: number = index + 1;
      const admitted: number = Math.floor(256 / choices) * choices;
      let sample: number;
      do sample = nextByte();
      while (sample >= admitted);
      const selected: number = sample % choices;
      [output[index], output[selected]] = [output[selected]!, output[index]!];
    }
    return output;
  }

  /** Creates a cryptographically random 256-bit scheduling seed. */
  export function seed(): string {
    return crypto.randomBytes(32).toString("hex");
  }

  function validate(plan: IEvidenceBenchmarkOperation.IPlan): void {
    if (
      plan.schemaVersion !== 1 ||
      typeof plan.blockId !== "string" ||
      !/^[A-Za-z0-9][A-Za-z0-9._-]{0,95}$/.test(plan.blockId) ||
      typeof plan.sourceRevision !== "string" ||
      !/^[0-9a-f]{40}$/i.test(plan.sourceRevision) ||
      typeof plan.repository !== "string" ||
      !path.isAbsolute(plan.repository) ||
      typeof plan.preparedAtUtc !== "string" ||
      !Number.isFinite(Date.parse(plan.preparedAtUtc)) ||
      !Number.isInteger(plan.replicate) ||
      plan.replicate < 1 ||
      !validSubjects(plan.subjects) ||
      typeof plan.mergedBaseRef !== "string" ||
      !/^refs\/remotes\/[^/]+\/.+/.test(plan.mergedBaseRef) ||
      typeof plan.mergedBaseRevision !== "string" ||
      !/^[0-9a-f]{40}$/i.test(plan.mergedBaseRevision) ||
      typeof plan.remoteVerifiedAtUtc !== "string" ||
      !Number.isFinite(Date.parse(plan.remoteVerifiedAtUtc)) ||
      typeof plan.sealedSource !== "string" ||
      !path.isAbsolute(plan.sealedSource) ||
      typeof plan.sealedSourceManifest !== "string" ||
      !path.isAbsolute(plan.sealedSourceManifest) ||
      typeof plan.sealedSourceManifestSha256 !== "string" ||
      !/^[0-9a-f]{64}$/i.test(plan.sealedSourceManifestSha256) ||
      !/^[0-9a-f]{64}$/i.test(plan.seed) ||
      !validSafety(plan.safety, plan.subjects) ||
      plan.concurrency !== 4 ||
      !Array.isArray(plan.cells) ||
      plan.cells.length !== 4 ||
      !Array.isArray(plan.launchOrder) ||
      plan.launchOrder.length !== 4 ||
      typeof plan.productProvenance !== "string" ||
      !path.isAbsolute(plan.productProvenance) ||
      !/^[0-9a-f]{64}$/i.test(plan.productProvenanceSha256) ||
      !/^[0-9a-f]{64}$/i.test(plan.planSha256)
    )
      throw new Error("Benchmark operation plan has an invalid outer shape.");
    const expected: string[] = cells(
      plan.blockId,
      plan.replicate,
      plan.subjects,
    )
      .map((cell) => cell.runId)
      .sort();
    const actual: string[] = plan.cells.map((cell) => cell.runId).sort();
    const launch: string[] = [...plan.launchOrder].sort();
    if (
      JSON.stringify(actual) !== JSON.stringify(expected) ||
      JSON.stringify(launch) !== JSON.stringify(expected)
    )
      throw new Error(
        "Benchmark plan must contain each selected subject/arm run exactly once.",
      );
    const roots: Set<string> = new Set();
    const workspaces: Set<string> = new Set();
    const manifests: Set<string> = new Set();
    const setups: Set<string> = new Set();
    for (const [index, runId] of plan.launchOrder.entries()) {
      const cell: IEvidenceBenchmarkOperation.ICell | undefined =
        plan.cells.find((candidate) => candidate.runId === runId);
      if (
        cell === undefined ||
        cell.launchIndex !== index ||
        cell.replicate !== plan.replicate ||
        !path.isAbsolute(cell.root) ||
        !path.isAbsolute(cell.workspace) ||
        !path.isAbsolute(cell.materializationManifest) ||
        !path.isAbsolute(cell.setupRecord) ||
        !/^[0-9a-f]{64}$/i.test(cell.materializationManifestSha256) ||
        !/^[0-9a-f]{64}$/i.test(cell.setupRecordSha256)
      )
        throw new Error(`Benchmark plan cell is invalid: ${runId}.`);
      const expectedRoot: string = path.join(
        plan.repository,
        "benchmark",
        ".work",
        plan.blockId,
        "cells",
        cell.runId,
      );
      if (
        path.resolve(cell.root) !== path.resolve(expectedRoot) ||
        path.resolve(cell.workspace) !== path.join(expectedRoot, "workspace") ||
        path.resolve(cell.materializationManifest) !==
          path.join(expectedRoot, "materialization.json") ||
        path.resolve(cell.setupRecord) !== path.join(expectedRoot, "setup.json")
      )
        throw new Error(
          `Benchmark plan cell escapes its owned path layout: ${runId}.`,
        );
      for (const [set, value, label] of [
        [roots, path.resolve(cell.root), "root"],
        [workspaces, path.resolve(cell.workspace), "workspace"],
        [
          manifests,
          path.resolve(cell.materializationManifest),
          "materialization manifest",
        ],
        [setups, path.resolve(cell.setupRecord), "setup record"],
      ] as const) {
        if (set.has(value))
          throw new Error(
            `Benchmark plan reuses one ${label} across cells: ${value}.`,
          );
        set.add(value);
      }
    }
    const blockRoot: string = path.join(
      plan.repository,
      "benchmark",
      ".work",
      plan.blockId,
    );
    if (
      path.resolve(plan.sealedSource) !== path.join(blockRoot, "source") ||
      path.resolve(plan.sealedSourceManifest) !==
        path.join(blockRoot, "sealed-source.json") ||
      path.resolve(plan.productProvenance) !==
        path.join(blockRoot, "product", "provenance.json")
    )
      throw new Error(
        "Benchmark sealed source or product provenance escapes its block.",
      );
    reconcileSealedSource(plan);
    reconcilePreparedFiles(plan);
  }

  function verifyFile(location: string, expected: string, label: string): void {
    if (!fs.existsSync(location) || !fs.statSync(location).isFile())
      throw new Error(`Benchmark ${label} is missing: ${location}.`);
    const actual: string = EvidenceBenchmarkHash.file(location);
    if (actual !== expected)
      throw new Error(
        `Benchmark ${label} drifted: expected ${expected}, received ${actual}.`,
      );
  }

  function reconcilePreparedFiles(
    plan: IEvidenceBenchmarkOperation.IPlan,
  ): void {
    const product: IEvidenceBenchmarkPackageArtifact = parseProduct(
      plan.productProvenance,
    );
    if (product.sourceCommit !== plan.sourceRevision)
      throw new Error(
        "Benchmark product provenance does not match the plan source revision.",
      );
    for (const cell of plan.cells) {
      const materialization: IEvidenceBenchmarkMaterialization.IManifest =
        parseMaterialization(cell.materializationManifest);
      const setup: IEvidenceBenchmarkSetup = parseSetup(cell.setupRecord);
      const immutableRequirements: Map<string, Uint8Array> =
        EvidenceBenchmarkHash.directory(
          path.join(cell.root, "inputs", "requirements"),
        );
      const workspaceRequirements: Map<string, Uint8Array> =
        EvidenceBenchmarkHash.directory(
          path.join(cell.workspace, "docs", "analysis"),
        );
      if (
        materialization.project !== cell.project ||
        materialization.arm !== cell.arm ||
        materialization.artifact.sourceCommit !== plan.sourceRevision ||
        materialization.artifact.sha256 !== product.sha256 ||
        materialization.artifact.payloadSha256 !== product.payloadSha256 ||
        materialization.artifact.name !== product.name ||
        materialization.artifact.version !== product.version ||
        (cell.arm === "evidence") !==
          (materialization.artifact.relativeArchive !== undefined)
      )
        throw new Error(
          `Benchmark materialization semantics do not match cell ${cell.runId}.`,
        );
      if (
        EvidenceBenchmarkHash.tree(immutableRequirements) !==
          materialization.requirementsTreeSha256 ||
        EvidenceBenchmarkHash.tree(workspaceRequirements) !==
          materialization.requirementsTreeSha256 ||
        JSON.stringify(EvidenceBenchmarkHash.entries(immutableRequirements)) !==
          JSON.stringify(materialization.requirementFiles) ||
        JSON.stringify(EvidenceBenchmarkHash.entries(workspaceRequirements)) !==
          JSON.stringify(materialization.requirementFiles)
      )
        throw new Error(
          `Benchmark exact requirement bytes disagree for ${cell.runId}.`,
        );
      if (
        setup.pnpmVersion !== "10.10.0" ||
        setup.ttscVersion !== "0.23.0" ||
        setup.lintVersion !== "0.23.0" ||
        setup.typescriptVersion !== "7.0.2" ||
        !Number.isFinite(Date.parse(setup.completedAt)) ||
        !/^[0-9a-f]{64}$/i.test(setup.lockSha256)
      )
        throw new Error(
          `Benchmark setup semantics are invalid for ${cell.runId}.`,
        );
      if (
        materialization.corpus.atomicAcceptanceClauses < 1 ||
        materialization.corpus.documents < 1 ||
        materialization.corpus.h2 < 1 ||
        materialization.corpus.h3 < 1 ||
        materialization.corpus.contextCriteria < 0
      )
        throw new Error(
          `Benchmark corpus counts are invalid for ${cell.runId}.`,
        );
    }
    for (const project of plan.subjects) {
      const pair: IEvidenceBenchmarkMaterialization.IManifest[] = plan.cells
        .filter((cell) => cell.project === project)
        .map((cell) => parseMaterialization(cell.materializationManifest));
      if (
        pair.length !== 2 ||
        pair[0]!.requirementsTreeSha256 !== pair[1]!.requirementsTreeSha256 ||
        JSON.stringify(pair[0]!.requirementFiles) !==
          JSON.stringify(pair[1]!.requirementFiles) ||
        JSON.stringify(pair[0]!.corpus) !== JSON.stringify(pair[1]!.corpus)
      )
        throw new Error(
          `Benchmark arms do not share one exact ${project} requirement corpus.`,
        );
    }
  }

  function reconcileSealedSource(
    plan: IEvidenceBenchmarkOperation.IPlan,
  ): void {
    verifyFile(
      plan.sealedSourceManifest,
      plan.sealedSourceManifestSha256,
      "sealed source manifest",
    );
    const parsed: unknown = JSON.parse(
      fs.readFileSync(plan.sealedSourceManifest, "utf8"),
    );
    if (
      !isObject(parsed) ||
      parsed.schemaVersion !== 2 ||
      parsed.treeAlgorithm !== EvidenceBenchmarkHash.TREE_ALGORITHM ||
      parsed.sourceRevision !== plan.sourceRevision ||
      parsed.coreAutocrlf !== "false" ||
      parsed.coreEol !== "lf" ||
      !Array.isArray(parsed.files) ||
      typeof parsed.treeSha256 !== "string" ||
      !/^[0-9a-f]{64}$/i.test(parsed.treeSha256)
    )
      throw new Error("Benchmark sealed source manifest is invalid.");
    const files = parsed.files as Array<{
      path: string;
      mode: string;
      bytes: number;
      sha256: string;
    }>;
    const paths: Set<string> = new Set();
    const tree: Map<string, Uint8Array> = new Map();
    for (const entry of files) {
      if (
        typeof entry.path !== "string" ||
        entry.path.length === 0 ||
        paths.has(entry.path) ||
        typeof entry.mode !== "string" ||
        !/^[0-7]{6}$/.test(entry.mode) ||
        !Number.isInteger(entry.bytes) ||
        entry.bytes < 0 ||
        !/^[0-9a-f]{64}$/i.test(entry.sha256)
      )
        throw new Error("Benchmark sealed source file ledger is invalid.");
      paths.add(entry.path);
      const location: string = path.join(
        plan.sealedSource,
        ...entry.path.split("/"),
      );
      if (!fs.existsSync(location))
        throw new Error(`Benchmark sealed source file drifted: ${entry.path}.`);
      const bytes: Buffer =
        entry.mode === "120000"
          ? Buffer.from(fs.readlinkSync(location), "utf8")
          : fs.readFileSync(location);
      if (
        bytes.byteLength !== entry.bytes ||
        EvidenceBenchmarkHash.bytes(bytes) !== entry.sha256
      )
        throw new Error(`Benchmark sealed source file drifted: ${entry.path}.`);
      tree.set(entry.path, bytes);
    }
    const actualPaths: string[] = sealedPaths(plan.sealedSource);
    if (
      JSON.stringify(actualPaths) !== JSON.stringify([...paths].sort(ordinal))
    )
      throw new Error(
        "Benchmark sealed source contains an unrecorded or missing path.",
      );
    if (EvidenceBenchmarkHash.tree(tree) !== parsed.treeSha256)
      throw new Error("Benchmark sealed source tree ledger drifted.");
  }

  function parseMaterialization(
    location: string,
  ): IEvidenceBenchmarkMaterialization.IManifest {
    const parsed: unknown = JSON.parse(fs.readFileSync(location, "utf8"));
    if (
      !isObject(parsed) ||
      parsed.schemaVersion !== 2 ||
      parsed.treeAlgorithm !== EvidenceBenchmarkHash.TREE_ALGORITHM ||
      typeof parsed.project !== "string" ||
      !["todo", "reddit", "shopping", "erp"].includes(parsed.project) ||
      typeof parsed.arm !== "string" ||
      !["evidence", "plain"].includes(parsed.arm) ||
      typeof parsed.requirementsTreeSha256 !== "string" ||
      !/^[0-9a-f]{64}$/i.test(parsed.requirementsTreeSha256) ||
      !Array.isArray(parsed.requirementFiles) ||
      !isObject(parsed.corpus) ||
      !isObject(parsed.artifact)
    )
      throw new Error(`Invalid materialization manifest: ${location}.`);
    return parsed as unknown as IEvidenceBenchmarkMaterialization.IManifest;
  }

  function parseSetup(location: string): IEvidenceBenchmarkSetup {
    const parsed: unknown = JSON.parse(fs.readFileSync(location, "utf8"));
    if (!isObject(parsed))
      throw new Error(`Invalid setup record: ${location}.`);
    return parsed as unknown as IEvidenceBenchmarkSetup;
  }

  function parseProduct(location: string): IEvidenceBenchmarkPackageArtifact {
    const parsed: unknown = JSON.parse(fs.readFileSync(location, "utf8"));
    if (
      !isObject(parsed) ||
      typeof parsed.name !== "string" ||
      typeof parsed.version !== "string" ||
      typeof parsed.sha256 !== "string" ||
      !/^[0-9a-f]{64}$/i.test(parsed.sha256) ||
      typeof parsed.payloadSha256 !== "string" ||
      !/^[0-9a-f]{64}$/i.test(parsed.payloadSha256) ||
      typeof parsed.sourceCommit !== "string"
    )
      throw new Error(`Invalid product provenance: ${location}.`);
    return parsed as unknown as IEvidenceBenchmarkPackageArtifact;
  }

  function validSubjects(
    input: IEvidenceBenchmarkOperation.IPlan["subjects"],
  ): boolean {
    return (
      Array.isArray(input) &&
      (JSON.stringify(input) === JSON.stringify(["todo", "reddit"]) ||
        JSON.stringify(input) === JSON.stringify(["shopping", "erp"]))
    );
  }

  function validSafety(
    input: IEvidenceBenchmarkOperation.ISafetyAuthorization,
    subjects: IEvidenceBenchmarkOperation.IPlan["subjects"],
  ): boolean {
    if (
      !isObject(input) ||
      typeof input.id !== "string" ||
      input.id.trim().length === 0 ||
      typeof input.approvedAtUtc !== "string" ||
      !Number.isFinite(Date.parse(input.approvedAtUtc)) ||
      !isObject(input.maximumObservedTotalTokensBySubject) ||
      !isObject(input.maximumDurationMsBySubject) ||
      !Number.isInteger(input.maximumObservedBlockTotalTokens) ||
      input.maximumObservedBlockTotalTokens < 1 ||
      !Number.isInteger(input.maximumBlockDurationMs) ||
      input.maximumBlockDurationMs < 1 ||
      input.monetaryStatus !== "unavailable" ||
      input.hardCeilingGuaranteed !== false
    )
      return false;
    const keys: string[] = Object.keys(
      input.maximumObservedTotalTokensBySubject,
    ).sort();
    const expected: string[] = [...subjects].sort();
    const durationKeys: string[] = Object.keys(
      input.maximumDurationMsBySubject,
    ).sort();
    if (
      JSON.stringify(keys) !== JSON.stringify(expected) ||
      JSON.stringify(durationKeys) !== JSON.stringify(expected)
    )
      return false;
    const thresholds: number[] = subjects.map(
      (subject) => input.maximumObservedTotalTokensBySubject[subject]!,
    );
    return (
      thresholds.every(
        (threshold) => Number.isInteger(threshold) && threshold > 0,
      ) &&
      subjects.every((subject) => {
        const duration: number | undefined =
          input.maximumDurationMsBySubject[subject];
        return Number.isInteger(duration) && duration! > 0;
      }) &&
      input.maximumObservedBlockTotalTokens <=
        thresholds.reduce((sum, threshold) => sum + threshold * 2, 0)
    );
  }

  function isObject(input: unknown): input is Record<string, unknown> {
    return typeof input === "object" && input !== null && !Array.isArray(input);
  }

  function sealedPaths(root: string): string[] {
    const output: string[] = [];
    const visit = (relative: string): void => {
      const location: string =
        relative.length === 0 ? root : path.join(root, ...relative.split("/"));
      for (const entry of fs.readdirSync(location, {
        withFileTypes: true,
      })) {
        if (relative.length === 0 && entry.name === ".git") continue;
        const child: string =
          relative.length === 0
            ? entry.name
            : path.posix.join(relative, entry.name);
        if (entry.isDirectory()) visit(child);
        else if (entry.isFile() || entry.isSymbolicLink()) output.push(child);
        else
          throw new Error(
            `Benchmark sealed source contains an unsupported path: ${child}.`,
          );
      }
    };
    visit("");
    return output.sort(ordinal);
  }

  function ordinal(left: string, right: string): number {
    return left < right ? -1 : left > right ? 1 : 0;
  }
}
