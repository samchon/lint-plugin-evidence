import fs from "node:fs";
import path from "node:path";

import { EvidenceBenchmarkHash } from "./EvidenceBenchmarkHash.ts";
import { EvidenceBenchmarkJson } from "./EvidenceBenchmarkJson.ts";
import { EvidenceBenchmarkMarkdown } from "./EvidenceBenchmarkMarkdown.ts";
import { EvidenceBenchmarkProcess } from "./EvidenceBenchmarkProcess.ts";

/** Reads and validates one complete benchmark requirement corpus. */
export namespace EvidenceBenchmarkCorpus {
  const DUAL_PROTOCOL_DOCUMENTS: ReadonlySet<string> = new Set([
    "00-corpus-contract.md",
    "00-toc.md",
  ]);

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

    /** Separately scored H2 context criteria, never added to atomic clauses. */
    contextCriteria: number;

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
    const parserFiles: Map<string, Uint8Array> = normalizeText(files);
    const hasJsonLines: boolean = parserFiles.has("acceptance-criteria.jsonl");
    const hasMetadata: boolean = parserFiles.has("metadata.json");
    const hasContext: boolean = parserFiles.has("context-criteria.jsonl");
    const hasManifest: boolean = parserFiles.has("corpus-manifest.json");
    if (hasJsonLines && hasMetadata)
      throw new Error(
        "Requirement corpus must select exactly one inventory adapter, not both acceptance-criteria.jsonl and metadata.json.",
      );
    if (hasJsonLines && hasContext !== hasManifest)
      throw new Error(
        "Dual-denominator corpus requires both context-criteria.jsonl and corpus-manifest.json.",
      );
    if (hasMetadata && (hasContext || hasManifest))
      throw new Error(
        "metadata.json corpus cannot also declare the dual-denominator contract.",
      );
    if (!hasJsonLines && !hasMetadata && (hasContext || hasManifest))
      throw new Error(
        "Dual-denominator corpus requires acceptance-criteria.jsonl.",
      );
    const manifest: Record<string, unknown> | undefined = hasManifest
      ? readCorpusManifest(files)
      : undefined;
    const markdown: IMarkdownInventory = readMarkdown(parserFiles, {
      manifestOwnedProtocol:
        manifest === undefined ? undefined : DUAL_PROTOCOL_DOCUMENTS,
    });
    if (hasJsonLines) {
      const clauses: number = validateJsonLines(parserFiles, markdown);
      const contextCriteria: number = hasContext
        ? validateContextJsonLines(parserFiles, markdown)
        : 0;
      if (manifest !== undefined) {
        validateCorpusManifest(
          parserFiles,
          manifest,
          markdown,
          clauses,
          contextCriteria,
        );
        validateCorpusExecutable(root);
      }
      return result(
        files,
        markdown,
        clauses,
        contextCriteria,
        "acceptance-criteria.jsonl",
        hasContext ? markdown.groups.size : markdown.h2,
      );
    }
    if (hasMetadata) {
      const clauses: number = validateMetadata(
        parserFiles,
        markdown,
        path.basename(root),
      );
      return result(files, markdown, clauses, 0, "metadata.json", markdown.h2);
    }
    throw new Error(
      `Benchmark requirement corpus has no audited machine-readable inventory: ${root}.`,
    );
  }

  interface IMarkdownDocument {
    path: string;
    h2: number;
    groups: ReadonlySet<string>;
    requirements: ReadonlySet<string>;
  }

  interface IMarkdownInventory {
    documents: ReadonlyMap<string, IMarkdownDocument>;
    groups: ReadonlyMap<string, string>;
    h2: number;
    h3: number;
  }

  interface IMarkdownPolicy {
    manifestOwnedProtocol: ReadonlySet<string> | undefined;
  }

  function result(
    files: ReadonlyMap<string, Uint8Array>,
    markdown: IMarkdownInventory,
    atomicAcceptanceClauses: number,
    contextCriteria: number,
    inventory: IResult["inventory"],
    h2: number,
  ): IResult {
    return {
      files,
      documents: markdown.documents.size,
      h2,
      h3: markdown.h3,
      atomicAcceptanceClauses,
      contextCriteria,
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
    policy: IMarkdownPolicy,
  ): IMarkdownInventory {
    const documents: Map<string, IMarkdownDocument> = new Map();
    const numbers: Map<string, string> = new Map();
    const groups: Map<string, string> = new Map();
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
      const previous: string | undefined = numbers.get(number);
      if (
        previous !== undefined &&
        !(
          number === "00" &&
          policy.manifestOwnedProtocol?.has(previous) === true &&
          policy.manifestOwnedProtocol.has(relative)
        )
      )
        throw new Error(
          `Requirement Markdown number is duplicated: ${number} (${previous}, ${relative}).`,
        );
      numbers.set(number, relative);
      const source: string = Buffer.from(content).toString("utf8");
      const lines: string[] = EvidenceBenchmarkMarkdown.lines(source);
      const documentGroups: Set<string> = new Set();
      const requirements: Set<string> = new Set();
      for (const line of lines) {
        if (/^## [^#]/.test(line)) {
          ++h2;
          const heading: RegExpExecArray | null =
            /^## (REQ-[A-Za-z0-9._-]+)(?::|\s|$)/.exec(line);
          if (heading !== null) {
            const group: string = heading[1]!;
            const previous: string | undefined = groups.get(group);
            if (previous !== undefined)
              throw new Error(
                `Requirement group heading is duplicated: ${group} (${previous}, ${relative}).`,
              );
            groups.set(group, relative);
            documentGroups.add(group);
          }
        }
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
        groups: documentGroups,
        requirements,
      });
    }
    if (documents.size === 0)
      throw new Error(
        "Benchmark requirement corpus has no Markdown documents.",
      );
    return { documents, groups, h2, h3 };
  }

  function validateJsonLines(
    files: ReadonlyMap<string, Uint8Array>,
    markdown: IMarkdownInventory,
  ): number {
    const records: Record<string, unknown>[] = jsonLineRecords(
      files,
      "acceptance-criteria.jsonl",
    );
    const identifiers: Set<string> = new Set();
    const covered: Set<string> = new Set();
    for (const record of records) {
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
    return records.length;
  }

  function validateContextJsonLines(
    files: ReadonlyMap<string, Uint8Array>,
    markdown: IMarkdownInventory,
  ): number {
    const records: Record<string, unknown>[] = jsonLineRecords(
      files,
      "context-criteria.jsonl",
    );
    const identifiers: Set<string> = new Set();
    const covered: Set<string> = new Set();
    const ownerSequences: Map<string, number> = new Map();
    for (const [index, record] of records.entries()) {
      const location: string = `context-criteria.jsonl line ${index + 1}`;
      const fields: string[] = Object.keys(record).sort();
      if (
        JSON.stringify(fields) !==
        JSON.stringify(["criterion", "id", "requirement", "source"])
      )
        throw new Error(
          `${location} fields must be exactly id, requirement, source, criterion.`,
        );
      const id: string = nonEmptyString(record.id, `${location} id`);
      const requirement: string = nonEmptyString(
        record.requirement,
        `${id} requirement`,
      );
      const source: string = nonEmptyString(record.source, `${id} source`);
      const criterion: string = nonEmptyString(
        record.criterion,
        `${id} criterion`,
      );
      if (criterion !== criterion.trim())
        throw new Error(`${id} criterion must be trimmed.`);
      if (identifiers.has(id))
        throw new Error(`Context criterion id is duplicated: ${id}.`);
      identifiers.add(id);
      const sequence: number = (ownerSequences.get(requirement) ?? 0) + 1;
      ownerSequences.set(requirement, sequence);
      const expected: string = `${requirement}.CTX-${String(sequence).padStart(2, "0")}`;
      if (id !== expected)
        throw new Error(
          `${location} id must follow its owner-local sequence: ${expected}.`,
        );
      resolveGroup(markdown, source, requirement, id);
      covered.add(requirement);
    }
    const missing: string[] = [...markdown.groups.keys()].filter(
      (group) => !covered.has(group),
    );
    if (missing.length !== 0)
      throw new Error(
        `context-criteria.jsonl does not cover every REQ H2: ${missing.join(", ")}.`,
      );
    return records.length;
  }

  function readCorpusManifest(
    files: ReadonlyMap<string, Uint8Array>,
  ): Record<string, unknown> {
    const manifest: Record<string, unknown> = object(
      EvidenceBenchmarkJson.parse(
        textFile(files, "corpus-manifest.json"),
        "corpus-manifest.json",
      ),
      "corpus-manifest.json",
    );
    if (manifest.schemaVersion !== 1)
      throw new Error("corpus-manifest.json schemaVersion must be 1.");
    const expectedPaths: string[] = [...files.keys()]
      .filter((relative) => relative !== "corpus-manifest.json")
      .sort();
    const declared: unknown[] = array(
      manifest.files,
      "corpus-manifest.json files",
    );
    const declaredPaths: string[] = [];
    for (const [index, input] of declared.entries()) {
      const entry: Record<string, unknown> = object(
        input,
        `corpus-manifest.json files[${index}]`,
      );
      const relative: string = portablePath(
        nonEmptyString(entry.path, `corpus-manifest.json files[${index}] path`),
        "Corpus manifest file",
      );
      const sha256: string = nonEmptyString(
        entry.sha256,
        `corpus-manifest.json ${relative} sha256`,
      );
      if (!/^[a-f0-9]{64}$/.test(sha256))
        throw new Error(
          `corpus-manifest.json ${relative} sha256 must be lowercase hexadecimal SHA-256.`,
        );
      const content: Uint8Array | undefined = files.get(relative);
      if (content === undefined)
        throw new Error(
          `corpus-manifest.json file is absent from the corpus: ${relative}.`,
        );
      if (EvidenceBenchmarkHash.bytes(content) !== sha256)
        throw new Error(`corpus-manifest.json file hash drifted: ${relative}.`);
      declaredPaths.push(relative);
    }
    if (JSON.stringify(declaredPaths) !== JSON.stringify(expectedPaths))
      throw new Error(
        "corpus-manifest.json file inventory must exactly match the sorted corpus path set.",
      );

    const chunks: Uint8Array[] = [];
    for (const relative of expectedPaths)
      chunks.push(
        Buffer.from(relative, "utf8"),
        Buffer.from([0]),
        files.get(relative)!,
        Buffer.from([0]),
      );
    const aggregate: string = EvidenceBenchmarkHash.bytes(
      Buffer.concat(chunks),
    );
    if (manifest.aggregateSha256 !== aggregate)
      throw new Error(
        `corpus-manifest.json aggregateSha256 must be ${aggregate}.`,
      );
    return manifest;
  }

  function validateCorpusManifest(
    files: ReadonlyMap<string, Uint8Array>,
    manifest: Record<string, unknown>,
    markdown: IMarkdownInventory,
    acceptanceCriteria: number,
    contextCriteria: number,
  ): void {
    manifestCount(manifest.h2, markdown.groups.size, "h2");
    manifestCount(manifest.h3, markdown.h3, "h3");
    manifestCount(
      manifest.acceptanceCriteria,
      acceptanceCriteria,
      "acceptanceCriteria",
    );
    manifestCount(manifest.contextCriteria, contextCriteria, "contextCriteria");
    if ("links" in manifest) {
      const links: number = jsonLineRecords(
        files,
        "requirement-links.jsonl",
      ).length;
      manifestCount(manifest.links, links, "links");
    }
  }

  function validateCorpusExecutable(root: string): void {
    const executable: string = path.join(root, "validate.mjs");
    if (!fs.existsSync(executable))
      throw new Error(
        "Dual-denominator corpus must provide its frozen validate.mjs.",
      );
    const result: EvidenceBenchmarkProcess.IResult =
      EvidenceBenchmarkProcess.runSync(process.execPath, [executable], {
        cwd: root,
        allowFailure: true,
        label: "requirement corpus validator",
      });
    if (result.status !== 0)
      throw new Error(
        [
          `Requirement corpus validator failed with status ${String(result.status)}.`,
          result.stderr.trim(),
          result.stdout.trim(),
        ]
          .filter((part) => part.length !== 0)
          .join("\n"),
      );
  }

  function validateMetadata(
    files: ReadonlyMap<string, Uint8Array>,
    markdown: IMarkdownInventory,
    subject: string,
  ): number {
    const metadata: Record<string, unknown> = object(
      EvidenceBenchmarkJson.parse(
        textFile(files, "metadata.json"),
        "metadata.json",
      ),
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

  function resolveGroup(
    markdown: IMarkdownInventory,
    inputPath: string,
    requirement: string,
    criterion: string,
  ): void {
    const relative: string = portableSource(inputPath);
    if (!/^REQ-[A-Za-z0-9._-]+$/.test(requirement))
      throw new Error(
        `Context criterion ${criterion} has an invalid requirement identifier: ${requirement}.`,
      );
    const source: string | undefined = markdown.groups.get(requirement);
    if (source === undefined)
      throw new Error(
        `Context criterion ${criterion} does not map to a REQ H2: ${requirement}.`,
      );
    if (source !== relative)
      throw new Error(
        `Context criterion ${criterion} source ${relative} does not own REQ H2 ${requirement}; expected ${source}.`,
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
    return portablePath(source, "Requirement inventory source");
  }

  function portablePath(source: string, label: string): string {
    if (
      source.startsWith("/") ||
      source.includes("\\") ||
      path.posix.normalize(source) !== source ||
      source === ".." ||
      source.startsWith("../")
    )
      throw new Error(`${label} is not portable: ${source}.`);
    return source;
  }

  function jsonLineRecords(
    files: ReadonlyMap<string, Uint8Array>,
    relative: string,
  ): Record<string, unknown>[] {
    const lines: string[] = textFile(files, relative)
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length !== 0);
    if (lines.length === 0) throw new Error(`${relative} must not be empty.`);
    return lines.map((line, index): Record<string, unknown> => {
      let parsed: unknown;
      try {
        parsed = EvidenceBenchmarkJson.parse(
          line,
          `${relative} line ${index + 1}`,
        );
      } catch (error) {
        throw new Error(`${relative} line ${index + 1} is not valid JSON.`, {
          cause: error,
        });
      }
      return object(parsed, `${relative} line ${index + 1}`);
    });
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

  function manifestCount(input: unknown, actual: number, label: string): void {
    if (input !== actual)
      throw new Error(
        `corpus-manifest.json ${label} must be ${actual}, received ${JSON.stringify(input)}.`,
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
