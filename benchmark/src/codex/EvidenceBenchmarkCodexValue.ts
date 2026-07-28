import crypto from "node:crypto";

/** Strict JSON guards, hashing, and canonical serialization for runner records. */
export namespace EvidenceBenchmarkCodexValue {
  /** Tests whether an unknown value is a non-null, non-array JSON object. */
  export function isRecord(input: unknown): input is Record<string, unknown> {
    return typeof input === "object" && input !== null && !Array.isArray(input);
  }

  /** Requires a string field without coercing malformed protocol input. */
  export function string(input: unknown, label: string): string {
    if (typeof input !== "string") throw new Error(`${label} must be a string`);
    return input;
  }

  /** Requires a non-negative safe-integer protocol counter. */
  export function counter(
    input: unknown,
    label: string,
    fallback?: number,
  ): number {
    if (input === undefined && fallback !== undefined) return fallback;
    if (typeof input !== "number" || !Number.isSafeInteger(input) || input < 0)
      throw new Error(`${label} must be a non-negative safe integer`);
    return input;
  }

  /** Returns the lowercase SHA-256 of exact bytes or UTF-8 text. */
  export function sha256(input: string | NodeJS.ArrayBufferView): string {
    return crypto.createHash("sha256").update(input).digest("hex");
  }

  /**
   * Serializes one JSON value according to RFC 8785 canonical ordering and
   * ECMAScript primitive serialization.
   */
  export function canonicalJson(input: unknown): string {
    if (input === null) return "null";
    if (typeof input === "boolean" || typeof input === "string")
      return JSON.stringify(input);
    if (typeof input === "number") {
      if (!Number.isFinite(input))
        throw new Error("canonical JSON forbids non-finite numbers");
      return JSON.stringify(input);
    }
    if (Array.isArray(input)) return `[${input.map(canonicalJson).join(",")}]`;
    if (!isRecord(input))
      throw new Error(`canonical JSON cannot serialize ${typeof input}`);
    return `{${Object.keys(input)
      .sort()
      .map(
        (key: string): string =>
          `${JSON.stringify(key)}:${canonicalJson(input[key])}`,
      )
      .join(",")}}`;
  }
}
