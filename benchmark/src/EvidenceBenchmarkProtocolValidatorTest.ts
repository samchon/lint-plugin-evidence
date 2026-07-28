import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { EvidenceBenchmarkProtocolValidator } from "./EvidenceBenchmarkProtocolValidator.ts";

/** Exercises the shared protocol validator without provider or paid calls. */
export namespace EvidenceBenchmarkProtocolValidatorTest {
  /** Runs strict parsing, schema, format, registry, and offline-ref fixtures. */
  export function main(protocolRoot: string): void {
    EvidenceBenchmarkProtocolValidator.preflightProviderRegistry(protocolRoot);
    const freezeText: string = fs.readFileSync(
      path.join(protocolRoot, "subject-freeze-manifest.json"),
      "utf8",
    );
    EvidenceBenchmarkProtocolValidator.validateText(
      protocolRoot,
      "subject-freeze-manifest.schema.json",
      freezeText,
      "emitted subject freeze manifest",
    );
    const valid = JSON.stringify({
      outcome: "complete",
      summary: "All frozen work completed.",
      unfinished: [],
    });
    assert.deepEqual(
      EvidenceBenchmarkProtocolValidator.validateText(
        protocolRoot,
        "generation-outcome-local.schema.json",
        valid,
        "valid generation outcome",
      ),
      JSON.parse(valid),
    );
    assert.throws(
      () =>
        EvidenceBenchmarkProtocolValidator.validateText(
          protocolRoot,
          "generation-outcome-local.schema.json",
          JSON.stringify({
            outcome: "complete",
            summary: "",
            unfinished: ["still open"],
          }),
          "invalid generation outcome",
        ),
      (error: unknown) =>
        error instanceof EvidenceBenchmarkProtocolValidator.ValidationError &&
        error.diagnostics.length >= 2 &&
        error.diagnostics
          .map((entry) => entry.instancePath)
          .includes("/summary"),
    );
    assert.throws(
      () =>
        EvidenceBenchmarkProtocolValidator.parse(
          '{"outer":{"same":1,"same":2}}',
          "duplicate-key fixture",
        ),
      /duplicate object member "same"/,
    );
    assert.throws(
      () =>
        EvidenceBenchmarkProtocolValidator.validateValue(
          protocolRoot,
          "../outside.schema.json",
          {},
        ),
      /not canonical/,
    );
    testRemoteReferenceRejection();
  }

  function testRemoteReferenceRejection(): void {
    const temporary: string = fs.mkdtempSync(
      path.join(os.tmpdir(), "evidence-protocol-validator-"),
    );
    try {
      const schemaRoot: string = path.join(temporary, "schema");
      fs.mkdirSync(schemaRoot, { recursive: true });
      fs.writeFileSync(
        path.join(schemaRoot, "escape.schema.json"),
        `${JSON.stringify(
          {
            $schema: "https://json-schema.org/draft/2020-12/schema",
            $id: "https://example.invalid/protocol/schema/escape.schema.json",
            $ref: "https://untracked.invalid/remote.schema.json",
          },
          null,
          2,
        )}\n`,
        "utf8",
      );
      assert.throws(
        () =>
          EvidenceBenchmarkProtocolValidator.validateValue(
            temporary,
            "escape.schema.json",
            {},
          ),
        /escapes the offline registry/,
      );
    } finally {
      fs.rmSync(temporary, { recursive: true, force: true });
    }
  }
}
