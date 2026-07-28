import assert from "node:assert/strict";
import childProcess from "node:child_process";
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
    testInvalidUtf8Rejection();
    testUntrackedSchemaRejection();
    testRemoteReferenceRejection();
    testBrokenLocalReferenceRejection();
    testRegistrySchemaAdmission(protocolRoot);
  }

  function testInvalidUtf8Rejection(): void {
    assert.throws(
      () =>
        EvidenceBenchmarkProtocolValidator.parseBytes(
          Buffer.from([0x7b, 0x22, 0x78, 0x22, 0x3a, 0xc3, 0x28, 0x7d]),
          "invalid UTF-8 fixture",
        ),
      /is not UTF-8/,
    );
  }

  function testUntrackedSchemaRejection(): void {
    const temporary: string = temporaryRepository();
    try {
      const schemaRoot: string = path.join(temporary, "schema");
      fs.mkdirSync(schemaRoot, { recursive: true });
      fs.writeFileSync(
        path.join(schemaRoot, "untracked.schema.json"),
        `${JSON.stringify(
          {
            $schema: "https://json-schema.org/draft/2020-12/schema",
            $id: "https://example.invalid/protocol/schema/untracked.schema.json",
            type: "object",
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
            "untracked.schema.json",
            {},
          ),
        /schema inventory differs from Git/,
      );
    } finally {
      fs.rmSync(temporary, { recursive: true, force: true });
    }
  }

  function testRemoteReferenceRejection(): void {
    const temporary: string = temporaryRepository();
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
      trackAll(temporary);
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

  function testBrokenLocalReferenceRejection(): void {
    const temporary: string = temporaryRepository();
    try {
      const schemaRoot: string = path.join(temporary, "schema");
      fs.mkdirSync(schemaRoot, { recursive: true });
      fs.writeFileSync(
        path.join(schemaRoot, "broken.schema.json"),
        `${JSON.stringify(
          {
            $schema: "https://json-schema.org/draft/2020-12/schema",
            $id: "https://example.invalid/protocol/schema/broken.schema.json",
            $ref: "#/$defs/missing",
          },
          null,
          2,
        )}\n`,
        "utf8",
      );
      trackAll(temporary);
      assert.throws(
        () =>
          EvidenceBenchmarkProtocolValidator.validateValue(
            temporary,
            "broken.schema.json",
            {},
          ),
        /reference|resolve/i,
      );
    } finally {
      fs.rmSync(temporary, { recursive: true, force: true });
    }
  }

  function testRegistrySchemaAdmission(protocolRoot: string): void {
    const temporary: string = temporaryRepository();
    try {
      fs.cpSync(protocolRoot, temporary, {
        recursive: true,
        filter: (source) => path.basename(source) !== ".git",
      });
      trackAll(temporary);
      const registryPath: string = path.join(
        temporary,
        "provider-output-registry.json",
      );
      const registry = JSON.parse(
        fs.readFileSync(registryPath, "utf8"),
      ) as Record<string, unknown>;
      registry.untrackedAssertion = true;
      fs.writeFileSync(
        registryPath,
        `${JSON.stringify(registry, null, 2)}\n`,
        "utf8",
      );
      assert.throws(
        () =>
          EvidenceBenchmarkProtocolValidator.preflightProviderRegistry(
            temporary,
          ),
        (error: unknown) =>
          error instanceof EvidenceBenchmarkProtocolValidator.ValidationError &&
          error.diagnostics.some(
            (entry) => entry.keyword === "additionalProperties",
          ),
      );
    } finally {
      fs.rmSync(temporary, { recursive: true, force: true });
    }
  }

  function temporaryRepository(): string {
    const temporary: string = fs.mkdtempSync(
      path.join(os.tmpdir(), "evidence-protocol-validator-"),
    );
    childProcess.execFileSync("git", ["init", "--quiet", temporary], {
      windowsHide: true,
    });
    childProcess.execFileSync(
      "git",
      ["-C", temporary, "config", "core.autocrlf", "false"],
      { windowsHide: true },
    );
    childProcess.execFileSync(
      "git",
      ["-C", temporary, "config", "core.eol", "lf"],
      { windowsHide: true },
    );
    return temporary;
  }

  function trackAll(repository: string): void {
    childProcess.execFileSync("git", ["-C", repository, "add", "--all"], {
      windowsHide: true,
    });
  }
}
