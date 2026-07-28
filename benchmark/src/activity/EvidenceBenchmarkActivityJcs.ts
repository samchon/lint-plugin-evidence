import crypto from "node:crypto";

/** RFC 8785 JSON Canonicalization Scheme support for runner event hashes. */
export namespace EvidenceBenchmarkActivityJcs {
  /** Returns the event-chain SHA-256 after omitting `eventSha256`. */
  export function eventSha256(input: Record<string, unknown>): string {
    const { eventSha256: _ignored, ...body } = input;
    return crypto.createHash("sha256").update(stringify(body)).digest("hex");
  }

  /** Encodes one parsed I-JSON value according to RFC 8785. */
  export function stringify(input: unknown): string {
    return encode(input);
  }

  function encode(input: unknown): string {
    if (input === null || typeof input === "boolean")
      return JSON.stringify(input);
    if (typeof input === "string") {
      wellFormed(input);
      return JSON.stringify(input);
    }
    if (typeof input === "number") {
      if (!Number.isFinite(input))
        throw new Error("RFC 8785 input rejects non-finite numbers.");
      return JSON.stringify(input);
    }
    if (Array.isArray(input)) return `[${input.map(encode).join(",")}]`;
    if (typeof input !== "object")
      throw new Error(`RFC 8785 input rejects ${typeof input} values.`);
    return `{${Object.entries(input as Record<string, unknown>)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([key, value]) => {
        wellFormed(key);
        return `${JSON.stringify(key)}:${encode(value)}`;
      })
      .join(",")}}`;
  }

  function wellFormed(input: string): void {
    for (let index: number = 0; index < input.length; ++index) {
      const unit: number = input.charCodeAt(index);
      if (unit >= 0xd800 && unit <= 0xdbff) {
        const next: number = input.charCodeAt(index + 1);
        if (next < 0xdc00 || next > 0xdfff)
          throw new Error("RFC 8785 input rejects an unpaired high surrogate.");
        ++index;
      } else if (unit >= 0xdc00 && unit <= 0xdfff)
        throw new Error("RFC 8785 input rejects an unpaired low surrogate.");
    }
  }
}
