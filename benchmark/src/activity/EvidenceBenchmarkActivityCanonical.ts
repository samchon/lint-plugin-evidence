import crypto from "node:crypto";

/** Canonical bytes and digests used by immutable activity artifacts. */
export namespace EvidenceBenchmarkActivityCanonical {
  /** Returns SHA-256 over exact bytes or UTF-8 text. */
  export function sha256(input: Uint8Array | string): string {
    return crypto.createHash("sha256").update(input).digest("hex");
  }

  /**
   * Encodes a JSON-compatible value with UTF-8 bytewise object-key ordering.
   *
   * This is a private benchmark artifact encoding, not a claim of RFC 8785.
   * Values outside the JSON data model fail instead of being coerced.
   */
  export function stringify(input: unknown): string {
    return encode(input);
  }

  /** Returns SHA-256 over one canonical JSON value plus an LF terminator. */
  export function object(input: unknown): string {
    return sha256(`${stringify(input)}\n`);
  }

  function compareUtf8(left: string, right: string): number {
    return Buffer.compare(
      Buffer.from(left, "utf8"),
      Buffer.from(right, "utf8"),
    );
  }

  function encode(input: unknown): string {
    if (
      input === null ||
      typeof input === "boolean" ||
      typeof input === "string"
    )
      return JSON.stringify(input);
    if (typeof input === "number") {
      if (!Number.isFinite(input))
        throw new Error("Canonical activity JSON rejects non-finite numbers.");
      return JSON.stringify(input);
    }
    if (Array.isArray(input)) return `[${input.map(encode).join(",")}]`;
    if (typeof input !== "object")
      throw new Error(
        `Canonical activity JSON rejects ${typeof input} values.`,
      );
    const entries: [string, unknown][] = Object.entries(
      input as Record<string, unknown>,
    ).sort(([left], [right]) => compareUtf8(left, right));
    return `{${entries
      .map(([key, value]) => `${JSON.stringify(key)}:${encode(value)}`)
      .join(",")}}`;
  }
}
