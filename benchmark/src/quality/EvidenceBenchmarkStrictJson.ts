import { createRequire } from "node:module";
import fs from "node:fs";

/** Rejects invalid UTF-8, BOMs, duplicate keys, and malformed JSON. */
export namespace EvidenceBenchmarkStrictJson {
  const validator = createRequire(import.meta.url)(
    "json-dup-key-validator",
  ) as {
    parse(input: string, allowDuplicatedKeys: boolean): unknown;
  };

  /** Decodes exact UTF-8 bytes without replacement characters or a BOM. */
  export function decode(bytes: Uint8Array, label: string): string {
    const input = Buffer.from(bytes);
    if (
      input.length >= 3 &&
      input[0] === 0xef &&
      input[1] === 0xbb &&
      input[2] === 0xbf
    )
      throw new Error(`${label} must not contain a UTF-8 BOM.`);
    try {
      return new TextDecoder("utf-8", { fatal: true }).decode(input);
    } catch {
      throw new Error(`${label} is not valid UTF-8.`);
    }
  }

  /** Parses one strict JSON value and rejects duplicate escaped keys. */
  export function parse(bytes: Uint8Array, label: string): unknown {
    try {
      return validator.parse(decode(bytes, label), false);
    } catch (error) {
      throw new Error(
        `${label} is not strict JSON: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  /** Reads and parses one strict JSON file. */
  export function file(location: string, label: string): unknown {
    return parse(fs.readFileSync(location), label);
  }

  /** Parses every nonempty line as an independent strict JSON value. */
  export function lines(bytes: Uint8Array, label: string): unknown[] {
    const content = decode(bytes, label);
    return content
      .split("\n")
      .filter((line) => line.length !== 0)
      .map((line, index) =>
        parse(Buffer.from(line, "utf8"), `${label} line ${index + 1}`),
      );
  }
}
