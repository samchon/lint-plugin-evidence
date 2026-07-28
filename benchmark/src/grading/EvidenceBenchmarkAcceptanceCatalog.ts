import path from "node:path";

import { EvidenceBenchmarkCorpus } from "../EvidenceBenchmarkCorpus.ts";
import { EvidenceBenchmarkHash } from "../EvidenceBenchmarkHash.ts";
import { EvidenceBenchmarkMarkdown } from "../EvidenceBenchmarkMarkdown.ts";
import type { IEvidenceBenchmarkQualityGrade } from "../structures/IEvidenceBenchmarkQualityGrade.ts";

/** Loads exact quality denominators and resolves their Markdown hierarchy. */
export namespace EvidenceBenchmarkAcceptanceCatalog {
  const SUBJECTS: ReadonlySet<string> = new Set([
    "todo",
    "reddit",
    "shopping",
    "erp",
  ]);

  interface IHeading {
    h2: string;
    level: "h2" | "h3";
    source: string;
  }

  /** Frozen subject identity read from the protocol subject-freeze manifest. */
  export interface IFreeze {
    /** Subject whose corpus is pinned. */
    subject: IEvidenceBenchmarkQualityGrade.Subject;

    /** Exact requirement directory tree digest. */
    requirementsTreeSha256: string;

    /** Exact acceptance JSONL byte digest. */
    acceptanceCatalogSha256: string;

    /** Exact context JSONL byte digest, absent without that population. */
    contextCatalogSha256: string | null;

    /** Exact Markdown document count. */
    documents: number;

    /** Exact H2 requirement owner count. */
    h2: number;

    /** Exact H3 leaf count. */
    h3: number;

    /** Exact acceptance criterion count. */
    acceptance: number;

    /** Exact context criterion count. */
    context: number;
  }

  /** Reads and validates one subject's acceptance and context catalogs. */
  export function read(
    requirementRoot: string,
    freeze: IFreeze,
  ): IEvidenceBenchmarkQualityGrade.ICatalog {
    const subject: IEvidenceBenchmarkQualityGrade.Subject =
      parseSubject(requirementRoot);
    const corpus: EvidenceBenchmarkCorpus.IResult =
      EvidenceBenchmarkCorpus.read(requirementRoot);
    const files: Map<string, Uint8Array> =
      EvidenceBenchmarkHash.directory(requirementRoot);
    const hierarchy: ReadonlyMap<string, IHeading> = readHierarchy(files);
    const acceptanceBytes: Uint8Array | undefined = files.get(
      "acceptance-criteria.jsonl",
    );
    if (acceptanceBytes === undefined)
      throw new Error(
        `${subject} has no acceptance-criteria.jsonl quality denominator.`,
      );
    const acceptance: IEvidenceBenchmarkQualityGrade.IClause[] = parseCatalog(
      acceptanceBytes,
      "acceptance",
      hierarchy,
    );
    const contextBytes: Uint8Array | undefined = files.get(
      "context-criteria.jsonl",
    );
    const context: IEvidenceBenchmarkQualityGrade.IClause[] =
      contextBytes === undefined
        ? []
        : parseCatalog(contextBytes, "context", hierarchy);
    requireUniquePopulations(acceptance, context);
    if (
      acceptance.length !== corpus.atomicAcceptanceClauses ||
      context.length !== corpus.contextCriteria
    )
      throw new Error(
        `${subject} quality catalogs disagree with the validated corpus counts.`,
      );
    if (
      subject === "erp" &&
      (acceptance.length !== 1724 || context.length !== 986)
    )
      throw new Error(
        "ERP requires exactly 1,724 acceptance and 986 context ratings as separate denominators.",
      );
    if (subject !== "erp" && context.length !== 0)
      throw new Error(
        `${subject} unexpectedly declares a context denominator; freeze its protocol before grading.`,
      );
    const result: IEvidenceBenchmarkQualityGrade.ICatalog = {
      schemaVersion: 1,
      subject,
      requirementsTreeSha256: EvidenceBenchmarkHash.tree(files),
      acceptanceCatalogSha256: EvidenceBenchmarkHash.bytes(acceptanceBytes),
      acceptance,
      contextCatalogSha256:
        contextBytes === undefined
          ? null
          : EvidenceBenchmarkHash.bytes(contextBytes),
      context,
      denominatorsSummed: false,
    };
    if (
      freeze.subject !== subject ||
      freeze.requirementsTreeSha256 !== result.requirementsTreeSha256 ||
      freeze.acceptanceCatalogSha256 !== result.acceptanceCatalogSha256 ||
      freeze.contextCatalogSha256 !== result.contextCatalogSha256 ||
      freeze.documents !== corpus.documents ||
      freeze.h2 !== corpus.h2 ||
      freeze.h3 !== corpus.h3 ||
      freeze.acceptance !== result.acceptance.length ||
      freeze.context !== result.context.length
    )
      throw new Error(
        `${subject} requirement corpus does not match its frozen subject manifest.`,
      );
    return result;
  }

  function parseSubject(
    requirementRoot: string,
  ): IEvidenceBenchmarkQualityGrade.Subject {
    const subject: string = path.basename(path.resolve(requirementRoot));
    if (!SUBJECTS.has(subject))
      throw new Error(`Unknown benchmark quality subject: ${subject}.`);
    return subject as IEvidenceBenchmarkQualityGrade.Subject;
  }

  function readHierarchy(
    files: ReadonlyMap<string, Uint8Array>,
  ): ReadonlyMap<string, IHeading> {
    const hierarchy: Map<string, IHeading> = new Map();
    for (const [relative, bytes] of files) {
      if (!relative.endsWith(".md")) continue;
      let h2: string | null = null;
      const source: string = decode(bytes, relative);
      for (const line of EvidenceBenchmarkMarkdown.lines(source)) {
        const group: RegExpExecArray | null =
          /^## (REQ-[A-Za-z0-9._-]+)(?::|\s|$)/.exec(line);
        if (group !== null) {
          h2 = group[1]!;
          if (hierarchy.has(h2))
            throw new Error(`Requirement hierarchy duplicates H2 ${h2}.`);
          hierarchy.set(h2, { h2, level: "h2", source: relative });
          continue;
        }
        const leaf: RegExpExecArray | null =
          /^### (REQ-[A-Za-z0-9._-]+)(?::|\s|$)/.exec(line);
        if (leaf === null) continue;
        if (h2 === null)
          throw new Error(
            `${relative} declares H3 ${leaf[1]} before an owning REQ H2.`,
          );
        if (hierarchy.has(leaf[1]!))
          throw new Error(`Requirement hierarchy duplicates H3 ${leaf[1]}.`);
        hierarchy.set(leaf[1]!, {
          h2,
          level: "h3",
          source: relative,
        });
      }
    }
    return hierarchy;
  }

  function parseCatalog(
    bytes: Uint8Array,
    population: IEvidenceBenchmarkQualityGrade.Population,
    hierarchy: ReadonlyMap<string, IHeading>,
  ): IEvidenceBenchmarkQualityGrade.IClause[] {
    const rows: IEvidenceBenchmarkQualityGrade.IClause[] = [];
    const identifiers: Set<string> = new Set();
    for (const [index, line] of decode(bytes, `${population} catalog`)
      .split("\n")
      .entries()) {
      if (line.length === 0) continue;
      const row: Record<string, unknown> = record(
        JSON.parse(line) as unknown,
        `${population} catalog line ${index + 1}`,
      );
      const fields: string[] = Object.keys(row).sort();
      if (
        JSON.stringify(fields) !==
        JSON.stringify(["criterion", "id", "requirement", "source"])
      )
        throw new Error(
          `${population} catalog line ${index + 1} has an unexpected field set.`,
        );
      const id: string = text(row.id, `${population} criterion id`);
      const requirement: string = text(row.requirement, `${id} requirement`);
      const source: string = portable(
        text(row.source, `${id} source`),
        `${id} source`,
      );
      const criterion: string = text(row.criterion, `${id} criterion`);
      const heading: IHeading | undefined = hierarchy.get(requirement);
      if (heading === undefined)
        throw new Error(`${id} owns unknown requirement ${requirement}.`);
      if (identifiers.has(id))
        throw new Error(`${population} criterion id is duplicated: ${id}.`);
      identifiers.add(id);
      if (source !== heading.source)
        throw new Error(
          `${id} source ${source} does not own ${requirement}; expected ${heading.source}.`,
        );
      const h3: string | null =
        population === "acceptance" ? requirement : null;
      if (
        (population === "acceptance" && heading.level !== "h3") ||
        (population === "context" && heading.level !== "h2")
      )
        throw new Error(
          `${id} belongs to the wrong Markdown heading level for ${population}.`,
        );
      rows.push({
        id,
        requirement,
        source,
        criterion,
        population,
        h2: heading.h2,
        h3,
      });
    }
    if (rows.length === 0)
      throw new Error(`${population} criterion catalog is empty.`);
    return rows;
  }

  function requireUniquePopulations(
    acceptance: IEvidenceBenchmarkQualityGrade.IClause[],
    context: IEvidenceBenchmarkQualityGrade.IClause[],
  ): void {
    const acceptanceIds: Set<string> = new Set(
      acceptance.map((clause) => clause.id),
    );
    const overlap: string[] = context
      .map((clause) => clause.id)
      .filter((id) => acceptanceIds.has(id));
    if (overlap.length !== 0)
      throw new Error(
        `Acceptance and context catalogs overlap: ${overlap.join(", ")}.`,
      );
  }

  function decode(bytes: Uint8Array, label: string): string {
    let source: string;
    try {
      source = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      throw new Error(`${label} is not valid UTF-8.`);
    }
    if (source.includes("\r"))
      throw new Error(`${label} must use frozen LF line endings.`);
    return source;
  }

  function record(input: unknown, label: string): Record<string, unknown> {
    if (typeof input !== "object" || input === null || Array.isArray(input))
      throw new Error(`${label} must be a JSON object.`);
    return input as Record<string, unknown>;
  }

  function text(input: unknown, label: string): string {
    if (
      typeof input !== "string" ||
      input.length === 0 ||
      input !== input.trim()
    )
      throw new Error(`${label} must be one non-empty trimmed string.`);
    return input;
  }

  function portable(input: string, label: string): string {
    if (
      input.includes("\\") ||
      path.posix.isAbsolute(input) ||
      input.split("/").some((segment) => segment === "" || segment === "..")
    )
      throw new Error(`${label} must be a portable relative path.`);
    return input;
  }
}
