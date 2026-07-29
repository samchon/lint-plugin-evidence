import fs from "node:fs";

import { EvidenceBenchmarkHash } from "./EvidenceBenchmarkHash.ts";
import { EvidenceBenchmarkMarkdown } from "./EvidenceBenchmarkMarkdown.ts";

/** Reads and validates one complete Markdown benchmark requirement corpus. */
export namespace EvidenceBenchmarkCorpus {
  /** Validated subject files and Markdown structure bound into run provenance. */
  export interface IResult {
    /** Every Markdown requirement document, preserving its exact source bytes. */
    files: ReadonlyMap<string, Uint8Array>;

    /** Number of Markdown documents in the selected subject directory. */
    documents: number;

    /** Number of level-two sections outside fenced code blocks. */
    h2: number;

    /** Number of REQ-owned level-three sections outside fenced code blocks. */
    h3: number;
  }

  /**
   * Reads a subject directory and validates its Markdown-owned node identities.
   *
   * A corpus is deliberately self-contained: every input is a root-level,
   * numbered Markdown document. Counts describe only structure that can be
   * observed from those documents; no parallel inventory is reconstructed.
   */
  export function read(root: string): IResult {
    if (!fs.existsSync(root) || !fs.statSync(root).isDirectory())
      throw new Error(`Benchmark requirement corpus is missing: ${root}.`);
    const files: Map<string, Uint8Array> =
      EvidenceBenchmarkHash.directory(root);
    if (files.size === 0)
      throw new Error(`Benchmark requirement corpus is empty: ${root}.`);

    const groups: Map<string, string> = new Map();
    const requirements: Map<string, string> = new Map();
    let h2: number = 0;
    let h3: number = 0;
    for (const [relative, content] of files) {
      if (
        relative.includes("/") ||
        !/^\d{2}-[a-z0-9]+(?:-[a-z0-9]+)*\.md$/.test(relative)
      )
        throw new Error(
          `Requirement corpus files must be root-level numbered Markdown documents: ${relative}.`,
        );
      const source: string = Buffer.from(content).toString("utf8");
      if (source.includes("\uFFFD"))
        throw new Error(`Requirement text is not valid UTF-8: ${relative}.`);
      const lines: string[] = EvidenceBenchmarkMarkdown.lines(
        source.replaceAll("\r\n", "\n"),
      );
      for (const line of lines) {
        if (/^## [^#]/.test(line)) {
          ++h2;
          const heading: RegExpExecArray | null =
            /^## (REQ-[A-Za-z0-9._-]+)(?::|\s|$)/.exec(line);
          if (heading !== null)
            claimNode(groups, heading[1]!, relative, "group heading");
        }
        const heading: RegExpExecArray | null =
          /^### (REQ-[A-Za-z0-9._-]+)(?::|\s|$)/.exec(line);
        if (heading !== null) {
          claimNode(requirements, heading[1]!, relative, "heading");
          ++h3;
        } else if (/^### [^#]/.test(line))
          throw new Error(
            `Requirement corpus H3 must own a REQ identifier: ${relative}: ${line}.`,
          );
      }
    }
    if (h2 === 0)
      throw new Error(
        `Benchmark requirement corpus has no level-two requirement groups: ${root}.`,
      );
    if (h3 === 0)
      throw new Error(
        `Benchmark requirement corpus has no REQ-owned level-three requirements: ${root}.`,
      );
    return {
      files,
      documents: files.size,
      h2,
      h3,
    };
  }

  function claimNode(
    owners: Map<string, string>,
    identifier: string,
    relative: string,
    kind: string,
  ): void {
    const previous: string | undefined = owners.get(identifier);
    if (previous !== undefined)
      throw new Error(
        `Requirement ${kind} is duplicated: ${identifier} (${previous}, ${relative}).`,
      );
    owners.set(identifier, relative);
  }
}
