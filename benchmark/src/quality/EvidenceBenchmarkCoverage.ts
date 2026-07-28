import fs from "node:fs";
import path from "node:path";

import { EvidenceBenchmarkHash } from "../EvidenceBenchmarkHash.ts";
import type { IEvidenceBenchmarkQualityGate } from "../structures/IEvidenceBenchmarkQualityGate.ts";
import { EvidenceBenchmarkArtifactInventory } from "./EvidenceBenchmarkArtifactInventory.ts";

/** Ingests conventional coverage without collapsing independent dimensions. */
export namespace EvidenceBenchmarkCoverage {
  interface IMutableCount {
    covered: number;
    total: number;
  }

  interface IAccumulator {
    files: Set<string>;
    lines: IMutableCount;
    branches: IMutableCount;
    functions: IMutableCount;
    statements: IMutableCount | null;
  }

  /** Reads Istanbul `coverage-final.json` and binds it to exact workspace files. */
  export function istanbul(
    workspace: string,
    artifact: string,
  ): IEvidenceBenchmarkQualityGate.ICoverage {
    const absoluteArtifact: string = path.resolve(artifact);
    const value: unknown = JSON.parse(
      fs.readFileSync(absoluteArtifact, "utf8"),
    );
    if (typeof value !== "object" || value === null || Array.isArray(value))
      throw new Error("Istanbul coverage root must be an object.");
    const accumulator: IAccumulator = empty(true);
    for (const [reportedPath, unknownRecord] of Object.entries(value)) {
      const relative: string = sourcePath(workspace, reportedPath);
      if (accumulator.files.has(relative))
        throw new Error(
          `Coverage contains duplicate source path: ${relative}.`,
        );
      accumulator.files.add(relative);
      const record: Record<string, unknown> = object(
        unknownRecord,
        `Istanbul record ${relative}`,
      );
      if (
        typeof record.path !== "string" ||
        sourcePath(workspace, record.path) !== relative
      )
        throw new Error(
          `Istanbul record key and embedded path differ: ${relative}.`,
        );
      const statementMap: Record<string, unknown> = object(
        record.statementMap,
        `${relative} statementMap`,
      );
      const statementHits: Record<string, unknown> = object(
        record.s,
        `${relative} statement hits`,
      );
      exactKeys(statementMap, statementHits, `${relative} statements`);
      addHits(accumulator.statements!, statementHits, `${relative} statements`);
      const lineHits: Map<number, number> = new Map();
      for (const [id, location] of Object.entries(statementMap)) {
        const row: Record<string, unknown> = object(
          location,
          `${relative} statement ${id}`,
        );
        const start: Record<string, unknown> = object(
          row.start,
          `${relative} statement ${id} start`,
        );
        const line: number = integer(
          start.line,
          `${relative} statement ${id} line`,
        );
        const hits: number = integer(
          statementHits[id],
          `${relative} statement ${id} hits`,
        );
        lineHits.set(line, Math.max(lineHits.get(line) ?? 0, hits));
      }
      addHits(
        accumulator.lines,
        Object.fromEntries(lineHits),
        `${relative} lines`,
      );
      const functionMap: Record<string, unknown> = object(
        record.fnMap,
        `${relative} functionMap`,
      );
      const functionHits: Record<string, unknown> = object(
        record.f,
        `${relative} function hits`,
      );
      exactKeys(functionMap, functionHits, `${relative} functions`);
      addHits(accumulator.functions, functionHits, `${relative} functions`);
      const branchMap: Record<string, unknown> = object(
        record.branchMap,
        `${relative} branchMap`,
      );
      const branchHits: Record<string, unknown> = object(
        record.b,
        `${relative} branch hits`,
      );
      exactKeys(branchMap, branchHits, `${relative} branches`);
      for (const [id, hits] of Object.entries(branchHits)) {
        if (!Array.isArray(hits))
          throw new Error(`${relative} branch ${id} hits must be an array.`);
        const branch: Record<string, unknown> = object(
          branchMap[id],
          `${relative} branch ${id}`,
        );
        if (
          !Array.isArray(branch.locations) ||
          branch.locations.length !== hits.length
        )
          throw new Error(
            `${relative} branch ${id} locations and hits differ.`,
          );
        addHits(
          accumulator.branches,
          Object.fromEntries(hits.map((hit, index) => [String(index), hit])),
          `${relative} branch ${id}`,
        );
      }
    }
    return finish(workspace, absoluteArtifact, "istanbul", accumulator);
  }

  /** Reads LCOV records and binds every `SF` record to the workspace. */
  export function lcov(
    workspace: string,
    artifact: string,
  ): IEvidenceBenchmarkQualityGate.ICoverage {
    const absoluteArtifact: string = path.resolve(artifact);
    const accumulator: IAccumulator = empty(false);
    let current: string | null = null;
    let recordKeys: Set<string> = new Set();
    const lines: string[] = fs
      .readFileSync(absoluteArtifact, "utf8")
      .replaceAll("\r\n", "\n")
      .split("\n");
    for (const line of lines) {
      if (line.startsWith("SF:")) {
        if (current !== null)
          throw new Error(`LCOV record for ${current} has no end_of_record.`);
        current = sourcePath(workspace, line.slice(3));
        if (accumulator.files.has(current))
          throw new Error(
            `Coverage contains duplicate source path: ${current}.`,
          );
        accumulator.files.add(current);
        recordKeys = new Set();
      } else if (line === "end_of_record") {
        if (current === null)
          throw new Error("LCOV end_of_record has no active source.");
        current = null;
      } else if (line.startsWith("DA:")) {
        requireRecord(current, "DA");
        uniqueLcov(recordKeys, "DA", line, 0);
        addLcovHit(accumulator.lines, line, 2, 1);
      } else if (line.startsWith("FNDA:")) {
        requireRecord(current, "FNDA");
        uniqueLcov(recordKeys, "FNDA", line, 1);
        addLcovHit(accumulator.functions, line, 2, 0);
      } else if (line.startsWith("BRDA:")) {
        requireRecord(current, "BRDA");
        const fields: string[] = line.slice(5).split(",");
        if (fields.length !== 4)
          throw new Error(`Malformed LCOV BRDA line: ${line}.`);
        uniqueLcov(recordKeys, "BRDA", line, [0, 1, 2]);
        ++accumulator.branches.total;
        if (fields[3] !== "-" && integer(fields[3], "LCOV branch hits") > 0)
          ++accumulator.branches.covered;
      }
    }
    if (current !== null)
      throw new Error(`LCOV record for ${current} has no end_of_record.`);
    return finish(workspace, absoluteArtifact, "lcov", accumulator);
  }

  function finish(
    workspace: string,
    artifact: string,
    format: "istanbul" | "lcov",
    accumulator: IAccumulator,
  ): IEvidenceBenchmarkQualityGate.ICoverage {
    if (accumulator.files.size === 0)
      throw new Error(`${format} coverage contains no source records.`);
    const files: Map<string, Uint8Array> =
      EvidenceBenchmarkArtifactInventory.authoredFiles(workspace);
    return {
      schemaVersion: 1,
      format,
      sourceArtifact: portableRelative(workspace, artifact),
      sourceArtifactSha256: EvidenceBenchmarkHash.file(artifact),
      workspaceSourceTreeSha256:
        EvidenceBenchmarkArtifactInventory.treeSha256(files),
      files: accumulator.files.size,
      lines: finalize(accumulator.lines),
      branches: finalize(accumulator.branches),
      functions: finalize(accumulator.functions),
      statements:
        accumulator.statements === null
          ? null
          : finalize(accumulator.statements),
    };
  }

  function sourcePath(workspace: string, reported: string): string {
    const root: string = path.resolve(workspace);
    const absolute: string = path.isAbsolute(reported)
      ? path.resolve(reported)
      : path.resolve(root, reported);
    const relative: string = path
      .relative(root, absolute)
      .replaceAll("\\", "/");
    if (
      relative.length === 0 ||
      relative === ".." ||
      relative.startsWith("../") ||
      path.isAbsolute(relative)
    )
      throw new Error(`Coverage source escapes the workspace: ${reported}.`);
    const normalized: string = relative.normalize("NFC");
    const segments: string[] = normalized.split("/");
    if (
      segments.some((segment) =>
        ["node_modules", "coverage", "dist", "build", "lib", ".git"].includes(
          segment,
        ),
      )
    )
      throw new Error(
        `Coverage source is not authored product code: ${reported}.`,
      );
    const location: string = path.join(root, ...normalized.split("/"));
    if (!fs.existsSync(location) || !fs.statSync(location).isFile())
      throw new Error(`Coverage source does not exist: ${reported}.`);
    return normalized;
  }

  function portableRelative(workspace: string, artifact: string): string {
    const relative: string = path
      .relative(path.resolve(workspace), artifact)
      .replaceAll("\\", "/");
    return relative.length === 0 ? "." : relative.normalize("NFC");
  }

  function empty(statements: boolean): IAccumulator {
    return {
      files: new Set(),
      lines: { covered: 0, total: 0 },
      branches: { covered: 0, total: 0 },
      functions: { covered: 0, total: 0 },
      statements: statements ? { covered: 0, total: 0 } : null,
    };
  }

  function addHits(
    target: IMutableCount,
    hits: Record<string, unknown>,
    label: string,
  ): void {
    for (const [id, raw] of Object.entries(hits)) {
      const value: number = integer(raw, `${label} ${id}`);
      ++target.total;
      if (value > 0) ++target.covered;
    }
  }

  function addLcovHit(
    target: IMutableCount,
    line: string,
    expectedFields: number,
    hitIndex: number,
  ): void {
    const fields: string[] = line.slice(line.indexOf(":") + 1).split(",");
    if (fields.length !== expectedFields)
      throw new Error(`Malformed LCOV line: ${line}.`);
    const hits: number = integer(fields[hitIndex], "LCOV hits");
    ++target.total;
    if (hits > 0) ++target.covered;
  }

  function exactKeys(
    left: Record<string, unknown>,
    right: Record<string, unknown>,
    label: string,
  ): void {
    const leftKeys: string[] = Object.keys(left).sort();
    const rightKeys: string[] = Object.keys(right).sort();
    if (JSON.stringify(leftKeys) !== JSON.stringify(rightKeys))
      throw new Error(`${label} map and hit IDs differ.`);
  }

  function object(input: unknown, label: string): Record<string, unknown> {
    if (typeof input !== "object" || input === null || Array.isArray(input))
      throw new Error(`${label} must be an object.`);
    return input as Record<string, unknown>;
  }

  function integer(input: unknown, label: string): number {
    if (
      typeof input !== "number" &&
      !(typeof input === "string" && /^(?:0|[1-9]\d*)$/u.test(input))
    )
      throw new Error(`${label} must be a non-negative integer.`);
    const value: number = Number(input);
    if (!Number.isSafeInteger(value) || value < 0)
      throw new Error(`${label} must be a non-negative safe integer.`);
    return value;
  }

  function requireRecord(current: string | null, kind: string): void {
    if (current === null)
      throw new Error(`LCOV ${kind} appears outside a source record.`);
  }

  function uniqueLcov(
    keys: Set<string>,
    kind: string,
    line: string,
    identity: number | readonly number[],
  ): void {
    const fields: string[] = line.slice(line.indexOf(":") + 1).split(",");
    const indexes: readonly number[] =
      typeof identity === "number" ? [identity] : identity;
    const key: string = `${kind}:${indexes.map((index) => fields[index]).join(",")}`;
    if (keys.has(key)) throw new Error(`LCOV repeats record ${key}.`);
    keys.add(key);
  }

  function finalize(
    value: IMutableCount,
  ): IEvidenceBenchmarkQualityGate.ICount {
    return {
      ...value,
      ratio: value.total === 0 ? null : value.covered / value.total,
    };
  }
}
