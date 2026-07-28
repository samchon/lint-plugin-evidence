import fs from "node:fs";
import path from "node:path";

import { EvidenceBenchmarkHash } from "./EvidenceBenchmarkHash.ts";

/** Reads and validates one complete benchmark requirement corpus. */
export namespace EvidenceBenchmarkCorpus {
  /** Validated subject files and inventory counts bound into run provenance. */
  export interface IResult {
    /** Every regular subject file, including machine-readable inventories. */
    files: ReadonlyMap<string, Uint8Array>;

    /** Number of Markdown documents in the selected subject directory. */
    documents: number;

    /** Number of level-two sections outside fenced code blocks. */
    h2: number;

    /** Number of REQ-owned level-three sections outside fenced code blocks. */
    h3: number;

    /** Number of validated atomic acceptance criteria. */
    atomicAcceptanceClauses: number;

    /** Machine-readable inventory contract detected for this subject. */
    inventory: "acceptance-criteria.jsonl" | "metadata.json";
  }

  /**
   * Reads a subject directory and verifies any detected inventory adapter.
   *
   * Inventory paths and requirement IDs must resolve to the Markdown source
   * shipped in the same directory. Every REQ H3 is represented exactly as the
   * inventory's exhaustive acceptance contract requires.
   */
  export function read(root: string): IResult {
    if (!fs.existsSync(root) || !fs.statSync(root).isDirectory())
      throw new Error(`Benchmark requirement corpus is missing: ${root}.`);
    const files: Map<string, Uint8Array> =
      EvidenceBenchmarkHash.directory(root);
    if (files.size === 0)
      throw new Error(`Benchmark requirement corpus is empty: ${root}.`);
    const normalized: Map<string, Uint8Array> = normalizeText(files);
    const markdown: IMarkdownInventory = readMarkdown(normalized);
    const hasJsonLines: boolean = normalized.has("acceptance-criteria.jsonl");
    const hasMetadata: boolean = normalized.has("metadata.json");
    if (hasJsonLines && hasMetadata)
      throw new Error(
        "Requirement corpus must select exactly one inventory adapter, not both acceptance-criteria.jsonl and metadata.json.",
      );
    if (hasJsonLines) {
      const clauses: number = validateJsonLines(normalized, markdown);
      return result(normalized, markdown, clauses, "acceptance-criteria.jsonl");
    }
    if (hasMetadata) {
      const clauses: number = validateMetadata(
        normalized,
        markdown,
        path.basename(root),
      );
      return result(normalized, markdown, clauses, "metadata.json");
    }
    throw new Error(
      `Benchmark requirement corpus has no audited machine-readable inventory: ${root}.`,
    );
  }

  interface IMarkdownDocument {
    path: string;
    h2: number;
    requirements: ReadonlySet<string>;
  }

  interface IMarkdownInventory {
    documents: ReadonlyMap<string, IMarkdownDocument>;
    h2: number;
    h3: number;
  }

  function result(
    files: ReadonlyMap<string, Uint8Array>,
    markdown: IMarkdownInventory,
    atomicAcceptanceClauses: number,
    inventory: IResult["inventory"],
  ): IResult {
    return {
      files,
      documents: markdown.documents.size,
      h2: markdown.h2,
      h3: markdown.h3,
      atomicAcceptanceClauses,
      inventory,
    };
  }

  function normalizeText(
    files: ReadonlyMap<string, Uint8Array>,
  ): Map<string, Uint8Array> {
    const result: Map<string, Uint8Array> = new Map();
    for (const [relative, content] of files) {
      if (!/\.(?:md|json|jsonl)$/i.test(relative)) {
        result.set(relative, content);
        continue;
      }
      const text: string = Buffer.from(content).toString("utf8");
      if (text.includes("\uFFFD"))
        throw new Error(`Requirement text is not valid UTF-8: ${relative}.`);
      result.set(relative, Buffer.from(text.replaceAll("\r\n", "\n"), "utf8"));
    }
    return result;
  }

  function readMarkdown(
    files: ReadonlyMap<string, Uint8Array>,
  ): IMarkdownInventory {
    const documents: Map<string, IMarkdownDocument> = new Map();
    const numbers: Set<string> = new Set();
    let h2: number = 0;
    let h3: number = 0;
    for (const [relative, content] of files) {
      if (!relative.endsWith(".md")) continue;
      const filename: RegExpExecArray | null =
        /^(?<number>\d{2})-[a-z0-9]+(?:-[a-z0-9]+)*\.md$/.exec(relative);
      if (filename === null || relative.includes("/"))
        throw new Error(
          `Requirement Markdown must be a root-level numbered document: ${relative}.`,
        );
      const number: string = filename.groups!.number!;
      if (numbers.has(number))
        throw new Error(
          `Requirement Markdown number is duplicated: ${number} (${relative}).`,
        );
      numbers.add(number);
      const source: string = Buffer.from(content).toString("utf8");
      const lines: string[] = markdownLines(source);
      const requirements: Set<string> = new Set();
      for (const line of lines) {
        if (/^## [^#]/.test(line)) ++h2;
        const heading: RegExpExecArray | null =
          /^### (REQ-[A-Za-z0-9._-]+)(?::|\s|$)/.exec(line);
        if (heading !== null) {
          const requirement: string = heading[1]!;
          if (requirements.has(requirement))
            throw new Error(
              `Requirement heading is duplicated in ${relative}: ${requirement}.`,
            );
          requirements.add(requirement);
          ++h3;
        } else if (/^### [^#]/.test(line))
          throw new Error(
            `Requirement corpus H3 must own a REQ identifier: ${relative}: ${line}.`,
          );
      }
      documents.set(relative, {
        path: relative,
        h2: countH2(lines),
        requirements,
      });
    }
    if (documents.size === 0)
      throw new Error(
        "Benchmark requirement corpus has no Markdown documents.",
      );
    return { documents, h2, h3 };
  }

  function validateJsonLines(
    files: ReadonlyMap<string, Uint8Array>,
    markdown: IMarkdownInventory,
  ): number {
    const source: string = textFile(files, "acceptance-criteria.jsonl");
    const lines: string[] = source
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length !== 0);
    if (lines.length === 0)
      throw new Error("acceptance-criteria.jsonl must not be empty.");
    const identifiers: Set<string> = new Set();
    const covered: Set<string> = new Set();
    for (const [index, line] of lines.entries()) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(line);
      } catch (error) {
        throw new Error(
          `acceptance-criteria.jsonl line ${index + 1} is not valid JSON.`,
          { cause: error },
        );
      }
      const record: Record<string, unknown> = object(
        parsed,
        `acceptance-criteria.jsonl line ${index + 1}`,
      );
      const id: string = nonEmptyString(record.id, "criterion id");
      const requirement: string = nonEmptyString(
        record.requirement,
        `${id} requirement`,
      );
      const sourcePath: string = nonEmptyString(record.source, `${id} source`);
      nonEmptyString(record.criterion, `${id} criterion`);
      if (identifiers.has(id))
        throw new Error(`Acceptance criterion id is duplicated: ${id}.`);
      identifiers.add(id);
      resolveRequirement(markdown, sourcePath, requirement, id);
      covered.add(`${sourcePath}\0${requirement}`);
    }
    requireExhaustive(markdown, covered, "acceptance-criteria.jsonl");
    return lines.length;
  }

  function validateMetadata(
    files: ReadonlyMap<string, Uint8Array>,
    markdown: IMarkdownInventory,
    subject: string,
  ): number {
    const metadata: Record<string, unknown> = object(
      JSON.parse(textFile(files, "metadata.json")),
      "metadata.json",
    );
    if (
      typeof metadata.schemaVersion !== "number" ||
      !Number.isInteger(metadata.schemaVersion) ||
      metadata.schemaVersion < 1
    )
      throw new Error(
        "metadata.json schemaVersion must be a positive integer.",
      );
    if (nonEmptyString(metadata.subject, "metadata subject") !== subject)
      throw new Error(
        `metadata.json subject must match its directory name ${subject}.`,
      );
    const documentInventory: Record<string, unknown> = object(
      metadata.documentInventory,
      "metadata documentInventory",
    );
    const declaredDocuments: unknown[] = array(
      documentInventory.documents,
      "metadata documents",
    );
    const declaredPaths: Set<string> = new Set();
    for (const item of declaredDocuments) {
      const declared: Record<string, unknown> = object(
        item,
        "metadata document",
      );
      const relative: string = portableSource(
        nonEmptyString(declared.path, "metadata document path"),
      );
      if (declaredPaths.has(relative))
        throw new Error(
          `metadata.json document path is duplicated: ${relative}.`,
        );
      declaredPaths.add(relative);
      const actual: IMarkdownDocument | undefined =
        markdown.documents.get(relative);
      if (actual === undefined)
        throw new Error(
          `metadata.json document is absent from the subject: ${relative}.`,
        );
      exactCount(declared.h2, actual.h2, `${relative} h2`);
      exactCount(declared.h3, actual.requirements.size, `${relative} h3`);
    }
    const actualPaths: string[] = [...markdown.documents.keys()].sort();
    const expectedPaths: string[] = [...declaredPaths].sort();
    if (JSON.stringify(actualPaths) !== JSON.stringify(expectedPaths))
      throw new Error(
        "metadata.json document inventory must exactly match the subject Markdown path set.",
      );
    const totals: Record<string, unknown> = object(
      documentInventory.totals,
      "metadata document totals",
    );
    exactCount(totals.documents, markdown.documents.size, "total documents");
    exactCount(totals.h2, markdown.h2, "total h2");
    exactCount(totals.h3, markdown.h3, "total h3");
    validateStateInventory(metadata.sectionInventory, "sectionInventory");

    const acceptance: Record<string, unknown> = object(
      metadata.atomicAcceptanceInventory,
      "metadata atomicAcceptanceInventory",
    );
    validateStateInventory(acceptance, "atomicAcceptanceInventory");
    nonEmptyString(acceptance.scoringRule, "atomic acceptance scoringRule");
    const clauses: unknown[] = array(
      acceptance.clauses,
      "metadata atomic acceptance clauses",
    );
    exactCount(
      totals.atomicAcceptanceClauses,
      clauses.length,
      "total atomicAcceptanceClauses",
    );
    const identifiers: Set<string> = new Set();
    const covered: Set<string> = new Set();
    for (const item of clauses) {
      const clause: Record<string, unknown> = object(
        item,
        "metadata atomic acceptance clause",
      );
      const id: string = nonEmptyString(clause.id, "atomic clause id");
      if (identifiers.has(id))
        throw new Error(`Atomic acceptance clause id is duplicated: ${id}.`);
      identifiers.add(id);
      nonEmptyString(clause.criterion, `${id} criterion`);
      const source: string = nonEmptyString(clause.source, `${id} source`);
      const resolved: { path: string; requirement: string } = parseJoinedSource(
        source,
        id,
      );
      resolveRequirement(markdown, resolved.path, resolved.requirement, id);
      covered.add(`${resolved.path}\0${resolved.requirement}`);
    }
    requireExhaustive(markdown, covered, "metadata.json");
    return clauses.length;
  }

  function validateStateInventory(input: unknown, label: string): void {
    const inventory: Record<string, unknown> = object(input, label);
    if (label === "sectionInventory")
      nonEmptyString(inventory.headingPattern, `${label} headingPattern`);
    nonEmptyString(inventory.unit, `${label} unit`);
    if (
      typeof inventory.states !== "string" &&
      !Array.isArray(inventory.states) &&
      !isObject(inventory.states)
    )
      throw new Error(`${label} states must declare a non-empty state model.`);
    if (
      (typeof inventory.states === "string" &&
        inventory.states.trim().length === 0) ||
      (Array.isArray(inventory.states) && inventory.states.length === 0) ||
      (isObject(inventory.states) && Object.keys(inventory.states).length === 0)
    )
      throw new Error(`${label} states must declare a non-empty state model.`);
  }

  function resolveRequirement(
    markdown: IMarkdownInventory,
    inputPath: string,
    requirement: string,
    criterion: string,
  ): void {
    const relative: string = portableSource(inputPath);
    if (!/^REQ-[A-Za-z0-9._-]+$/.test(requirement))
      throw new Error(
        `Criterion ${criterion} has an invalid requirement identifier: ${requirement}.`,
      );
    const document: IMarkdownDocument | undefined =
      markdown.documents.get(relative);
    if (document === undefined)
      throw new Error(
        `Criterion ${criterion} names a source outside the subject Markdown set: ${relative}.`,
      );
    if (!document.requirements.has(requirement))
      throw new Error(
        `Criterion ${criterion} does not map to ${relative} H3 ${requirement}.`,
      );
  }

  function requireExhaustive(
    markdown: IMarkdownInventory,
    covered: ReadonlySet<string>,
    inventory: string,
  ): void {
    const missing: string[] = [];
    for (const document of markdown.documents.values())
      for (const requirement of document.requirements)
        if (!covered.has(`${document.path}\0${requirement}`))
          missing.push(`${document.path}#${requirement}`);
    if (missing.length !== 0)
      throw new Error(
        `${inventory} does not cover every REQ H3: ${missing.join(", ")}.`,
      );
  }

  function parseJoinedSource(
    source: string,
    criterion: string,
  ): { path: string; requirement: string } {
    const separator: number = source.lastIndexOf("#");
    if (separator <= 0 || separator === source.length - 1)
      throw new Error(
        `Criterion ${criterion} source must be path.md#REQ-ID: ${source}.`,
      );
    return {
      path: source.slice(0, separator),
      requirement: source.slice(separator + 1),
    };
  }

  function portableSource(source: string): string {
    if (
      source.startsWith("/") ||
      source.includes("\\") ||
      path.posix.normalize(source) !== source ||
      source === ".." ||
      source.startsWith("../")
    )
      throw new Error(
        `Requirement inventory source is not portable: ${source}.`,
      );
    return source;
  }

  function markdownLines(source: string): string[] {
    const output: string[] = [];
    let fence: string | null = null;
    for (const line of source.split("\n")) {
      const marker: RegExpExecArray | null = /^\s*(```+|~~~+)/.exec(line);
      if (marker !== null) {
        const family: string = marker[1]![0]!;
        if (fence === null) fence = family;
        else if (fence === family) fence = null;
        continue;
      }
      if (fence === null) output.push(line);
    }
    return output;
  }

  function countH2(lines: readonly string[]): number {
    return lines.filter((line) => /^## [^#]/.test(line)).length;
  }

  function textFile(
    files: ReadonlyMap<string, Uint8Array>,
    relative: string,
  ): string {
    const content: Uint8Array | undefined = files.get(relative);
    if (content === undefined)
      throw new Error(`Requirement inventory is missing: ${relative}.`);
    return Buffer.from(content).toString("utf8");
  }

  function exactCount(input: unknown, actual: number, label: string): void {
    if (input !== actual)
      throw new Error(
        `metadata.json ${label} must be ${actual}, received ${JSON.stringify(input)}.`,
      );
  }

  function nonEmptyString(input: unknown, label: string): string {
    if (typeof input !== "string" || input.trim().length === 0)
      throw new Error(`${label} must be a non-empty string.`);
    return input;
  }

  function array(input: unknown, label: string): unknown[] {
    if (!Array.isArray(input)) throw new Error(`${label} must be an array.`);
    return input;
  }

  function object(input: unknown, label: string): Record<string, unknown> {
    if (!isObject(input)) throw new Error(`${label} must be an object.`);
    return input;
  }

  function isObject(input: unknown): input is Record<string, unknown> {
    return typeof input === "object" && input !== null && !Array.isArray(input);
  }
}
