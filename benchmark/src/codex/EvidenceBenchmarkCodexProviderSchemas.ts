import { EvidenceBenchmarkCodexValue } from "./EvidenceBenchmarkCodexValue.ts";

/**
 * Recursive provider-schema admission with separately pinned local semantic
 * contracts.
 */
export namespace EvidenceBenchmarkCodexProviderSchemas {
  /** Every generation class that can reach `turn/start.outputSchema`. */
  export type Name = "generation_outcome" | "finding" | "verification";

  /** One provider-compatible schema paired with stricter local semantics. */
  export interface IEntry {
    /** Schema sent to the provider. */
    provider: Readonly<Record<string, unknown>>;

    /** SHA-256 of the provider schema bytes in canonical JSON. */
    providerSha256: string;

    /** SHA-256 of the strict local validator/schema. */
    localSha256: string;
  }

  /** Complete registry and transitive external reference closure. */
  export interface IRegistry {
    /** Exact three provider-facing turn schema classes. */
    schemas: Record<Name, IEntry>;

    /** External `$ref` values keyed by exact reference string. */
    references: Record<string, Readonly<Record<string, unknown>>>;
  }

  /** Rejects any unsupported keyword, missing ref, cycle drift, or pin drift. */
  export function admit(registry: IRegistry): void {
    const names: Name[] = ["generation_outcome", "finding", "verification"];
    if (
      EvidenceBenchmarkCodexValue.canonicalJson(
        Object.keys(registry.schemas).sort(),
      ) !== EvidenceBenchmarkCodexValue.canonicalJson([...names].sort())
    )
      throw new Error(
        "provider schema registry must contain exactly three classes",
      );
    for (const name of names) {
      const entry = registry.schemas[name];
      if (
        EvidenceBenchmarkCodexValue.sha256(
          EvidenceBenchmarkCodexValue.canonicalJson(entry.provider),
        ) !== entry.providerSha256 ||
        !/^[0-9a-f]{64}$/.test(entry.localSha256)
      )
        throw new Error(`${name} provider or local schema pin is invalid`);
      validateSchema(entry.provider, registry.references, new Set<string>());
    }
  }

  function validateSchema(
    schema: Readonly<Record<string, unknown>>,
    references: IRegistry["references"],
    resolving: Set<string>,
  ): void {
    const allowed = new Set([
      "$schema",
      "$id",
      "$ref",
      "title",
      "type",
      "additionalProperties",
      "required",
      "properties",
      "enum",
      "items",
    ]);
    for (const key of Object.keys(schema))
      if (!allowed.has(key))
        throw new Error(`provider schema uses unsupported keyword ${key}`);
    if (schema.$ref !== undefined) {
      if (typeof schema.$ref !== "string")
        throw new Error("provider schema $ref must be a string");
      const target = references[schema.$ref];
      if (target === undefined)
        throw new Error(`provider schema reference is missing: ${schema.$ref}`);
      if (!resolving.has(schema.$ref)) {
        const next = new Set(resolving);
        next.add(schema.$ref);
        validateSchema(target, references, next);
      }
    }
    if (schema.properties !== undefined) {
      if (!EvidenceBenchmarkCodexValue.isRecord(schema.properties))
        throw new Error("provider schema properties must be an object");
      for (const child of Object.values(schema.properties)) {
        if (!EvidenceBenchmarkCodexValue.isRecord(child))
          throw new Error("provider schema property must be a schema object");
        validateSchema(child, references, new Set(resolving));
      }
    }
    if (schema.items !== undefined) {
      if (!EvidenceBenchmarkCodexValue.isRecord(schema.items))
        throw new Error("provider schema items must be one schema object");
      validateSchema(schema.items, references, new Set(resolving));
    }
    if (EvidenceBenchmarkCodexValue.isRecord(schema.additionalProperties))
      validateSchema(
        schema.additionalProperties,
        references,
        new Set(resolving),
      );
    else if (
      schema.additionalProperties !== undefined &&
      typeof schema.additionalProperties !== "boolean"
    )
      throw new Error("additionalProperties must be boolean or a schema");
    if (
      schema.required !== undefined &&
      (!Array.isArray(schema.required) ||
        schema.required.some((entry): boolean => typeof entry !== "string"))
    )
      throw new Error("provider schema required must contain strings");
    if (
      schema.enum !== undefined &&
      (!Array.isArray(schema.enum) ||
        schema.enum.some(
          (entry): boolean =>
            entry !== null &&
            !["string", "number", "boolean"].includes(typeof entry),
        ))
    )
      throw new Error("provider schema enum must contain primitive values");
  }
}
