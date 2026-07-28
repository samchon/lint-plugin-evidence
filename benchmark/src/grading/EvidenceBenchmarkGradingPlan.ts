import path from "node:path";

import { EvidenceBenchmarkHash } from "../EvidenceBenchmarkHash.ts";
import { EvidenceBenchmarkProtocolValidator } from "../EvidenceBenchmarkProtocolValidator.ts";
import type { IEvidenceBenchmarkQualityGrade } from "../structures/IEvidenceBenchmarkQualityGrade.ts";
import { EvidenceBenchmarkQualityArtifacts } from "./EvidenceBenchmarkQualityArtifacts.ts";

/** Creates exact, bounded, non-overlapping semantic grading partitions. */
export namespace EvidenceBenchmarkGradingPlan {
  /** Builds one deterministic block plan without combining populations. */
  export function create(
    catalog: IEvidenceBenchmarkQualityGrade.ICatalog,
    phase: IEvidenceBenchmarkQualityGrade.Phase,
    bindings: IEvidenceBenchmarkQualityGrade.IBlockPlan["bindings"],
    maximumCriteriaPerBlock: number,
    sizing: IEvidenceBenchmarkQualityGrade.IBlockPlan["sizing"],
  ): IEvidenceBenchmarkQualityGrade.IBlockPlan {
    if (
      !Number.isInteger(maximumCriteriaPerBlock) ||
      maximumCriteriaPerBlock !== 50
    )
      throw new Error(
        "Grade block size must be the frozen canonical size of 50.",
      );
    validateBindings(catalog, bindings);
    if (
      !Number.isInteger(sizing.estimatedTokensPerCriterion) ||
      sizing.estimatedTokensPerCriterion < 1 ||
      !Number.isInteger(sizing.envelopeTokens) ||
      sizing.envelopeTokens < 0 ||
      !Number.isInteger(sizing.maximumOutputTokens) ||
      sizing.maximumOutputTokens < 1 ||
      maximumCriteriaPerBlock * sizing.estimatedTokensPerCriterion +
        sizing.envelopeTokens >
        sizing.maximumOutputTokens
    )
      throw new Error(
        "Grade block size exceeds its frozen conservative output-token admission.",
      );
    const identity: string = blockIdentity(catalog, phase, bindings);
    const blocks: IEvidenceBenchmarkQualityGrade.IBlock[] = [
      ...partition(
        catalog.subject,
        phase,
        identity,
        "acceptance",
        catalog.acceptance.map((clause) => clause.id),
        maximumCriteriaPerBlock,
      ),
      ...partition(
        catalog.subject,
        phase,
        identity,
        "context",
        catalog.context.map((clause) => clause.id),
        maximumCriteriaPerBlock,
      ),
    ];
    const value: Omit<IEvidenceBenchmarkQualityGrade.IBlockPlan, "planSha256"> =
      {
        schemaVersion: 1,
        subject: catalog.subject,
        phase,
        bindings: structuredClone(bindings),
        maximumCriteriaPerBlock,
        sizing: structuredClone(sizing),
        blocks,
        acceptanceCatalogSha256: catalog.acceptanceCatalogSha256,
        contextCatalogSha256: catalog.contextCatalogSha256,
      };
    const plan: IEvidenceBenchmarkQualityGrade.IBlockPlan = {
      ...value,
      planSha256: EvidenceBenchmarkHash.object(value),
    };
    verify(catalog, plan);
    return plan;
  }

  /** Projects the internal execution plan to the canonical protocol artifact. */
  export function protocol(
    catalog: IEvidenceBenchmarkQualityGrade.ICatalog,
    plan: IEvidenceBenchmarkQualityGrade.IBlockPlan,
  ): Record<string, unknown> {
    verify(catalog, plan);
    const populations = (
      [
        ["acceptance", catalog.acceptance, catalog.acceptanceCatalogSha256],
        ["context", catalog.context, catalog.contextCatalogSha256],
      ] as const
    ).flatMap(([population, clauses, catalogSha256]) => {
      if (clauses.length === 0) return [];
      const blocks = plan.blocks.filter(
        (block) => block.population === population,
      );
      const ordered: string[] = clauses.map((clause) => clause.id);
      return [
        {
          population,
          catalogSha256,
          catalogCount: ordered.length,
          orderedCriterionIdsSha256: EvidenceBenchmarkHash.object(ordered),
          blocks: blocks.map((block) => ({
            blockId: block.blockId,
            blockIndex: block.index - 1,
            criterionIds: [...block.criterionIds],
            criterionIdsSha256: EvidenceBenchmarkHash.object(
              block.criterionIds,
            ),
          })),
        },
      ];
    });
    const value: Record<string, unknown> = {
      schemaVersion: 1,
      planId: `plan-${plan.planSha256.slice(0, 32)}`,
      runId: plan.bindings.runId,
      bundleId: plan.bindings.bundleId,
      bundleSha256: plan.bindings.bundleManifestSha256,
      parentCoreSealSha256: plan.bindings.generationCoreSealSha256,
      subject: plan.subject,
      phase: plan.phase,
      subjectFreezeManifestSha256: plan.bindings.subjectFreezeManifestSha256,
      requirementsRawTreeSha256: plan.bindings.requirementsRawTreeSha256,
      rubricSha256: plan.bindings.rubricSha256,
      graderPromptSha256: plan.bindings.promptSha256,
      gradeBlockProviderSchemaSha256: plan.bindings.providerSchemaSha256,
      gradeBlockLocalSchemaSha256: plan.bindings.localSchemaSha256,
      armGuessProviderSchemaSha256: plan.bindings.armGuessProviderSchemaSha256,
      armGuessLocalSchemaSha256: plan.bindings.armGuessLocalSchemaSha256,
      providerOutputRegistrySha256: plan.bindings.registrySha256,
      protocolRevisionSha256: plan.bindings.protocolRevisionSha256,
      blockSize: 50,
      blockContextPolicy: "fresh_per_block",
      graderAssignments: plan.bindings.graderAssignments.map((grader) => ({
        pseudonym: grader.pseudonym,
        model: grader.model,
        reasoningEffort: grader.reasoningEffort,
        assignmentSha256: EvidenceBenchmarkHash.object(grader),
      })),
      populations,
      partitionValidation: {
        catalogOrderPreserved: true,
        exactUnion: true,
        nonOverlapping: true,
        uniqueIds: true,
        countsReconciled: true,
      },
    };
    EvidenceBenchmarkQualityArtifacts.validatePlan(
      value,
      plan.bindings.generationCoreSealSha256,
    );
    EvidenceBenchmarkProtocolValidator.validateValue(
      path.resolve(import.meta.dirname, "..", "..", "protocol"),
      "grading-block-plan.schema.json",
      value,
      "canonical grading block plan",
    );
    return value;
  }

  /** Verifies plan identity and exact population partitioning. */
  export function verify(
    catalog: IEvidenceBenchmarkQualityGrade.ICatalog,
    plan: IEvidenceBenchmarkQualityGrade.IBlockPlan,
  ): void {
    const { planSha256: _planSha256, ...value } = plan;
    if (
      plan.schemaVersion !== 1 ||
      plan.subject !== catalog.subject ||
      plan.acceptanceCatalogSha256 !== catalog.acceptanceCatalogSha256 ||
      plan.contextCatalogSha256 !== catalog.contextCatalogSha256 ||
      plan.planSha256 !== EvidenceBenchmarkHash.object(value)
    )
      throw new Error("Grade block plan identity does not match its catalog.");
    validateBindings(catalog, plan.bindings);
    if (
      !Number.isInteger(plan.maximumCriteriaPerBlock) ||
      plan.maximumCriteriaPerBlock !== 50 ||
      !Number.isInteger(plan.sizing.estimatedTokensPerCriterion) ||
      plan.sizing.estimatedTokensPerCriterion < 1 ||
      !Number.isInteger(plan.sizing.envelopeTokens) ||
      plan.sizing.envelopeTokens < 0 ||
      !Number.isInteger(plan.sizing.maximumOutputTokens) ||
      plan.sizing.maximumOutputTokens < 1 ||
      plan.maximumCriteriaPerBlock * plan.sizing.estimatedTokensPerCriterion +
        plan.sizing.envelopeTokens >
        plan.sizing.maximumOutputTokens
    )
      throw new Error(
        "Grade block plan violates its frozen output-token admission.",
      );
    requirePopulation(
      plan,
      "acceptance",
      catalog.acceptance.map((clause) => clause.id),
    );
    requirePopulation(
      plan,
      "context",
      catalog.context.map((clause) => clause.id),
    );
  }

  function partition(
    subject: IEvidenceBenchmarkQualityGrade.Subject,
    phase: IEvidenceBenchmarkQualityGrade.Phase,
    identity: string,
    population: IEvidenceBenchmarkQualityGrade.Population,
    identifiers: string[],
    maximum: number,
  ): IEvidenceBenchmarkQualityGrade.IBlock[] {
    const count: number = Math.ceil(identifiers.length / maximum);
    return Array.from({ length: count }, (_, index) => ({
      blockId: `${subject}-${phase}-${identity}-${population}-${String(index + 1).padStart(3, "0")}`,
      population,
      index: index + 1,
      count,
      criterionIds: identifiers.slice(index * maximum, (index + 1) * maximum),
    }));
  }

  function requirePopulation(
    plan: IEvidenceBenchmarkQualityGrade.IBlockPlan,
    population: IEvidenceBenchmarkQualityGrade.Population,
    expected: string[],
  ): void {
    const blocks: IEvidenceBenchmarkQualityGrade.IBlock[] = plan.blocks.filter(
      (block) => block.population === population,
    );
    const identity: string = blockIdentity(
      {
        subject: plan.subject,
        treeAlgorithm: plan.bindings.treeAlgorithm,
        requirementsRawTreeSha256: plan.bindings.requirementsRawTreeSha256,
      } as IEvidenceBenchmarkQualityGrade.ICatalog,
      plan.phase,
      plan.bindings,
    );
    const count: number = Math.ceil(
      expected.length / plan.maximumCriteriaPerBlock,
    );
    if (blocks.length !== count)
      throw new Error(
        `${population} grade plan requires ${count} blocks, found ${blocks.length}.`,
      );
    const actual: string[] = [];
    for (const [offset, block] of blocks.entries()) {
      const index: number = offset + 1;
      const expectedId: string = `${plan.subject}-${plan.phase}-${identity}-${population}-${String(index).padStart(3, "0")}`;
      if (
        block.blockId !== expectedId ||
        block.index !== index ||
        block.count !== count ||
        block.criterionIds.length === 0 ||
        block.criterionIds.length > plan.maximumCriteriaPerBlock
      )
        throw new Error(
          `${population} grade block ${index} violates its deterministic partition.`,
        );
      actual.push(...block.criterionIds);
    }
    if (JSON.stringify(actual) !== JSON.stringify(expected))
      throw new Error(
        `${population} grade blocks do not exactly partition the frozen catalog order.`,
      );
    if (new Set(actual).size !== actual.length)
      throw new Error(`${population} grade blocks repeat a criterion id.`);
  }

  function validateBindings(
    catalog: IEvidenceBenchmarkQualityGrade.ICatalog,
    bindings: IEvidenceBenchmarkQualityGrade.IBlockPlan["bindings"],
  ): void {
    const sha256: RegExp = /^[a-f0-9]{64}$/;
    if (
      bindings.treeAlgorithm !== EvidenceBenchmarkHash.TREE_ALGORITHM ||
      bindings.treeAlgorithm !== catalog.treeAlgorithm ||
      bindings.requirementsRawTreeSha256 !==
        catalog.requirementsRawTreeSha256 ||
      !bindings.runId.trim() ||
      !bindings.bundleId.trim() ||
      !sha256.test(bindings.bundleManifestSha256) ||
      !sha256.test(bindings.bundleRawTreeSha256) ||
      !sha256.test(bindings.gradingInputManifestSha256) ||
      !sha256.test(bindings.sourceSnapshotRawTreeSha256) ||
      !sha256.test(bindings.subjectFreezeManifestSha256) ||
      !sha256.test(bindings.materializedRequirementsRawTreeSha256) ||
      !sha256.test(bindings.runManifestSha256) ||
      !sha256.test(bindings.generationCoreSealSha256) ||
      !sha256.test(bindings.hiddenAcceptanceCatalogSha256) ||
      !sha256.test(bindings.deterministicInputsSha256) ||
      !sha256.test(bindings.rubricSha256) ||
      !sha256.test(bindings.promptSha256) ||
      !sha256.test(bindings.providerSchemaSha256) ||
      !sha256.test(bindings.localSchemaSha256) ||
      !sha256.test(bindings.armGuessProviderSchemaSha256) ||
      !sha256.test(bindings.armGuessLocalSchemaSha256) ||
      !sha256.test(bindings.adjudicationProviderSchemaSha256) ||
      !sha256.test(bindings.adjudicationLocalSchemaSha256) ||
      !sha256.test(bindings.registrySha256) ||
      !bindings.protocolRevision.trim() ||
      !sha256.test(bindings.protocolRevisionSha256) ||
      bindings.graderAssignments.length !== 2 ||
      bindings.graderAssignments.some(
        (entry) =>
          !entry.pseudonym.trim() ||
          entry.kind !== "llm" ||
          entry.model === null ||
          !entry.model.trim() ||
          entry.version === null ||
          !entry.version.trim() ||
          entry.reasoningEffort === null ||
          !entry.reasoningEffort.trim() ||
          entry.authMode === null ||
          !entry.authMode.trim() ||
          entry.serviceTier === null ||
          !entry.serviceTier.trim() ||
          entry.agentVersion === null ||
          !entry.agentVersion.trim(),
      ) ||
      new Set(bindings.graderAssignments.map((entry) => entry.pseudonym))
        .size !== 2 ||
      !bindings.adjudicatorAssignment.pseudonym.trim() ||
      bindings.adjudicatorAssignment.kind !== "llm_adjudicator" ||
      bindings.adjudicatorAssignment.model === null ||
      !bindings.adjudicatorAssignment.model.trim() ||
      bindings.adjudicatorAssignment.version === null ||
      !bindings.adjudicatorAssignment.version.trim() ||
      bindings.adjudicatorAssignment.reasoningEffort === null ||
      !bindings.adjudicatorAssignment.reasoningEffort.trim() ||
      bindings.adjudicatorAssignment.authMode === null ||
      !bindings.adjudicatorAssignment.authMode.trim() ||
      bindings.adjudicatorAssignment.serviceTier === null ||
      !bindings.adjudicatorAssignment.serviceTier.trim() ||
      bindings.adjudicatorAssignment.agentVersion === null ||
      !bindings.adjudicatorAssignment.agentVersion.trim() ||
      bindings.graderAssignments.some(
        (entry) => entry.pseudonym === bindings.adjudicatorAssignment.pseudonym,
      ) ||
      bindings.contextPolicy !== "fresh_per_block"
    )
      throw new Error("Grade block plan has incomplete frozen bindings.");
  }

  function blockIdentity(
    catalog: Pick<
      IEvidenceBenchmarkQualityGrade.ICatalog,
      "subject" | "treeAlgorithm" | "requirementsRawTreeSha256"
    >,
    phase: IEvidenceBenchmarkQualityGrade.Phase,
    bindings: IEvidenceBenchmarkQualityGrade.IBlockPlan["bindings"],
  ): string {
    return EvidenceBenchmarkHash.object({
      subject: catalog.subject,
      phase,
      treeAlgorithm: catalog.treeAlgorithm,
      requirementsRawTreeSha256: catalog.requirementsRawTreeSha256,
      bindings,
    }).slice(0, 12);
  }
}
