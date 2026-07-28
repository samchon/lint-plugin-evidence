import fs from "node:fs";
import path from "node:path";

import { EvidenceBenchmarkHash } from "./EvidenceBenchmarkHash.ts";
import { EvidenceBenchmarkMaterializer } from "./EvidenceBenchmarkMaterializer.ts";
import { EvidenceBenchmarkOperationPlan } from "./EvidenceBenchmarkOperationPlan.ts";
import { EvidenceBenchmarkOperationStore } from "./EvidenceBenchmarkOperationStore.ts";
import { EvidenceBenchmarkOperationSource } from "./EvidenceBenchmarkOperationSource.ts";
import { EvidenceBenchmarkPackage } from "./EvidenceBenchmarkPackage.ts";
import { EvidenceBenchmarkProcess } from "./EvidenceBenchmarkProcess.ts";
import { EvidenceBenchmarkProtocolAdmission } from "./EvidenceBenchmarkProtocolAdmission.ts";
import { EvidenceBenchmarkSetup } from "./EvidenceBenchmarkSetup.ts";
import type { IEvidenceBenchmarkMaterialization } from "./structures/IEvidenceBenchmarkMaterialization.ts";
import type { IEvidenceBenchmarkOperation } from "./structures/IEvidenceBenchmarkOperation.ts";
import type { IEvidenceBenchmarkOperationPreparer } from "./structures/IEvidenceBenchmarkOperationPreparer.ts";
import type { IEvidenceBenchmarkPackageArtifact } from "./structures/IEvidenceBenchmarkPackageArtifact.ts";

/** Production model-free preparer for the first Todo and Reddit block. */
export class EvidenceBenchmarkOperationPreparer implements IEvidenceBenchmarkOperationPreparer {
  /** Creates a preparer rooted at the benchmark package's transient work tree. */
  public constructor(
    private readonly options: EvidenceBenchmarkOperationPreparer.IOptions,
  ) {}

  /**
   * Packs the product before creating any cell, then prepares all four
   * path-identical experiment cells without importing or invoking Codex.
   */
  public async prepare(
    request: IEvidenceBenchmarkOperation.IPrepareRequest,
  ): Promise<IEvidenceBenchmarkOperation.IPlan> {
    const repository: string = path.resolve(request.repository);
    const planPath: string = path.resolve(request.plan);
    const seed: string = request.seed ?? EvidenceBenchmarkOperationPlan.seed();
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,95}$/.test(request.blockId))
      throw new Error(
        "Benchmark block id must be one portable filename segment.",
      );
    if (!Number.isInteger(request.replicate) || request.replicate < 1)
      throw new Error("Benchmark replicate must be a positive integer.");
    if (fs.existsSync(planPath))
      throw new Error(
        `Benchmark preparation refuses to overwrite a plan: ${planPath}.`,
      );
    const source = await this.source(repository);
    const subjects: IEvidenceBenchmarkOperation.IPlan["subjects"] =
      request.subjects ?? ["todo", "reddit"];
    const blockRoot: string = path.join(this.options.workRoot, request.blockId);
    if (fs.existsSync(blockRoot))
      throw new Error(
        `Benchmark preparation refuses to overwrite a block: ${blockRoot}.`,
      );
    fs.mkdirSync(blockRoot, { recursive: true });

    const sealed = await EvidenceBenchmarkOperationSource.prepare({
      repository,
      output: path.join(blockRoot, "source"),
      revision: source.revision,
      now: this.options.now,
    });
    EvidenceBenchmarkProtocolAdmission.validate(sealed.root);
    const productRoot: string = path.join(blockRoot, "product");
    const artifact: IEvidenceBenchmarkPackageArtifact =
      await EvidenceBenchmarkPackage.prepare({
        repository: sealed.root,
        expectedCommit: source.revision,
        output: productRoot,
      });
    const specifications = EvidenceBenchmarkOperationPlan.cells(
      request.blockId,
      request.replicate,
      subjects,
    );
    const randomized = EvidenceBenchmarkOperationPlan.randomize(
      specifications,
      seed,
    );
    const prepared: IEvidenceBenchmarkOperation.ICell[] = await Promise.all(
      randomized.map(async (specification, launchIndex) => {
        const root: string = path.join(blockRoot, "cells", specification.runId);
        const variables: IEvidenceBenchmarkMaterialization.IVariables =
          this.variables(specification.runId);
        const materialization = await EvidenceBenchmarkMaterializer.materialize(
          {
            repository: sealed.root,
            output: root,
            project: specification.project,
            arm: specification.arm,
            variables,
            artifact,
          },
        );
        await EvidenceBenchmarkSetup.prepare({
          materialization,
          arm: specification.arm,
        });
        const setupRecord: string = path.join(root, "setup.json");
        return {
          ...specification,
          replicate: request.replicate,
          launchIndex,
          root,
          workspace: materialization.workspace,
          materializationManifest: materialization.manifest,
          materializationManifestSha256: EvidenceBenchmarkHash.file(
            materialization.manifest,
          ),
          setupRecord,
          setupRecordSha256: EvidenceBenchmarkHash.file(setupRecord),
        };
      }),
    );
    const cells: IEvidenceBenchmarkOperation.ICell[] = [...prepared].sort(
      (left, right) =>
        left.runId < right.runId ? -1 : left.runId > right.runId ? 1 : 0,
    );
    const plan: IEvidenceBenchmarkOperation.IPlan =
      EvidenceBenchmarkOperationPlan.write(planPath, {
        schemaVersion: 1,
        blockId: request.blockId,
        sourceRevision: source.revision,
        repository,
        preparedAtUtc: this.options.now().toISOString(),
        replicate: request.replicate,
        subjects,
        mergedBaseRef: source.mergedBaseRef,
        mergedBaseRevision: source.mergedBaseRevision,
        remoteVerifiedAtUtc: source.remoteVerifiedAtUtc,
        sealedSource: sealed.root,
        sealedSourceManifest: sealed.manifest,
        sealedSourceManifestSha256: EvidenceBenchmarkHash.file(sealed.manifest),
        seed,
        safety: request.safety,
        concurrency: 4,
        launchOrder: randomized.map((cell) => cell.runId),
        cells,
        productProvenance: path.join(productRoot, "provenance.json"),
        productProvenanceSha256: EvidenceBenchmarkHash.file(
          path.join(productRoot, "provenance.json"),
        ),
      });
    const serialized: string = fs.readFileSync(planPath, "utf8");
    for (const cell of plan.cells) {
      fs.writeFileSync(
        path.join(cell.root, "operation-plan.json"),
        serialized,
        { encoding: "utf8", flag: "wx" },
      );
      EvidenceBenchmarkOperationStore.initialize(cell, this.options.now());
    }
    return plan;
  }

  private async source(repository: string): Promise<{
    revision: string;
    mergedBaseRef: string;
    mergedBaseRevision: string;
    remoteVerifiedAtUtc: string;
  }> {
    const revisionResult = await EvidenceBenchmarkProcess.run(
      "git",
      ["rev-parse", "HEAD"],
      { cwd: repository, label: "benchmark source revision" },
    );
    const revision: string = revisionResult.stdout.trim();
    if (!/^[0-9a-f]{40}$/i.test(revision))
      throw new Error(
        `Git returned an invalid benchmark source revision: ${revision}.`,
      );
    const remoteHead = await EvidenceBenchmarkProcess.run(
      "git",
      ["symbolic-ref", "refs/remotes/origin/HEAD"],
      { cwd: repository, label: "benchmark remote default branch" },
    );
    const mergedBaseRef: string = remoteHead.stdout.trim();
    if (!/^refs\/remotes\/origin\/.+/.test(mergedBaseRef))
      throw new Error(
        `Git returned an invalid remote default branch: ${mergedBaseRef}.`,
      );
    const remoteBranch: string = mergedBaseRef.slice(
      "refs/remotes/origin/".length,
    );
    await EvidenceBenchmarkProcess.run(
      "git",
      [
        "fetch",
        "--quiet",
        "origin",
        `+refs/heads/${remoteBranch}:${mergedBaseRef}`,
      ],
      { cwd: repository, label: "benchmark remote-default refresh" },
    );
    const remoteRevision = await EvidenceBenchmarkProcess.run(
      "git",
      ["rev-parse", mergedBaseRef],
      { cwd: repository, label: "benchmark fetched remote revision" },
    );
    const mergedBaseRevision: string = remoteRevision.stdout.trim();
    if (!/^[0-9a-f]{40}$/i.test(mergedBaseRevision))
      throw new Error(
        `Git returned an invalid fetched revision: ${mergedBaseRevision}.`,
      );
    const merged = await EvidenceBenchmarkProcess.run(
      "git",
      ["merge-base", "--is-ancestor", revision, mergedBaseRevision],
      {
        cwd: repository,
        label: "benchmark merged-source admission",
        allowFailure: true,
      },
    );
    if (merged.status !== 0)
      throw new Error(
        `Benchmark source ${revision} is not merged into ${mergedBaseRef}.`,
      );
    return {
      revision,
      mergedBaseRef,
      mergedBaseRevision,
      remoteVerifiedAtUtc: this.options.now().toISOString(),
    };
  }

  private variables(
    runId: string,
  ): IEvidenceBenchmarkMaterialization.IVariables {
    const slug: string = runId.toLowerCase().replaceAll(/[^a-z0-9-]/g, "-");
    return {
      name: `evidence-benchmark-${slug}`,
      apiPackageName: `@evidence-benchmark-${slug}/api`,
      backendPackageName: `@evidence-benchmark-${slug}/backend`,
      frontendPackageName: `@evidence-benchmark-${slug}/frontend`,
    };
  }
}

/** Constructor dependencies for {@link EvidenceBenchmarkOperationPreparer}. */
export namespace EvidenceBenchmarkOperationPreparer {
  /** Work-root and clock dependencies shared by deterministic preparation. */
  export interface IOptions {
    /** Absolute transient root owning every prepared block. */
    workRoot: string;

    /** UTC clock injected by deterministic fixtures. */
    now: () => Date;
  }
}
