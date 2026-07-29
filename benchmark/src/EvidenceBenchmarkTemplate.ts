import fs from "node:fs";
import path from "node:path";

import { EvidenceBenchmarkMarkdown } from "./EvidenceBenchmarkMarkdown.ts";

import { EvidenceBenchmarkHash } from "./EvidenceBenchmarkHash.ts";
import type { IEvidenceBenchmarkMaterialization } from "./structures/IEvidenceBenchmarkMaterialization.ts";

/** Composes, renders, and validates the frozen base and mechanism templates. */
export namespace EvidenceBenchmarkTemplate {
  const SPLICE_COMMENT = "<!-- benchmark-template-splice: base-body -->";
  const SPLICE_TOKEN = "{{base}}";
  const VARIABLE_KEYS = [
    "name",
    "apiPackageName",
    "backendPackageName",
    "frontendPackageName",
  ] as const;
  const FULL_REPLACEMENT_COLLISIONS: ReadonlySet<string> = new Set([
    "packages/api/lint.config.ts",
    "packages/backend/lint.config.main.ts",
    "packages/backend/lint.config.ts",
    "packages/frontend/lint.config.ts",
  ]);
  const EVIDENCE_ONLY_PATHS: ReadonlySet<string> = new Set([
    ".agents/skills/evidence/SKILL.md",
  ]);
  const BASE_REQUIRED_PATHS: readonly string[] = [
    ".agents/skills/api/SKILL.md",
    ".agents/skills/backend/SKILL.md",
    ".agents/skills/frontend/SKILL.md",
    ".agents/skills/project/SKILL.md",
    ".agents/skills/requirements/SKILL.md",
    "AGENTS.md",
    "CLAUDE.md",
    "config/lint.config.frontend.ts",
    "config/lint.config.ts",
    "config/package.json",
    "config/tsconfig.json",
    "package.json",
    "packages/api/lint.config.ts",
    "packages/api/package.json",
    "packages/api/scripts/ensure-nestia-exports.cjs",
    "packages/api/src/HttpError.ts",
    "packages/api/src/IConnection.ts",
    "packages/api/src/Primitive.ts",
    "packages/api/src/Resolved.ts",
    "packages/api/src/functional/health/index.ts",
    "packages/api/src/functional/index.ts",
    "packages/api/src/index.ts",
    "packages/api/src/module.ts",
    "packages/api/src/structures/DTO_EVIDENCE_EXCLUDE.ts",
    "packages/api/src/structures/index.ts",
    "packages/api/src/typings/IDiagnosis.ts",
    "packages/api/src/typings/IEntity.ts",
    "packages/api/src/typings/IPage.ts",
    "packages/api/src/typings/index.ts",
    "packages/api/tsconfig.json",
    "packages/backend/lint.config.main.ts",
    "packages/backend/lint.config.ts",
    "packages/backend/nestia.config.ts",
    "packages/backend/package.json",
    "packages/backend/prisma.config.ts",
    "packages/backend/prisma/schema/exclude.schema",
    "packages/backend/prisma/schema/main.prisma",
    "packages/backend/src/MyBackend.ts",
    "packages/backend/src/MyModule.ts",
    "packages/backend/src/controllers/CONTROLLER_EVIDENCE_EXCLUDE.ts",
    "packages/backend/src/controllers/HealthController.ts",
    "packages/backend/src/executable/server.ts",
    "packages/backend/src/executable/swagger.ts",
    "packages/backend/test/features/TEST_EVIDENCE_EXCLUDE.ts",
    "packages/backend/test/features/api/health/test_api_health.ts",
    "packages/backend/test/index.ts",
    "packages/backend/tsconfig.json",
    "packages/backend/tsconfig.lint.json",
    "packages/backend/tsconfig.test.json",
    "packages/frontend/index.html",
    "packages/frontend/lint.config.ts",
    "packages/frontend/package.json",
    "packages/frontend/playwright.config.ts",
    "packages/frontend/scripts/run-playwright.mjs",
    "packages/frontend/src/App.tsx",
    "packages/frontend/src/lib/client.ts",
    "packages/frontend/src/lib/config.ts",
    "packages/frontend/src/main.tsx",
    "packages/frontend/tests/journeys/scaffold.spec.ts",
    "packages/frontend/tsconfig.json",
    "packages/frontend/vite.config.ts",
    "pnpm-workspace.yaml",
  ];
  const ARM_REQUIRED_PATHS: Readonly<
    Record<IEvidenceBenchmarkMaterialization.Arm, readonly string[]>
  > = {
    evidence: [
      ".agents/skills/evidence/SKILL.md",
      ".agents/skills/review/SKILL.md",
      "AGENTS.md",
      "packages/api/lint.config.ts",
      "packages/backend/lint.config.main.ts",
      "packages/backend/lint.config.ts",
      "packages/frontend/lint.config.ts",
    ],
    plain: [
      ".agents/skills/review/SKILL.md",
      "AGENTS.md",
      "packages/api/lint.config.ts",
      "packages/backend/lint.config.main.ts",
      "packages/backend/lint.config.ts",
      "packages/frontend/lint.config.ts",
    ],
  };

  /** Rendered template and source identities consumed by the materializer. */
  export interface IComposition {
    /** Fully rendered workspace files before requirements and package injection. */
    files: ReadonlyMap<string, Uint8Array>;

    /** SHA-256 identity of normalized base template source files. */
    baseTreeSha256: string;

    /** SHA-256 identity of normalized arm template source files. */
    armTreeSha256: string;
  }

  /** Rendered neutral scaffold and its template-source identity. */
  export interface IBaseComposition {
    /** Fully rendered base files before any arm overlay or requirements. */
    files: ReadonlyMap<string, Uint8Array>;

    /** SHA-256 identity of normalized base template source files. */
    baseTreeSha256: string;
  }

  /**
   * Renders the neutral scaffold while auditing both arm overlay contracts.
   *
   * The template-revision gate uses this before either benchmark mechanism is
   * present, so a broken shared scaffold cannot be mistaken for an arm effect.
   */
  export function composeBase(props: {
    /** Absolute benchmark/template directory containing base and both arms. */
    template: string;

    /** Exact package identities accepted by scaffold placeholders. */
    variables: IEvidenceBenchmarkMaterialization.IVariables;
  }): IBaseComposition {
    validateVariables(props.variables);
    const base: Map<string, Uint8Array> = readTextTree(
      path.join(props.template, "base"),
    );
    const overlays: Record<
      IEvidenceBenchmarkMaterialization.Arm,
      Map<string, Uint8Array>
    > = {
      evidence: readTextTree(path.join(props.template, "evidence")),
      plain: readTextTree(path.join(props.template, "plain")),
    };
    validateRequiredPaths("base", base, BASE_REQUIRED_PATHS);
    validatePortablePaths("base", base);
    validateOverlayContract(base, overlays);
    const rendered: Map<string, Uint8Array> = new Map();
    for (const [relative, content] of base)
      rendered.set(
        relative,
        encode(renderVariables(decode(content, relative), props.variables)),
      );
    validatePortablePaths("rendered neutral scaffold", rendered);
    validateMarkdown(rendered);
    return {
      files: rendered,
      baseTreeSha256: EvidenceBenchmarkHash.tree(base),
    };
  }

  /**
   * Composes one template in base, arm order and validates the resulting tree.
   *
   * An existing path is accepted only through the explicit Markdown body-splice
   * marker or the evidence lint-config replacement set. This makes an added
   * collision a reviewed contract change rather than last-writer-wins
   * behavior.
   */
  export function compose(props: {
    /** Absolute benchmark/template directory containing base and both arms. */
    template: string;

    /** Mechanism overlay selected for this generated workspace. */
    arm: IEvidenceBenchmarkMaterialization.Arm;

    /** Exact package identities accepted by scaffold placeholders. */
    variables: IEvidenceBenchmarkMaterialization.IVariables;
  }): IComposition {
    validateVariables(props.variables);
    const base: Map<string, Uint8Array> = readTextTree(
      path.join(props.template, "base"),
    );
    const overlays: Record<
      IEvidenceBenchmarkMaterialization.Arm,
      Map<string, Uint8Array>
    > = {
      evidence: readTextTree(path.join(props.template, "evidence")),
      plain: readTextTree(path.join(props.template, "plain")),
    };
    const arm: Map<string, Uint8Array> = overlays[props.arm];
    validateRequiredPaths("base", base, BASE_REQUIRED_PATHS);
    validatePortablePaths("base", base);
    validateOverlayContract(base, overlays);

    const composed: Map<string, Uint8Array> = new Map(base);
    for (const [relative, overlayBytes] of sortedEntries(arm)) {
      const original: Uint8Array | undefined = base.get(relative);
      const overlay: string = decode(overlayBytes, relative);
      let merged: string;
      if (original === undefined) {
        if (overlay.includes(SPLICE_COMMENT) || overlay.includes(SPLICE_TOKEN))
          throw new Error(
            `Template overlay ${props.arm}/${relative} requests a base-body splice but base/${relative} does not exist.`,
          );
        merged = overlay;
      } else if (overlay.includes(SPLICE_COMMENT)) {
        merged = spliceBody({
          arm: props.arm,
          relative,
          base: decode(original, relative),
          overlay,
        });
      } else if (FULL_REPLACEMENT_COLLISIONS.has(relative)) {
        if (overlay.includes(SPLICE_TOKEN))
          throw new Error(
            `Template overlay ${props.arm}/${relative} contains ${SPLICE_TOKEN} without its splice contract comment.`,
          );
        merged = overlay;
      } else {
        throw new Error(
          `Template overlay collision is not authorized: ${props.arm}/${relative}. Add the base-body splice contract or an explicit full-replacement policy.`,
        );
      }
      composed.set(relative, encode(renderVariables(merged, props.variables)));
    }
    for (const [relative, content] of composed) {
      const source: string = decode(content, relative);
      if (source.includes(SPLICE_COMMENT) || source.includes(SPLICE_TOKEN))
        throw new Error(
          `Rendered template retains a base-body splice marker: ${relative}.`,
        );
      composed.set(relative, encode(renderVariables(source, props.variables)));
    }
    validatePortablePaths("rendered workspace", composed);
    validateMarkdown(composed);
    return {
      files: composed,
      baseTreeSha256: EvidenceBenchmarkHash.tree(base),
      armTreeSha256: EvidenceBenchmarkHash.tree(arm),
    };
  }

  /**
   * Validates portable paths, instruction frontmatter, H1 ownership, and links.
   *
   * The materializer calls this again after requirements and the local package
   * have entered the tree so validation covers the exact agent-visible input.
   */
  export function validate(files: ReadonlyMap<string, Uint8Array>): void {
    validatePortablePaths("rendered workspace", files);
    validateMarkdown(files);
  }

  function validateOverlayContract(
    base: ReadonlyMap<string, Uint8Array>,
    overlays: Readonly<
      Record<
        IEvidenceBenchmarkMaterialization.Arm,
        ReadonlyMap<string, Uint8Array>
      >
    >,
  ): void {
    for (const arm of ["evidence", "plain"] as const) {
      validateRequiredPaths(arm, overlays[arm], ARM_REQUIRED_PATHS[arm]);
      validatePortablePaths(arm, overlays[arm]);
    }
    requireEqualPathSets(
      "evidence and plain overlay",
      new Map(
        [...overlays.evidence].filter(
          ([relative]) => !EVIDENCE_ONLY_PATHS.has(relative),
        ),
      ),
      overlays.plain,
    );
    for (const relative of EVIDENCE_ONLY_PATHS) {
      if (!overlays.evidence.has(relative))
        throw new Error(
          `Evidence template is missing evidence-only path: ${relative}.`,
        );
      if (overlays.plain.has(relative) || base.has(relative))
        throw new Error(
          `Evidence-only template path must belong only to the evidence overlay: ${relative}.`,
        );
    }
    const collisions: Record<
      IEvidenceBenchmarkMaterialization.Arm,
      Set<string>
    > = {
      evidence: new Set(
        [...overlays.evidence.keys()].filter((relative) => base.has(relative)),
      ),
      plain: new Set(
        [...overlays.plain.keys()].filter((relative) => base.has(relative)),
      ),
    };
    requireEqualPathSets(
      "evidence and plain base-collision",
      collisions.evidence,
      collisions.plain,
    );
    for (const relative of FULL_REPLACEMENT_COLLISIONS)
      if (!collisions.evidence.has(relative))
        throw new Error(
          `Template full-replacement policy names a path that both arms do not collide with: ${relative}.`,
        );
    for (const arm of ["evidence", "plain"] as const)
      for (const [relative, bytes] of overlays[arm]) {
        const overlay: string = decode(bytes, relative);
        const original: Uint8Array | undefined = base.get(relative);
        if (original === undefined) {
          if (
            overlay.includes(SPLICE_COMMENT) ||
            overlay.includes(SPLICE_TOKEN)
          )
            throw new Error(
              `Template overlay ${arm}/${relative} requests a base-body splice but base/${relative} does not exist.`,
            );
          continue;
        }
        if (FULL_REPLACEMENT_COLLISIONS.has(relative)) {
          if (
            overlay.includes(SPLICE_COMMENT) ||
            overlay.includes(SPLICE_TOKEN)
          )
            throw new Error(
              `Template full replacement ${arm}/${relative} must contain no splice marker or token.`,
            );
          continue;
        }
        spliceBody({
          arm,
          relative,
          base: decode(original, relative),
          overlay,
        });
      }
  }

  function spliceBody(props: {
    arm: IEvidenceBenchmarkMaterialization.Arm;
    relative: string;
    base: string;
    overlay: string;
  }): string {
    const commentCount: number = occurrences(props.overlay, SPLICE_COMMENT);
    const tokenCount: number = occurrences(props.overlay, SPLICE_TOKEN);
    if (commentCount !== 1 || tokenCount !== 1)
      throw new Error(
        `Template overlay ${props.arm}/${props.relative} requires exactly one splice comment and one ${SPLICE_TOKEN}; found ${commentCount} and ${tokenCount}.`,
      );
    const contract = new RegExp(
      `${escapeRegExp(SPLICE_COMMENT)}[\\t ]*\\n[\\t ]*${escapeRegExp(SPLICE_TOKEN)}`,
      "g",
    );
    if (occurrencesByPattern(props.overlay, contract) !== 1)
      throw new Error(
        `Template overlay ${props.arm}/${props.relative} must place ${SPLICE_TOKEN} on the line immediately after ${SPLICE_COMMENT}.`,
      );
    const body: string = markdownBody(props.base, props.relative);
    return props.overlay.replace(contract, body);
  }

  function markdownBody(source: string, relative: string): string {
    let body: string = source;
    if (relative.endsWith("/SKILL.md")) {
      const frontmatter: IFrontmatter = readFrontmatter(source, relative);
      body = source.slice(frontmatter.end);
    }
    const heading: RegExpExecArray | null = /^# [^\r\n]+(?:\r?\n|$)/m.exec(
      body,
    );
    if (heading === null)
      throw new Error(
        `Base Markdown selected for body splice has no level-one heading: ${relative}.`,
      );
    return body
      .slice((heading.index ?? 0) + heading[0].length)
      .replace(/^\n+/, "");
  }

  function renderVariables(
    source: string,
    variables: IEvidenceBenchmarkMaterialization.IVariables,
  ): string {
    return source.replace(
      /\{\{([A-Za-z][A-Za-z0-9]*)\}\}/g,
      (_match: string, key: string): string => {
        const value: string | undefined =
          variables[key as keyof IEvidenceBenchmarkMaterialization.IVariables];
        if (value === undefined)
          throw new Error(`Unknown benchmark template variable: ${key}.`);
        return value;
      },
    );
  }

  function validateVariables(
    variables: IEvidenceBenchmarkMaterialization.IVariables,
  ): void {
    if (typeof variables !== "object" || variables === null)
      throw new Error("Benchmark template variables must be an object.");
    const actual: string[] = Object.keys(variables).sort();
    const expected: string[] = [...VARIABLE_KEYS].sort();
    const missing: string[] = expected.filter((key) => !actual.includes(key));
    const unknown: string[] = actual.filter((key) => !expected.includes(key));
    if (missing.length !== 0 || unknown.length !== 0)
      throw new Error(
        `Benchmark template variables require exactly ${expected.join(", ")}; missing=${missing.join(", ") || "none"}; unknown=${unknown.join(", ") || "none"}.`,
      );
    for (const key of VARIABLE_KEYS) {
      const value: string = variables[key];
      if (!isNpmPackageName(value))
        throw new Error(
          `Benchmark template variable ${key} is not a valid npm package name: ${JSON.stringify(value)}.`,
        );
    }
    const identities: Map<string, string> = new Map();
    for (const key of VARIABLE_KEYS) {
      const value: string = variables[key];
      const previous: string | undefined = identities.get(value);
      if (previous !== undefined)
        throw new Error(
          `Benchmark template package names must be distinct: ${previous} and ${key} both use ${value}.`,
        );
      identities.set(value, key);
    }
  }

  function isNpmPackageName(value: unknown): value is string {
    if (
      typeof value !== "string" ||
      value.length === 0 ||
      value.length > 214 ||
      value !== value.toLowerCase() ||
      value.trim() !== value
    )
      return false;
    const part = (input: string): boolean =>
      /^[a-z0-9][a-z0-9._~-]*$/.test(input);
    if (!value.startsWith("@")) return part(value);
    const pieces: string[] = value.slice(1).split("/");
    return pieces.length === 2 && part(pieces[0]!) && part(pieces[1]!);
  }

  function readTextTree(root: string): Map<string, Uint8Array> {
    if (!fs.existsSync(root) || !fs.statSync(root).isDirectory())
      throw new Error(`Benchmark template directory is missing: ${root}.`);
    const source: Map<string, Uint8Array> =
      EvidenceBenchmarkHash.directory(root);
    const result: Map<string, Uint8Array> = new Map();
    for (const [inputPath, bytes] of source) {
      const relative: string =
        path.posix.basename(inputPath) === "gitignore"
          ? path.posix.join(path.posix.dirname(inputPath), ".gitignore")
          : inputPath;
      if (result.has(relative))
        throw new Error(
          `Benchmark template path collision after gitignore restoration: ${relative}.`,
        );
      result.set(
        relative.replace(/^\.\//, ""),
        encode(decode(bytes, inputPath).replaceAll("\r\n", "\n")),
      );
    }
    return result;
  }

  function validateRequiredPaths(
    label: string,
    files: ReadonlyMap<string, Uint8Array>,
    required: readonly string[],
  ): void {
    const missing: string[] = required.filter(
      (relative) => !files.has(relative),
    );
    if (missing.length !== 0)
      throw new Error(
        `Benchmark ${label} template is missing required paths: ${missing.join(", ")}.`,
      );
  }

  function requireEqualPathSets(
    label: string,
    left: ReadonlyMap<string, unknown> | ReadonlySet<string>,
    right: ReadonlyMap<string, unknown> | ReadonlySet<string>,
  ): void {
    const leftPaths: string[] = [...left.keys()].sort((first, second) =>
      first.localeCompare(second, "en"),
    );
    const rightPaths: string[] = [...right.keys()].sort((first, second) =>
      first.localeCompare(second, "en"),
    );
    const missing: string[] = leftPaths.filter(
      (relative) => !rightPaths.includes(relative),
    );
    const extra: string[] = rightPaths.filter(
      (relative) => !leftPaths.includes(relative),
    );
    if (missing.length !== 0 || extra.length !== 0)
      throw new Error(
        `Benchmark ${label} path sets differ; missing=${missing.join(", ") || "none"}; extra=${extra.join(", ") || "none"}.`,
      );
  }

  function validatePortablePaths(
    label: string,
    files: ReadonlyMap<string, Uint8Array>,
  ): void {
    const identities: Map<string, string> = new Map();
    for (const relative of files.keys()) {
      if (
        relative.length === 0 ||
        relative.startsWith("/") ||
        relative.includes("\\") ||
        path.posix.normalize(relative) !== relative ||
        relative
          .split("/")
          .some((segment) => segment === ".." || segment === ".")
      )
        throw new Error(
          `Benchmark ${label} contains a non-portable relative path: ${relative}.`,
        );
      if (relative.normalize("NFC") !== relative)
        throw new Error(
          `Benchmark ${label} path is not Unicode NFC normalized: ${relative}.`,
        );
      for (const segment of relative.split("/")) {
        const stem: string = segment.split(".")[0]!.toUpperCase();
        if (
          /[<>:"|?*\u0000-\u001f]/.test(segment) ||
          /^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/.test(stem)
        )
          throw new Error(
            `Benchmark ${label} path is not portable to Windows: ${relative}.`,
          );
      }
      const identity: string = relative.toLocaleLowerCase("en-US");
      const previous: string | undefined = identities.get(identity);
      if (previous !== undefined)
        throw new Error(
          `Benchmark ${label} paths collide on a case-insensitive filesystem: ${previous} and ${relative}.`,
        );
      identities.set(identity, relative);
    }
  }

  function validateMarkdown(files: ReadonlyMap<string, Uint8Array>): void {
    for (const [relative, bytes] of files) {
      if (!relative.endsWith(".md")) continue;
      const source: string = decode(bytes, relative);
      if (
        path.posix.basename(relative) === "CLAUDE.md" &&
        source.trim() === "@AGENTS.md"
      ) {
        const target: string = path.posix.join(
          path.posix.dirname(relative),
          "AGENTS.md",
        );
        if (!files.has(target))
          throw new Error(
            `Claude instruction pointer has no sibling AGENTS.md: ${relative}.`,
          );
        continue;
      }
      const headings: string[] = EvidenceBenchmarkMarkdown.lines(source).filter(
        (line) => /^# [^#]/.test(line),
      );
      if (headings.length !== 1)
        throw new Error(
          `Rendered Markdown ${relative} requires exactly one level-one heading; found ${headings.length}.`,
        );
      if (relative.endsWith("/SKILL.md")) {
        const frontmatter: IFrontmatter = readFrontmatter(source, relative);
        const name: string | undefined = /^name:\s*(\S+)\s*$/m.exec(
          frontmatter.body,
        )?.[1];
        const description: string | undefined =
          /^description:\s*(.+)\s*$/m.exec(frontmatter.body)?.[1];
        const expected: string = path.posix.basename(
          path.posix.dirname(relative),
        );
        if (name !== expected || description === undefined)
          throw new Error(
            `Skill ${relative} requires frontmatter name ${expected} and a non-empty description.`,
          );
      } else if (source.startsWith("---\n")) {
        throw new Error(
          `Only SKILL.md may carry YAML frontmatter in the generated instruction tree: ${relative}.`,
        );
      }
      validateLinks(relative, source, files);
    }
  }

  function validateLinks(
    relative: string,
    source: string,
    files: ReadonlyMap<string, Uint8Array>,
  ): void {
    for (const line of EvidenceBenchmarkMarkdown.lines(source)) {
      for (const match of line.matchAll(
        /!?\[[^\]]*\]\(([^)\s]+)(?:\s+[^)]*)?\)/g,
      )) {
        const raw: string = match[1]!;
        if (raw.startsWith("#") || /^[A-Za-z][A-Za-z0-9+.-]*:/.test(raw))
          continue;
        const withoutAnchor: string = raw.split(/[?#]/, 1)[0]!;
        if (withoutAnchor.length === 0) continue;
        const target: string = path.posix.normalize(
          path.posix.join(path.posix.dirname(relative), withoutAnchor),
        );
        if (target === ".." || target.startsWith("../"))
          throw new Error(
            `Markdown link escapes the generated workspace: ${relative} -> ${raw}.`,
          );
        const exists: boolean =
          files.has(target) ||
          [...files.keys()].some((candidate) =>
            candidate.startsWith(`${target.replace(/\/$/, "")}/`),
          );
        if (!exists)
          throw new Error(
            `Markdown link target is missing from the generated path set: ${relative} -> ${raw}.`,
          );
      }
    }
  }

  interface IFrontmatter {
    body: string;
    end: number;
  }

  function readFrontmatter(source: string, relative: string): IFrontmatter {
    if (!source.startsWith("---\n"))
      throw new Error(`Skill ${relative} must start with YAML frontmatter.`);
    const end: number = source.indexOf("\n---\n", 4);
    if (end === -1)
      throw new Error(`Skill ${relative} has unterminated YAML frontmatter.`);
    return { body: source.slice(4, end), end: end + 5 };
  }

  function sortedEntries(
    files: ReadonlyMap<string, Uint8Array>,
  ): Array<[string, Uint8Array]> {
    return [...files.entries()].sort(([left], [right]) =>
      left.localeCompare(right, "en"),
    );
  }

  function encode(source: string): Uint8Array {
    return Buffer.from(source, "utf8");
  }

  function decode(content: Uint8Array, relative: string): string {
    const source: string = Buffer.from(content).toString("utf8");
    if (source.includes("\uFFFD"))
      throw new Error(`Benchmark text asset is not valid UTF-8: ${relative}.`);
    return source;
  }

  function occurrences(source: string, token: string): number {
    return source.split(token).length - 1;
  }

  function occurrencesByPattern(source: string, pattern: RegExp): number {
    return Array.from(source.matchAll(pattern)).length;
  }

  function escapeRegExp(source: string): string {
    return source.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
}
