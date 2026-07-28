import fs from "node:fs";
import path from "node:path";

import { EvidenceBenchmarkAtomic } from "../EvidenceBenchmarkAtomic.ts";
import { EvidenceBenchmarkHash } from "../EvidenceBenchmarkHash.ts";
import type { IEvidenceBenchmarkQualityGrade } from "../structures/IEvidenceBenchmarkQualityGrade.ts";
import type { IEvidenceBenchmarkQualityPostprocess } from "../structures/IEvidenceBenchmarkQualityPostprocess.ts";
import type { IEvidenceBenchmarkQualityReport } from "../structures/IEvidenceBenchmarkQualityReport.ts";
import { EvidenceBenchmarkBlindBundle } from "../grading/EvidenceBenchmarkBlindBundle.ts";
import { EvidenceBenchmarkQualityReport } from "./EvidenceBenchmarkQualityReport.ts";

/** Seals grading artifacts beside, never inside, an immutable terminal core. */
export namespace EvidenceBenchmarkQualityPostprocess {
  /** Inputs for one immutable postprocess publication. */
  export interface IRequest {
    /** Exact measured run identifier. */
    runId: string;

    /** Terminal generation outcome. */
    generationStatus: "completed" | "failed" | "interrupted" | "safety_limit";

    /** Absolute immutable core-seal path. */
    coreSealPath: string;

    /** New sibling postprocess directory. */
    outputDirectory: string;

    /** Subject needed to validate phase ownership. */
    subject: IEvidenceBenchmarkQualityGrade.Subject;

    /** Safety-stop evidence digest, present only for safety_limit. */
    safetyStopSha256: string | null;

    /** Every reached and fully adjudicated phase. */
    phases: Array<{
      /** Complete quality artifact. */
      report: IEvidenceBenchmarkQualityReport.IPhase;

      /** Runner-owned bundle reopened for post-grade mutation proof. */
      bundle: EvidenceBenchmarkBlindBundle.IResult;
    }>;

    /** UTC timestamp used in the immutable seal. */
    sealedAtUtc: string;
  }

  /** Atomically writes complete phase artifacts and their core-bound seal. */
  export async function write(
    request: IRequest,
  ): Promise<IEvidenceBenchmarkQualityPostprocess.ISeal> {
    if (
      !request.runId.trim() ||
      !fs.existsSync(request.coreSealPath) ||
      fs.existsSync(request.outputDirectory) ||
      !validUtc(request.sealedAtUtc)
    )
      throw new Error("Quality postprocess request is invalid.");
    if (
      (request.generationStatus === "safety_limit") !==
        (request.safetyStopSha256 !== null) ||
      (request.safetyStopSha256 !== null &&
        !/^[a-f0-9]{64}$/.test(request.safetyStopSha256))
    )
      throw new Error("Quality postprocess safety-stop binding is invalid.");
    const order: IEvidenceBenchmarkQualityGrade.Phase[] = request.phases.map(
      (entry) => entry.report.phase,
    );
    const coreSealSha256: string = EvidenceBenchmarkHash.file(
      request.coreSealPath,
    );
    if (
      new Set(order).size !== order.length ||
      (request.generationStatus === "completed" &&
        JSON.stringify(order) !== JSON.stringify(["t_done", "t_dry"])) ||
      request.phases.some(
        (entry) =>
          entry.report.gradePlan.bindings.generationCoreSealSha256 !==
          coreSealSha256,
      )
    )
      throw new Error(
        "Completed postprocess requires exact t_done and t_dry phase order.",
      );
    const output: string = path.resolve(request.outputDirectory);
    const stage: string = `${output}.next-${process.pid}-${Date.now()}`;
    await fs.promises.mkdir(stage, { recursive: false });
    try {
      const phases: IEvidenceBenchmarkQualityPostprocess.IPhase[] = [];
      for (const entry of request.phases) {
        EvidenceBenchmarkQualityReport.validatePhase(
          request.runId,
          request.subject,
          entry.report,
        );
        if (
          entry.bundle.bundleId !== entry.report.bundleId ||
          entry.bundle.sourceSnapshotRawTreeSha256 !==
            entry.report.snapshotRawTreeSha256 ||
          entry.bundle.bundleRawTreeSha256 !==
            entry.report.bundleRawTreeSha256 ||
          entry.bundle.treeAlgorithm !== entry.report.rawScale.treeAlgorithm
        )
          throw new Error(
            `${entry.report.phase} postprocess bundle identity drifted.`,
          );
        EvidenceBenchmarkBlindBundle.verifyAfterGrade(entry.bundle);
        const artifactPath: string = `${entry.report.phase}.json`;
        const artifactLocation: string = path.join(stage, artifactPath);
        await writeExclusive(
          artifactLocation,
          `${JSON.stringify(entry.report, null, 2)}\n`,
        );
        phases.push({
          phase: entry.report.phase,
          artifactPath,
          artifactSha256: EvidenceBenchmarkHash.file(artifactLocation),
          gradingInputManifestSha256:
            entry.report.gradePlan.bindings.gradingInputManifestSha256,
          treeAlgorithm: entry.bundle.treeAlgorithm,
          postGradeBundleRawTreeSha256:
            EvidenceBenchmarkBlindBundle.rawTreeSha256(entry.bundle.bundleRoot),
          firstGradeSha256: EvidenceBenchmarkHash.object(
            entry.report.firstGrade,
          ),
          secondGradeSha256: EvidenceBenchmarkHash.object(
            entry.report.secondGrade,
          ),
          comparisonSha256: EvidenceBenchmarkHash.object(
            entry.report.comparison,
          ),
          adjudicationSha256: entry.report.adjudication.adjudicationSha256,
          deterministicInputsSha256:
            entry.report.deterministicInputs.manifestSha256,
          secondaryReviewSha256: EvidenceBenchmarkHash.object(
            entry.report.secondaryReview,
          ),
        });
      }
      const unsigned: Omit<
        IEvidenceBenchmarkQualityPostprocess.ISeal,
        "sealSha256"
      > = {
        schemaVersion: 1,
        runId: request.runId,
        subject: request.subject,
        generationStatus: request.generationStatus,
        coreSealSha256,
        safetyStopSha256: request.safetyStopSha256,
        phases,
        requiredQualityComplete:
          request.generationStatus === "completed" &&
          JSON.stringify(order) === JSON.stringify(["t_done", "t_dry"]),
        sealedAtUtc: request.sealedAtUtc,
      };
      const seal: IEvidenceBenchmarkQualityPostprocess.ISeal = {
        ...unsigned,
        sealSha256: EvidenceBenchmarkHash.object(unsigned),
      };
      await writeExclusive(
        path.join(stage, "postprocess-seal.json"),
        `${JSON.stringify(seal, null, 2)}\n`,
      );
      await EvidenceBenchmarkAtomic.publish(stage, output);
      verify(request.coreSealPath, output);
      return seal;
    } catch (error) {
      if (fs.existsSync(stage))
        await fs.promises.rm(stage, { recursive: true, force: true });
      throw error;
    }
  }

  /** Reopens a postprocess directory and verifies its immutable core binding. */
  export function verify(
    coreSealPath: string,
    postprocessDirectory: string,
  ): IEvidenceBenchmarkQualityPostprocess.ISeal {
    const root: string = path.resolve(postprocessDirectory);
    const sealPath: string = path.join(root, "postprocess-seal.json");
    const seal: IEvidenceBenchmarkQualityPostprocess.ISeal = JSON.parse(
      fs.readFileSync(sealPath, "utf8"),
    ) as IEvidenceBenchmarkQualityPostprocess.ISeal;
    const { sealSha256: _sealSha256, ...unsigned } = seal;
    const sha256: RegExp = /^[a-f0-9]{64}$/;
    if (
      seal.schemaVersion !== 1 ||
      !seal.runId.trim() ||
      !["todo", "reddit", "shopping", "erp"].includes(seal.subject) ||
      !["completed", "failed", "interrupted", "safety_limit"].includes(
        seal.generationStatus,
      ) ||
      seal.coreSealSha256 !== EvidenceBenchmarkHash.file(coreSealPath) ||
      (seal.generationStatus === "safety_limit") !==
        (seal.safetyStopSha256 !== null) ||
      (seal.safetyStopSha256 !== null && !sha256.test(seal.safetyStopSha256)) ||
      !validUtc(seal.sealedAtUtc) ||
      seal.sealSha256 !== EvidenceBenchmarkHash.object(unsigned) ||
      new Set(seal.phases.map((phase) => phase.phase)).size !==
        seal.phases.length ||
      seal.requiredQualityComplete !==
        (seal.generationStatus === "completed" &&
          JSON.stringify(seal.phases.map((phase) => phase.phase)) ===
            JSON.stringify(["t_done", "t_dry"]))
    )
      throw new Error("Quality postprocess seal is invalid.");
    for (const phase of seal.phases) {
      if (
        phase.treeAlgorithm !== EvidenceBenchmarkHash.TREE_ALGORITHM ||
        [
          phase.artifactSha256,
          phase.gradingInputManifestSha256,
          phase.postGradeBundleRawTreeSha256,
          phase.firstGradeSha256,
          phase.secondGradeSha256,
          phase.comparisonSha256,
          phase.adjudicationSha256,
          phase.deterministicInputsSha256,
          phase.secondaryReviewSha256,
        ].some((digest) => !sha256.test(digest))
      )
        throw new Error(`${phase.phase} postprocess projection is invalid.`);
      const target: string = inside(root, phase.artifactPath);
      if (phase.artifactSha256 !== EvidenceBenchmarkHash.file(target))
        throw new Error(
          `${phase.phase} postprocess artifact changed after sealing.`,
        );
      const report: IEvidenceBenchmarkQualityReport.IPhase = JSON.parse(
        fs.readFileSync(target, "utf8"),
      ) as IEvidenceBenchmarkQualityReport.IPhase;
      EvidenceBenchmarkQualityReport.validatePhase(
        seal.runId,
        seal.subject,
        report,
      );
      if (
        report.phase !== phase.phase ||
        report.gradePlan.bindings.generationCoreSealSha256 !==
          seal.coreSealSha256 ||
        report.gradePlan.bindings.gradingInputManifestSha256 !==
          phase.gradingInputManifestSha256 ||
        report.rawScale.treeAlgorithm !== phase.treeAlgorithm ||
        report.bundleRawTreeSha256 !== phase.postGradeBundleRawTreeSha256 ||
        EvidenceBenchmarkHash.object(report.firstGrade) !==
          phase.firstGradeSha256 ||
        EvidenceBenchmarkHash.object(report.secondGrade) !==
          phase.secondGradeSha256 ||
        EvidenceBenchmarkHash.object(report.comparison) !==
          phase.comparisonSha256 ||
        report.adjudication.adjudicationSha256 !== phase.adjudicationSha256 ||
        report.deterministicInputs.manifestSha256 !==
          phase.deterministicInputsSha256 ||
        EvidenceBenchmarkHash.object(report.secondaryReview) !==
          phase.secondaryReviewSha256
      )
        throw new Error(
          `${phase.phase} postprocess digest projections are stale.`,
        );
    }
    return seal;
  }

  /**
   * Admits final latest/demo promotion only after block-ledger publication.
   *
   * The caller remains the sole final-promotion owner. This function performs
   * no repository mutation and exposes no bypass around that facade.
   */
  export function admitFinalPromotion(
    coreSealPath: string,
    postprocessDirectory: string,
    ledgerRow: IEvidenceBenchmarkQualityReport.ILedgerRow,
    runId: string,
  ): void {
    const seal = verify(coreSealPath, postprocessDirectory);
    const { rowSha256: _rowSha256, ...unsignedRow } = ledgerRow;
    EvidenceBenchmarkQualityReport.create(ledgerRow.block);
    const cell = ledgerRow.block.cells.find(
      (candidate) => candidate.runId === runId,
    );
    const postprocessSealPath: string = path.join(
      postprocessDirectory,
      "postprocess-seal.json",
    );
    if (
      seal.runId !== runId ||
      ledgerRow.schemaVersion !== 1 ||
      !Number.isSafeInteger(ledgerRow.sequence) ||
      ledgerRow.sequence < 1 ||
      !/^[a-f0-9]{64}$/.test(ledgerRow.previousRowSha256) ||
      ledgerRow.blockSha256 !== EvidenceBenchmarkHash.object(ledgerRow.block) ||
      ledgerRow.rowSha256 !== EvidenceBenchmarkHash.object(unsignedRow) ||
      seal.generationStatus !== "completed" ||
      !seal.requiredQualityComplete ||
      cell === undefined ||
      cell.status !== "completed" ||
      cell.postprocessSealSha256 !==
        EvidenceBenchmarkHash.file(postprocessSealPath) ||
      cell.attemptSealSha256 !== seal.coreSealSha256
    )
      throw new Error(
        "Final promotion requires a complete core, postprocess, and block ledger row.",
      );
  }

  function inside(root: string, relative: string): string {
    if (
      relative.includes("\\") ||
      path.posix.isAbsolute(relative) ||
      relative
        .split("/")
        .some(
          (segment) => segment === "" || segment === "." || segment === "..",
        )
    )
      throw new Error(`Postprocess path is not portable: ${relative}.`);
    const target: string = path.resolve(root, ...relative.split("/"));
    if (target !== root && !target.startsWith(`${root}${path.sep}`))
      throw new Error(`Postprocess path escapes its root: ${relative}.`);
    return target;
  }

  async function writeExclusive(
    target: string,
    content: string,
  ): Promise<void> {
    const handle = await fs.promises.open(target, "wx");
    try {
      await handle.writeFile(content, "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }
  }

  function validUtc(value: string): boolean {
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value))
      return false;
    const milliseconds: number = Date.parse(value);
    return (
      !Number.isNaN(milliseconds) &&
      new Date(milliseconds).toISOString() === value
    );
  }
}
