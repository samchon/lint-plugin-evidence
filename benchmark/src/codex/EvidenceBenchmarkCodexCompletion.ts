import type { IEvidenceBenchmarkCodexRun } from "../structures/IEvidenceBenchmarkCodexRun.ts";
import { EvidenceBenchmarkCodexValue } from "./EvidenceBenchmarkCodexValue.ts";

/**
 * Provider-compatible completion schema admission and stricter local outcome
 * adjudication.
 */
export namespace EvidenceBenchmarkCodexCompletion {
  /** Frozen local semantic contract applied after provider schema validation. */
  export const LOCAL_VALIDATION_CONTRACT =
    "v1:exact-keys;summary-nonblank;unfinished-nonblank-unique;" +
    "complete-empty;interrupted-nonempty";

  /** Returns the deliberately small Structured Outputs provider subset. */
  export function providerSchema(): Readonly<Record<string, unknown>> {
    return {
      type: "object",
      properties: {
        outcome: {
          type: "string",
          enum: ["complete", "interrupted"],
        },
        summary: { type: "string" },
        unfinished: {
          type: "array",
          items: { type: "string" },
        },
      },
      required: ["outcome", "summary", "unfinished"],
      additionalProperties: false,
    };
  }

  /** Returns the manifest pin for the stricter local semantic contract. */
  export function localValidationSha256(): string {
    return EvidenceBenchmarkCodexValue.sha256(LOCAL_VALIDATION_CONTRACT);
  }

  /**
   * Rejects unsupported or weakened provider-facing schemas before a paid
   * process can start.
   */
  export function admitProviderSchema(
    schema: Readonly<Record<string, unknown>>,
  ): void {
    if (
      EvidenceBenchmarkCodexValue.canonicalJson(schema) !==
      EvidenceBenchmarkCodexValue.canonicalJson(providerSchema())
    )
      throw new Error(
        "generation outcome schema must equal the frozen provider-compatible subset",
      );
  }

  /** Parses final assistant JSON and applies all cross-field local semantics. */
  export function parse(
    text: string,
  ): IEvidenceBenchmarkCodexRun.IGenerationOutcome {
    let input: unknown;
    try {
      input = JSON.parse(text);
    } catch (error) {
      throw new Error(
        `generation outcome is not JSON: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
    if (!EvidenceBenchmarkCodexValue.isRecord(input))
      throw new Error("generation outcome must be an object");
    const keys = Object.keys(input).sort();
    if (
      EvidenceBenchmarkCodexValue.canonicalJson(keys) !==
      EvidenceBenchmarkCodexValue.canonicalJson([
        "outcome",
        "summary",
        "unfinished",
      ])
    )
      throw new Error("generation outcome has missing or additional keys");
    if (input.outcome !== "complete" && input.outcome !== "interrupted")
      throw new Error("generation outcome value is invalid");
    if (typeof input.summary !== "string" || input.summary.trim().length === 0)
      throw new Error("generation summary must be nonblank");
    if (
      !Array.isArray(input.unfinished) ||
      input.unfinished.some(
        (entry): boolean =>
          typeof entry !== "string" || entry.trim().length === 0,
      )
    )
      throw new Error("unfinished must contain only nonblank strings");
    if (new Set(input.unfinished).size !== input.unfinished.length)
      throw new Error("unfinished entries must be unique");
    if (input.outcome === "complete" && input.unfinished.length !== 0)
      throw new Error("complete outcome requires an empty unfinished list");
    if (input.outcome === "interrupted" && input.unfinished.length === 0)
      throw new Error(
        "interrupted outcome requires at least one unfinished item",
      );
    return {
      outcome: input.outcome,
      summary: input.summary,
      unfinished: [...input.unfinished],
    };
  }
}
