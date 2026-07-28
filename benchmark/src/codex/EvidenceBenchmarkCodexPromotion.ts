import fs from "node:fs";
import path from "node:path";

import type { IEvidenceBenchmarkCodexRun } from "../structures/IEvidenceBenchmarkCodexRun.ts";
import { EvidenceBenchmarkCodexCheckpoint } from "./EvidenceBenchmarkCodexCheckpoint.ts";
import { EvidenceBenchmarkCodexLog } from "./EvidenceBenchmarkCodexLog.ts";
import { EvidenceBenchmarkCodexSourceSnapshot } from "./EvidenceBenchmarkCodexSourceSnapshot.ts";
import { EvidenceBenchmarkCodexValue } from "./EvidenceBenchmarkCodexValue.ts";

/**
 * Publishes immutable terminal runs while updating only the latest and
 * successful-demo projections.
 */
export namespace EvidenceBenchmarkCodexPromotion {
  /** Frozen promotion input validated before any canonical mutation. */
  export interface IOptions {
    /** Terminal run identity. */
    runId: string;

    /** Durable run record directory. */
    runDirectory: string;

    /** Immutable source snapshot directory captured before terminal sealing. */
    sealedSourceSnapshotDirectory: string;

    /** Manifest sealing the immutable source snapshot directory. */
    sealedSourceSnapshotManifestPath: string;

    /** Canonical `benchmark/result/<subject>/<arm>` directory. */
    canonicalDirectory: string;

    /** Immutable run manifest. */
    manifest: IEvidenceBenchmarkCodexRun.IManifest;

    /** Terminal runner checkpoint. */
    state: IEvidenceBenchmarkCodexRun.IRunState;

    /** Final validated semantic event hash. */
    finalEventSha256: string;
  }

  /**
   * Appends one immutable terminal run and atomically updates projections.
   *
   * Interrupted and failed runs remain under `runs/` for cost history but never
   * replace the latest completed pointer or demo workspace.
   */
  export async function promote(options: IOptions): Promise<void> {
    validate(options);
    const canonical = path.resolve(options.canonicalDirectory);
    const runs = path.join(canonical, "runs");
    const target = path.join(runs, options.runId);
    const stage = path.join(
      runs,
      `.next-${options.runId}-${process.pid}-${Date.now()}`,
    );
    assertInside(canonical, runs);
    assertInside(runs, target);
    assertInside(runs, stage);
    if (
      isInside(path.resolve(options.runDirectory), canonical) ||
      isInside(path.resolve(options.sealedSourceSnapshotDirectory), canonical)
    )
      throw new Error("canonical result must not contain source artifacts");
    await fs.promises.mkdir(runs, { recursive: true });
    if (await exists(target))
      throw new Error(`terminal run ${options.runId} is already published`);
    const priorRuns = await runDigests(runs);
    const previousLatestRunId = await latestRunId(canonical);
    await fs.promises.mkdir(stage, { recursive: false });
    try {
      await fs.promises.cp(options.runDirectory, path.join(stage, "record"), {
        recursive: true,
        force: false,
        errorOnExist: true,
      });
      const snapshotManifest = await readSnapshotManifest(
        options.sealedSourceSnapshotManifestPath,
      );
      await EvidenceBenchmarkCodexSourceSnapshot.verify(
        options.sealedSourceSnapshotDirectory,
        snapshotManifest,
      );
      await fs.promises.cp(
        options.sealedSourceSnapshotDirectory,
        path.join(stage, "workspace"),
        {
          recursive: true,
          force: false,
          errorOnExist: true,
        },
      );
      await fs.promises.copyFile(
        options.sealedSourceSnapshotManifestPath,
        path.join(stage, "source-snapshot.manifest.json"),
        fs.constants.COPYFILE_EXCL,
      );
      await EvidenceBenchmarkCodexSourceSnapshot.verify(
        path.join(stage, "workspace"),
        snapshotManifest,
      );
      if (
        options.state.status === "completed" &&
        snapshotManifest.sourceSnapshotSha256 !==
          options.state.tDrySourceSnapshotSha256
      )
        throw new Error(
          "completed source snapshot does not equal the sealed t_dry snapshot",
        );
      const reopened = new EvidenceBenchmarkCodexLog(
        path.join(stage, "record"),
        options.state.streamHeads.envelope.lastSequence,
        options.runId,
      );
      await reopened.open();
      const reopenedHeads = await reopened.streamHeads();
      const orphanSegments = await reopened.orphanSegments();
      if (
        EvidenceBenchmarkCodexValue.canonicalJson(reopenedHeads) !==
        EvidenceBenchmarkCodexValue.canonicalJson(options.state.streamHeads)
      )
        throw new Error(
          "fresh-process raw, envelope, or event verification changed stream heads",
        );
      if (options.state.status === "completed" && orphanSegments.length !== 0)
        throw new Error(
          "completed promotion cannot contain raw orphan segments",
        );
      const recordSha256 = await treeSha256(path.join(stage, "record"));
      const workspaceSha256 = snapshotManifest.sourceSnapshotSha256;
      const seal = {
        schemaVersion: 1,
        runId: options.runId,
        status: options.state.status,
        sealedAtUtc: options.state.terminal!.atUtc,
        manifestSha256: options.state.manifestSha256,
        finalEventSha256: options.finalEventSha256,
        recordSha256,
        workspaceSha256,
      };
      await EvidenceBenchmarkCodexCheckpoint.write(
        path.join(stage, "terminal-seal.json"),
        seal,
      );
      await EvidenceBenchmarkCodexCheckpoint.write(
        path.join(stage, "promotion.json"),
        {
          schemaVersion: 1,
          runId: options.runId,
          subject: options.manifest.experiment.subject,
          arm: options.manifest.experiment.arm,
          status: options.state.status,
          sourceRunRoot: path.resolve(options.runDirectory),
          retainedRunPath: `runs/${options.runId}`,
          sourceSnapshotSha256: snapshotManifest.sourceSnapshotSha256,
          tDrySourceSnapshotSha256: options.state.tDrySourceSnapshotSha256,
          sourceSnapshotManifestSha256: snapshotManifest.manifestSha256,
          manifestHashAlgorithm: "rfc8785-sha256",
          manifestSha256: options.state.manifestSha256,
          rawChainFreshProcessVerified: true,
          orphanFree: orphanSegments.length === 0,
          orphanSegmentCount: orphanSegments.length,
          priorRunsPreserved: true,
          previousLatestRunId,
          currentLatestRunId:
            options.state.status === "completed"
              ? options.runId
              : previousLatestRunId,
          promotedAtUtc: new Date().toISOString(),
        },
      );
      await fs.promises.rename(stage, target);
      const afterRuns = await runDigests(runs, options.runId);
      for (const [runId, digest] of Object.entries(priorRuns))
        if (afterRuns[runId] !== digest)
          throw new Error(`promotion mutated prior terminal run ${runId}`);
      if (options.state.status === "completed") {
        await EvidenceBenchmarkCodexCheckpoint.write(
          path.join(canonical, "latest.json"),
          {
            schemaVersion: 1,
            runId: options.runId,
            status: options.state.status,
            terminalAtUtc: options.state.terminal!.atUtc,
            runPath: `runs/${options.runId}`,
            manifestSha256: options.state.manifestSha256,
            finalEventSha256: options.finalEventSha256,
            recordSha256,
            workspaceSha256,
          },
        );
        await replaceDemoWorkspace(
          canonical,
          path.join(target, "workspace"),
          options.runId,
        );
      }
    } catch (error) {
      if (await exists(stage))
        await fs.promises.rm(stage, { recursive: true, force: true });
      throw error;
    }
  }

  function validate(options: IOptions): void {
    const manifestSha256 = EvidenceBenchmarkCodexValue.sha256(
      EvidenceBenchmarkCodexValue.canonicalJson(options.manifest),
    );
    if (
      options.manifest.experiment.runId !== options.runId ||
      options.state.status === "running" ||
      options.state.phase !== "terminal" ||
      options.state.terminal === null ||
      options.state.manifestSha256 !== manifestSha256 ||
      options.state.streamHeads.event.lastEventSha256 !==
        options.finalEventSha256 ||
      options.finalEventSha256.length !== 64
    )
      throw new Error(
        "promotion requires a manifest-valid terminal seal and raw-chain head",
      );
    if (
      options.state.status === "completed" &&
      (!options.state.green ||
        options.state.milestones.t_dry === undefined ||
        options.state.campaignCheckpointSha256 === null ||
        options.state.tDrySourceSnapshotSha256 === null)
    )
      throw new Error(
        "completed promotion requires green gates and campaign t_dry",
      );
  }

  async function readSnapshotManifest(
    target: string,
  ): Promise<EvidenceBenchmarkCodexSourceSnapshot.IManifest> {
    const input: unknown = JSON.parse(
      await fs.promises.readFile(target, "utf8"),
    );
    if (
      !EvidenceBenchmarkCodexValue.isRecord(input) ||
      input.schemaVersion !== 1 ||
      typeof input.sourceSnapshotSha256 !== "string" ||
      typeof input.manifestSha256 !== "string" ||
      !Array.isArray(input.entries) ||
      !Array.isArray(input.exclusions)
    )
      throw new Error("sealed source snapshot manifest is malformed");
    return input as unknown as EvidenceBenchmarkCodexSourceSnapshot.IManifest;
  }

  async function replaceDemoWorkspace(
    canonical: string,
    source: string,
    runId: string,
  ): Promise<void> {
    const target = path.join(canonical, "workspace");
    const stage = path.join(canonical, `.workspace-next-${runId}`);
    const previous = path.join(canonical, `.workspace-previous-${runId}`);
    assertInside(canonical, stage);
    assertInside(canonical, previous);
    if (await exists(stage))
      await fs.promises.rm(stage, { recursive: true, force: true });
    if (await exists(previous))
      await fs.promises.rm(previous, { recursive: true, force: true });
    await fs.promises.cp(source, stage, {
      recursive: true,
      force: false,
      errorOnExist: true,
    });
    const hadTarget = await exists(target);
    if (hadTarget) await fs.promises.rename(target, previous);
    try {
      await fs.promises.rename(stage, target);
    } catch (error) {
      if (hadTarget) await fs.promises.rename(previous, target);
      throw error;
    }
    if (hadTarget)
      await fs.promises.rm(previous, { recursive: true, force: true });
  }

  async function treeSha256(root: string): Promise<string> {
    const entries: Array<{
      path: string;
      kind: "file" | "symlink";
      byteLength: number;
      sha256: string;
    }> = [];
    const visit = async (directory: string): Promise<void> => {
      const children = await fs.promises.readdir(directory, {
        withFileTypes: true,
      });
      children.sort((left, right): number =>
        EvidenceBenchmarkCodexValue.utf8Compare(left.name, right.name),
      );
      for (const child of children) {
        const target = path.join(directory, child.name);
        if (child.isDirectory()) {
          await visit(target);
          continue;
        }
        const relative = path
          .relative(root, target)
          .split(path.sep)
          .join("/")
          .normalize("NFC");
        const bytes = child.isSymbolicLink()
          ? Buffer.from(await fs.promises.readlink(target), "utf8")
          : await fs.promises.readFile(target);
        entries.push({
          path: relative,
          kind: child.isSymbolicLink() ? "symlink" : "file",
          byteLength: bytes.length,
          sha256: EvidenceBenchmarkCodexValue.sha256(bytes),
        });
      }
    };
    await visit(root);
    entries.sort((left, right): number =>
      EvidenceBenchmarkCodexValue.utf8Compare(left.path, right.path),
    );
    return EvidenceBenchmarkCodexValue.sha256(
      EvidenceBenchmarkCodexValue.canonicalJson(entries),
    );
  }

  async function runDigests(
    runs: string,
    excludeRunId?: string,
  ): Promise<Record<string, string>> {
    if (!(await exists(runs))) return {};
    const children = await fs.promises.readdir(runs, {
      withFileTypes: true,
    });
    const output: Record<string, string> = {};
    for (const child of children)
      if (
        child.isDirectory() &&
        !child.name.startsWith(".next-") &&
        child.name !== excludeRunId
      )
        output[child.name] = await treeSha256(path.join(runs, child.name));
    return output;
  }

  async function latestRunId(canonical: string): Promise<string | null> {
    try {
      const input: unknown = JSON.parse(
        await fs.promises.readFile(path.join(canonical, "latest.json"), "utf8"),
      );
      return EvidenceBenchmarkCodexValue.isRecord(input) &&
        typeof input.runId === "string"
        ? input.runId
        : null;
    } catch (error) {
      if (
        EvidenceBenchmarkCodexValue.isRecord(error) &&
        error.code === "ENOENT"
      )
        return null;
      throw error;
    }
  }

  async function exists(target: string): Promise<boolean> {
    return fs.promises
      .lstat(target)
      .then((): boolean => true)
      .catch((error: unknown): boolean => {
        if (
          EvidenceBenchmarkCodexValue.isRecord(error) &&
          error.code === "ENOENT"
        )
          return false;
        throw error;
      });
  }

  function assertInside(root: string, target: string): void {
    if (!isInside(root, target))
      throw new Error(`promotion path escapes its exact root: ${target}`);
  }

  function isInside(root: string, target: string): boolean {
    const relative = path.relative(path.resolve(root), path.resolve(target));
    return (
      relative === "" ||
      (!relative.startsWith(`..${path.sep}`) &&
        relative !== ".." &&
        !path.isAbsolute(relative))
    );
  }
}
