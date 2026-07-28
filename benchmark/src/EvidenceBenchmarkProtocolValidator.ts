import crypto from "node:crypto";
import childProcess from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

import {
  Ajv2020,
  type ErrorObject,
  type ValidateFunction,
} from "ajv/dist/2020.js";
import type { FormatsPlugin } from "ajv-formats";

/** Offline JSON parsing, schema validation, and provider-schema preflight. */
export namespace EvidenceBenchmarkProtocolValidator {
  const require: NodeJS.Require = createRequire(import.meta.url);
  const addFormats: FormatsPlugin = require("ajv-formats") as FormatsPlugin;

  /** One stable machine-readable schema diagnostic. */
  export interface IDiagnostic {
    /** RFC 6901-style path to the invalid artifact value. */
    instancePath: string;

    /** Schema location that rejected the value. */
    schemaPath: string;

    /** JSON Schema keyword that failed. */
    keyword: string;

    /** Stable Ajv failure message. */
    message: string;

    /** Canonical JSON serialization of keyword parameters. */
    params: string;
  }

  /** Validation error with deterministically ordered diagnostics. */
  export class ValidationError extends Error {
    /** Deterministically ordered machine-readable failures. */
    public readonly diagnostics: readonly IDiagnostic[];

    /** Creates one stable aggregate validation failure. */
    public constructor(label: string, diagnostics: readonly IDiagnostic[]) {
      super(
        `${label} failed protocol validation:\n${diagnostics
          .map(
            (entry) =>
              `${entry.instancePath || "/"} ${entry.keyword} ${entry.message} (${entry.schemaPath})`,
          )
          .join("\n")}`,
      );
      this.name = "EvidenceBenchmarkProtocolValidationError";
      this.diagnostics = diagnostics;
    }
  }

  /** Parses exact JSON text and rejects duplicate object member names. */
  export function parse(text: string, label: string): unknown {
    return new StrictJsonParser(text, label).parse();
  }

  /** Fatally decodes exact UTF-8 bytes before strict JSON parsing. */
  export function parseBytes(bytes: Uint8Array, label: string): unknown {
    return parse(decodeUtf8(bytes, label), label);
  }

  /** Parses and validates exact artifact text against one protocol schema. */
  export function validateText<T>(
    protocolRoot: string,
    schemaRelativePath: string,
    text: string,
    label: string = schemaRelativePath,
  ): T {
    return validateValue<T>(
      protocolRoot,
      schemaRelativePath,
      parse(text, label),
      label,
    );
  }

  /** Fatally decodes and validates exact artifact bytes. */
  export function validateBytes<T>(
    protocolRoot: string,
    schemaRelativePath: string,
    bytes: Uint8Array,
    label: string = schemaRelativePath,
  ): T {
    return validateValue<T>(
      protocolRoot,
      schemaRelativePath,
      parseBytes(bytes, label),
      label,
    );
  }

  /** Validates an already parsed artifact against one protocol schema. */
  export function validateValue<T>(
    protocolRoot: string,
    schemaRelativePath: string,
    value: unknown,
    label: string = schemaRelativePath,
  ): T {
    const registry: ISchemaRegistry = loadSchemas(protocolRoot);
    const schemaPath: string = resolveSchemaPath(
      registry.schemaRoot,
      schemaRelativePath,
    );
    const schema = registry.byPath.get(schemaPath);
    if (schema === undefined)
      throw new Error(
        `${label} names an untracked protocol schema: ${schemaRelativePath}.`,
      );
    const validate: ValidateFunction =
      registry.ajv.getSchema(schema.id) ?? registry.ajv.compile(schema.value);
    if (!validate(value))
      throw new ValidationError(label, diagnostics(validate.errors ?? []));
    return value as T;
  }

  /**
   * Proves that every registered provider schema is byte-pinned, offline, and
   * limited to the provider keyword allowlist.
   */
  export function preflightProviderRegistry(protocolRoot: string): void {
    const root: string = path.resolve(protocolRoot);
    const registryPath: string = path.join(
      root,
      "provider-output-registry.json",
    );
    const registry = record(
      parseBytes(fs.readFileSync(registryPath), registryPath),
      "provider output registry",
    );
    const allowlist = stringArray(
      registry.providerKeywordAllowlist,
      "provider keyword allowlist",
    );
    if (new Set(allowlist).size !== allowlist.length)
      throw new Error("Provider keyword allowlist contains duplicates.");
    const allowed: ReadonlySet<string> = new Set(allowlist);
    const contracts = array(registry.contracts, "provider contracts");
    const schemas: ISchemaRegistry = loadSchemas(root);
    validateLoaded(
      schemas,
      "provider-output-registry.schema.json",
      registry,
      "provider output registry",
    );
    const seenIds: Set<string> = new Set();
    for (const [index, input] of contracts.entries()) {
      const contract = record(input, `provider contract ${index}`);
      const id: string = nonblank(contract.id, `provider contract ${index} id`);
      if (seenIds.has(id))
        throw new Error(`Provider contract id is duplicated: ${id}.`);
      seenIds.add(id);
      const providerRelative: string = nonblank(
        contract.providerSchema,
        `${id} provider schema`,
      );
      const providerPath: string = resolveSchemaPath(
        schemas.schemaRoot,
        providerRelative,
      );
      const schema = schemas.byPath.get(providerPath);
      if (schema === undefined)
        throw new Error(
          `${id} provider schema is not tracked: ${providerRelative}.`,
        );
      const bytes: Buffer = fs.readFileSync(providerPath);
      if (
        contract.providerBytes !== bytes.byteLength ||
        contract.providerSha256 !== sha256(bytes)
      )
        throw new Error(`${id} provider schema byte pin drifted.`);
      inspectProviderSchema(
        schema.value,
        schema.id,
        allowed,
        schemas,
        new Set(),
      );
      const localRelative: string = nonblank(
        contract.localSchema,
        `${id} local schema`,
      );
      const localPath: string = resolveSchemaPath(
        schemas.schemaRoot,
        localRelative,
      );
      const local = schemas.byPath.get(localPath);
      if (local === undefined)
        throw new Error(`${id} local schema is not tracked: ${localRelative}.`);
      const localBytes: Buffer = fs.readFileSync(localPath);
      if (
        contract.localBytes !== localBytes.byteLength ||
        contract.localSha256 !== sha256(localBytes)
      )
        throw new Error(`${id} local schema byte pin drifted.`);
      schemas.ajv.getSchema(local.id) ?? schemas.ajv.compile(local.value);
    }
  }

  /**
   * Proves that the machine-readable cost prior is byte-bound to its active
   * append-only Markdown chain and reproduces the selected P50/P90 tables.
   */
  export function preflightCostPredictions(protocolRoot: string): void {
    const root: string = path.resolve(protocolRoot);
    const artifactPath: string = path.join(root, "cost-predictions.json");
    const artifactBytes: Buffer = fs.readFileSync(artifactPath);
    const value = validateBytes<Record<string, unknown>>(
      root,
      "cost-predictions.schema.json",
      artifactBytes,
      artifactPath,
    );
    validateCostPredictionsValue(root, value);
    const pinsPath: string = path.join(root, "pins.json");
    const pins = record(
      parseBytes(fs.readFileSync(pinsPath), pinsPath),
      "protocol pins",
    );
    const pin = record(pins.costPredictions, "cost prediction pin");
    const digest: string = sha256(artifactBytes);
    if (
      pin.path !== "benchmark/protocol/cost-predictions.json" ||
      pin.schemaPath !==
        "benchmark/protocol/schema/cost-predictions.schema.json" ||
      pin.bytes !== artifactBytes.byteLength ||
      pin.sha256 !== digest ||
      pin.freezeId !== value.freezeId ||
      pin.observationCount !== 0
    )
      throw new Error("Cost prediction artifact pin drifted.");
    const repositoryDigests = record(
      pins.repositoryFrozenDigests,
      "repository frozen digests",
    );
    if (repositoryDigests.costPredictionsSha256 !== digest)
      throw new Error("Repository cost prediction digest pin drifted.");
    const formal = record(
      pins.formalProtocolRevision,
      "formal protocol revision",
    );
    const activeLeaf = record(value.activeLeaf, "cost prediction active leaf");
    if (
      formal.activePriorReviewId !== activeLeaf.reviewId ||
      formal.activePriorReviewUrl !==
        `https://github.com/samchon/lint-plugin-evidence/pull/105#pullrequestreview-${String(
          activeLeaf.reviewId,
        )}`
    )
      throw new Error(
        "Formal active-prior review does not identify the cost prediction active leaf.",
      );
  }

  /**
   * Proves that the null-by-default safety pins are complete by subject and
   * wave and that every populated wave is internally authorized.
   */
  export function preflightSafetyAuthorizationPins(protocolRoot: string): void {
    const root: string = path.resolve(protocolRoot);
    const pinsPath: string = path.join(root, "pins.json");
    const pins = record(
      parseBytes(fs.readFileSync(pinsPath), pinsPath),
      "protocol pins",
    );
    validateSafetyAuthorizationValue(root, pins.safetyAuthorization);
  }

  /**
   * Proves that prepare-time quota freshness has one stable retained boundary
   * and that execution reuses the same contract without promoting raw clocks.
   */
  export function preflightQuotaAuthorityBoundaryPins(
    protocolRoot: string,
  ): void {
    quotaAuthorityBoundaryPolicy(path.resolve(protocolRoot));
  }

  /** Validates one safety authorization and optionally requires one wave. */
  export function validateSafetyAuthorizationValue(
    protocolRoot: string,
    input: unknown,
    selectedWave: string | null = null,
  ): void {
    const value = validateValue<Record<string, unknown>>(
      protocolRoot,
      "safety-authorization.schema.json",
      input,
      "safety authorization",
    );
    const tokens = record(
      value.maximumObservedTotalTokensBySubject,
      "subject token limits",
    );
    const walls = record(
      value.hardWallDurationSecondsBySubject,
      "subject wall limits",
    );
    const blockTokens = record(
      value.maximumObservedBlockTotalTokensByWave,
      "wave token limits",
    );
    const blockWalls = record(
      value.blockHardWallDurationSecondsByWave,
      "wave wall limits",
    );
    const waves: ReadonlyArray<readonly [string, string, string]> = [
      ["todo-reddit", "todo", "reddit"],
      ["shopping-erp", "shopping", "erp"],
    ];
    for (const [wave, left, right] of waves) {
      const entries: unknown[] = [
        tokens[left],
        tokens[right],
        walls[left],
        walls[right],
        blockTokens[wave],
        blockWalls[wave],
      ];
      const nullCount: number = entries.filter(
        (entry) => entry === null,
      ).length;
      if (nullCount !== 0 && nullCount !== entries.length)
        throw new Error(
          `Safety authorization wave ${wave} must be all null or all positive.`,
        );
      if (nullCount === entries.length) {
        if (selectedWave === wave)
          throw new Error(
            `Safety authorization selected wave remains unauthorized: ${wave}.`,
          );
        continue;
      }
      const leftTokens: number = integer(tokens[left], `${left} token limit`);
      const rightTokens: number = integer(
        tokens[right],
        `${right} token limit`,
      );
      const leftWall: number = integer(walls[left], `${left} wall limit`);
      const rightWall: number = integer(walls[right], `${right} wall limit`);
      const waveTokens: number = integer(
        blockTokens[wave],
        `${wave} block token limit`,
      );
      const waveWall: number = integer(
        blockWalls[wave],
        `${wave} block wall limit`,
      );
      if (waveTokens > 2 * (leftTokens + rightTokens))
        throw new Error(
          `Safety authorization ${wave} block token limit exceeds the four-cell token sum.`,
        );
      if (waveWall > 2 * (leftWall + rightWall))
        throw new Error(
          `Safety authorization ${wave} block wall limit exceeds the four-cell wall-duration sum.`,
        );
    }
    if (selectedWave !== null && !waves.some(([wave]) => wave === selectedWave))
      throw new Error(`Safety authorization wave is unknown: ${selectedWave}.`);
  }

  /**
   * Validates one plan's prepare-time quota authority interval. JSON Schema
   * owns the retained shape; this closes chronology, duration, and digest
   * relationships that schema keywords cannot express.
   */
  export function validateQuotaAuthorityBoundaryValue(
    protocolRoot: string,
    input: unknown,
  ): void {
    const value = validateValue<Record<string, unknown>>(
      protocolRoot,
      "quota-prepare-authority.schema.json",
      input,
      "prepare quota authority admission",
    );
    validateQuotaAuthorityAdmissionValue(protocolRoot, value, "prepare");
  }

  /**
   * Validates the CLI's start-time authority record against the exact closed
   * plan and the prepare nonce that it must not replay.
   */
  export function validateStartQuotaAuthorityAdmissionValue(
    protocolRoot: string,
    input: unknown,
  ): void {
    const value = validateValue<Record<string, unknown>>(
      protocolRoot,
      "quota-start-authority.schema.json",
      input,
      "start quota authority admission",
    );
    validateQuotaAuthorityAdmissionValue(protocolRoot, value, "start");
  }

  function validateQuotaAuthorityAdmissionValue(
    protocolRoot: string,
    input: unknown,
    phase: "prepare" | "start",
  ): void {
    const policy = quotaAuthorityBoundaryPolicy(path.resolve(protocolRoot));
    const plan = record(input, "quota authority plan");
    const authorization = record(
      plan.authorization,
      "quota authority authorization",
    );
    const quotaState = record(
      authorization.quotaState,
      "quota authority state",
    );
    const boundary = record(
      authorization.quotaAuthorityBoundary,
      "quota authority boundary",
    );
    const blockId: string = nonblank(plan.blockId, "quota authority block id");
    const subjects: string[] = stringArray(
      plan.subjects,
      "quota authority subject wave",
    );
    if (
      ![
        JSON.stringify(["todo", "reddit"]),
        JSON.stringify(["shopping", "erp"]),
      ].includes(JSON.stringify(subjects))
    )
      throw new Error("Quota authority subject wave is invalid.");
    if (
      quotaState.phase !== phase ||
      boundary.phase !== phase ||
      boundary.capturedWithinLiveInterval !== true
    )
      throw new Error("Quota authority boundary policy drifted.");
    const planSha256: string | null =
      phase === "prepare"
        ? null
        : digest(plan.planSha256, "closed block plan SHA-256");
    if (
      quotaState.planSha256 !== planSha256 ||
      boundary.planSha256 !== planSha256
    )
      throw new Error(
        phase === "prepare"
          ? "Prepare quota authority must not bind a closed plan SHA-256."
          : "Start quota authority must bind the exact closed plan SHA-256.",
      );
    if (quotaState.blockId !== blockId || boundary.blockId !== blockId)
      throw new Error(
        "Quota authority block identity disagrees with the plan.",
      );
    if (
      canonical(quotaState.subjects) !== canonical(subjects) ||
      canonical(boundary.subjects) !== canonical(subjects)
    )
      throw new Error("Quota authority subject wave disagrees with the plan.");
    const requestId: string = nonblank(
      quotaState.authorityRequestId,
      "quota authority request id",
    );
    if (!/^[a-f0-9]{64}$/u.test(requestId))
      throw new Error(
        "Quota authority request id must be a lowercase 256-bit random nonce.",
      );
    if (boundary.authorityRequestId !== requestId)
      throw new Error(
        "Quota authority boundary request id disagrees with quota state.",
      );
    if (
      phase === "start" &&
      requestId ===
        nonblank(
          plan.prepareAuthorityRequestId,
          "prepare quota authority request id",
        )
    )
      throw new Error(
        "Start quota authority must use a fresh request nonce distinct from prepare.",
      );
    const requestProjection = {
      authorityRequestId: requestId,
      phase,
      blockId,
      planSha256,
      subjects,
    };
    assertClosedAsciiJson(
      requestProjection,
      "quota authority request projection",
    );
    const expectedRequestSha256: string = sha256(
      Buffer.from(canonical(requestProjection), "utf8"),
    );
    const requestSha256: string = digest(
      quotaState.authorityRequestSha256,
      "quota authority request SHA-256",
    );
    if (requestSha256 !== expectedRequestSha256)
      throw new Error(
        "Quota authority request SHA-256 disagrees with the RFC 8785 controller request.",
      );
    if (boundary.authorityRequestSha256 !== requestSha256)
      throw new Error(
        "Quota authority boundary request SHA-256 disagrees with quota state.",
      );
    const maximumDurationMs: number = positiveInteger(
      boundary.maximumDurationMs,
      "quota authority maximum duration",
    );
    if (maximumDurationMs !== policy.maximumDurationMs)
      throw new Error(
        "Quota authority maximum duration drifted from protocol pins.",
      );
    const requestStartedAt: number = dateTime(
      boundary.requestStartedAtUtc,
      "quota authority request start",
    );
    const responseReceivedAt: number = dateTime(
      boundary.responseReceivedAtUtc,
      "quota authority response receipt",
    );
    const capturedAt: number = dateTime(
      quotaState.capturedAtUtc,
      "quota authority capture time",
    );
    if (requestStartedAt > responseReceivedAt)
      throw new Error(
        "Quota authority response receipt must not precede request start.",
      );
    if (capturedAt < requestStartedAt)
      throw new Error(
        "Quota authority capture is stale relative to the live request interval.",
      );
    if (capturedAt > responseReceivedAt)
      throw new Error(
        "Quota authority capture is later than the live response interval.",
      );
    if (
      typeof boundary.elapsedMonotonicNs !== "string" ||
      !/^(?:0|[1-9][0-9]*)$/u.test(boundary.elapsedMonotonicNs)
    )
      throw new Error(
        "Quota authority monotonic elapsed duration must be a nonnegative decimal string.",
      );
    const elapsedText: string = boundary.elapsedMonotonicNs;
    const elapsedNs: bigint = BigInt(elapsedText);
    if (elapsedNs > BigInt(Number.MAX_SAFE_INTEGER))
      throw new Error(
        "Quota authority monotonic elapsed duration exceeds the safe retained range.",
      );
    const maximumDurationNs: bigint = BigInt(maximumDurationMs) * 1_000_000n;
    const utcElapsedMs: number = responseReceivedAt - requestStartedAt;
    if (utcElapsedMs > maximumDurationMs || elapsedNs > maximumDurationNs)
      throw new Error("Quota authority live request exceeded its timeout.");
    const utcElapsedNs: bigint = BigInt(utcElapsedMs) * 1_000_000n;
    const disagreementNs: bigint =
      utcElapsedNs >= elapsedNs
        ? utcElapsedNs - elapsedNs
        : elapsedNs - utcElapsedNs;
    if (disagreementNs > BigInt(policy.utcMonotonicToleranceMs) * 1_000_000n)
      throw new Error(
        "Quota authority UTC and monotonic durations exceed the pinned tolerance.",
      );
    const stateAttestation: string = digest(
      quotaState.attestationSha256,
      "quota authority state attestation SHA-256",
    );
    if (quotaState.policySha256 !== policy.policySha256)
      throw new Error(
        "Quota authority state policy SHA-256 drifted from protocol pins.",
      );
    const attestationProjection: Record<string, unknown> = {};
    for (const field of policy.attestationProjectionFields) {
      if (!Object.hasOwn(quotaState, field))
        throw new Error(
          `Quota authority state omits attestation projection field: ${field}.`,
        );
      attestationProjection[field] = quotaState[field];
    }
    assertClosedAsciiJson(
      attestationProjection,
      "quota authority attestation projection",
    );
    const expectedAttestation: string = sha256(
      Buffer.from(canonical(attestationProjection), "utf8"),
    );
    if (stateAttestation !== expectedAttestation)
      throw new Error(
        "Quota authority sanitized attestation does not bind the controller request and policy projection.",
      );
    if (
      digest(
        boundary.attestationSha256,
        "quota authority boundary attestation SHA-256",
      ) !== stateAttestation
    )
      throw new Error(
        "Quota authority boundary attestation disagrees with quota state.",
      );
  }

  /**
   * Rejects impossible protocol self-digests while preserving formal review
   * identity and a runtime-only digest slot for the sealed raw tree.
   */
  export function preflightProtocolIdentityPins(protocolRoot: string): void {
    const root: string = path.resolve(protocolRoot);
    const pinsPath: string = path.join(root, "pins.json");
    const pins = record(
      parseBytes(fs.readFileSync(pinsPath), pinsPath),
      "protocol pins",
    );
    validateProtocolIdentityValue(
      pins.formalProtocolRevision,
      pins.prepareTimeRuntimeRequired,
    );
  }

  /** Validates the separation between formal and runtime protocol identity. */
  export function validateProtocolIdentityValue(
    formalInput: unknown,
    runtimeInput: unknown,
  ): void {
    const formal = record(formalInput, "formal protocol identity");
    const runtime = record(runtimeInput, "runtime protocol identity");
    for (const legacy of [
      "protocolRevisionSha256",
      "protocolTreeSha256",
    ] as const)
      if (Object.hasOwn(formal, legacy) || Object.hasOwn(runtime, legacy))
        throw new Error(
          `Protocol identity contains a legacy protocol digest field (${legacy}); a self-referential protocol digest is forbidden.`,
        );
    if (
      formal.identityKind !==
        "runtime-resolved-merged-source-and-formal-review" ||
      !Object.hasOwn(formal, "reviewedMergedCommit") ||
      !Object.hasOwn(formal, "finalCommentReviewId")
    )
      throw new Error("Formal protocol identity contract drifted.");
    if (
      runtime.sealedProtocolRawTreeAlgorithmId !==
        "sha256-posix-path-nul-bytes-v1" ||
      !Object.hasOwn(runtime, "sealedProtocolRawTreeSha256")
    )
      throw new Error("Runtime sealed protocol raw-tree contract drifted.");
    if (
      formal.reviewedMergedCommit !== null ||
      formal.finalCommentReviewId !== null ||
      runtime.mergedSourceCommit !== null ||
      runtime.sealedProtocolRawTreeSha256 !== null
    )
      throw new Error(
        "Tracked protocol source, final review, and raw-tree templates must remain null; runtime source admission owns their resolved values.",
      );
    const policy = record(
      formal.resolutionPolicy,
      "formal protocol resolution policy",
    );
    if (
      policy.source !== "github-api-and-git-remote" ||
      policy.mergeStrategy !== "merge-commit" ||
      policy.finalReviewState !== "COMMENTED" ||
      policy.reviewAuthorLogin !== "samchon" ||
      policy.reviewAuthorAssociation !== "OWNER" ||
      policy.reviewBodyDigestAlgorithmId !== "sha256-utf8-review-body-v1" ||
      policy.requiredReviewMarker !== "overall-self-review-v1" ||
      policy.requireReviewSubmittedNoLaterThanMerge !== true ||
      policy.requireReviewedHeadMergeParentOrAncestor !== true ||
      policy.requireExactReviewedHeadAndMergedGitTree !== true ||
      policy.runtimeArtifact !==
        "benchmark/protocol/schema/block-plan.schema.json#/$defs/formalReviewAdmission"
    )
      throw new Error("Formal protocol runtime-resolution policy drifted.");
  }

  /**
   * Verifies retained runtime review/source fields and their cross-field
   * equality. The CLI separately owns GitHub retrieval, direct body-marker
   * inspection, exact body hashing, and remote Git ancestry/tree proof.
   */
  export function validateRuntimeSourceAdmissionValue(input: unknown): void {
    const plan = record(input, "runtime source admission plan");
    const merged: string = commit(
      plan.sourceMergedCommit,
      "plan merged source commit",
    );
    const admission = record(plan.sourceAdmission, "source admission");
    if (
      commit(admission.mergedBaseRevision, "admitted merged revision") !==
      merged
    )
      throw new Error(
        "Runtime source admission merged revision disagrees with the plan.",
      );
    const review = record(admission.formalReview, "formal review admission");
    if (
      review.resolutionSource !== "github-api-and-git-remote" ||
      review.mergeStrategy !== "merge-commit" ||
      review.finalCommentReviewState !== "COMMENTED" ||
      review.reviewAuthorLogin !== "samchon" ||
      review.reviewAuthorAssociation !== "OWNER" ||
      review.reviewBodyDigestAlgorithmId !== "sha256-utf8-review-body-v1" ||
      review.requiredReviewMarker !== "overall-self-review-v1" ||
      review.reviewBodyMarkerPresent !== true ||
      review.reviewedHeadIsMergeParentOrAncestor !== true ||
      review.exactGitTreeMatch !== true
    )
      throw new Error("Runtime formal review admission policy drifted.");
    if (commit(review.mergeCommitRevision, "review merge commit") !== merged)
      throw new Error(
        "Runtime formal review merge commit disagrees with the admitted source.",
      );
    const reviewedHead: string = commit(
      review.reviewedHeadRevision,
      "reviewed head revision",
    );
    if (
      commit(
        review.finalReviewCommitRevision,
        "formal review payload commit revision",
      ) !== reviewedHead
    )
      throw new Error(
        "Formal review payload commit revision disagrees with the reviewed head.",
      );
    if (reviewedHead === merged)
      throw new Error(
        "Merge-commit admission requires a distinct reviewed head revision.",
      );
    const reviewedTree: string = commit(
      review.reviewedHeadTreeOid,
      "reviewed head tree OID",
    );
    const mergedTree: string = commit(review.mergedTreeOid, "merged tree OID");
    if (reviewedTree !== mergedTree)
      throw new Error(
        "Runtime source admission reviewed and merged Git trees differ.",
      );
    positiveInteger(
      review.pullRequestNumber,
      "formal review pull request number",
    );
    positiveInteger(review.finalCommentReviewId, "formal COMMENT review id");
    digest(review.reviewBodySha256, "formal review body SHA-256");
    const submittedAt: number = dateTime(
      review.submittedAtUtc,
      "formal review submission time",
    );
    const mergedAt: number = dateTime(
      review.pullRequestMergedAtUtc,
      "pull request merge time",
    );
    if (submittedAt > mergedAt)
      throw new Error(
        "Formal review submission time must not be later than the pull request merge time.",
      );
  }

  /** Verifies a runtime-sealed protocol raw-tree digest after sealing. */
  export function validateSealedProtocolRawTree(
    sealedInput: unknown,
    actualSha256: string,
  ): void {
    const sealed = record(sealedInput, "sealed protocol raw tree");
    if (sealed.algorithmId !== "sha256-posix-path-nul-bytes-v1")
      throw new Error("Sealed protocol raw-tree algorithm drifted.");
    const expected: string = nonblank(
      sealed.sha256,
      "sealed protocol raw-tree SHA-256",
    );
    if (expected !== actualSha256)
      throw new Error("Sealed protocol raw-tree digest drifted.");
  }

  /**
   * Proves that each block-plan cell embeds the exact selected prediction row,
   * including both milestones and their explicit units.
   */
  export function validateBlockPlanCostPredictions(
    protocolRoot: string,
    input: unknown,
  ): void {
    const root: string = path.resolve(protocolRoot);
    const plan = record(input, "block plan cost binding");
    const artifactPath: string = path.join(root, "cost-predictions.json");
    const artifactBytes: Buffer = fs.readFileSync(artifactPath);
    const artifactSha256: string = sha256(artifactBytes);
    if (plan.costPredictionsSha256 !== artifactSha256)
      throw new Error("Block plan cost-predictions artifact digest drifted.");
    const artifact = record(
      parseBytes(artifactBytes, artifactPath),
      "cost predictions",
    );
    validateCostPredictionsValue(root, artifact);
    const rows: Map<string, Record<string, unknown>> = new Map();
    for (const inputRow of array(artifact.rows, "cost prediction rows")) {
      const row = record(inputRow, "cost prediction row");
      rows.set(
        `${nonblank(row.subject, "prediction subject")}\0${nonblank(
          row.arm,
          "prediction arm",
        )}`,
        row,
      );
    }
    for (const inputCell of array(plan.cells, "block plan cells")) {
      const cell = record(inputCell, "block plan cell");
      const subject: string = nonblank(cell.subject, "block plan subject");
      const arm: string = nonblank(cell.arm, "block plan arm");
      const prediction = record(cell.predicted, "block plan prediction");
      if (
        prediction.artifactSha256 !== artifactSha256 ||
        prediction.subject !== subject ||
        prediction.arm !== arm
      )
        throw new Error(
          `Block plan prediction identity drifted for ${subject}/${arm}.`,
        );
      if (
        prediction.wallClockUnit !== "hours" ||
        prediction.providerTokensUnit !== "millions-of-provider-total-tokens"
      )
        throw new Error(
          `Block plan prediction units drifted for ${subject}/${arm}.`,
        );
      const source = rows.get(`${subject}\0${arm}`);
      if (
        source === undefined ||
        canonical(prediction.milestones) !== canonical(source.milestones)
      )
        throw new Error(
          `Block plan prediction milestones drifted from the artifact for ${subject}/${arm}.`,
        );
    }
  }

  /** Validates one cost-prior value against the frozen Markdown source chain. */
  export function validateCostPredictionsValue(
    protocolRoot: string,
    input: unknown,
  ): void {
    const root: string = path.resolve(protocolRoot);
    const prediction = validateValue<Record<string, unknown>>(
      root,
      "cost-predictions.schema.json",
      input,
      "cost predictions",
    );
    const sources: Map<string, ICostPredictionSource> = new Map();
    for (const [index, entry] of array(
      prediction.sourceChain,
      "cost prediction source chain",
    ).entries()) {
      const source = costPredictionSource(
        root,
        entry,
        `cost prediction source ${index + 1}`,
      );
      if (source.order !== index + 1)
        throw new Error(
          `Cost prediction source order drifted at ${source.path}.`,
        );
      if (sources.has(source.path))
        throw new Error(
          `Cost prediction source is duplicated: ${source.path}.`,
        );
      sources.set(source.path, source);
    }
    const activeLeaf = costPredictionSource(
      root,
      prediction.activeLeaf,
      "cost prediction active leaf",
      false,
    );
    const last: ICostPredictionSource | undefined = [...sources.values()].at(
      -1,
    );
    if (
      last === undefined ||
      activeLeaf.path !== last.path ||
      activeLeaf.bytes !== last.bytes ||
      activeLeaf.sha256 !== last.sha256 ||
      activeLeaf.reviewId !== last.reviewId
    )
      throw new Error(
        "Cost prediction active leaf does not match the final source-chain entry.",
      );

    const selection = record(
      prediction.valueSelection,
      "cost prediction value selection",
    );
    const wallSelection = costTableSelection(
      sources,
      selection.wallClock,
      "wall-clock selection",
    );
    const tokenSelection = costTableSelection(
      sources,
      selection.providerTokens,
      "provider-token selection",
    );
    const monetary = record(selection.monetary, "monetary selection");
    const monetarySource = declaredSource(
      sources,
      monetary.sourcePath,
      monetary.sourceSha256,
      "monetary selection",
    );
    const monetaryAssertion: string = nonblank(
      monetary.assertionText,
      "monetary assertion",
    );
    if (!monetarySource.text.includes(monetaryAssertion))
      throw new Error(
        "Monetary-unavailable assertion drifted from its Markdown source.",
      );
    const zero = record(
      prediction.zeroObservationProvenance,
      "zero-observation provenance",
    );
    const zeroSource = declaredSource(
      sources,
      zero.assertionSourcePath,
      zero.assertionSourceSha256,
      "zero-observation provenance",
    );
    const zeroAssertion: string = nonblank(
      zero.assertionText,
      "zero-observation assertion",
    );
    if (!zeroSource.text.includes(zeroAssertion))
      throw new Error(
        "Zero-observation assertion drifted from its Markdown source.",
      );

    const wallRows: ReadonlyMap<string, ISelectedQuantiles> =
      extractPredictionTable(
        wallSelection.source.text,
        wallSelection.heading,
        true,
      );
    const tokenRows: ReadonlyMap<string, ISelectedQuantiles> =
      extractPredictionTable(
        tokenSelection.source.text,
        tokenSelection.heading,
        false,
      );
    const seen: Set<string> = new Set();
    for (const entry of array(prediction.rows, "cost prediction rows")) {
      const row = record(entry, "cost prediction row");
      const subject: string = nonblank(row.subject, "cost prediction subject");
      const arm: string = nonblank(row.arm, "cost prediction arm");
      const key: string = `${subject}\0${arm}`;
      if (seen.has(key))
        throw new Error(
          `Cost prediction subject/arm row is duplicated: ${subject}/${arm}.`,
        );
      seen.add(key);
      const expectedWall = wallRows.get(key);
      const expectedTokens = tokenRows.get(key);
      if (expectedWall === undefined || expectedTokens === undefined)
        throw new Error(
          `Cost prediction row is not tracked by both Markdown tables: ${subject}/${arm}.`,
        );
      const milestones = record(row.milestones, `${subject}/${arm} milestones`);
      compareMilestone(
        milestones.t_done,
        expectedWall.tDone,
        expectedTokens.tDone,
        `${subject}/${arm}/t_done`,
      );
      compareMilestone(
        milestones.t_dry,
        expectedWall.tDry,
        expectedTokens.tDry,
        `${subject}/${arm}/t_dry`,
      );
    }
    const expectedKeys: Set<string> = new Set([
      ...wallRows.keys(),
      ...tokenRows.keys(),
    ]);
    if (
      seen.size !== expectedKeys.size ||
      [...expectedKeys].some((key) => !seen.has(key))
    )
      throw new Error(
        "Cost prediction rows do not cover the exact Markdown subject/arm population.",
      );
  }

  interface ICostPredictionSource {
    order: number | null;
    path: string;
    bytes: number;
    sha256: string;
    reviewId: number;
    text: string;
  }

  interface ICostTableSelection {
    source: ICostPredictionSource;
    heading: string;
  }

  interface IQuantilePair {
    p50: number;
    p90: number;
  }

  interface ISelectedQuantiles {
    tDone: IQuantilePair;
    tDry: IQuantilePair;
  }

  function costPredictionSource(
    root: string,
    input: unknown,
    label: string,
    requireOrder: boolean = true,
  ): ICostPredictionSource {
    const source = record(input, label);
    const relative: string = nonblank(source.path, `${label} path`);
    const file: string = resolveProtocolPath(root, relative);
    const bytes: Buffer = fs.readFileSync(file);
    const expectedBytes: number = integer(source.bytes, `${label} bytes`);
    const expectedSha256: string = nonblank(source.sha256, `${label} SHA-256`);
    const text: string = decodeUtf8(bytes, file);
    if (bytes.byteLength !== expectedBytes || sha256(bytes) !== expectedSha256)
      throw new Error(`${label} source byte pin drifted: ${relative}.`);
    return {
      order: requireOrder ? integer(source.order, `${label} order`) : null,
      path: relative,
      bytes: expectedBytes,
      sha256: expectedSha256,
      reviewId: integer(source.reviewId, `${label} review id`),
      text,
    };
  }

  function costTableSelection(
    sources: ReadonlyMap<string, ICostPredictionSource>,
    input: unknown,
    label: string,
  ): ICostTableSelection {
    const selection = record(input, label);
    return {
      source: declaredSource(
        sources,
        selection.sourcePath,
        selection.sourceSha256,
        label,
      ),
      heading: nonblank(selection.sectionHeading, `${label} heading`),
    };
  }

  function declaredSource(
    sources: ReadonlyMap<string, ICostPredictionSource>,
    pathValue: unknown,
    shaValue: unknown,
    label: string,
  ): ICostPredictionSource {
    const relative: string = nonblank(pathValue, `${label} source path`);
    const digest: string = nonblank(shaValue, `${label} source SHA-256`);
    const source = sources.get(relative);
    if (source === undefined)
      throw new Error(`${label} names an untracked source: ${relative}.`);
    if (source.sha256 !== digest)
      throw new Error(
        `${label} source digest disagrees with the source chain.`,
      );
    return source;
  }

  function extractPredictionTable(
    markdown: string,
    heading: string,
    hours: boolean,
  ): ReadonlyMap<string, ISelectedQuantiles> {
    const lines: string[] = markdown.split(/\r?\n/u);
    const headingIndex: number = lines.indexOf(heading);
    if (headingIndex < 0)
      throw new Error(
        `Cost prediction Markdown heading is absent: ${heading}.`,
      );
    if (lines.lastIndexOf(heading) !== headingIndex)
      throw new Error(
        `Cost prediction Markdown heading is duplicated: ${heading}.`,
      );
    const nextHeadingIndex: number = lines.findIndex(
      (line, index) => index > headingIndex && line.startsWith("## "),
    );
    const sectionEnd: number =
      nextHeadingIndex < 0 ? lines.length : nextHeadingIndex;
    const headerIndex: number = lines.findIndex(
      (line, index) =>
        index > headingIndex &&
        index < sectionEnd &&
        line.startsWith("| Subject | Arm | `t_done` P10/P50/P90 |"),
    );
    if (headerIndex < 0)
      throw new Error(`Cost prediction Markdown table is absent: ${heading}.`);
    const rows: Map<string, ISelectedQuantiles> = new Map();
    for (let index: number = headerIndex + 2; index < sectionEnd; ++index) {
      const line: string | undefined = lines[index];
      if (line === undefined) break;
      if (!line.startsWith("|")) break;
      const columns: string[] = line
        .slice(1, -1)
        .split("|")
        .map((column) => column.trim());
      if (columns.length !== 4)
        throw new Error(`Malformed cost prediction table row: ${line}.`);
      const subject: string = columns[0]!.toLowerCase();
      const arm: string = columns[1]!.toLowerCase();
      const key: string = `${subject}\0${arm}`;
      if (rows.has(key))
        throw new Error(
          `Markdown cost prediction row is duplicated: ${subject}/${arm}.`,
        );
      rows.set(key, {
        tDone: parsePredictionTriplet(columns[2]!, hours, line),
        tDry: parsePredictionTriplet(columns[3]!, hours, line),
      });
    }
    if (rows.size === 0)
      throw new Error(`Cost prediction Markdown table is empty: ${heading}.`);
    return rows;
  }

  function parsePredictionTriplet(
    input: string,
    hours: boolean,
    label: string,
  ): IQuantilePair {
    const normalized: string = hours ? input.replace(/\s+h$/u, "") : input;
    const values: number[] = normalized.split("/").map((part) => {
      const token: string = part.trim().replaceAll(",", "");
      if (!/^[0-9]+$/u.test(token))
        throw new Error(`Malformed cost prediction quantile in ${label}.`);
      return Number(token);
    });
    if (values.length !== 3)
      throw new Error(`Cost prediction row does not contain P10/P50/P90.`);
    return { p50: values[1]!, p90: values[2]! };
  }

  function compareMilestone(
    input: unknown,
    expectedWall: IQuantilePair,
    expectedTokens: IQuantilePair,
    label: string,
  ): void {
    const milestone = record(input, label);
    compareQuantiles(
      milestone.wallClockHours,
      expectedWall,
      `${label} wall clock`,
    );
    compareQuantiles(
      milestone.providerTokensMillions,
      expectedTokens,
      `${label} provider tokens`,
    );
  }

  function compareQuantiles(
    input: unknown,
    expected: IQuantilePair,
    label: string,
  ): void {
    const quantiles = record(input, label);
    const actual: IQuantilePair = {
      p50: integer(quantiles.p50, `${label} P50`),
      p90: integer(quantiles.p90, `${label} P90`),
    };
    if (actual.p50 !== expected.p50 || actual.p90 !== expected.p90)
      throw new Error(
        `${label} drifted from Markdown: expected P50/P90 ${expected.p50}/${expected.p90}, got ${actual.p50}/${actual.p90}.`,
      );
  }

  function quotaAuthorityBoundaryPolicy(protocolRoot: string): {
    maximumDurationMs: number;
    utcMonotonicToleranceMs: number;
    policySha256: string;
    attestationProjectionFields: string[];
  } {
    const pinsPath: string = path.join(protocolRoot, "pins.json");
    const pins = record(
      parseBytes(fs.readFileSync(pinsPath), pinsPath),
      "protocol pins",
    );
    const policy = record(
      pins.quotaAuthorityBoundary,
      "quota authority boundary pins",
    );
    const quotaPolicyPath: string = path.join(
      protocolRoot,
      "quota-policy.json",
    );
    const quotaPolicyBytes: Buffer = fs.readFileSync(quotaPolicyPath);
    const quotaPolicy = validateValue<Record<string, unknown>>(
      protocolRoot,
      "quota-policy.schema.json",
      parseBytes(quotaPolicyBytes, quotaPolicyPath),
      "quota policy",
    );
    const quotaPolicyPin = record(pins.quotaPolicy, "quota policy pins");
    const policySha256: string = sha256(quotaPolicyBytes);
    const repositoryDigests = record(
      pins.repositoryFrozenDigests,
      "repository frozen digests",
    );
    if (
      quotaPolicyPin.path !== "benchmark/protocol/quota-policy.json" ||
      quotaPolicyPin.schemaPath !==
        "benchmark/protocol/schema/quota-policy.schema.json" ||
      quotaPolicyPin.bytes !== quotaPolicyBytes.byteLength ||
      quotaPolicyPin.sha256 !== policySha256 ||
      quotaPolicyPin.policyId !== quotaPolicy.policyId ||
      quotaPolicyPin.attestationAlgorithmId !==
        "sha256-rfc8785-sanitized-quota-attestation-v1" ||
      quotaPolicyPin.authorityRequestDigestAlgorithmId !==
        "sha256-rfc8785-controller-quota-request-v1" ||
      quotaPolicyPin.canonicalImplementationScope !==
        "rfc8785-equivalent-closed-ascii-projection-v1" ||
      repositoryDigests.quotaPolicySha256 !== policySha256
    )
      throw new Error("Quota policy artifact pin drifted.");
    const authorityRequest = record(
      quotaPolicy.authorityRequest,
      "quota authority request policy",
    );
    const attestation = record(
      quotaPolicy.sanitizedAttestation,
      "sanitized quota attestation policy",
    );
    if (
      authorityRequest.digestAlgorithmId !==
        "sha256-rfc8785-controller-quota-request-v1" ||
      authorityRequest.canonicalization !== "RFC8785" ||
      authorityRequest.implementationScope !==
        "rfc8785-equivalent-closed-ascii-projection-v1" ||
      canonical(authorityRequest.projectionFields) !==
        canonical([
          "authorityRequestId",
          "phase",
          "blockId",
          "planSha256",
          "subjects",
        ]) ||
      authorityRequest.preparePlanSha256 !== null ||
      authorityRequest.startPlanSha256 !== "exact-closed-block-plan-sha256" ||
      attestation.canonicalization !== "RFC8785" ||
      attestation.implementationScope !==
        "rfc8785-equivalent-closed-ascii-projection-v1"
    )
      throw new Error("Quota authority request digest policy drifted.");
    const attestationProjectionFields: string[] = stringArray(
      attestation.projectionFields,
      "quota attestation projection fields",
    );
    const maximumDurationMs: number = positiveInteger(
      policy.maximumDurationMs,
      "quota authority pinned maximum duration",
    );
    const utcMonotonicToleranceMs: number = positiveInteger(
      policy.utcMonotonicToleranceMs,
      "quota authority UTC/monotonic tolerance",
    );
    if (
      policy.schemaRef !==
        "benchmark/protocol/schema/block-plan.schema.json#/$defs/quotaAuthorityBoundary" ||
      policy.prepareAdmissionSchema !==
        "benchmark/protocol/schema/quota-prepare-authority.schema.json" ||
      policy.prepareAdmissionValidator !==
        "EvidenceBenchmarkProtocolValidator.validateQuotaAuthorityBoundaryValue" ||
      policy.phase !== "prepare" ||
      maximumDurationMs !== 60_000 ||
      utcMonotonicToleranceMs !== 2_000 ||
      policy.elapsedMonotonicNsEncoding !== "nonnegative-decimal-string" ||
      policy.rawMonotonicAbsoluteValuesRetained !== false ||
      policy.capturedWithinLiveIntervalRequired !== true ||
      policy.attestationBinding !==
        "authorization.quotaState.attestationSha256" ||
      policy.authorityRequestDigestAlgorithmId !==
        "sha256-rfc8785-controller-quota-request-v1" ||
      policy.authorityRequestProjection !==
        "authorityRequestId,phase,blockId,planSha256,subjects" ||
      policy.canonicalImplementationScope !==
        "rfc8785-equivalent-closed-ascii-projection-v1" ||
      policy.startExecutionAdmissionConsumer !==
        "benchmark/protocol/schema/quota-start-authority.schema.json" ||
      policy.startExecutionAdmissionValidator !==
        "EvidenceBenchmarkProtocolValidator.validateStartQuotaAuthorityAdmissionValue"
    )
      throw new Error("Quota authority boundary protocol pins drifted.");
    return {
      maximumDurationMs,
      utcMonotonicToleranceMs,
      policySha256,
      attestationProjectionFields,
    };
  }

  interface ILoadedSchema {
    path: string;
    id: string;
    value: Record<string, unknown>;
  }

  interface ISchemaRegistry {
    schemaRoot: string;
    byPath: ReadonlyMap<string, ILoadedSchema>;
    byId: ReadonlyMap<string, ILoadedSchema>;
    ajv: Ajv2020;
  }

  function loadSchemas(protocolRoot: string): ISchemaRegistry {
    const schemaRoot: string = path.join(path.resolve(protocolRoot), "schema");
    const files: string[] = fs
      .readdirSync(schemaRoot, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith(".schema.json"))
      .map((entry) => path.join(schemaRoot, entry.name))
      .sort((left, right) => Buffer.from(left).compare(Buffer.from(right)));
    assertTrackedSchemaInventory(protocolRoot, schemaRoot, files);
    const loaded: ILoadedSchema[] = files.map((file) => {
      const value = record(
        parseBytes(fs.readFileSync(file), file),
        `${file} schema`,
      );
      return {
        path: path.resolve(file),
        id: nonblank(value.$id, `${file} $id`),
        value,
      };
    });
    const byPath: Map<string, ILoadedSchema> = new Map();
    const byId: Map<string, ILoadedSchema> = new Map();
    for (const schema of loaded) {
      if (byId.has(schema.id))
        throw new Error(`Protocol schema $id is duplicated: ${schema.id}.`);
      byPath.set(schema.path, schema);
      byId.set(schema.id, schema);
    }
    for (const schema of loaded)
      inspectReferences(schema.value, schema.id, byId, new Set());
    const ajv = new Ajv2020({
      allErrors: true,
      allowUnionTypes: true,
      strictSchema: true,
      strictTypes: false,
      strictTuples: false,
      validateFormats: true,
    });
    addFormats(ajv);
    for (const schema of loaded) ajv.addSchema(schema.value, schema.id);
    for (const schema of loaded)
      if (ajv.getSchema(schema.id) === undefined)
        throw new Error(`Protocol schema did not compile: ${schema.path}.`);
    return { schemaRoot, byPath, byId, ajv };
  }

  function assertTrackedSchemaInventory(
    protocolRoot: string,
    schemaRoot: string,
    files: readonly string[],
  ): void {
    const repository: string = fs.realpathSync.native(
      childProcess
        .execFileSync(
          "git",
          ["-C", path.resolve(protocolRoot), "rev-parse", "--show-toplevel"],
          { encoding: "utf8", windowsHide: true },
        )
        .trim(),
    );
    const canonicalSchemaRoot: string = fs.realpathSync.native(schemaRoot);
    const relativeRoot: string = path
      .relative(repository, canonicalSchemaRoot)
      .split(path.sep)
      .join("/");
    if (
      relativeRoot.length === 0 ||
      relativeRoot === ".." ||
      relativeRoot.startsWith("../") ||
      path.isAbsolute(relativeRoot)
    )
      throw new Error(
        `Protocol schema root escapes its Git repository: ${canonicalSchemaRoot}.`,
      );
    const tracked: string[] = childProcess
      .execFileSync(
        "git",
        ["-C", repository, "ls-files", "-z", "--", relativeRoot],
        { encoding: "utf8", windowsHide: true },
      )
      .split("\0")
      .filter(
        (entry) =>
          entry.length !== 0 &&
          path.posix.dirname(entry) === relativeRoot &&
          entry.endsWith(".schema.json"),
      )
      .sort(compareUtf8);
    const present: string[] = files
      .map((file) => `${relativeRoot}/${path.basename(file)}`)
      .sort(compareUtf8);
    if (
      tracked.length === 0 ||
      JSON.stringify(tracked) !== JSON.stringify(present)
    )
      throw new Error(
        `Protocol schema inventory differs from Git: tracked ${tracked.length}, present ${present.length}.`,
      );
  }

  function validateLoaded(
    registry: ISchemaRegistry,
    schemaRelativePath: string,
    value: unknown,
    label: string,
  ): void {
    const schemaPath: string = resolveSchemaPath(
      registry.schemaRoot,
      schemaRelativePath,
    );
    const schema = registry.byPath.get(schemaPath);
    if (schema === undefined)
      throw new Error(
        `${label} names an untracked protocol schema: ${schemaRelativePath}.`,
      );
    const validate: ValidateFunction | undefined = registry.ajv.getSchema(
      schema.id,
    );
    if (validate === undefined)
      throw new Error(
        `${label} schema did not compile: ${schemaRelativePath}.`,
      );
    if (!validate(value))
      throw new ValidationError(label, diagnostics(validate.errors ?? []));
  }

  function inspectReferences(
    value: unknown,
    baseId: string,
    byId: ReadonlyMap<string, ILoadedSchema>,
    visited: Set<string>,
  ): void {
    if (Array.isArray(value)) {
      for (const item of value) inspectReferences(item, baseId, byId, visited);
      return;
    }
    if (!isRecord(value)) return;
    for (const [key, child] of Object.entries(value)) {
      if (key !== "$ref") {
        inspectReferences(child, baseId, byId, visited);
        continue;
      }
      const reference: string = nonblank(child, `${baseId} $ref`);
      if (reference.startsWith("#")) continue;
      const resolved: URL = new URL(reference, baseId);
      resolved.hash = "";
      const target: string = resolved.href;
      const schema = byId.get(target);
      if (schema === undefined)
        throw new Error(
          `Protocol schema reference escapes the offline registry: ${reference} from ${baseId}.`,
        );
      const edge: string = `${baseId}\0${target}`;
      if (visited.has(edge)) continue;
      visited.add(edge);
      inspectReferences(schema.value, schema.id, byId, visited);
    }
  }

  function inspectProviderSchema(
    value: unknown,
    baseId: string,
    allowed: ReadonlySet<string>,
    schemas: ISchemaRegistry,
    visited: Set<string>,
  ): void {
    if (!isRecord(value))
      throw new Error(`Provider schema node must be an object: ${baseId}.`);
    for (const [key, child] of Object.entries(value)) {
      if (!allowed.has(key))
        throw new Error(
          `Provider schema ${baseId} uses unsupported keyword ${key}.`,
        );
      if (key === "properties") {
        const properties = record(child, `${baseId} properties`);
        for (const property of Object.values(properties))
          inspectProviderSchema(property, baseId, allowed, schemas, visited);
        continue;
      }
      if (key === "items" || key === "additionalProperties") {
        if (isRecord(child))
          inspectProviderSchema(child, baseId, allowed, schemas, visited);
        else if (typeof child !== "boolean")
          throw new Error(
            `Provider schema ${baseId} has an invalid ${key} value.`,
          );
        continue;
      }
      if (key !== "$ref") {
        continue;
      }
      const reference: string = nonblank(child, `${baseId} provider $ref`);
      if (reference.startsWith("#")) {
        inspectProviderSchema(
          resolveFragment(schemas.byId.get(baseId)?.value, reference, baseId),
          baseId,
          allowed,
          schemas,
          visited,
        );
        continue;
      }
      const resolved: URL = new URL(reference, baseId);
      const fragment: string = resolved.hash;
      resolved.hash = "";
      const target = schemas.byId.get(resolved.href);
      if (target === undefined)
        throw new Error(
          `Provider schema reference escapes the offline registry: ${reference} from ${baseId}.`,
        );
      const edge: string = `${baseId}\0${resolved.href}${fragment}`;
      if (visited.has(edge)) continue;
      visited.add(edge);
      inspectProviderSchema(
        resolveFragment(target.value, fragment || "#", target.id),
        target.id,
        allowed,
        schemas,
        visited,
      );
    }
  }

  function resolveFragment(
    root: Record<string, unknown> | undefined,
    fragment: string,
    label: string,
  ): unknown {
    if (root === undefined)
      throw new Error(`Provider schema is absent from registry: ${label}.`);
    if (fragment === "#") return root;
    if (!fragment.startsWith("#/"))
      throw new Error(`Unsupported provider schema fragment: ${fragment}.`);
    return fragment
      .slice(2)
      .split("/")
      .map((token) => token.replaceAll("~1", "/").replaceAll("~0", "~"))
      .reduce<unknown>((current, token) => {
        const object = record(current, `${label}${fragment}`);
        if (!Object.hasOwn(object, token))
          throw new Error(
            `Provider schema fragment does not exist: ${label}${fragment}.`,
          );
        return object[token];
      }, root);
  }

  function resolveSchemaPath(root: string, relative: string): string {
    if (
      path.isAbsolute(relative) ||
      relative.includes("\\") ||
      relative.includes("\0")
    )
      throw new Error(`Protocol schema path is not canonical: ${relative}.`);
    const normalized: string = relative.startsWith("schema/")
      ? relative.slice("schema/".length)
      : relative;
    if (
      normalized.length === 0 ||
      normalized
        .split("/")
        .some(
          (segment) => segment === "" || segment === "." || segment === "..",
        )
    )
      throw new Error(`Protocol schema path is not canonical: ${relative}.`);
    const resolved: string = path.resolve(root, ...normalized.split("/"));
    const prefix: string = `${path.resolve(root)}${path.sep}`;
    if (!resolved.startsWith(prefix))
      throw new Error(`Protocol schema path escapes its root: ${relative}.`);
    return resolved;
  }

  function resolveProtocolPath(root: string, relative: string): string {
    if (
      path.isAbsolute(relative) ||
      relative.includes("\\") ||
      relative.includes("\0")
    )
      throw new Error(`Protocol artifact path is not canonical: ${relative}.`);
    const segments: string[] = relative.split("/");
    if (
      segments.length === 0 ||
      segments.some(
        (segment) => segment === "" || segment === "." || segment === "..",
      )
    )
      throw new Error(`Protocol artifact path is not canonical: ${relative}.`);
    const absoluteRoot: string = path.resolve(root);
    const resolved: string = path.resolve(absoluteRoot, ...segments);
    if (!resolved.startsWith(`${absoluteRoot}${path.sep}`))
      throw new Error(`Protocol artifact path escapes its root: ${relative}.`);
    return resolved;
  }

  function diagnostics(errors: readonly ErrorObject[]): IDiagnostic[] {
    return errors
      .map((error) => ({
        instancePath: error.instancePath,
        schemaPath: error.schemaPath,
        keyword: error.keyword,
        message: error.message ?? "schema assertion failed",
        params: canonical(error.params),
      }))
      .sort((left, right) =>
        compareUtf8(
          [
            left.instancePath,
            left.schemaPath,
            left.keyword,
            left.message,
            left.params,
          ].join("\0"),
          [
            right.instancePath,
            right.schemaPath,
            right.keyword,
            right.message,
            right.params,
          ].join("\0"),
        ),
      );
  }

  function assertClosedAsciiJson(
    value: unknown,
    label: string,
    location: string = "$",
  ): void {
    if (value === null || typeof value === "boolean") return;
    if (typeof value === "string") {
      if (
        [...value].some((character) => {
          const code: number = character.charCodeAt(0);
          return code < 0x20 || code > 0x7e;
        })
      )
        throw new Error(
          `${label} escapes the closed printable-ASCII domain at ${location}.`,
        );
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((child, index) =>
        assertClosedAsciiJson(child, label, `${location}/${String(index)}`),
      );
      return;
    }
    if (!isRecord(value))
      throw new Error(
        `${label} contains a non-closed JSON value at ${location}.`,
      );
    for (const [key, child] of Object.entries(value)) {
      if ([...key].some((character) => character.charCodeAt(0) > 0x7f))
        throw new Error(`${label} has a non-ASCII member name at ${location}.`);
      assertClosedAsciiJson(child, label, `${location}/${key}`);
    }
  }

  function canonical(value: unknown): string {
    if (value === null || typeof value !== "object")
      return JSON.stringify(value);
    if (Array.isArray(value))
      return `[${value.map((entry) => canonical(entry)).join(",")}]`;
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => compareUtf8(left, right))
      .map(([key, child]) => `${JSON.stringify(key)}:${canonical(child)}`)
      .join(",")}}`;
  }

  function compareUtf8(left: string, right: string): number {
    return Buffer.compare(
      Buffer.from(left, "utf8"),
      Buffer.from(right, "utf8"),
    );
  }

  function sha256(bytes: Uint8Array): string {
    return crypto.createHash("sha256").update(bytes).digest("hex");
  }

  function decodeUtf8(bytes: Uint8Array, label: string): string {
    try {
      return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch (error) {
      throw new SyntaxError(
        `${label} is not UTF-8: ${
          error instanceof Error ? error.message : String(error)
        }.`,
      );
    }
  }

  function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }

  function record(value: unknown, label: string): Record<string, unknown> {
    if (!isRecord(value)) throw new Error(`${label} must be an object.`);
    return value;
  }

  function array(value: unknown, label: string): unknown[] {
    if (!Array.isArray(value)) throw new Error(`${label} must be an array.`);
    return value;
  }

  function stringArray(value: unknown, label: string): string[] {
    return array(value, label).map((entry, index) =>
      nonblank(entry, `${label} ${index}`),
    );
  }

  function nonblank(value: unknown, label: string): string {
    if (
      typeof value !== "string" ||
      value.length === 0 ||
      value !== value.trim()
    )
      throw new Error(`${label} must be a nonblank string.`);
    return value;
  }

  function integer(value: unknown, label: string): number {
    if (typeof value !== "number" || !Number.isSafeInteger(value))
      throw new Error(`${label} must be a safe integer.`);
    return value;
  }

  function positiveInteger(value: unknown, label: string): number {
    const result: number = integer(value, label);
    if (result < 1) throw new Error(`${label} must be positive.`);
    return result;
  }

  function commit(value: unknown, label: string): string {
    const result: string = nonblank(value, label);
    if (!/^[a-f0-9]{40}$/u.test(result))
      throw new Error(`${label} must be a 40-character Git object ID.`);
    return result;
  }

  function digest(value: unknown, label: string): string {
    const result: string = nonblank(value, label);
    if (!/^[a-f0-9]{64}$/u.test(result))
      throw new Error(`${label} must be a lowercase SHA-256.`);
    return result;
  }

  function dateTime(value: unknown, label: string): number {
    const result: string = nonblank(value, label);
    const match: RegExpMatchArray | null = result.match(
      /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?(?:Z|[+-](\d{2}):(\d{2}))$/u,
    );
    if (match === null)
      throw new Error(`${label} must be an RFC 3339 date-time.`);
    const [
      ,
      yearText,
      monthText,
      dayText,
      hourText,
      minuteText,
      secondText,
      ,
      offsetHourText,
      offsetMinuteText,
    ] = match;
    const year: number = Number(yearText);
    const month: number = Number(monthText);
    const day: number = Number(dayText);
    const hour: number = Number(hourText);
    const minute: number = Number(minuteText);
    const second: number = Number(secondText);
    const offsetHour: number =
      offsetHourText === undefined ? 0 : Number(offsetHourText);
    const offsetMinute: number =
      offsetMinuteText === undefined ? 0 : Number(offsetMinuteText);
    const leapYear: boolean =
      year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    const daysInMonth: number[] = [
      31,
      leapYear ? 29 : 28,
      31,
      30,
      31,
      30,
      31,
      31,
      30,
      31,
      30,
      31,
    ];
    const epoch: number = Date.parse(result);
    if (
      day < 1 ||
      day > (daysInMonth[month - 1] ?? 0) ||
      hour > 23 ||
      minute > 59 ||
      second > 59 ||
      offsetHour > 23 ||
      offsetMinute > 59 ||
      !Number.isFinite(epoch)
    )
      throw new Error(`${label} must be an RFC 3339 date-time.`);
    return epoch;
  }

  class StrictJsonParser {
    private offset: number = 0;

    public constructor(
      private readonly source: string,
      private readonly label: string,
    ) {}

    public parse(): unknown {
      if (this.source.charCodeAt(0) === 0xfeff)
        this.fail("UTF-8 BOM is forbidden");
      this.whitespace();
      const value: unknown = this.value();
      this.whitespace();
      if (this.offset !== this.source.length)
        this.fail("unexpected trailing token");
      return value;
    }

    private value(): unknown {
      const token: string | undefined = this.source[this.offset];
      if (token === "{") return this.object();
      if (token === "[") return this.list();
      if (token === '"') return this.string();
      if (
        token === "-" ||
        (token !== undefined && token >= "0" && token <= "9")
      )
        return this.number();
      if (this.source.startsWith("true", this.offset)) {
        this.offset += 4;
        return true;
      }
      if (this.source.startsWith("false", this.offset)) {
        this.offset += 5;
        return false;
      }
      if (this.source.startsWith("null", this.offset)) {
        this.offset += 4;
        return null;
      }
      this.fail("expected a JSON value");
    }

    private object(): Record<string, unknown> {
      ++this.offset;
      this.whitespace();
      const entries: Array<[string, unknown]> = [];
      const keys: Set<string> = new Set();
      if (this.source[this.offset] === "}") {
        ++this.offset;
        return {};
      }
      while (true) {
        if (this.source[this.offset] !== '"')
          this.fail("expected an object member name");
        const key: string = this.string();
        if (keys.has(key))
          this.fail(`duplicate object member ${JSON.stringify(key)}`);
        keys.add(key);
        this.whitespace();
        if (this.source[this.offset] !== ":")
          this.fail("expected ':' after object member name");
        ++this.offset;
        this.whitespace();
        entries.push([key, this.value()]);
        this.whitespace();
        const separator: string | undefined = this.source[this.offset];
        if (separator === "}") {
          ++this.offset;
          return Object.fromEntries(entries);
        }
        if (separator !== ",") this.fail("expected ',' or '}' in object");
        ++this.offset;
        this.whitespace();
      }
    }

    private list(): unknown[] {
      ++this.offset;
      this.whitespace();
      const values: unknown[] = [];
      if (this.source[this.offset] === "]") {
        ++this.offset;
        return values;
      }
      while (true) {
        values.push(this.value());
        this.whitespace();
        const separator: string | undefined = this.source[this.offset];
        if (separator === "]") {
          ++this.offset;
          return values;
        }
        if (separator !== ",") this.fail("expected ',' or ']' in array");
        ++this.offset;
        this.whitespace();
      }
    }

    private string(): string {
      const start: number = this.offset;
      ++this.offset;
      let escaped: boolean = false;
      while (this.offset < this.source.length) {
        const code: number = this.source.charCodeAt(this.offset);
        if (!escaped && code === 0x22) {
          ++this.offset;
          try {
            return JSON.parse(this.source.slice(start, this.offset)) as string;
          } catch {
            this.fail("invalid JSON string");
          }
        }
        if (!escaped && code < 0x20)
          this.fail("unescaped control character in string");
        if (!escaped && code === 0x5c) escaped = true;
        else escaped = false;
        ++this.offset;
      }
      this.fail("unterminated JSON string");
    }

    private number(): number {
      const rest: string = this.source.slice(this.offset);
      const match: RegExpMatchArray | null = rest.match(
        /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/,
      );
      if (match === null) this.fail("invalid JSON number");
      this.offset += match[0].length;
      const value: number = Number(match[0]);
      if (!Number.isFinite(value)) this.fail("non-finite JSON number");
      return value;
    }

    private whitespace(): void {
      while (
        this.offset < this.source.length &&
        [0x20, 0x09, 0x0a, 0x0d].includes(this.source.charCodeAt(this.offset))
      )
        ++this.offset;
    }

    private fail(message: string): never {
      throw new SyntaxError(
        `${this.label} is not strict JSON at offset ${this.offset}: ${message}.`,
      );
    }
  }
}
