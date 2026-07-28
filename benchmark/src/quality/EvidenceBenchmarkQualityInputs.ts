import { EvidenceBenchmarkHash } from "../EvidenceBenchmarkHash.ts";
import { EvidenceBenchmarkProtocolValidator } from "../EvidenceBenchmarkProtocolValidator.ts";
import type { IEvidenceBenchmarkQualityGate } from "../structures/IEvidenceBenchmarkQualityGate.ts";
import { EvidenceBenchmarkQualityInput } from "./EvidenceBenchmarkQualityInput.ts";
import path from "node:path";

/** Canonical serializer and fail-closed reader for protocol quality inputs. */
export namespace EvidenceBenchmarkQualityInputs {
  const protocolRoot: string = path.resolve(
    import.meta.dirname,
    "../../protocol",
  );
  /** Creates one producer reference from the exact bytes the envelope pins. */
  export function producer(input: {
    producer: string;
    version: string;
    configBytes: Uint8Array;
    resultBytes: Uint8Array;
  }): IEvidenceBenchmarkQualityGate.IProducerReference {
    nonblank(input.producer, "quality producer");
    nonblank(input.version, "quality producer version");
    return {
      producer: input.producer,
      version: input.version,
      configSha256: EvidenceBenchmarkHash.bytes(input.configBytes),
      resultSha256: EvidenceBenchmarkHash.bytes(input.resultBytes),
    };
  }

  /** Serializes the exact protocol v2 field order with one terminal newline. */
  export function serialize(
    input: IEvidenceBenchmarkQualityGate.IQualityInputs,
  ): Buffer {
    validate(input);
    EvidenceBenchmarkProtocolValidator.validateValue(
      protocolRoot,
      "schema/quality-inputs.schema.json",
      input,
      "quality inputs",
    );
    return Buffer.from(`${JSON.stringify(input, null, 2)}\n`, "utf8");
  }

  /** Reads only canonical bytes and rejects schema or field mismatches. */
  export function parse(
    bytes: Uint8Array,
  ): IEvidenceBenchmarkQualityGate.IQualityInputs {
    const input: unknown =
      EvidenceBenchmarkProtocolValidator.validateBytes<unknown>(
        protocolRoot,
        "schema/quality-inputs.schema.json",
        bytes,
        "quality inputs",
      );
    validate(input);
    const canonical: Buffer = serialize(input);
    if (!canonical.equals(Buffer.from(bytes)))
      throw new Error("Quality inputs are not in canonical byte form.");
    return input;
  }

  /** Validates the postprocess envelope that binds actual producer results. */
  export function validate(
    value: unknown,
  ): asserts value is IEvidenceBenchmarkQualityGate.IQualityInputs {
    const input = record(value, "quality inputs");
    exactKeys(
      input,
      [
        "schemaVersion",
        "runId",
        "runManifestSha256",
        "milestone",
        "snapshotRawTree",
        "hiddenAcceptance",
        "coverage",
        "sampledMutation",
        "visualCapture",
      ],
      "quality inputs",
    );
    if (input.schemaVersion !== 2)
      throw new Error("Quality inputs schemaVersion must be 2.");
    nonblank(input.runId, "quality inputs runId");
    digest(input.runManifestSha256, "quality inputs run manifest");
    if (input.milestone !== "t_done" && input.milestone !== "t_dry")
      throw new Error("Quality inputs milestone must be t_done or t_dry.");
    EvidenceBenchmarkQualityInput.validateRawTree(
      input.snapshotRawTree,
      "quality inputs snapshot",
    );
    producerReference(input.hiddenAcceptance, "hiddenAcceptance");
    producerReference(input.coverage, "coverage");
    producerReference(input.sampledMutation, "sampledMutation");
    visualReference(input.visualCapture);
  }

  function producerReference(value: unknown, label: string): void {
    const input = record(value, label);
    exactKeys(
      input,
      ["producer", "version", "configSha256", "resultSha256"],
      label,
    );
    nonblank(input.producer, `${label} producer`);
    nonblank(input.version, `${label} version`);
    digest(input.configSha256, `${label} config`);
    digest(input.resultSha256, `${label} result`);
  }

  function visualReference(value: unknown): void {
    const input = record(value, "visualCapture");
    exactKeys(
      input,
      [
        "producer",
        "version",
        "configSha256",
        "routeInventorySha256",
        "stateSeedSha256",
        "sampleSeed",
        "viewports",
        "browser",
        "artifactsSha256",
      ],
      "visualCapture",
    );
    nonblank(input.producer, "visualCapture producer");
    nonblank(input.version, "visualCapture version");
    digest(input.configSha256, "visualCapture config");
    digest(input.routeInventorySha256, "visualCapture route inventory");
    digest(input.stateSeedSha256, "visualCapture state seed");
    nonblank(input.sampleSeed, "visualCapture sample seed");
    if (JSON.stringify(input.viewports) !== JSON.stringify([390, 834, 1440]))
      throw new Error(
        "visualCapture viewports must bind widths 390, 834, and 1440.",
      );
    nonblank(input.browser, "visualCapture browser");
    digest(input.artifactsSha256, "visualCapture artifacts");
  }

  function exactKeys(
    input: Record<string, unknown>,
    keys: readonly string[],
    label: string,
  ): void {
    if (
      JSON.stringify(Object.keys(input).sort()) !==
      JSON.stringify([...keys].sort())
    )
      throw new Error(`${label} fields are not the exact expected set.`);
  }

  function record(value: unknown, label: string): Record<string, unknown> {
    if (typeof value !== "object" || value === null || Array.isArray(value))
      throw new Error(`${label} must be an object.`);
    return value as Record<string, unknown>;
  }

  function nonblank(value: unknown, label: string): void {
    if (typeof value !== "string" || value.trim().length === 0)
      throw new Error(`${label} must be a nonblank string.`);
  }

  function digest(value: unknown, label: string): void {
    if (typeof value !== "string" || !/^[a-f0-9]{64}$/u.test(value))
      throw new Error(`${label} must be a lowercase SHA-256 digest.`);
  }
}
