# Neutral bundle and stripping procedure

The live workspace is the authoritative measured execution state, and its retained project snapshot is the authoritative Git-preserved source artifact. Stripping creates a separate read-only bundle for neutral discovery and blind grading; it never changes, builds, tests, or replaces either source.

This transform is a required production runner component. A manual copy, fixture-only adapter, regular-expression fallback, or operator-edited bundle cannot satisfy the campaign contract.

## Inputs and identity

The transform takes an immutable workspace snapshot, subject requirements, a fixed transform version, and a random bundle ID unrelated to subject, arm, replicate, timestamps, workspace names, or run IDs.

The output records:

- input snapshot tree digest;
- transform version and source digest;
- every included, excluded, normalized, and annotation-stripped path;
- before and after content digests;
- parser package, exact version, grammar digest, and parser-source digest for every supported format;
- the per-format exact-grammar fixture-set digest and pass result;
- leak-scan rules and results;
- final bundle tree digest.

The bundle contains the frozen requirements and product artifacts needed to assess behavior. It does not contain predictions or run history.

## Included product surfaces

Include source, tests, migrations and schema, public API definitions, frontend assets, package manifests after normalization, lockfile after normalization when safe, and product documentation written for users of the generated application.

Exclude dependencies, build outputs, coverage outputs, caches, screenshots that contain runner UI, hidden tests, runner state, and external grading results.

## Method removal

Remove these paths before semantic grading:

- `AGENTS.md`, `CLAUDE.md`, `.agents/`, `.codex/`, `.claude/`, and method-specific instructions;
- `.wiki/`, campaign ledgers, evidence ledgers, progress ledgers, plans, and run notes;
- benchmark manifest, prompts, protocol, raw streams, token use, timing, checkpoints, heartbeat, and campaign history;
- every `lint.config.*` and evidence-only lint output;
- locally packed evidence tarballs and vendor paths that name the arm;
- `.git/`, generated build output, caches, and dependencies.

Product-facing documentation remains only when it is part of the application rather than the generation method. The transform manifest names every such judgment through a frozen path rule; there is no per-run discretion.

## Evidence annotation removal

Use syntax-aware parsers for TypeScript JSDoc, Markdown HTML comments, and Prisma triple-slash comments. Remove only complete `@evidence` and `@evidenceExclude` tag records, including grammar-defined continuation lines. Preserve surrounding prose, unrelated JSDoc tags, source spacing, and executable code. The manifest pins each parser's exact package or internal implementation identity, version, parser-source digest, and accepted grammar digest.

A regular expression is insufficient because it can remove neighboring documentation or leave multiline reasons that reveal the arm. Parser failure aborts bundle creation; it does not fall back to broad text deletion.

When a comment becomes empty after tag removal, remove the empty comment deterministically. Emit an annotation-removal record with path, source span, tag kind, and before/after digest without storing the reason in the blind bundle.

## Manifest and dependency normalization

Parse JSON, JSONC, YAML, and TypeScript configuration with pinned parsers. Remove only:

- `@samchon/lint-plugin-evidence` dependency and local tarball references;
- scripts or configuration entries used solely to invoke evidence rules;
- arm labels, run IDs, and arm-specific workspace names;
- evidence-only package overrides.

Do not replace product dependencies, reorder unrelated keys, regenerate a lockfile, or make the stripped artifact buildable. Raw gates run before stripping. If safe structural normalization is impossible, exclude the entire method-only file and record why.

Normalize absolute source and workspace paths to bundle-relative paths. Preserve line endings as LF and file modes in the transform manifest.

## Leak scan

Bundle creation fails when any path or text matches a frozen identity rule, including case-insensitive and Unicode-normalized variants of:

```text
@evidence
@evidenceExclude
lint-plugin-evidence
evidence/graph
evidence/documented
evidence/singular
plain
treatment
control arm
campaign ledger
run ID
original workspace path
```

The scanner also rejects residual `.agents`, lint config, tarball, branch, repository worktree, and result-path names. Generic domain uses of words such as “evidence” or “plain” require a frozen allowlist entry tied to a requirements source span; the operator cannot add an allowlist after seeing an arm.

Scan file names, symlink targets, text, source maps, binary strings, archive members, package metadata, and image metadata. Unknown binary formats are excluded or make the bundle unverifiable.

## Verification

The transform is tested on synthetic fixtures containing every supported annotation form, multiline reason, adjacent JSDoc tag, CRLF input, Unicode, empty comment, malformed tag, manifest shape, lockfile reference, binary metadata, and forbidden path. TypeScript, Markdown, Prisma, and structured configuration each own an exact fixture inventory and digest. Every accepted and rejected grammar case must pass through the production parser entry point; a fixture-only parser or regular-expression implementation cannot satisfy the gate.

Running the transform twice on the same snapshot and version must produce the same content tree digest. Only the random external bundle ID may differ, and it is not embedded in product files.

For every accepted bundle:

1. Verify the raw snapshot digest.
2. Run the transform in a new output root.
3. Validate the transform manifest.
4. Run the complete leak scan.
5. Compare deterministic tree digest with a second transform.
6. Seal the bundle read-only.
7. Supply only the bundle, requirements, catalog, and permitted deterministic results to finders and graders.

Report raw and stripped artifact scale. A large arm-specific stripping delta is itself a measurement and a potential blinding threat.
