import type { IEvidenceBenchmarkQualityGrade } from "../structures/IEvidenceBenchmarkQualityGrade.ts";
import type { IEvidenceBenchmarkQualityReport } from "../structures/IEvidenceBenchmarkQualityReport.ts";

/** Computes unpooled criterion and heading coverage from final consensus. */
export namespace EvidenceBenchmarkQualityCoverage {
  /** Computes acceptance, context, H2, and H3 coverage without cross-summing. */
  export function compute(
    catalog: IEvidenceBenchmarkQualityGrade.ICatalog,
    adjudication: IEvidenceBenchmarkQualityGrade.IAdjudication,
  ): {
    acceptance: IEvidenceBenchmarkQualityReport.IPopulationCoverage;
    context: IEvidenceBenchmarkQualityReport.IPopulationCoverage | null;
    hierarchy: IEvidenceBenchmarkQualityReport.IHierarchyCoverage;
  } {
    const acceptance: IEvidenceBenchmarkQualityReport.IPopulationCoverage =
      population("acceptance", catalog.acceptance, adjudication.acceptance);
    const context: IEvidenceBenchmarkQualityReport.IPopulationCoverage | null =
      catalog.context.length === 0
        ? null
        : population("context", catalog.context, adjudication.context);
    const byId: ReadonlyMap<
      string,
      IEvidenceBenchmarkQualityGrade.IConsensusRating
    > = new Map(
      adjudication.acceptance.map((rating) => [rating.criterionId, rating]),
    );
    const h2: Map<string, IEvidenceBenchmarkQualityGrade.IConsensusRating[]> =
      group(catalog.acceptance, byId, (clause) => clause.h2);
    const h3: Map<string, IEvidenceBenchmarkQualityGrade.IConsensusRating[]> =
      group(catalog.acceptance, byId, (clause) => clause.h3!);
    return {
      acceptance,
      context,
      hierarchy: {
        h2Count: h2.size,
        h2Full: [...h2.values()].filter(full).length,
        h2PartialOrBetter: [...h2.values()].filter(partialOrBetter).length,
        h3Count: h3.size,
        h3Full: [...h3.values()].filter(full).length,
        h3PartialOrBetter: [...h3.values()].filter(partialOrBetter).length,
      },
    };
  }

  function population(
    populationName: IEvidenceBenchmarkQualityGrade.Population,
    clauses: IEvidenceBenchmarkQualityGrade.IClause[],
    ratings: IEvidenceBenchmarkQualityGrade.IConsensusRating[],
  ): IEvidenceBenchmarkQualityReport.IPopulationCoverage {
    requireExact(clauses, ratings, populationName);
    const applicable = ratings.filter(
      (rating) => rating.status !== "not_applicable",
    );
    const fullCount: number = applicable.filter(
      (rating) => rating.status === "implemented_correctly",
    ).length;
    const partialCount: number = applicable.filter((rating) =>
      ["implemented_correctly", "partial"].includes(rating.status),
    ).length;
    const testable: number = applicable.filter(
      (rating) => rating.testable,
    ).length;
    const nonVacuous: number = applicable.filter(
      (rating) => rating.nonVacuous,
    ).length;
    return {
      population: populationName,
      populationCount: ratings.length,
      applicable: applicable.length,
      full: fullCount,
      partialOrBetter: partialCount,
      fullRate: applicable.length === 0 ? null : fullCount / applicable.length,
      partialOrBetterRate:
        applicable.length === 0 ? null : partialCount / applicable.length,
      testable,
      nonVacuousTested: nonVacuous,
      nonVacuousTestRate: testable === 0 ? null : nonVacuous / testable,
    };
  }

  function requireExact(
    clauses: IEvidenceBenchmarkQualityGrade.IClause[],
    ratings: IEvidenceBenchmarkQualityGrade.IConsensusRating[],
    population: IEvidenceBenchmarkQualityGrade.Population,
  ): void {
    if (
      JSON.stringify(clauses.map((clause) => clause.id)) !==
      JSON.stringify(ratings.map((rating) => rating.criterionId))
    )
      throw new Error(
        `${population} consensus does not match its frozen catalog order.`,
      );
  }

  function group(
    clauses: IEvidenceBenchmarkQualityGrade.IClause[],
    byId: ReadonlyMap<string, IEvidenceBenchmarkQualityGrade.IConsensusRating>,
    key: (clause: IEvidenceBenchmarkQualityGrade.IClause) => string,
  ): Map<string, IEvidenceBenchmarkQualityGrade.IConsensusRating[]> {
    const result: Map<
      string,
      IEvidenceBenchmarkQualityGrade.IConsensusRating[]
    > = new Map();
    for (const clause of clauses) {
      const rating = byId.get(clause.id);
      if (rating === undefined)
        throw new Error(`Consensus rating is missing: ${clause.id}.`);
      const owner: string = key(clause);
      const current = result.get(owner) ?? [];
      current.push(rating);
      result.set(owner, current);
    }
    return result;
  }

  function full(
    ratings: IEvidenceBenchmarkQualityGrade.IConsensusRating[],
  ): boolean {
    const applicable = ratings.filter(
      (rating) => rating.status !== "not_applicable",
    );
    return (
      applicable.length !== 0 &&
      applicable.every((rating) => rating.status === "implemented_correctly")
    );
  }

  function partialOrBetter(
    ratings: IEvidenceBenchmarkQualityGrade.IConsensusRating[],
  ): boolean {
    const applicable = ratings.filter(
      (rating) => rating.status !== "not_applicable",
    );
    return (
      applicable.length !== 0 &&
      applicable.every((rating) =>
        ["implemented_correctly", "partial"].includes(rating.status),
      )
    );
  }
}
