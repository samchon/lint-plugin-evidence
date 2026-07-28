import assert from "node:assert/strict";
import childProcess from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { EvidenceBenchmarkProtocolValidator } from "./EvidenceBenchmarkProtocolValidator.ts";

/** Exercises the shared protocol validator without provider or paid calls. */
export namespace EvidenceBenchmarkProtocolValidatorTest {
  /** Runs strict parsing, schema, format, registry, and offline-ref fixtures. */
  export function main(protocolRoot: string): void {
    EvidenceBenchmarkProtocolValidator.preflightProviderRegistry(protocolRoot);
    testCostPredictionParity(protocolRoot);
    testSafetyAuthorization(protocolRoot);
    testProtocolIdentity(protocolRoot);
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

  function testCostPredictionParity(protocolRoot: string): void {
    EvidenceBenchmarkProtocolValidator.preflightCostPredictions(protocolRoot);
    const artifact = object(
      EvidenceBenchmarkProtocolValidator.parse(
        fs.readFileSync(
          path.join(protocolRoot, "cost-predictions.json"),
          "utf8",
        ),
        "cost predictions",
      ),
      "cost predictions",
    );
    const fixture = object(
      EvidenceBenchmarkProtocolValidator.parse(
        fs.readFileSync(
          path.join(
            protocolRoot,
            "fixtures",
            "cost-predictions",
            "cases.json",
          ),
          "utf8",
        ),
        "cost prediction fixture",
      ),
      "cost prediction fixture",
    );
    const expected = object(fixture.validExpected, "valid expectations");
    assert.equal(list(artifact.rows, "prediction rows").length, expected.rowCount);
    assert.equal(
      object(
        artifact.zeroObservationProvenance,
        "zero-observation provenance",
      ).observationCount,
      expected.observationCount,
    );
    for (const entry of list(fixture.invalidCases, "invalid cases")) {
      const invalid = object(entry, "invalid case");
      const mutated: Record<string, unknown> = structuredClone(artifact);
      applyMutation(mutated, invalid);
      assert.throws(
        () =>
          EvidenceBenchmarkProtocolValidator.validateCostPredictionsValue(
            protocolRoot,
            mutated,
          ),
        new RegExp(text(invalid.expectedPattern, "expected failure pattern")),
        text(invalid.id, "invalid case id"),
      );
    }
    testBlockPlanCostPredictionParity(protocolRoot, artifact);
  }

  function testBlockPlanCostPredictionParity(
    protocolRoot: string,
    artifact: Record<string, unknown>,
  ): void {
    const artifactBytes: Buffer = fs.readFileSync(
      path.join(protocolRoot, "cost-predictions.json"),
    );
    const digest: string = crypto
      .createHash("sha256")
      .update(artifactBytes)
      .digest("hex");
    const fixture = object(
      EvidenceBenchmarkProtocolValidator.parse(
        fs.readFileSync(
          path.join(
            protocolRoot,
            "fixtures",
            "cost-predictions",
            "block-plan-parity.json",
          ),
          "utf8",
        ),
        "block-plan prediction parity fixture",
      ),
      "block-plan prediction parity fixture",
    );
    const rows = list(artifact.rows, "cost prediction rows").map((entry) =>
      object(entry, "cost prediction row"),
    );
    const plan: Record<string, unknown> = {
      costPredictionsSha256: digest,
      cells: list(fixture.validCells, "valid cost bindings").map((entry) => {
        const binding = object(entry, "valid cost binding");
        const subject: string = text(binding.subject, "binding subject");
        const arm: string = text(binding.arm, "binding arm");
        const row = rows.find(
          (candidate) =>
            candidate.subject === subject && candidate.arm === arm,
        );
        if (row === undefined)
          throw new Error(`Cost fixture row is absent: ${subject}/${arm}.`);
        return {
          subject,
          arm,
          predicted: {
            artifactSha256: digest,
            subject,
            arm,
            wallClockUnit: "hours",
            providerTokensUnit: "millions-of-provider-total-tokens",
            milestones: structuredClone(row.milestones),
          },
        };
      }),
    };
    EvidenceBenchmarkProtocolValidator.validateBlockPlanCostPredictions(
      protocolRoot,
      plan,
    );
    for (const entry of list(fixture.invalidCases, "invalid cost bindings")) {
      const invalid = object(entry, "invalid cost binding");
      const mutated: Record<string, unknown> = structuredClone(plan);
      applyMutation(mutated, invalid);
      assert.throws(
        () =>
          EvidenceBenchmarkProtocolValidator.validateBlockPlanCostPredictions(
            protocolRoot,
            mutated,
          ),
        new RegExp(text(invalid.expectedPattern, "expected failure pattern")),
        text(invalid.id, "invalid binding id"),
      );
    }
  }

  function testSafetyAuthorization(protocolRoot: string): void {
    EvidenceBenchmarkProtocolValidator.preflightSafetyAuthorizationPins(
      protocolRoot,
    );
    const pins = object(
      EvidenceBenchmarkProtocolValidator.parse(
        fs.readFileSync(path.join(protocolRoot, "pins.json"), "utf8"),
        "protocol pins",
      ),
      "protocol pins",
    );
    const baseline = object(
      pins.safetyAuthorization,
      "safety authorization",
    );
    const fixture = object(
      EvidenceBenchmarkProtocolValidator.parse(
        fs.readFileSync(
          path.join(
            protocolRoot,
            "fixtures",
            "safety-authorization",
            "cases.json",
          ),
          "utf8",
        ),
        "safety authorization fixture",
      ),
      "safety authorization fixture",
    );
    const populations: Map<string, Record<string, unknown>> = new Map();
    for (const input of list(fixture.validPopulations, "valid populations")) {
      const population = object(input, "valid population");
      const value: Record<string, unknown> = structuredClone(baseline);
      populateSafetyWave(value, population);
      const selectedWave: string | null =
        population.selectedWave === null
          ? null
          : text(population.selectedWave, "selected wave");
      EvidenceBenchmarkProtocolValidator.validateSafetyAuthorizationValue(
        protocolRoot,
        value,
        selectedWave,
      );
      populations.set(text(population.id, "population id"), value);
    }
    for (const input of list(fixture.invalidCases, "invalid safety cases")) {
      const invalid = object(input, "invalid safety case");
      const populationId: string =
        typeof invalid.population === "string"
          ? invalid.population
          : "all-waves-null-and-blocked";
      const source = populations.get(populationId);
      if (source === undefined)
        throw new Error(`Safety population is absent: ${populationId}.`);
      const value: Record<string, unknown> = structuredClone(source);
      if (typeof invalid.operation === "string")
        applyMutation(value, invalid);
      const selectedWave: string | null =
        invalid.selectedWave === null
          ? null
          : text(invalid.selectedWave, "selected wave");
      assert.throws(
        () =>
          EvidenceBenchmarkProtocolValidator.validateSafetyAuthorizationValue(
            protocolRoot,
            value,
            selectedWave,
          ),
        new RegExp(text(invalid.expectedPattern, "expected failure pattern")),
        text(invalid.id, "invalid safety case id"),
      );
    }
  }

  function populateSafetyWave(
    authorization: Record<string, unknown>,
    population: Record<string, unknown>,
  ): void {
    if (population.selectedWave === null) return;
    const wave: string = text(population.selectedWave, "selected wave");
    const subjectTokens = object(
      authorization.maximumObservedTotalTokensBySubject,
      "subject token limits",
    );
    const subjectWalls = object(
      authorization.hardWallDurationSecondsBySubject,
      "subject wall limits",
    );
    for (const [subject, value] of Object.entries(
      object(population.subjectTokenLimits, "population token limits"),
    ))
      subjectTokens[subject] = value;
    for (const [subject, value] of Object.entries(
      object(population.subjectWallLimits, "population wall limits"),
    ))
      subjectWalls[subject] = value;
    object(
      authorization.maximumObservedBlockTotalTokensByWave,
      "block token limits",
    )[wave] = population.blockTokenLimit;
    object(
      authorization.blockHardWallDurationSecondsByWave,
      "block wall limits",
    )[wave] = population.blockWallLimit;
  }

  function testProtocolIdentity(protocolRoot: string): void {
    EvidenceBenchmarkProtocolValidator.preflightProtocolIdentityPins(
      protocolRoot,
    );
    const pins = object(
      EvidenceBenchmarkProtocolValidator.parse(
        fs.readFileSync(path.join(protocolRoot, "pins.json"), "utf8"),
        "protocol pins",
      ),
      "protocol pins",
    );
    const fixture = object(
      EvidenceBenchmarkProtocolValidator.parse(
        fs.readFileSync(
          path.join(
            protocolRoot,
            "fixtures",
            "protocol-identity",
            "cases.json",
          ),
          "utf8",
        ),
        "protocol identity fixture",
      ),
      "protocol identity fixture",
    );
    for (const input of list(fixture.invalidCases, "invalid identities")) {
      const invalid = object(input, "invalid identity");
      const id: string = text(invalid.id, "identity case id");
      if (id === "sealed-tree-mutation") {
        assert.throws(
          () =>
            EvidenceBenchmarkProtocolValidator.validateSealedProtocolRawTree(
              invalid.sealedTree,
              text(invalid.actualSha256, "actual tree SHA-256"),
            ),
          new RegExp(text(invalid.expectedPattern, "expected failure pattern")),
          id,
        );
        continue;
      }
      const formal = structuredClone(
        object(pins.formalProtocolRevision, "formal identity"),
      );
      const runtime = structuredClone(
        object(pins.prepareTimeRuntimeRequired, "runtime identity"),
      );
      const target =
        invalid.target === "formal"
          ? formal
          : invalid.target === "runtime"
            ? runtime
            : undefined;
      if (target === undefined)
        throw new Error(`Protocol identity fixture target is invalid: ${id}.`);
      target[text(invalid.field, "identity field")] = invalid.value;
      assert.throws(
        () =>
          EvidenceBenchmarkProtocolValidator.validateProtocolIdentityValue(
            formal,
            runtime,
          ),
        new RegExp(text(invalid.expectedPattern, "expected failure pattern")),
        id,
      );
    }
  }

  function applyMutation(
    target: Record<string, unknown>,
    mutation: Record<string, unknown>,
  ): void {
    const operation: string = text(mutation.operation, "mutation operation");
    const destination = pointerParent(
      target,
      text(mutation.path, "mutation path"),
    );
    if (operation === "replace") {
      setChild(
        destination.parent,
        destination.key,
        structuredClone(mutation.value),
      );
      return;
    }
    if (operation === "copy") {
      const source = pointerValue(
        target,
        text(mutation.from, "mutation source path"),
      );
      setChild(destination.parent, destination.key, structuredClone(source));
      return;
    }
    throw new Error(`Unsupported fixture mutation operation: ${operation}.`);
  }

  function setChild(
    parent: Record<string, unknown> | unknown[],
    key: string,
    value: unknown,
  ): void {
    if (Array.isArray(parent)) {
      if (!/^(?:0|[1-9][0-9]*)$/u.test(key))
        throw new Error(`Fixture array index is invalid: ${key}.`);
      const index: number = Number(key);
      if (index >= parent.length)
        throw new Error(`Fixture array index is out of range: ${key}.`);
      parent[index] = value;
      return;
    }
    parent[key] = value;
  }

  function pointerParent(
    root: Record<string, unknown>,
    pointer: string,
  ): { parent: Record<string, unknown> | unknown[]; key: string } {
    const tokens: string[] = pointerTokens(pointer);
    if (tokens.length === 0) throw new Error("Fixture cannot replace the root.");
    const parent: unknown = tokens
      .slice(0, -1)
      .reduce<unknown>((value, token) => child(value, token), root);
    if (typeof parent !== "object" || parent === null)
      throw new Error(`Fixture mutation parent is not a container: ${pointer}.`);
    return {
      parent: parent as Record<string, unknown> | unknown[],
      key: tokens.at(-1)!,
    };
  }

  function pointerValue(root: unknown, pointer: string): unknown {
    return pointerTokens(pointer).reduce<unknown>(
      (value, token) => child(value, token),
      root,
    );
  }

  function pointerTokens(pointer: string): string[] {
    if (!pointer.startsWith("/"))
      throw new Error(`Fixture mutation is not a JSON pointer: ${pointer}.`);
    return pointer
      .slice(1)
      .split("/")
      .map((token) => token.replaceAll("~1", "/").replaceAll("~0", "~"));
  }

  function child(value: unknown, token: string): unknown {
    if (Array.isArray(value)) {
      if (!/^(?:0|[1-9][0-9]*)$/u.test(token))
        throw new Error(`Fixture array index is invalid: ${token}.`);
      const index: number = Number(token);
      if (index >= value.length)
        throw new Error(`Fixture array index is out of range: ${token}.`);
      return value[index];
    }
    const parent = object(value, "fixture pointer parent");
    if (!Object.hasOwn(parent, token))
      throw new Error(`Fixture pointer member does not exist: ${token}.`);
    return parent[token];
  }

  function object(value: unknown, label: string): Record<string, unknown> {
    if (typeof value !== "object" || value === null || Array.isArray(value))
      throw new Error(`${label} must be an object.`);
    return value as Record<string, unknown>;
  }

  function list(value: unknown, label: string): unknown[] {
    if (!Array.isArray(value)) throw new Error(`${label} must be an array.`);
    return value;
  }

  function text(value: unknown, label: string): string {
    if (typeof value !== "string" || value.length === 0)
      throw new Error(`${label} must be a nonempty string.`);
    return value;
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
