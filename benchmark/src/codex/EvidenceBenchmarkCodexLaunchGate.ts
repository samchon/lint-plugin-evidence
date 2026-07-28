import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import type { IEvidenceBenchmarkCodexRun } from "../structures/IEvidenceBenchmarkCodexRun.ts";
import { EvidenceBenchmarkCodexCompletion } from "./EvidenceBenchmarkCodexCompletion.ts";
import { EvidenceBenchmarkCodexProtocol } from "./EvidenceBenchmarkCodexProtocol.ts";
import { EvidenceBenchmarkCodexValue } from "./EvidenceBenchmarkCodexValue.ts";

/**
 * Fail-closed preflight that must finish before spawning a paid Codex
 * app-server.
 */
export namespace EvidenceBenchmarkCodexLaunchGate {
  /** Pinned native executable admitted by the Codex 0.145.0 measurement. */
  export const CODEX_EXECUTABLE_SHA256 =
    "83751f15cb6a0a7b97df67752c001e3fe1c20e18ffbfec3ff63567296205eb6c";

  /** Validates every immutable byte, protocol, prompt, and cost input. */
  export async function validate(
    options: IEvidenceBenchmarkCodexRun.IOptions,
  ): Promise<void> {
    const { experiment, runner } = options.manifest;
    const hash = (value: string): string =>
      EvidenceBenchmarkCodexValue.sha256(value);
    if (
      runner.codexCliVersion !==
        EvidenceBenchmarkCodexProtocol.CODEX_CLI_VERSION ||
      runner.codexSourceCommit !==
        EvidenceBenchmarkCodexProtocol.CODEX_SOURCE_COMMIT ||
      runner.codexExecutableSha256 !== CODEX_EXECUTABLE_SHA256 ||
      runner.codexSchemaSha256 !==
        EvidenceBenchmarkCodexProtocol.CODEX_SCHEMA_SHA256 ||
      runner.codexSchemaTreeAlgorithm !==
        "sha256(sorted-posix-path-nul-bytes-nul)" ||
      runner.codexSchemaFileCount !== 347 ||
      runner.codexSchemaByteLength !== 3_303_877
    )
      throw new Error("Codex executable or experimental schema pin drifted");
    if (
      runner.model !== "gpt-5.6-terra" ||
      runner.effort !== "high" ||
      runner.serviceTier !== "priority" ||
      runner.allowProviderModelFallback !== false
    )
      throw new Error("model, effort, tier, or fallback policy drifted");
    if (
      runner.initialGoalStatus !== "paused" ||
      runner.goalActivationPolicy !==
        "paused-before-first-turn-active-after-turn-started" ||
      runner.firstPromptSelfContained !== true ||
      options.maximumRestarts !== 0
    )
      throw new Error("Goal ordering or restart fail-closed policy drifted");
    if (
      hash(options.prompt) !== runner.promptSha256 ||
      hash(options.goal) !== runner.goalSha256 ||
      hash(options.completionChallenge) !== runner.completionChallengeSha256 ||
      hash(options.recoveryPrompt) !== runner.recoveryPromptSha256
    )
      throw new Error("prompt bytes do not match the immutable manifest");
    EvidenceBenchmarkCodexCompletion.admitProviderSchema(
      options.generationOutcomeSchema,
    );
    if (
      hash(
        EvidenceBenchmarkCodexValue.canonicalJson(
          options.generationOutcomeSchema,
        ),
      ) !== runner.generationOutcomeSchemaSha256 ||
      EvidenceBenchmarkCodexCompletion.localValidationSha256() !==
        runner.generationOutcomeLocalValidationSha256
    )
      throw new Error("generation outcome schema or local semantics drifted");
    validateDenominators(experiment);
    validateCost(experiment.costAuthorization);
    if (!path.isAbsolute(options.appServer.command))
      throw new Error("production Codex executable path must be absolute");
    EvidenceBenchmarkCodexValue.assertDirectExecutable(
      options.appServer.command,
      "production Codex executable",
    );
    const executable = await fs.promises.readFile(options.appServer.command);
    if (
      EvidenceBenchmarkCodexValue.sha256(executable) !==
      runner.codexExecutableSha256
    )
      throw new Error("native Codex executable bytes do not match the pin");
    if (options.codexSchemaArchivePath === undefined) {
      if (
        runner.codexSchemaArchiveSha256 !== null ||
        runner.codexSchemaArchiveByteLength !== 0
      )
        throw new Error("schema archive pin exists without retained bytes");
    } else {
      const archive = await fs.promises.readFile(
        options.codexSchemaArchivePath,
      );
      if (
        archive.length !== runner.codexSchemaArchiveByteLength ||
        EvidenceBenchmarkCodexValue.sha256(archive) !==
          runner.codexSchemaArchiveSha256
      )
        throw new Error("immutable schema archive bytes do not match the pin");
    }
    const tree = await schemaTree(options.codexSchemaDirectory);
    if (
      tree.fileCount !== runner.codexSchemaFileCount ||
      tree.byteLength !== runner.codexSchemaByteLength ||
      tree.sha256 !== runner.codexSchemaSha256
    )
      throw new Error(
        "extracted experimental schema tree does not match archive pins",
      );
    if (
      !options.gates.some((gate): boolean => gate.kind === "build") ||
      !options.gates.some((gate): boolean => gate.kind === "test")
    )
      throw new Error("launch requires independent build and test gates");
    for (const value of [
      options.timeoutMs,
      options.requestTimeoutMs,
      options.heartbeatIntervalMs,
      options.dryIntervalMs,
    ])
      if (!Number.isSafeInteger(value) || value <= 0)
        throw new Error("runner durations must be positive safe integers");
  }

  /** Computes the exact frozen schema-tree identity without regenerating it. */
  export async function schemaTree(root: string): Promise<{
    fileCount: number;
    byteLength: number;
    sha256: string;
  }> {
    const entries: Array<{ path: string; target: string; byteLength: number }> =
      [];
    const visit = async (directory: string): Promise<void> => {
      const children = await fs.promises.readdir(directory, {
        withFileTypes: true,
      });
      children.sort((left, right): number =>
        left.name.localeCompare(right.name),
      );
      for (const child of children) {
        const target = path.join(directory, child.name);
        if (child.isSymbolicLink())
          throw new Error(`schema archive contains a symlink: ${target}`);
        if (child.isDirectory()) {
          await visit(target);
          continue;
        }
        if (!child.isFile())
          throw new Error(`schema archive contains a non-file: ${target}`);
        entries.push({
          path: path
            .relative(root, target)
            .split(path.sep)
            .join("/")
            .normalize("NFC"),
          target,
          byteLength: (await fs.promises.stat(target)).size,
        });
      }
    };
    await visit(path.resolve(root));
    entries.sort((left, right): number => left.path.localeCompare(right.path));
    const digest = crypto.createHash("sha256");
    let byteLength = 0;
    for (const entry of entries) {
      const bytes = await fs.promises.readFile(entry.target);
      byteLength += bytes.length;
      digest.update(entry.path, "utf8");
      digest.update(Buffer.from([0]));
      digest.update(bytes);
      digest.update(Buffer.from([0]));
    }
    return {
      fileCount: entries.length,
      byteLength,
      sha256: digest.digest("hex"),
    };
  }

  function validateDenominators(
    experiment: IEvidenceBenchmarkCodexRun.IExperimentManifest,
  ): void {
    if (
      !Number.isSafeInteger(experiment.acceptanceCatalogCount) ||
      experiment.acceptanceCatalogCount <= 0 ||
      experiment.denominatorsSummed !== false
    )
      throw new Error("acceptance denominator is invalid");
    const contextAbsent =
      experiment.contextCatalogSha256 === null &&
      experiment.contextCatalogCount === 0;
    const contextPresent =
      typeof experiment.contextCatalogSha256 === "string" &&
      experiment.contextCatalogCount > 0 &&
      experiment.contextCatalogSha256 !== experiment.acceptanceCatalogSha256;
    if (!contextAbsent && !contextPresent)
      throw new Error("context denominator must be absent or distinct");
  }

  function validateCost(
    authorization: IEvidenceBenchmarkCodexRun.ICostAuthorization,
  ): void {
    if (
      authorization.id.trim().length === 0 ||
      !Number.isFinite(authorization.maximumCost) ||
      authorization.maximumCost <= 0 ||
      !/^[A-Z]{3}$/.test(authorization.currency) ||
      !Number.isFinite(Date.parse(authorization.approvedAtUtc))
    )
      throw new Error("explicit positive cost authorization is invalid");
  }
}
