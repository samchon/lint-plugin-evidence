import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { EvidenceBenchmarkAtomic } from "../EvidenceBenchmarkAtomic.ts";
import { EvidenceBenchmarkHash } from "../EvidenceBenchmarkHash.ts";
import type { IEvidenceBenchmarkQualityGrade } from "../structures/IEvidenceBenchmarkQualityGrade.ts";
import type { IEvidenceBenchmarkQualityReport } from "../structures/IEvidenceBenchmarkQualityReport.ts";

/** Validates, renders, and atomically appends benchmark quality block reports. */
export namespace EvidenceBenchmarkQualityReport {
  const ZERO_SHA256 = "0".repeat(64);

  /** Creates one validated four-cell randomized block report. */
  export function create(
    input: IEvidenceBenchmarkQualityReport.IBlock,
  ): IEvidenceBenchmarkQualityReport.IBlock {
    validateBlock(input);
    return structuredClone(input);
  }

  /** Validates one terminal cell before postprocess or block publication. */
  export function validateCell(
    cell: IEvidenceBenchmarkQualityReport.ICell,
  ): void {
    requireCell(cell);
  }

  /** Validates one complete graded phase before immutable postprocess sealing. */
  export function validatePhase(
    runId: string,
    subject: IEvidenceBenchmarkQualityReport.ICell["subject"],
    phase: IEvidenceBenchmarkQualityReport.IPhase,
  ): void {
    requirePhase({ runId, subject }, phase);
  }

  /**
   * Appends one immutable report row as an atomic file.
   *
   * Existing rows are freshly reopened and hash-checked under an exclusive
   * lock. A crash can leave only a `.next-*` stage, never a partial ledger
   * row.
   */
  export async function append(
    ledgerDirectory: string,
    block: IEvidenceBenchmarkQualityReport.IBlock,
  ): Promise<IEvidenceBenchmarkQualityReport.ILedgerRow> {
    validateBlock(block);
    const root: string = path.resolve(ledgerDirectory);
    await fs.promises.mkdir(root, { recursive: true });
    const release: () => Promise<void> = await lock(root);
    try {
      const rows: IEvidenceBenchmarkQualityReport.ILedgerRow[] =
        await read(root);
      if (
        rows.some(
          (row) =>
            row.block.blockId === block.blockId ||
            row.blockSha256 === EvidenceBenchmarkHash.object(block),
        )
      )
        throw new Error(
          `Quality report block is already appended: ${block.blockId}.`,
        );
      const sequence: number = rows.length + 1;
      const previousRowSha256: string =
        rows.length === 0
          ? ZERO_SHA256
          : EvidenceBenchmarkHash.file(rowPath(root, rows.at(-1)!));
      const unsigned: Omit<
        IEvidenceBenchmarkQualityReport.ILedgerRow,
        "rowSha256"
      > = {
        schemaVersion: 1,
        sequence,
        previousRowSha256,
        block: structuredClone(block),
        blockSha256: EvidenceBenchmarkHash.object(block),
      };
      const row: IEvidenceBenchmarkQualityReport.ILedgerRow = {
        ...unsigned,
        rowSha256: EvidenceBenchmarkHash.object(unsigned),
      };
      const target: string = rowPath(root, row);
      const stage: string = path.join(
        root,
        `.next-${String(sequence).padStart(6, "0")}-${crypto.randomUUID()}`,
      );
      await writeExclusive(stage, `${JSON.stringify(row, null, 2)}\n`);
      await EvidenceBenchmarkAtomic.publish(stage, target);
      await read(root);
      return row;
    } finally {
      await release();
    }
  }

  /** Reads and validates every immutable report row in append order. */
  export async function read(
    ledgerDirectory: string,
  ): Promise<IEvidenceBenchmarkQualityReport.ILedgerRow[]> {
    const root: string = path.resolve(ledgerDirectory);
    if (!fs.existsSync(root)) return [];
    const stages: string[] = (await fs.promises.readdir(root)).filter((name) =>
      name.startsWith(".next-"),
    );
    if (stages.length !== 0)
      throw new Error(
        `Quality report ledger has recoverable staged rows: ${stages.join(", ")}.`,
      );
    const files: string[] = (await fs.promises.readdir(root))
      .filter((name) => /^\d{6}-[a-f0-9]{64}\.json$/.test(name))
      .sort();
    const rows: IEvidenceBenchmarkQualityReport.ILedgerRow[] = [];
    let previousBytesSha256: string = ZERO_SHA256;
    for (const [offset, name] of files.entries()) {
      const target: string = path.join(root, name);
      const bytes: Buffer = await fs.promises.readFile(target);
      const row: IEvidenceBenchmarkQualityReport.ILedgerRow = JSON.parse(
        new TextDecoder("utf-8", { fatal: true }).decode(bytes),
      ) as IEvidenceBenchmarkQualityReport.ILedgerRow;
      validateBlock(row.block);
      const { rowSha256: _rowSha256, ...unsigned } = row;
      const sequence: number = offset + 1;
      if (
        row.schemaVersion !== 1 ||
        row.sequence !== sequence ||
        row.previousRowSha256 !== previousBytesSha256 ||
        row.blockSha256 !== EvidenceBenchmarkHash.object(row.block) ||
        row.rowSha256 !== EvidenceBenchmarkHash.object(unsigned) ||
        name !== `${String(sequence).padStart(6, "0")}-${row.rowSha256}.json`
      )
        throw new Error(`Quality report ledger row is invalid: ${name}.`);
      rows.push(row);
      previousBytesSha256 = EvidenceBenchmarkHash.bytes(bytes);
    }
    return rows;
  }

  /**
   * Preserves interrupted stage files under an orphan directory.
   *
   * Recovery never deletes or promotes an incomplete stage. A later append
   * starts only after every stage has moved to the timestamped orphan record.
   */
  export async function recover(ledgerDirectory: string): Promise<string[]> {
    const root: string = path.resolve(ledgerDirectory);
    if (!fs.existsSync(root)) return [];
    const release: () => Promise<void> = await lock(root);
    try {
      const stages: string[] = (await fs.promises.readdir(root))
        .filter((name) => name.startsWith(".next-"))
        .sort();
      if (stages.length === 0) return [];
      const orphan: string = path.join(
        root,
        "orphan",
        new Date().toISOString().replaceAll(/[:.]/g, "-"),
      );
      await fs.promises.mkdir(orphan, { recursive: true });
      const retained: string[] = [];
      for (const stage of stages) {
        const source: string = path.join(root, stage);
        const target: string = path.join(orphan, stage.slice(1));
        await EvidenceBenchmarkAtomic.publish(source, target);
        retained.push(target);
      }
      await read(root);
      return retained;
    } finally {
      await release();
    }
  }

  /** Renders a bounded public Markdown block suitable for results issue #99. */
  export function markdown(
    block: IEvidenceBenchmarkQualityReport.IBlock,
  ): string {
    validateBlock(block);
    const lines: string[] = [
      `## Benchmark block ${escape(block.blockId)}`,
      "",
      `Merged source: \`${block.sourceMergedCommit}\`  `,
      `Protocol: \`${escape(block.protocolRevision)}\`  `,
      `Block plan: \`${block.blockPlanSha256}\`  `,
      `Price sheet: \`${block.priceSheetSha256}\``,
      "",
      "### Time, usage, and terminal outcome",
      "",
      "| Order | Subject | Arm | Status | t_done | t_green | t_dry | Tokens | Usage | Rounds | Findings | Gates failed | Censoring | Public reason |",
      "| ---: | --- | --- | --- | ---: | ---: | ---: | ---: | --- | ---: | ---: | ---: | --- | --- |",
    ];
    for (const cell of [...block.cells].sort(
      (left, right) => left.launchOrder - right.launchOrder,
    ))
      lines.push(
        `| ${cell.launchOrder} | ${cell.subject} | ${cell.arm} | ${cell.status} | ${duration(cell.timing.tDoneElapsedMs)} | ${duration(cell.timing.tGreenElapsedMs)} | ${duration(cell.timing.tDryElapsedMs)} | ${cell.usage.totalTokens.toLocaleString("en-US")} | ${cell.usage.completeness} | ${cell.campaign.completedRounds} | ${cell.campaign.verifiedFindings} | ${cell.campaign.failedGates} | ${cell.censoring ?? "—"} | ${escape(cell.publicTerminalReason)} |`,
      );
    lines.push("");
    lines.push("### AI-adjudicated quality");
    lines.push("");
    lines.push(
      "| Subject | Arm | Phase | Acceptance full | Acceptance partial+ | Non-vacuous tests | Context full | H2 full | H3 full | κ acceptance | κ context | Human validation | Human queue |",
    );
    lines.push(
      "| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | ---: |",
    );
    for (const cell of block.cells)
      for (const phase of cell.phases) {
        const acceptance = phase.coverage.acceptance;
        const context = phase.coverage.context;
        const hierarchy = phase.coverage.hierarchy;
        lines.push(
          `| ${cell.subject} | ${cell.arm} | ${phase.phase} | ${ratio(acceptance.full, acceptance.applicable)} | ${ratio(acceptance.partialOrBetter, acceptance.applicable)} | ${ratio(acceptance.nonVacuousTested, acceptance.testable)} | ${context === null ? "—" : ratio(context.full, context.applicable)} | ${ratio(hierarchy.h2Full, hierarchy.h2Count)} | ${ratio(hierarchy.h3Full, hierarchy.h3Count)} | ${decimal(phase.comparison.acceptance.weightedKappa)} | ${phase.comparison.context === null ? "—" : decimal(phase.comparison.context.weightedKappa)} | ${phase.adjudication.humanValidationStatus} | ${phase.adjudication.pendingHumanValidationQueue.length} |`,
        );
      }
    lines.push("");
    lines.push("### Deterministic and secondary vectors");
    lines.push("");
    lines.push(
      "| Subject | Arm | Phase | Hidden acceptance | Line coverage | Mutation | Raw / blind bytes | UI / responsive / feedback / a11y / maintainability |",
    );
    lines.push("| --- | --- | --- | ---: | ---: | ---: | ---: | --- |");
    for (const cell of block.cells)
      for (const phase of cell.phases) {
        const deterministic = phase.deterministicInputs;
        const conventional = deterministic.conventionalCoverage;
        const mutation = deterministic.mutation;
        const scores = phase.secondaryReview.scores;
        lines.push(
          `| ${cell.subject} | ${cell.arm} | ${phase.phase} | ${ratio(deterministic.hiddenAcceptance.passed, deterministic.hiddenAcceptance.total)} | ${ratio(conventional.lines.covered, conventional.lines.total)} | ${ratio(mutation.killed, mutation.sampled - mutation.invalid)} | ${phase.rawScale.bytes.toLocaleString("en-US")} / ${phase.blindScale.bytes.toLocaleString("en-US")} | ${scores.legibility.toFixed(2)} / ${scores.responsive.toFixed(2)} / ${scores.stateFeedback.toFixed(2)} / ${scores.accessibility.toFixed(2)} / ${scores.maintainability.toFixed(2)} |`,
        );
      }
    lines.push("");
    lines.push(
      "Acceptance and context are independent populations; no count or percentage in this report adds them together. Interrupted or inexact usage rows are observed lower bounds, not reconstructed totals.",
    );
    return `${lines.join("\n")}\n`;
  }

  function validateBlock(block: IEvidenceBenchmarkQualityReport.IBlock): void {
    const sha256: RegExp = /^[a-f0-9]{64}$/;
    if (
      block.schemaVersion !== 1 ||
      !block.blockId.trim() ||
      !/^[a-f0-9]{40}$/.test(block.sourceMergedCommit) ||
      !block.protocolRevision.trim() ||
      !sha256.test(block.blockPlanSha256) ||
      !sha256.test(block.priceSheetSha256) ||
      block.cells.length !== 4 ||
      block.selectedSubjects.length !== 2 ||
      new Set(block.selectedSubjects).size !== 2 ||
      !validDate(block.createdAtUtc)
    )
      throw new Error("Quality block report identity is invalid.");
    if (
      block.safetyLimit !== null &&
      (!sha256.test(block.safetyLimit.sharedStopDigest) ||
        !Number.isSafeInteger(block.safetyLimit.threshold) ||
        block.safetyLimit.threshold < 1 ||
        !Number.isSafeInteger(block.safetyLimit.observedTotalTokens) ||
        block.safetyLimit.observedTotalTokens < block.safetyLimit.threshold ||
        block.safetyLimit.hardCeilingGuaranteed !== false)
    )
      throw new Error("Quality block safety-limit observation is invalid.");
    const orders: number[] = block.cells.map((cell) => cell.launchOrder).sort();
    if (JSON.stringify(orders) !== JSON.stringify([1, 2, 3, 4]))
      throw new Error("Quality block requires launch orders 1 through 4.");
    for (const subject of block.selectedSubjects) {
      const cells = block.cells.filter((cell) => cell.subject === subject);
      if (
        cells.length !== 2 ||
        new Set(cells.map((cell) => cell.arm)).size !== 2 ||
        cells[0]!.replicate !== cells[1]!.replicate
      )
        throw new Error(
          `${subject} block pair requires plain and evidence at one replicate.`,
        );
    }
    for (const cell of block.cells) requireCell(cell);
    const blockStopped = block.cells.filter(
      (cell) => cell.safetyLimit?.scope === "block",
    );
    if (
      (block.safetyLimit === null) !== (blockStopped.length === 0) ||
      (block.safetyLimit !== null &&
        blockStopped.some(
          (cell) =>
            cell.safetyLimit!.sharedStopDigest !==
              block.safetyLimit!.sharedStopDigest ||
            cell.safetyLimit!.threshold !== block.safetyLimit!.threshold ||
            cell.safetyLimit!.observed !==
              block.safetyLimit!.observedTotalTokens,
        ))
    )
      throw new Error("Block and cell safety-stop evidence disagree.");
  }

  function requireCell(cell: IEvidenceBenchmarkQualityReport.ICell): void {
    const sha256: RegExp = /^[a-f0-9]{64}$/;
    if (
      cell.schemaVersion !== 1 ||
      !cell.runId.trim() ||
      !Number.isInteger(cell.replicate) ||
      cell.replicate < 1 ||
      !Number.isInteger(cell.launchOrder) ||
      !publicText(cell.publicTerminalReason) ||
      !sha256.test(cell.privateTerminalReasonSha256) ||
      !sha256.test(cell.attemptSealSha256) ||
      !sha256.test(cell.postprocessSealSha256) ||
      (cell.terminalSealSha256 !== null &&
        !sha256.test(cell.terminalSealSha256)) ||
      (cell.promotionSha256 === null) !==
        (cell.promotionAbsentReason !== null) ||
      (cell.promotionSha256 !== null && !sha256.test(cell.promotionSha256)) ||
      (cell.promotionAbsentReason !== null &&
        !publicText(cell.promotionAbsentReason)) ||
      cell.usage.exact !== (cell.usage.completeness === "exact") ||
      !sha256.test(cell.usage.responseSetSha256) ||
      !sha256.test(cell.usage.costReportSha256)
    )
      throw new Error(`Quality cell is invalid: ${cell.runId}.`);
    validateTiming(cell);
    validateUsage(cell);
    validateCampaign(cell);
    if (
      (cell.status === "safety_limit") !== (cell.safetyLimit !== null) ||
      (cell.censoring === "safety_limit") !== (cell.safetyLimit !== null) ||
      (cell.safetyLimit !== null &&
        (!sha256.test(cell.safetyLimit.sharedStopDigest) ||
          !Number.isSafeInteger(cell.safetyLimit.threshold) ||
          cell.safetyLimit.threshold < 1 ||
          !Number.isSafeInteger(cell.safetyLimit.observed) ||
          cell.safetyLimit.observed < 0 ||
          !Number.isSafeInteger(cell.safetyLimit.overshoot) ||
          cell.safetyLimit.hardCeilingGuaranteed !== false ||
          cell.safetyLimit.overshoot < 0 ||
          cell.usage.completeness !== "observed_lower_bound"))
    )
      throw new Error(`Quality cell safety limit is invalid: ${cell.runId}.`);
    if (
      cell.status === "completed" &&
      (cell.phases.length !== 2 ||
        cell.phases[0]?.phase !== "t_done" ||
        cell.phases[1]?.phase !== "t_dry")
    )
      throw new Error(
        `Completed quality cell lacks both graded phases: ${cell.runId}.`,
      );
    for (const phase of cell.phases) requirePhase(cell, phase);
  }

  function requirePhase(
    cell: Pick<IEvidenceBenchmarkQualityReport.ICell, "runId" | "subject">,
    phase: IEvidenceBenchmarkQualityReport.IPhase,
  ): void {
    validateGrade(phase.firstGrade);
    validateGrade(phase.secondGrade);
    const { comparisonSha256: _comparisonSha256, ...comparisonValue } =
      phase.comparison;
    const { adjudicationSha256: _adjudicationSha256, ...adjudicationValue } =
      phase.adjudication;
    if (
      phase.firstGrade.subject !== cell.subject ||
      phase.secondGrade.subject !== cell.subject ||
      phase.firstGrade.phase !== phase.phase ||
      phase.secondGrade.phase !== phase.phase ||
      phase.firstGrade.bundleId !== phase.bundleId ||
      phase.secondGrade.bundleId !== phase.bundleId ||
      phase.comparison.firstGradeId !== phase.firstGrade.gradeId ||
      phase.comparison.secondGradeId !== phase.secondGrade.gradeId ||
      phase.adjudication.firstGradeId !== phase.firstGrade.gradeId ||
      phase.adjudication.secondGradeId !== phase.secondGrade.gradeId ||
      phase.adjudication.denominatorsSummed !== false ||
      phase.gradePlan.bindings.runId !== cell.runId ||
      phase.gradePlan.bindings.bundleId !== phase.bundleId ||
      phase.gradePlan.bindings.bundleSha256 !== phase.bundleSha256 ||
      phase.gradePlan.bindings.sourceSnapshotSha256 !== phase.snapshotSha256 ||
      phase.firstGrade.planSha256 !== phase.gradePlan.planSha256 ||
      phase.secondGrade.planSha256 !== phase.gradePlan.planSha256 ||
      phase.gradePlan.bindings.deterministicInputsSha256 !==
        phase.deterministicInputs.manifestSha256 ||
      phase.comparison.comparisonSha256 !==
        EvidenceBenchmarkHash.object(comparisonValue) ||
      phase.adjudication.adjudicationSha256 !==
        EvidenceBenchmarkHash.object(adjudicationValue) ||
      phase.adjudication.schemaVersion !== 1 ||
      JSON.stringify(phase.adjudication.adjudicator) !==
        JSON.stringify(phase.gradePlan.bindings.adjudicatorAssignment) ||
      phase.adjudication.provenance.providerSchemaSha256 !==
        phase.gradePlan.bindings.adjudicationProviderSchemaSha256 ||
      phase.adjudication.provenance.localSchemaSha256 !==
        phase.gradePlan.bindings.adjudicationLocalSchemaSha256 ||
      phase.adjudication.provenance.registrySha256 !==
        phase.gradePlan.bindings.registrySha256 ||
      phase.adjudication.humanValidationStatus !== "pending" ||
      phase.adjudication.humanValidatedCompositeClaim !== false ||
      JSON.stringify(phase.adjudication.pendingHumanValidationQueue) !==
        JSON.stringify(phase.comparison.humanAuditQueue)
    )
      throw new Error(
        `${cell.runId} ${phase.phase} grading identities disagree.`,
      );
    validateScale(phase.rawScale, `${cell.runId} ${phase.phase} raw`);
    validateScale(phase.blindScale, `${cell.runId} ${phase.phase} blind`);
    validateAdjudication(phase);
    validateCoverage(phase);
    validateDeterministic(phase.deterministicInputs);
    validateSecondary(phase.secondaryReview);
    if (
      cell.subject === "erp" &&
      (phase.coverage.acceptance.populationCount !== 1724 ||
        phase.coverage.context?.populationCount !== 986)
    )
      throw new Error(
        `${cell.runId} ${phase.phase} pooled or changed ERP denominators.`,
      );
  }

  function validateTiming(cell: IEvidenceBenchmarkQualityReport.ICell): void {
    const timing = cell.timing;
    const sha256: RegExp = /^[a-f0-9]{64}$/;
    const started: bigint = monotonic(
      timing.startedMonotonicNanoseconds,
      `${cell.runId} t0`,
    );
    const terminal: bigint = monotonic(
      timing.terminalMonotonicNanoseconds,
      `${cell.runId} terminal`,
    );
    if (
      !validDate(timing.startedAtUtc) ||
      !validDate(timing.terminalAtUtc) ||
      (timing.tDoneAtUtc !== null && !validDate(timing.tDoneAtUtc)) ||
      (timing.tGreenAtUtc !== null && !validDate(timing.tGreenAtUtc)) ||
      (timing.tDryAtUtc !== null && !validDate(timing.tDryAtUtc)) ||
      timing.terminalElapsedMs < 0 ||
      (timing.tDoneAtUtc === null) !== (timing.tDoneElapsedMs === null) ||
      (timing.tDoneAtUtc === null) !==
        (timing.tDoneMonotonicNanoseconds === null) ||
      (timing.tGreenAtUtc === null) !== (timing.tGreenElapsedMs === null) ||
      (timing.tGreenAtUtc === null) !==
        (timing.tGreenMonotonicNanoseconds === null) ||
      (timing.tDryAtUtc === null) !== (timing.tDryElapsedMs === null) ||
      (timing.tDryAtUtc === null) !==
        (timing.tDryMonotonicNanoseconds === null) ||
      (timing.tGreenAtUtc === null) !==
        (timing.tGreenEvidenceSha256 === null) ||
      (timing.tGreenEvidenceSha256 !== null &&
        !sha256.test(timing.tGreenEvidenceSha256)) ||
      (timing.tDoneAtUtc === null) !== (timing.gateAtDoneGreen === null) ||
      (timing.tDoneAtUtc === null) !==
        (timing.gateAtDoneEvidenceSha256 === null) ||
      (timing.gateAtDoneEvidenceSha256 !== null &&
        !sha256.test(timing.gateAtDoneEvidenceSha256))
    )
      throw new Error(`Quality timing is invalid: ${cell.runId}.`);
    for (const value of [
      timing.tDoneElapsedMs,
      timing.tGreenElapsedMs,
      timing.tDryElapsedMs,
    ])
      if (value !== null && value < 0)
        throw new Error(`Quality timing is negative: ${cell.runId}.`);
    const milestones: Array<{
      atUtc: string | null;
      monotonic: string | null;
      elapsed: number | null;
      label: string;
    }> = [
      {
        atUtc: timing.tDoneAtUtc,
        monotonic: timing.tDoneMonotonicNanoseconds,
        elapsed: timing.tDoneElapsedMs,
        label: "t_done",
      },
      {
        atUtc: timing.tGreenAtUtc,
        monotonic: timing.tGreenMonotonicNanoseconds,
        elapsed: timing.tGreenElapsedMs,
        label: "t_green",
      },
      {
        atUtc: timing.tDryAtUtc,
        monotonic: timing.tDryMonotonicNanoseconds,
        elapsed: timing.tDryElapsedMs,
        label: "t_dry",
      },
    ];
    let previousUtc: number = Date.parse(timing.startedAtUtc);
    let previousMonotonic: bigint = started;
    for (const milestone of milestones) {
      if (milestone.atUtc === null) continue;
      const currentUtc: number = Date.parse(milestone.atUtc);
      const currentMonotonic: bigint = monotonic(
        milestone.monotonic!,
        `${cell.runId} ${milestone.label}`,
      );
      if (
        currentUtc < previousUtc ||
        currentMonotonic < previousMonotonic ||
        milestone.elapsed !== Number(currentMonotonic - started) / 1_000_000
      )
        throw new Error(
          `${cell.runId} ${milestone.label} does not derive from frozen t0.`,
        );
      previousUtc = currentUtc;
      previousMonotonic = currentMonotonic;
    }
    if (
      Date.parse(timing.terminalAtUtc) < previousUtc ||
      terminal < previousMonotonic ||
      timing.terminalElapsedMs !== Number(terminal - started) / 1_000_000
    )
      throw new Error(`${cell.runId} terminal timing does not derive from t0.`);
    if (
      timing.gateAtDoneGreen === true &&
      (timing.tDoneMonotonicNanoseconds !== timing.tGreenMonotonicNanoseconds ||
        timing.gateAtDoneEvidenceSha256 !== timing.tGreenEvidenceSha256)
    )
      throw new Error(
        `${cell.runId} gate-at-done evidence does not establish t_green.`,
      );
  }

  function validateUsage(cell: IEvidenceBenchmarkQualityReport.ICell): void {
    const usage = cell.usage;
    if (
      !Number.isSafeInteger(usage.responseCount) ||
      usage.responseCount < 0 ||
      [
        usage.totalTokens,
        usage.inputTokens,
        usage.cachedInputTokens,
        usage.cacheWriteInputTokens,
        usage.outputTokens,
        usage.reasoningOutputTokens,
      ].some((value) => !Number.isSafeInteger(value) || value < 0) ||
      usage.cachedInputTokens > usage.inputTokens ||
      usage.reasoningOutputTokens > usage.outputTokens
    )
      throw new Error(`Quality usage is invalid: ${cell.runId}.`);
  }

  function validateCampaign(cell: IEvidenceBenchmarkQualityReport.ICell): void {
    const campaign = cell.campaign;
    if (
      !counts([
        campaign.completedRounds,
        campaign.verifiedFindings,
        campaign.repairAttempts,
        campaign.provenFixed,
        campaign.consecutiveDryRounds,
        campaign.gateExecutions,
        campaign.failedGates,
      ]) ||
      typeof campaign.incompleteRoundPreserved !== "boolean" ||
      campaign.provenFixed > campaign.repairAttempts ||
      campaign.provenFixed > campaign.verifiedFindings ||
      campaign.failedGates > campaign.gateExecutions ||
      campaign.consecutiveDryRounds > campaign.completedRounds
    )
      throw new Error(`Quality campaign counts are invalid: ${cell.runId}.`);
  }

  function validateScale(
    scale: IEvidenceBenchmarkQualityReport.IArtifactScale,
    label: string,
  ): void {
    if (
      !Number.isSafeInteger(scale.files) ||
      scale.files < 1 ||
      !Number.isSafeInteger(scale.bytes) ||
      scale.bytes < 1 ||
      !/^[a-f0-9]{64}$/.test(scale.treeSha256)
    )
      throw new Error(`${label} artifact scale is invalid.`);
  }

  function validateGrade(grade: IEvidenceBenchmarkQualityGrade.IGrade): void {
    const { gradeId: _gradeId, ...unsigned } = grade;
    const acceptanceIds: string[] = grade.acceptanceRatings.map(
      (rating) => rating.criterionId,
    );
    const contextIds: string[] = grade.contextRatings.map(
      (rating) => rating.criterionId,
    );
    if (
      grade.schemaVersion !== 1 ||
      grade.gradeId !==
        `grade-${EvidenceBenchmarkHash.object(unsigned).slice(0, 32)}` ||
      grade.blind !== true ||
      grade.denominatorsSummed !== false ||
      new Set(acceptanceIds).size !== acceptanceIds.length ||
      new Set(contextIds).size !== contextIds.length ||
      (grade.contextRatings.length === 0) !== (grade.contextSummary === null) ||
      new Set(grade.sourceBlocks).size !== grade.sourceBlocks.length ||
      grade.sourceBlocks.length === 0 ||
      new Set(grade.sourceThreadIds).size !== grade.sourceThreadIds.length ||
      grade.sourceThreadIds.length === 0 ||
      new Set(grade.sourceResponseIds).size !==
        grade.sourceResponseIds.length ||
      grade.sourceResponseIds.length === 0 ||
      grade.armGuess.schemaVersion !== 1 ||
      grade.armGuess.planSha256 !== grade.planSha256
    )
      throw new Error(
        `Quality grade is internally inconsistent: ${grade.gradeId}.`,
      );
    validateSummary(grade.acceptanceRatings, grade.acceptanceSummary);
    if (grade.contextSummary !== null)
      validateSummary(grade.contextRatings, grade.contextSummary);
  }

  function validateSummary(
    ratings: IEvidenceBenchmarkQualityGrade.IRating[],
    summary: IEvidenceBenchmarkQualityGrade.ISummary,
  ): void {
    const count = (status: IEvidenceBenchmarkQualityGrade.Status): number =>
      ratings.filter((rating) => rating.status === status).length;
    const applicable = ratings.filter(
      (rating) => rating.status !== "not_applicable",
    );
    if (
      summary.populationCount !== ratings.length ||
      summary.applicable !== applicable.length ||
      summary.implementedCorrectly !== count("implemented_correctly") ||
      summary.partial !== count("partial") ||
      summary.omitted !== count("omitted") ||
      summary.contradicted !== count("contradicted") ||
      summary.unverifiable !== count("unverifiable") ||
      summary.notApplicable !== count("not_applicable") ||
      summary.testable !==
        applicable.filter((rating) => rating.test.testable).length ||
      summary.nonVacuousTested !==
        applicable.filter((rating) => rating.test.nonVacuous).length ||
      summary.criticalDefects !==
        applicable.filter((rating) => rating.severity === "critical").length
    )
      throw new Error("Quality grade summary is a stale projection.");
  }

  function validateAdjudication(
    phase: IEvidenceBenchmarkQualityReport.IPhase,
  ): void {
    const adjudication = phase.adjudication;
    const queueKeys: string[] = phase.comparison.humanAuditQueue.map(
      (item) => `${item.population}\0${item.criterionId}`,
    );
    const decisionKeys: string[] = adjudication.decisions.map(
      (item) => `${item.population}\0${item.criterionId}`,
    );
    const priorThreads: Set<string> = new Set([
      ...phase.firstGrade.sourceThreadIds,
      ...phase.secondGrade.sourceThreadIds,
    ]);
    const priorResponses: Set<string> = new Set([
      ...phase.firstGrade.sourceResponseIds,
      ...phase.secondGrade.sourceResponseIds,
    ]);
    if (
      JSON.stringify(queueKeys) !== JSON.stringify(decisionKeys) ||
      new Set(decisionKeys).size !== decisionKeys.length ||
      !validDate(adjudication.completedAtUtc) ||
      adjudication.completedAtUtc !== adjudication.provenance.submittedAtUtc ||
      adjudication.provenance.threadId.trim().length === 0 ||
      adjudication.provenance.turnId.trim().length === 0 ||
      adjudication.provenance.responseIds.length === 0 ||
      new Set(adjudication.provenance.responseIds).size !==
        adjudication.provenance.responseIds.length ||
      priorThreads.has(adjudication.provenance.threadId) ||
      adjudication.provenance.responseIds.some((id) =>
        priorResponses.has(id),
      ) ||
      adjudication.decisions.some(
        (decision) =>
          decision.rating.criterionId !== decision.criterionId ||
          decision.rationale.trim().length === 0,
      )
    )
      throw new Error("Third-LLM adjudication is incomplete or not fresh.");
    const decisions: ReadonlyMap<
      string,
      IEvidenceBenchmarkQualityGrade.IAdjudicationDecision
    > = new Map(
      adjudication.decisions.map((decision) => [
        `${decision.population}\0${decision.criterionId}`,
        decision,
      ]),
    );
    validateConsensus(
      "acceptance",
      phase.firstGrade.acceptanceRatings,
      phase.secondGrade.acceptanceRatings,
      adjudication.acceptance,
      decisions,
    );
    validateConsensus(
      "context",
      phase.firstGrade.contextRatings,
      phase.secondGrade.contextRatings,
      adjudication.context,
      decisions,
    );
  }

  function validateConsensus(
    population: IEvidenceBenchmarkQualityGrade.Population,
    first: IEvidenceBenchmarkQualityGrade.IRating[],
    second: IEvidenceBenchmarkQualityGrade.IRating[],
    consensus: IEvidenceBenchmarkQualityGrade.IConsensusRating[],
    decisions: ReadonlyMap<
      string,
      IEvidenceBenchmarkQualityGrade.IAdjudicationDecision
    >,
  ): void {
    const severity: IEvidenceBenchmarkQualityGrade.Severity[] = [
      "none",
      "low",
      "medium",
      "high",
      "critical",
    ];
    if (first.length !== second.length || first.length !== consensus.length)
      throw new Error(`${population} AI consensus cardinality is invalid.`);
    for (const [index, left] of first.entries()) {
      const right = second[index]!;
      const actual = consensus[index]!;
      const decision = decisions.get(`${population}\0${left.criterionId}`);
      const expected: IEvidenceBenchmarkQualityGrade.IConsensusRating =
        decision === undefined
          ? {
              criterionId: left.criterionId,
              status: left.status,
              testable: left.test.testable && right.test.testable,
              nonVacuous: left.test.nonVacuous && right.test.nonVacuous,
              severity:
                severity[
                  Math.max(
                    severity.indexOf(left.severity),
                    severity.indexOf(right.severity),
                  )
                ]!,
              source: "grader_agreement",
            }
          : {
              criterionId: left.criterionId,
              status: decision.rating.status,
              testable: decision.rating.test.testable,
              nonVacuous: decision.rating.test.nonVacuous,
              severity: decision.rating.severity,
              source: "llm_adjudication",
            };
      if (
        left.criterionId !== right.criterionId ||
        (decision === undefined && left.status !== right.status) ||
        JSON.stringify(actual) !== JSON.stringify(expected)
      )
        throw new Error(`${population} AI consensus is a stale projection.`);
    }
  }

  function validateCoverage(
    phase: IEvidenceBenchmarkQualityReport.IPhase,
  ): void {
    validatePopulationCoverage(
      phase.adjudication.acceptance,
      phase.coverage.acceptance,
      "acceptance",
    );
    if (
      (phase.adjudication.context.length === 0) !==
      (phase.coverage.context === null)
    )
      throw new Error("Context coverage presence does not match consensus.");
    if (phase.coverage.context !== null)
      validatePopulationCoverage(
        phase.adjudication.context,
        phase.coverage.context,
        "context",
      );
    const hierarchy = phase.coverage.hierarchy;
    if (
      !counts(Object.values(hierarchy)) ||
      hierarchy.h2Count < 1 ||
      hierarchy.h2Full > hierarchy.h2PartialOrBetter ||
      hierarchy.h2PartialOrBetter > hierarchy.h2Count ||
      hierarchy.h3Full > hierarchy.h3PartialOrBetter ||
      hierarchy.h3PartialOrBetter > hierarchy.h3Count
    )
      throw new Error("Requirement hierarchy coverage is invalid.");
  }

  function validatePopulationCoverage(
    ratings: IEvidenceBenchmarkQualityGrade.IConsensusRating[],
    coverage: IEvidenceBenchmarkQualityReport.IPopulationCoverage,
    population: IEvidenceBenchmarkQualityGrade.Population,
  ): void {
    const applicable = ratings.filter(
      (rating) => rating.status !== "not_applicable",
    );
    const full = applicable.filter(
      (rating) => rating.status === "implemented_correctly",
    ).length;
    const partial = applicable.filter((rating) =>
      ["implemented_correctly", "partial"].includes(rating.status),
    ).length;
    const testable = applicable.filter((rating) => rating.testable).length;
    const nonVacuous = applicable.filter((rating) => rating.nonVacuous).length;
    if (
      coverage.population !== population ||
      coverage.populationCount !== ratings.length ||
      coverage.applicable !== applicable.length ||
      coverage.full !== full ||
      coverage.partialOrBetter !== partial ||
      coverage.testable !== testable ||
      coverage.nonVacuousTested !== nonVacuous ||
      coverage.fullRate !==
        (applicable.length === 0 ? null : full / applicable.length) ||
      coverage.partialOrBetterRate !==
        (applicable.length === 0 ? null : partial / applicable.length) ||
      coverage.nonVacuousTestRate !==
        (testable === 0 ? null : nonVacuous / testable) ||
      nonVacuous > testable
    )
      throw new Error(`${population} coverage is a stale projection.`);
  }

  function validateDeterministic(
    input: IEvidenceBenchmarkQualityReport.IDeterministicInputs,
  ): void {
    const sha256: RegExp = /^[a-f0-9]{64}$/;
    if (
      !sha256.test(input.manifestSha256) ||
      !counts([
        input.hiddenAcceptance.total,
        input.hiddenAcceptance.passed,
        input.hiddenAcceptance.failed,
        input.mutation.sampled,
        input.mutation.killed,
        input.mutation.survived,
        input.mutation.invalid,
      ]) ||
      input.hiddenAcceptance.total < 1 ||
      input.hiddenAcceptance.passed + input.hiddenAcceptance.failed !==
        input.hiddenAcceptance.total ||
      !sha256.test(input.hiddenAcceptance.catalogSha256) ||
      input.mutation.sampled < 1 ||
      input.mutation.killed +
        input.mutation.survived +
        input.mutation.invalid !==
        input.mutation.sampled ||
      !sha256.test(input.mutation.sampleManifestSha256)
    )
      throw new Error("Deterministic grading inputs are incomplete.");
    validateCollector(input.hiddenAcceptance.collector);
    validateCollector(input.conventionalCoverage.collector);
    validateCollector(input.mutation.collector);
    for (const value of Object.values(input.conventionalCoverage)) {
      if (
        typeof value === "object" &&
        value !== null &&
        "covered" in value &&
        "total" in value &&
        (typeof value.covered !== "number" ||
          typeof value.total !== "number" ||
          !Number.isSafeInteger(value.covered) ||
          !Number.isSafeInteger(value.total) ||
          value.total < 1 ||
          value.covered < 0 ||
          value.covered > value.total)
      )
        throw new Error("Conventional coverage input is invalid.");
    }
  }

  function validateCollector(
    collector: IEvidenceBenchmarkQualityReport.ICollector,
  ): void {
    if (
      !collector.producer.trim() ||
      !collector.version.trim() ||
      !/^[a-f0-9]{64}$/.test(collector.configurationSha256) ||
      !/^[a-f0-9]{64}$/.test(collector.resultSha256)
    )
      throw new Error("Quality collector provenance is invalid.");
  }

  function validateSecondary(
    review: IEvidenceBenchmarkQualityReport.ISecondaryReview,
  ): void {
    const sha256: RegExp = /^[a-f0-9]{64}$/;
    if (
      review.schemaVersion !== 1 ||
      JSON.stringify(review.evidence.viewportWidths) !==
        JSON.stringify([390, 834, 1440]) ||
      review.evidence.routes < 1 ||
      review.evidence.states < 1 ||
      !Number.isSafeInteger(review.evidence.routes) ||
      !Number.isSafeInteger(review.evidence.states) ||
      !sha256.test(review.scenarioManifestSha256) ||
      !sha256.test(review.evidence.screenshotSetSha256) ||
      !sha256.test(review.evidence.browserFlowSha256) ||
      review.sourceGradeSha256.some((digest) => !sha256.test(digest)) ||
      new Set(review.sourceGradeSha256).size !== 2 ||
      !sha256.test(review.gradeProviderSchemaSha256) ||
      !sha256.test(review.gradeLocalSchemaSha256) ||
      !sha256.test(review.adjudicationProviderSchemaSha256) ||
      !sha256.test(review.adjudicationLocalSchemaSha256) ||
      !sha256.test(review.registrySha256) ||
      !sha256.test(review.adjudicationSha256) ||
      Object.values(review.scores).some(
        (score) => !Number.isFinite(score) || score < 0 || score > 1,
      ) ||
      review.humanValidationStatus !== "pending" ||
      review.humanValidatedCompositeClaim !== false ||
      review.combinedWithRequirementCoverage !== false
    )
      throw new Error("Secondary blind review is incomplete.");
  }

  function rowPath(
    root: string,
    row: IEvidenceBenchmarkQualityReport.ILedgerRow,
  ): string {
    return path.join(
      root,
      `${String(row.sequence).padStart(6, "0")}-${row.rowSha256}.json`,
    );
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

  async function lock(root: string): Promise<() => Promise<void>> {
    const target: string = path.join(root, ".append.lock");
    const deadline: number = Date.now() + 10_000;
    for (;;) {
      try {
        const handle = await fs.promises.open(target, "wx");
        await handle.writeFile(
          `${JSON.stringify({ pid: process.pid, atUtc: new Date().toISOString() })}\n`,
          "utf8",
        );
        await handle.sync();
        return async (): Promise<void> => {
          await handle.close();
          await fs.promises.unlink(target);
        };
      } catch (error) {
        if (
          !(
            typeof error === "object" &&
            error !== null &&
            "code" in error &&
            error.code === "EEXIST"
          ) ||
          Date.now() >= deadline
        )
          throw error;
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
    }
  }

  function duration(milliseconds: number | null): string {
    return milliseconds === null
      ? "—"
      : `${(milliseconds / 3_600_000).toFixed(2)} h`;
  }

  function ratio(numerator: number, denominator: number): string {
    return denominator === 0
      ? "—"
      : `${numerator.toLocaleString("en-US")}/${denominator.toLocaleString("en-US")} (${((numerator / denominator) * 100).toFixed(1)}%)`;
  }

  function decimal(value: number | null): string {
    return value === null ? "—" : value.toFixed(3);
  }

  function escape(value: string): string {
    return value.replaceAll("|", "\\|").replaceAll(/\r?\n/g, " ");
  }

  function validDate(value: string): boolean {
    if (
      value.trim().length === 0 ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)
    )
      return false;
    const milliseconds: number = Date.parse(value);
    return (
      !Number.isNaN(milliseconds) &&
      new Date(milliseconds).toISOString() === value
    );
  }

  function publicText(value: string): boolean {
    return (
      value.trim().length !== 0 &&
      value.length <= 512 &&
      !/[\r\n]/.test(value) &&
      !/(?:[a-zA-Z]:[\\/]|file:\/\/|(?:^|\s)\/(?:home|root|Users|tmp|var|opt|workspace)\/)/.test(
        value,
      ) &&
      !/(?:authorization|api[_-]?key|access[_-]?token|refresh[_-]?token)\s*[:=]/i.test(
        value,
      ) &&
      !/\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s+#\d+\b/i.test(value)
    );
  }

  function counts(values: number[]): boolean {
    return values.every((value) => Number.isSafeInteger(value) && value >= 0);
  }

  function monotonic(value: string, label: string): bigint {
    if (!/^(?:0|[1-9][0-9]*)$/.test(value))
      throw new Error(`${label} monotonic timestamp is invalid.`);
    return BigInt(value);
  }
}
