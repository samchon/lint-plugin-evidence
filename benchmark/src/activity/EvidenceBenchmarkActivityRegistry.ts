import fs from "node:fs";
import path from "node:path";

import { EvidenceBenchmarkActivityCanonical } from "./EvidenceBenchmarkActivityCanonical.ts";

/** Fail-closed admission of the two provider/local contracts activity uses. */
export namespace EvidenceBenchmarkActivityRegistry {
  /** Exact schema identities copied into the immutable run binding. */
  export interface IBinding {
    /** Exact-byte identity of the provider output registry. */
    registrySha256: string;

    /** Exact-byte identity of the provider-facing rating schema. */
    activityRatingProviderSchemaSha256: string;

    /** Exact-byte identity of the local rating schema. */
    activityRatingLocalSchemaSha256: string;

    /** Exact-byte identity of the provider-facing adjudication schema. */
    adjudicationProviderSchemaSha256: string;

    /** Exact-byte identity of the local adjudication schema. */
    adjudicationLocalSchemaSha256: string;
  }

  /** Loads, hashes, and closes the activity registry contracts under one root. */
  export function admit(protocolRoot: string): IBinding {
    const root: string = realDirectory(protocolRoot);
    const registryLocation: string = inside(
      root,
      "provider-output-registry.json",
    );
    const registryBytes: Buffer = readRegular(registryLocation);
    const registry: unknown = JSON.parse(registryBytes.toString("utf8"));
    const record: Record<string, unknown> = object(registry, "registry");
    const allowlist: Set<string> = new Set(
      strings(record.providerKeywordAllowlist, "providerKeywordAllowlist"),
    );
    const contracts: readonly unknown[] = array(record.contracts, "contracts");
    const rating: Contract = contract(contracts, "activity-rating-block", [
      "activity-rater-a",
      "activity-rater-b",
    ]);
    const adjudication: Contract = contract(
      contracts,
      "fresh-ai-adjudication",
      ["activity-adjudicator"],
      true,
    );
    const ratingPair: Pair = admitPair(root, rating, allowlist);
    const adjudicationPair: Pair = admitPair(root, adjudication, allowlist);
    return {
      registrySha256: EvidenceBenchmarkActivityCanonical.sha256(registryBytes),
      activityRatingProviderSchemaSha256: ratingPair.providerSha256,
      activityRatingLocalSchemaSha256: ratingPair.localSha256,
      adjudicationProviderSchemaSha256: adjudicationPair.providerSha256,
      adjudicationLocalSchemaSha256: adjudicationPair.localSha256,
    };
  }

  interface Contract {
    providerSchema: string;
    providerBytes: number;
    providerSha256: string;
    localSchema: string;
    localBytes: number;
    localSha256: string;
  }

  interface Pair {
    providerSha256: string;
    localSha256: string;
  }

  function contract(
    entries: readonly unknown[],
    id: string,
    requiredTurns: readonly string[],
    allowAdditionalTurns: boolean = false,
  ): Contract {
    const matches: Record<string, unknown>[] = entries
      .map((entry, index) => object(entry, `contracts[${index}]`))
      .filter((entry) => entry.id === id);
    if (matches.length !== 1)
      throw new Error(`Registry requires exactly one ${id} contract.`);
    const entry: Record<string, unknown> = matches[0]!;
    const turns: string[] = strings(entry.turns, `${id}.turns`);
    const turnSet: Set<string> = new Set(turns);
    if (turnSet.size !== turns.length)
      throw new Error(`${id}.turns contains a duplicate.`);
    if (
      requiredTurns.some((turn) => !turnSet.has(turn)) ||
      (!allowAdditionalTurns && turnSet.size !== requiredTurns.length)
    )
      throw new Error(
        `${id}.turns does not admit the required isolated turns.`,
      );
    return {
      providerSchema: string(entry.providerSchema, `${id}.providerSchema`),
      providerBytes: integer(entry.providerBytes, `${id}.providerBytes`),
      providerSha256: digest(entry.providerSha256, `${id}.providerSha256`),
      localSchema: string(entry.localSchema, `${id}.localSchema`),
      localBytes: integer(entry.localBytes, `${id}.localBytes`),
      localSha256: digest(entry.localSha256, `${id}.localSha256`),
    };
  }

  function admitPair(
    root: string,
    entry: Contract,
    allowlist: ReadonlySet<string>,
  ): Pair {
    const provider: Buffer = schema(root, entry.providerSchema, new Set());
    exactFile("provider", provider, entry.providerBytes, entry.providerSha256);
    validateProviderKeywords(
      JSON.parse(provider.toString("utf8")),
      allowlist,
      "$",
    );
    const local: Buffer = schema(root, entry.localSchema, new Set());
    exactFile("local", local, entry.localBytes, entry.localSha256);
    return {
      providerSha256: entry.providerSha256,
      localSha256: entry.localSha256,
    };
  }

  function schema(
    root: string,
    relative: string,
    visited: Set<string>,
  ): Buffer {
    const location: string = inside(root, relative);
    const normalized: string = path
      .relative(root, location)
      .replaceAll("\\", "/");
    const bytes: Buffer = readRegular(location);
    if (visited.has(normalized)) return bytes;
    visited.add(normalized);
    const value: unknown = JSON.parse(bytes.toString("utf8"));
    walk(value, (reference) => {
      if (reference.startsWith("#")) return;
      if (/^[a-z][a-z0-9+.-]*:/i.test(reference))
        throw new Error(`Remote schema reference is forbidden: ${reference}`);
      const file: string = reference.split("#", 1)[0]!;
      if (file.length === 0) return;
      const child: string = path.posix.join(
        path.posix.dirname(normalized),
        file,
      );
      schema(root, child, visited);
    });
    return bytes;
  }

  function walk(input: unknown, reference: (value: string) => void): void {
    if (Array.isArray(input)) {
      for (const value of input) walk(value, reference);
      return;
    }
    if (typeof input !== "object" || input === null) return;
    for (const [key, value] of Object.entries(input)) {
      if (key === "$ref" && typeof value === "string") reference(value);
      else walk(value, reference);
    }
  }

  function validateProviderKeywords(
    input: unknown,
    allowlist: ReadonlySet<string>,
    pointer: string,
  ): void {
    if (Array.isArray(input)) {
      input.forEach((value, index) =>
        validateProviderKeywords(value, allowlist, `${pointer}/${index}`),
      );
      return;
    }
    if (typeof input !== "object" || input === null) return;
    for (const [key, value] of Object.entries(input)) {
      if (
        (pointer.endsWith("/properties") ||
          pointer.endsWith("/$defs") ||
          pointer.endsWith("/definitions")) === false &&
        !allowlist.has(key)
      )
        throw new Error(
          `Provider schema keyword ${JSON.stringify(key)} at ${pointer} is not allowlisted.`,
        );
      validateProviderKeywords(value, allowlist, `${pointer}/${key}`);
    }
  }

  function exactFile(
    role: string,
    bytes: Buffer,
    expectedBytes: number,
    expectedSha256: string,
  ): void {
    const actualSha256: string =
      EvidenceBenchmarkActivityCanonical.sha256(bytes);
    if (bytes.byteLength !== expectedBytes || actualSha256 !== expectedSha256)
      throw new Error(
        `${role} schema bytes or SHA-256 differ from the registry.`,
      );
  }

  function inside(root: string, relative: string): string {
    if (
      relative.length === 0 ||
      relative.includes("\\") ||
      relative.includes("\0") ||
      relative.startsWith("/") ||
      /^[a-z]:/i.test(relative) ||
      relative.split("/").some((segment) => segment === "." || segment === "..")
    )
      throw new Error(
        `Registry path is not a portable relative path: ${relative}`,
      );
    const resolved: string = path.resolve(root, ...relative.split("/"));
    if (!resolved.startsWith(`${root}${path.sep}`))
      throw new Error(`Registry path escapes its protocol root: ${relative}`);
    const real: string = fs.realpathSync(resolved);
    const comparable = (value: string): string =>
      process.platform === "win32" ? value.toLowerCase() : value;
    if (
      comparable(real) !== comparable(resolved) ||
      !comparable(real).startsWith(`${comparable(root)}${path.sep}`)
    )
      throw new Error(
        `Registry path traverses a symbolic-link boundary: ${relative}`,
      );
    return resolved;
  }

  function readRegular(location: string): Buffer {
    const stat: fs.Stats = fs.lstatSync(location);
    if (!stat.isFile() || stat.isSymbolicLink())
      throw new Error(
        `Registry closure must contain regular files: ${location}`,
      );
    return fs.readFileSync(location);
  }

  function realDirectory(location: string): string {
    const real: string = fs.realpathSync(location);
    if (!fs.statSync(real).isDirectory())
      throw new Error(`Protocol root is not a directory: ${location}`);
    return real;
  }

  function object(input: unknown, label: string): Record<string, unknown> {
    if (typeof input !== "object" || input === null || Array.isArray(input))
      throw new Error(`${label} must be an object.`);
    return input as Record<string, unknown>;
  }

  function array(input: unknown, label: string): readonly unknown[] {
    if (!Array.isArray(input)) throw new Error(`${label} must be an array.`);
    return input;
  }

  function strings(input: unknown, label: string): string[] {
    const values: readonly unknown[] = array(input, label);
    if (values.some((value) => typeof value !== "string"))
      throw new Error(`${label} must contain only strings.`);
    return values as string[];
  }

  function string(input: unknown, label: string): string {
    if (typeof input !== "string" || input.length === 0)
      throw new Error(`${label} must be a non-empty string.`);
    return input;
  }

  function integer(input: unknown, label: string): number {
    if (!Number.isSafeInteger(input) || (input as number) < 0)
      throw new Error(`${label} must be a nonnegative safe integer.`);
    return input as number;
  }

  function digest(input: unknown, label: string): string {
    const value: string = string(input, label);
    if (!/^[a-f0-9]{64}$/.test(value))
      throw new Error(`${label} must be a lowercase SHA-256.`);
    return value;
  }
}
