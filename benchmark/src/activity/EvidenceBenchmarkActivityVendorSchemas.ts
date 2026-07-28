import {
  Ajv,
  type AnySchema,
  type ErrorObject,
  type ValidateFunction,
} from "ajv";

import { EvidenceBenchmarkActivityCanonical } from "./EvidenceBenchmarkActivityCanonical.ts";
import { EvidenceBenchmarkActivityStrictJson } from "./EvidenceBenchmarkActivityStrictJson.ts";

/** Exact offline validation against the frozen Codex app-server schemas. */
export namespace EvidenceBenchmarkActivityVendorSchemas {
  const VALIDATORS: Map<string, ValidateFunction> = new Map();

  /** Frozen raw-response notification schema identity. */
  export const RAW_RESPONSE_COMPLETED = {
    path: "benchmark/protocol/vendor/codex/0.145.0/app-server-schema-experimental/v2/RawResponseCompletedNotification.json",
    bytes: 1525,
    sha256: "d330286f1d9abc273837091a9a4e7b4b2454721f4f3bc3a01386c2145105b4e7",
  } as const;

  /** Frozen completed-item notification schema identity. */
  export const ITEM_COMPLETED = {
    path: "benchmark/protocol/vendor/codex/0.145.0/app-server-schema-experimental/v2/ItemCompletedNotification.json",
    bytes: 39260,
    sha256: "047016f3132b046cedc98b62672656f834e7561c872c06c155643a018f51eef8",
  } as const;

  /** Frozen started-item notification schema identity. */
  export const ITEM_STARTED = {
    path: "benchmark/protocol/vendor/codex/0.145.0/app-server-schema-experimental/v2/ItemStartedNotification.json",
    bytes: 39252,
    sha256: "35e7674f955c0661ad30f47f6e1b709425748df45d90293f03bfbf34ebfdadaa",
  } as const;

  /** Validates the two exact notification parameter objects offline. */
  export function admit(
    rawResponseSchemaBytes: Uint8Array,
    itemCompletedSchemaBytes: Uint8Array,
    rawResponseParams: unknown,
    itemCompletedParams: unknown,
  ): void {
    admitRawResponse(rawResponseSchemaBytes, rawResponseParams);
    admitItemCompleted(itemCompletedSchemaBytes, itemCompletedParams);
  }

  /** Validates one exact raw-response notification parameter object. */
  export function admitRawResponse(
    schemaBytes: Uint8Array,
    params: unknown,
  ): void {
    validate(
      RAW_RESPONSE_COMPLETED,
      schemaBytes,
      params,
      "rawResponse/completed params",
    );
  }

  /** Validates one exact item-started notification parameter object. */
  export function admitItemStarted(
    schemaBytes: Uint8Array,
    params: unknown,
  ): void {
    validate(ITEM_STARTED, schemaBytes, params, "item/started params");
  }

  /** Validates one exact item-completed notification parameter object. */
  export function admitItemCompleted(
    schemaBytes: Uint8Array,
    params: unknown,
  ): void {
    validate(ITEM_COMPLETED, schemaBytes, params, "item/completed params");
  }

  function validate(
    pin: { bytes: number; sha256: string },
    bytes: Uint8Array,
    value: unknown,
    label: string,
  ): void {
    if (
      bytes.byteLength !== pin.bytes ||
      EvidenceBenchmarkActivityCanonical.sha256(bytes) !== pin.sha256
    )
      throw new Error(`${label} vendor schema differs from its frozen pin.`);
    let validator: ValidateFunction | undefined = VALIDATORS.get(pin.sha256);
    if (validator === undefined) {
      const schema: AnySchema = EvidenceBenchmarkActivityStrictJson.parse(
        bytes,
        `${label} vendor schema`,
      ) as AnySchema;
      const ajv: Ajv = new Ajv({
        allErrors: true,
        allowUnionTypes: true,
        strict: true,
      });
      ajv.addFormat("int32", {
        type: "number",
        validate: (input: number): boolean =>
          Number.isSafeInteger(input) &&
          input >= -2_147_483_648 &&
          input <= 2_147_483_647,
      });
      ajv.addFormat("int64", {
        type: "number",
        validate: Number.isSafeInteger,
      });
      ajv.addFormat("uint", {
        type: "number",
        validate: nonnegativeSafeInteger,
      });
      ajv.addFormat("uint32", {
        type: "number",
        validate: (input: number): boolean =>
          nonnegativeSafeInteger(input) && input <= 4_294_967_295,
      });
      ajv.addFormat("uint64", {
        type: "number",
        validate: nonnegativeSafeInteger,
      });
      validator = ajv.compile(schema);
      VALIDATORS.set(pin.sha256, validator);
    }
    if (validator(value)) return;
    const detail: string = (validator.errors ?? [])
      .map(
        (error: ErrorObject) =>
          `${error.instancePath || "/"} ${error.keyword} ${error.message ?? "failed"}`,
      )
      .join("; ");
    throw new Error(`${label} fails the frozen Codex schema: ${detail}`);
  }

  function nonnegativeSafeInteger(input: number): boolean {
    return Number.isSafeInteger(input) && input >= 0;
  }
}
