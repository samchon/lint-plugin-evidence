import crypto from "node:crypto";
import childProcess from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

import {
  Ajv2020,
  type ErrorObject,
  type ValidateFunction,
} from "ajv/dist/2020.js";
import type { FormatsPlugin } from "ajv-formats";

/** Offline JSON parsing, schema validation, and provider-schema preflight. */
export namespace EvidenceBenchmarkProtocolValidator {
  const require: NodeJS.Require = createRequire(import.meta.url);
  const addFormats: FormatsPlugin = require("ajv-formats") as FormatsPlugin;

  /** One stable machine-readable schema diagnostic. */
  export interface IDiagnostic {
    /** RFC 6901-style path to the invalid artifact value. */
    instancePath: string;

    /** Schema location that rejected the value. */
    schemaPath: string;

    /** JSON Schema keyword that failed. */
    keyword: string;

    /** Stable Ajv failure message. */
    message: string;

    /** Canonical JSON serialization of keyword parameters. */
    params: string;
  }

  /** Validation error with deterministically ordered diagnostics. */
  export class ValidationError extends Error {
    /** Deterministically ordered machine-readable failures. */
    public readonly diagnostics: readonly IDiagnostic[];

    /** Creates one stable aggregate validation failure. */
    public constructor(label: string, diagnostics: readonly IDiagnostic[]) {
      super(
        `${label} failed protocol validation:\n${diagnostics
          .map(
            (entry) =>
              `${entry.instancePath || "/"} ${entry.keyword} ${entry.message} (${entry.schemaPath})`,
          )
          .join("\n")}`,
      );
      this.name = "EvidenceBenchmarkProtocolValidationError";
      this.diagnostics = diagnostics;
    }
  }

  /** Parses exact JSON text and rejects duplicate object member names. */
  export function parse(text: string, label: string): unknown {
    return new StrictJsonParser(text, label).parse();
  }

  /** Fatally decodes exact UTF-8 bytes before strict JSON parsing. */
  export function parseBytes(bytes: Uint8Array, label: string): unknown {
    let text: string;
    try {
      text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch (error) {
      throw new SyntaxError(
        `${label} is not UTF-8: ${
          error instanceof Error ? error.message : String(error)
        }.`,
      );
    }
    return parse(text, label);
  }

  /** Parses and validates exact artifact text against one protocol schema. */
  export function validateText<T>(
    protocolRoot: string,
    schemaRelativePath: string,
    text: string,
    label: string = schemaRelativePath,
  ): T {
    return validateValue<T>(
      protocolRoot,
      schemaRelativePath,
      parse(text, label),
      label,
    );
  }

  /** Fatally decodes and validates exact artifact bytes. */
  export function validateBytes<T>(
    protocolRoot: string,
    schemaRelativePath: string,
    bytes: Uint8Array,
    label: string = schemaRelativePath,
  ): T {
    return validateValue<T>(
      protocolRoot,
      schemaRelativePath,
      parseBytes(bytes, label),
      label,
    );
  }

  /** Validates an already parsed artifact against one protocol schema. */
  export function validateValue<T>(
    protocolRoot: string,
    schemaRelativePath: string,
    value: unknown,
    label: string = schemaRelativePath,
  ): T {
    const registry: ISchemaRegistry = loadSchemas(protocolRoot);
    const schemaPath: string = resolveSchemaPath(
      registry.schemaRoot,
      schemaRelativePath,
    );
    const schema = registry.byPath.get(schemaPath);
    if (schema === undefined)
      throw new Error(
        `${label} names an untracked protocol schema: ${schemaRelativePath}.`,
      );
    const validate: ValidateFunction =
      registry.ajv.getSchema(schema.id) ?? registry.ajv.compile(schema.value);
    if (!validate(value))
      throw new ValidationError(label, diagnostics(validate.errors ?? []));
    return value as T;
  }

  /**
   * Proves that every registered provider schema is byte-pinned, offline, and
   * limited to the provider keyword allowlist.
   */
  export function preflightProviderRegistry(protocolRoot: string): void {
    const root: string = path.resolve(protocolRoot);
    const registryPath: string = path.join(
      root,
      "provider-output-registry.json",
    );
    const registry = record(
      parseBytes(fs.readFileSync(registryPath), registryPath),
      "provider output registry",
    );
    const allowlist = stringArray(
      registry.providerKeywordAllowlist,
      "provider keyword allowlist",
    );
    if (new Set(allowlist).size !== allowlist.length)
      throw new Error("Provider keyword allowlist contains duplicates.");
    const allowed: ReadonlySet<string> = new Set(allowlist);
    const contracts = array(registry.contracts, "provider contracts");
    const schemas: ISchemaRegistry = loadSchemas(root);
    validateLoaded(
      schemas,
      "provider-output-registry.schema.json",
      registry,
      "provider output registry",
    );
    const seenIds: Set<string> = new Set();
    for (const [index, input] of contracts.entries()) {
      const contract = record(input, `provider contract ${index}`);
      const id: string = nonblank(contract.id, `provider contract ${index} id`);
      if (seenIds.has(id))
        throw new Error(`Provider contract id is duplicated: ${id}.`);
      seenIds.add(id);
      const providerRelative: string = nonblank(
        contract.providerSchema,
        `${id} provider schema`,
      );
      const providerPath: string = resolveSchemaPath(
        schemas.schemaRoot,
        providerRelative,
      );
      const schema = schemas.byPath.get(providerPath);
      if (schema === undefined)
        throw new Error(
          `${id} provider schema is not tracked: ${providerRelative}.`,
        );
      const bytes: Buffer = fs.readFileSync(providerPath);
      if (
        contract.providerBytes !== bytes.byteLength ||
        contract.providerSha256 !== sha256(bytes)
      )
        throw new Error(`${id} provider schema byte pin drifted.`);
      inspectProviderSchema(
        schema.value,
        schema.id,
        allowed,
        schemas,
        new Set(),
      );
      const localRelative: string = nonblank(
        contract.localSchema,
        `${id} local schema`,
      );
      const localPath: string = resolveSchemaPath(
        schemas.schemaRoot,
        localRelative,
      );
      const local = schemas.byPath.get(localPath);
      if (local === undefined)
        throw new Error(`${id} local schema is not tracked: ${localRelative}.`);
      const localBytes: Buffer = fs.readFileSync(localPath);
      if (
        contract.localBytes !== localBytes.byteLength ||
        contract.localSha256 !== sha256(localBytes)
      )
        throw new Error(`${id} local schema byte pin drifted.`);
      schemas.ajv.getSchema(local.id) ?? schemas.ajv.compile(local.value);
    }
  }

  interface ILoadedSchema {
    path: string;
    id: string;
    value: Record<string, unknown>;
  }

  interface ISchemaRegistry {
    schemaRoot: string;
    byPath: ReadonlyMap<string, ILoadedSchema>;
    byId: ReadonlyMap<string, ILoadedSchema>;
    ajv: Ajv2020;
  }

  function loadSchemas(protocolRoot: string): ISchemaRegistry {
    const schemaRoot: string = path.join(path.resolve(protocolRoot), "schema");
    const files: string[] = fs
      .readdirSync(schemaRoot, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith(".schema.json"))
      .map((entry) => path.join(schemaRoot, entry.name))
      .sort((left, right) => Buffer.from(left).compare(Buffer.from(right)));
    assertTrackedSchemaInventory(protocolRoot, schemaRoot, files);
    const loaded: ILoadedSchema[] = files.map((file) => {
      const value = record(
        parseBytes(fs.readFileSync(file), file),
        `${file} schema`,
      );
      return {
        path: path.resolve(file),
        id: nonblank(value.$id, `${file} $id`),
        value,
      };
    });
    const byPath: Map<string, ILoadedSchema> = new Map();
    const byId: Map<string, ILoadedSchema> = new Map();
    for (const schema of loaded) {
      if (byId.has(schema.id))
        throw new Error(`Protocol schema $id is duplicated: ${schema.id}.`);
      byPath.set(schema.path, schema);
      byId.set(schema.id, schema);
    }
    for (const schema of loaded)
      inspectReferences(schema.value, schema.id, byId, new Set());
    const ajv = new Ajv2020({
      allErrors: true,
      allowUnionTypes: true,
      strictSchema: true,
      strictTypes: false,
      strictTuples: false,
      validateFormats: true,
    });
    addFormats(ajv);
    for (const schema of loaded) ajv.addSchema(schema.value, schema.id);
    for (const schema of loaded)
      if (ajv.getSchema(schema.id) === undefined)
        throw new Error(`Protocol schema did not compile: ${schema.path}.`);
    return { schemaRoot, byPath, byId, ajv };
  }

  function assertTrackedSchemaInventory(
    protocolRoot: string,
    schemaRoot: string,
    files: readonly string[],
  ): void {
    const repository: string = fs.realpathSync.native(
      childProcess
        .execFileSync(
          "git",
          ["-C", path.resolve(protocolRoot), "rev-parse", "--show-toplevel"],
          { encoding: "utf8", windowsHide: true },
        )
        .trim(),
    );
    const canonicalSchemaRoot: string = fs.realpathSync.native(schemaRoot);
    const relativeRoot: string = path
      .relative(repository, canonicalSchemaRoot)
      .split(path.sep)
      .join("/");
    if (
      relativeRoot.length === 0 ||
      relativeRoot === ".." ||
      relativeRoot.startsWith("../") ||
      path.isAbsolute(relativeRoot)
    )
      throw new Error(
        `Protocol schema root escapes its Git repository: ${canonicalSchemaRoot}.`,
      );
    const tracked: string[] = childProcess
      .execFileSync(
        "git",
        ["-C", repository, "ls-files", "-z", "--", relativeRoot],
        { encoding: "utf8", windowsHide: true },
      )
      .split("\0")
      .filter(
        (entry) =>
          entry.length !== 0 &&
          path.posix.dirname(entry) === relativeRoot &&
          entry.endsWith(".schema.json"),
      )
      .sort(compareUtf8);
    const present: string[] = files
      .map((file) => `${relativeRoot}/${path.basename(file)}`)
      .sort(compareUtf8);
    if (
      tracked.length === 0 ||
      JSON.stringify(tracked) !== JSON.stringify(present)
    )
      throw new Error(
        `Protocol schema inventory differs from Git: tracked ${tracked.length}, present ${present.length}.`,
      );
  }

  function validateLoaded(
    registry: ISchemaRegistry,
    schemaRelativePath: string,
    value: unknown,
    label: string,
  ): void {
    const schemaPath: string = resolveSchemaPath(
      registry.schemaRoot,
      schemaRelativePath,
    );
    const schema = registry.byPath.get(schemaPath);
    if (schema === undefined)
      throw new Error(
        `${label} names an untracked protocol schema: ${schemaRelativePath}.`,
      );
    const validate: ValidateFunction | undefined = registry.ajv.getSchema(
      schema.id,
    );
    if (validate === undefined)
      throw new Error(
        `${label} schema did not compile: ${schemaRelativePath}.`,
      );
    if (!validate(value))
      throw new ValidationError(label, diagnostics(validate.errors ?? []));
  }

  function inspectReferences(
    value: unknown,
    baseId: string,
    byId: ReadonlyMap<string, ILoadedSchema>,
    visited: Set<string>,
  ): void {
    if (Array.isArray(value)) {
      for (const item of value) inspectReferences(item, baseId, byId, visited);
      return;
    }
    if (!isRecord(value)) return;
    for (const [key, child] of Object.entries(value)) {
      if (key !== "$ref") {
        inspectReferences(child, baseId, byId, visited);
        continue;
      }
      const reference: string = nonblank(child, `${baseId} $ref`);
      if (reference.startsWith("#")) continue;
      const resolved: URL = new URL(reference, baseId);
      resolved.hash = "";
      const target: string = resolved.href;
      const schema = byId.get(target);
      if (schema === undefined)
        throw new Error(
          `Protocol schema reference escapes the offline registry: ${reference} from ${baseId}.`,
        );
      const edge: string = `${baseId}\0${target}`;
      if (visited.has(edge)) continue;
      visited.add(edge);
      inspectReferences(schema.value, schema.id, byId, visited);
    }
  }

  function inspectProviderSchema(
    value: unknown,
    baseId: string,
    allowed: ReadonlySet<string>,
    schemas: ISchemaRegistry,
    visited: Set<string>,
  ): void {
    if (!isRecord(value))
      throw new Error(`Provider schema node must be an object: ${baseId}.`);
    for (const [key, child] of Object.entries(value)) {
      if (!allowed.has(key))
        throw new Error(
          `Provider schema ${baseId} uses unsupported keyword ${key}.`,
        );
      if (key === "properties") {
        const properties = record(child, `${baseId} properties`);
        for (const property of Object.values(properties))
          inspectProviderSchema(property, baseId, allowed, schemas, visited);
        continue;
      }
      if (key === "items" || key === "additionalProperties") {
        if (isRecord(child))
          inspectProviderSchema(child, baseId, allowed, schemas, visited);
        else if (typeof child !== "boolean")
          throw new Error(
            `Provider schema ${baseId} has an invalid ${key} value.`,
          );
        continue;
      }
      if (key !== "$ref") {
        continue;
      }
      const reference: string = nonblank(child, `${baseId} provider $ref`);
      if (reference.startsWith("#")) {
        inspectProviderSchema(
          resolveFragment(schemas.byId.get(baseId)?.value, reference, baseId),
          baseId,
          allowed,
          schemas,
          visited,
        );
        continue;
      }
      const resolved: URL = new URL(reference, baseId);
      const fragment: string = resolved.hash;
      resolved.hash = "";
      const target = schemas.byId.get(resolved.href);
      if (target === undefined)
        throw new Error(
          `Provider schema reference escapes the offline registry: ${reference} from ${baseId}.`,
        );
      const edge: string = `${baseId}\0${resolved.href}${fragment}`;
      if (visited.has(edge)) continue;
      visited.add(edge);
      inspectProviderSchema(
        resolveFragment(target.value, fragment || "#", target.id),
        target.id,
        allowed,
        schemas,
        visited,
      );
    }
  }

  function resolveFragment(
    root: Record<string, unknown> | undefined,
    fragment: string,
    label: string,
  ): unknown {
    if (root === undefined)
      throw new Error(`Provider schema is absent from registry: ${label}.`);
    if (fragment === "#") return root;
    if (!fragment.startsWith("#/"))
      throw new Error(`Unsupported provider schema fragment: ${fragment}.`);
    return fragment
      .slice(2)
      .split("/")
      .map((token) => token.replaceAll("~1", "/").replaceAll("~0", "~"))
      .reduce<unknown>((current, token) => {
        const object = record(current, `${label}${fragment}`);
        if (!Object.hasOwn(object, token))
          throw new Error(
            `Provider schema fragment does not exist: ${label}${fragment}.`,
          );
        return object[token];
      }, root);
  }

  function resolveSchemaPath(root: string, relative: string): string {
    if (
      path.isAbsolute(relative) ||
      relative.includes("\\") ||
      relative.includes("\0")
    )
      throw new Error(`Protocol schema path is not canonical: ${relative}.`);
    const normalized: string = relative.startsWith("schema/")
      ? relative.slice("schema/".length)
      : relative;
    if (
      normalized.length === 0 ||
      normalized
        .split("/")
        .some(
          (segment) => segment === "" || segment === "." || segment === "..",
        )
    )
      throw new Error(`Protocol schema path is not canonical: ${relative}.`);
    const resolved: string = path.resolve(root, ...normalized.split("/"));
    const prefix: string = `${path.resolve(root)}${path.sep}`;
    if (!resolved.startsWith(prefix))
      throw new Error(`Protocol schema path escapes its root: ${relative}.`);
    return resolved;
  }

  function diagnostics(errors: readonly ErrorObject[]): IDiagnostic[] {
    return errors
      .map((error) => ({
        instancePath: error.instancePath,
        schemaPath: error.schemaPath,
        keyword: error.keyword,
        message: error.message ?? "schema assertion failed",
        params: canonical(error.params),
      }))
      .sort((left, right) =>
        compareUtf8(
          [
            left.instancePath,
            left.schemaPath,
            left.keyword,
            left.message,
            left.params,
          ].join("\0"),
          [
            right.instancePath,
            right.schemaPath,
            right.keyword,
            right.message,
            right.params,
          ].join("\0"),
        ),
      );
  }

  function canonical(value: unknown): string {
    if (value === null || typeof value !== "object")
      return JSON.stringify(value);
    if (Array.isArray(value))
      return `[${value.map((entry) => canonical(entry)).join(",")}]`;
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => compareUtf8(left, right))
      .map(([key, child]) => `${JSON.stringify(key)}:${canonical(child)}`)
      .join(",")}}`;
  }

  function compareUtf8(left: string, right: string): number {
    return Buffer.compare(
      Buffer.from(left, "utf8"),
      Buffer.from(right, "utf8"),
    );
  }

  function sha256(bytes: Uint8Array): string {
    return crypto.createHash("sha256").update(bytes).digest("hex");
  }

  function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }

  function record(value: unknown, label: string): Record<string, unknown> {
    if (!isRecord(value)) throw new Error(`${label} must be an object.`);
    return value;
  }

  function array(value: unknown, label: string): unknown[] {
    if (!Array.isArray(value)) throw new Error(`${label} must be an array.`);
    return value;
  }

  function stringArray(value: unknown, label: string): string[] {
    return array(value, label).map((entry, index) =>
      nonblank(entry, `${label} ${index}`),
    );
  }

  function nonblank(value: unknown, label: string): string {
    if (
      typeof value !== "string" ||
      value.length === 0 ||
      value !== value.trim()
    )
      throw new Error(`${label} must be a nonblank string.`);
    return value;
  }

  class StrictJsonParser {
    private offset: number = 0;

    public constructor(
      private readonly source: string,
      private readonly label: string,
    ) {}

    public parse(): unknown {
      if (this.source.charCodeAt(0) === 0xfeff)
        this.fail("UTF-8 BOM is forbidden");
      this.whitespace();
      const value: unknown = this.value();
      this.whitespace();
      if (this.offset !== this.source.length)
        this.fail("unexpected trailing token");
      return value;
    }

    private value(): unknown {
      const token: string | undefined = this.source[this.offset];
      if (token === "{") return this.object();
      if (token === "[") return this.list();
      if (token === '"') return this.string();
      if (
        token === "-" ||
        (token !== undefined && token >= "0" && token <= "9")
      )
        return this.number();
      if (this.source.startsWith("true", this.offset)) {
        this.offset += 4;
        return true;
      }
      if (this.source.startsWith("false", this.offset)) {
        this.offset += 5;
        return false;
      }
      if (this.source.startsWith("null", this.offset)) {
        this.offset += 4;
        return null;
      }
      this.fail("expected a JSON value");
    }

    private object(): Record<string, unknown> {
      ++this.offset;
      this.whitespace();
      const entries: Array<[string, unknown]> = [];
      const keys: Set<string> = new Set();
      if (this.source[this.offset] === "}") {
        ++this.offset;
        return {};
      }
      while (true) {
        if (this.source[this.offset] !== '"')
          this.fail("expected an object member name");
        const key: string = this.string();
        if (keys.has(key))
          this.fail(`duplicate object member ${JSON.stringify(key)}`);
        keys.add(key);
        this.whitespace();
        if (this.source[this.offset] !== ":")
          this.fail("expected ':' after object member name");
        ++this.offset;
        this.whitespace();
        entries.push([key, this.value()]);
        this.whitespace();
        const separator: string | undefined = this.source[this.offset];
        if (separator === "}") {
          ++this.offset;
          return Object.fromEntries(entries);
        }
        if (separator !== ",") this.fail("expected ',' or '}' in object");
        ++this.offset;
        this.whitespace();
      }
    }

    private list(): unknown[] {
      ++this.offset;
      this.whitespace();
      const values: unknown[] = [];
      if (this.source[this.offset] === "]") {
        ++this.offset;
        return values;
      }
      while (true) {
        values.push(this.value());
        this.whitespace();
        const separator: string | undefined = this.source[this.offset];
        if (separator === "]") {
          ++this.offset;
          return values;
        }
        if (separator !== ",") this.fail("expected ',' or ']' in array");
        ++this.offset;
        this.whitespace();
      }
    }

    private string(): string {
      const start: number = this.offset;
      ++this.offset;
      let escaped: boolean = false;
      while (this.offset < this.source.length) {
        const code: number = this.source.charCodeAt(this.offset);
        if (!escaped && code === 0x22) {
          ++this.offset;
          try {
            return JSON.parse(this.source.slice(start, this.offset)) as string;
          } catch {
            this.fail("invalid JSON string");
          }
        }
        if (!escaped && code < 0x20)
          this.fail("unescaped control character in string");
        if (!escaped && code === 0x5c) escaped = true;
        else escaped = false;
        ++this.offset;
      }
      this.fail("unterminated JSON string");
    }

    private number(): number {
      const rest: string = this.source.slice(this.offset);
      const match: RegExpMatchArray | null = rest.match(
        /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/,
      );
      if (match === null) this.fail("invalid JSON number");
      this.offset += match[0].length;
      const value: number = Number(match[0]);
      if (!Number.isFinite(value)) this.fail("non-finite JSON number");
      return value;
    }

    private whitespace(): void {
      while (
        this.offset < this.source.length &&
        [0x20, 0x09, 0x0a, 0x0d].includes(this.source.charCodeAt(this.offset))
      )
        ++this.offset;
    }

    private fail(message: string): never {
      throw new SyntaxError(
        `${this.label} is not strict JSON at offset ${this.offset}: ${message}.`,
      );
    }
  }
}
