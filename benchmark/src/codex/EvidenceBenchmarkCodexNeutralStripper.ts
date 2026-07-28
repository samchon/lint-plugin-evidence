import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

import { EvidenceBenchmarkCodexValue } from "./EvidenceBenchmarkCodexValue.ts";

/**
 * Parser-backed arm-marker removal for TypeScript, Markdown, Prisma, JSON, and
 * YAML assets.
 */
export class EvidenceBenchmarkCodexNeutralStripper {
  private readonly typescript: EvidenceBenchmarkCodexNeutralStripper.ITypeScript;
  private readonly yaml: EvidenceBenchmarkCodexNeutralStripper.IYaml;
  private readonly prisma: EvidenceBenchmarkCodexNeutralStripper.IPrisma;
  private readonly provenanceValue: EvidenceBenchmarkCodexNeutralStripper.IProvenance;

  /**
   * Resolves pinned parsers from the generated project, measured plugin, or
   * benchmark repository.
   *
   * @param projectRoot Generated project root.
   */
  public constructor(private readonly projectRoot: string) {
    const typescript = this.resolveTypeScript();
    this.typescript = typescript.value;
    const yaml =
      this.resolveWithPath<EvidenceBenchmarkCodexNeutralStripper.IYaml>("yaml");
    this.yaml = yaml.value;
    const prismaModule =
      this.resolveWithPath<EvidenceBenchmarkCodexNeutralStripper.IPrismaModule>(
        "@prisma/prisma-schema-wasm",
      );
    const prismaManifest =
      this.resolve<EvidenceBenchmarkCodexNeutralStripper.IPackageManifest>(
        "@prisma/prisma-schema-wasm/package.json",
      );
    if (typeof prismaModule.value.get_datamodel !== "function")
      throw new Error("Prisma parser exposes no get_datamodel function");
    this.prisma = {
      getDatamodel: prismaModule.value.get_datamodel,
      version: prismaManifest.version,
    };
    const yamlManifest =
      this.resolve<EvidenceBenchmarkCodexNeutralStripper.IPackageManifest>(
        "yaml/package.json",
      );
    this.provenanceValue = {
      schemaVersion: 1,
      implementations: {
        typescript: {
          package: "typescript",
          version: this.typescript.version,
          sourceSha256: typescript.sourceSha256,
          resolvedPackageRoot: typescript.packageRoot,
          resolvedEntryPath: typescript.entryPath,
          grammarSha256: EvidenceBenchmarkCodexValue.sha256(
            "ts.createSourceFile+ts.getJSDocTags:evidence,evidenceExclude:v1",
          ),
        },
        markdown: {
          package: "benchmark-html-comment-scanner",
          version: "1",
          sourceSha256: EvidenceBenchmarkCodexValue.sha256(
            fs.readFileSync(import.meta.filename),
          ),
          resolvedPackageRoot: path.dirname(import.meta.filename),
          resolvedEntryPath: path.basename(import.meta.filename),
          grammarSha256: EvidenceBenchmarkCodexValue.sha256(
            "CommonMark-HTML-comment-token:evidence,evidenceExclude:v1",
          ),
        },
        prisma: {
          package: "@prisma/prisma-schema-wasm",
          version: prismaManifest.version,
          sourceSha256: prismaModule.sourceSha256,
          resolvedPackageRoot: prismaModule.packageRoot,
          resolvedEntryPath: prismaModule.entryPath,
          grammarSha256: EvidenceBenchmarkCodexValue.sha256(
            "prisma-wasm-get_datamodel+triple-slash-tag-record:v1",
          ),
        },
        json: {
          package: "JSON.parse",
          version: process.versions.node,
          sourceSha256: EvidenceBenchmarkCodexValue.sha256(
            fs.readFileSync(process.execPath),
          ),
          resolvedPackageRoot: path.dirname(process.execPath),
          resolvedEntryPath: path.basename(process.execPath),
          grammarSha256: EvidenceBenchmarkCodexValue.sha256(
            "recursive-arm-key-value-elision:v1",
          ),
        },
        yaml: {
          package: "yaml",
          version: yamlManifest.version,
          sourceSha256: yaml.sourceSha256,
          resolvedPackageRoot: yaml.packageRoot,
          resolvedEntryPath: yaml.entryPath,
          grammarSha256: EvidenceBenchmarkCodexValue.sha256(
            "yaml-parseDocument+recursive-arm-key-value-elision:v1",
          ),
        },
      },
    };
  }

  /** Returns immutable parser and grammar provenance for the bundle manifest. */
  public provenance(): EvidenceBenchmarkCodexNeutralStripper.IProvenance {
    return structuredClone(this.provenanceValue);
  }

  /** Parses and strips one supported UTF-8 asset without regex fallback. */
  public strip(relativePath: string, bytes: Buffer): Buffer {
    const extension = path.extname(relativePath).toLowerCase();
    const source = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    if (
      [".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs"].includes(
        extension,
      )
    )
      return Buffer.from(this.typescriptSource(relativePath, source), "utf8");
    if (extension === ".md" || extension === ".mdx")
      return Buffer.from(this.markdown(source), "utf8");
    if (extension === ".prisma")
      return Buffer.from(this.prismaSource(source), "utf8");
    if (extension === ".json")
      return Buffer.from(
        `${JSON.stringify(this.cleanStructured(JSON.parse(source)), null, 2)}\n`,
        "utf8",
      );
    if (extension === ".yaml" || extension === ".yml") {
      const document = this.yaml.parseDocument(source);
      if (document.errors.length !== 0)
        throw new Error(
          `YAML parser rejected ${relativePath}: ${document.errors.join("; ")}`,
        );
      return Buffer.from(
        this.yaml.stringify(this.cleanStructured(document.toJS())),
        "utf8",
      );
    }
    return bytes;
  }

  /** Validates a complete Prisma schema file set before or after stripping. */
  public validatePrisma(files: Array<[string, string]>, label: string): void {
    if (files.length === 0) return;
    try {
      this.prisma.getDatamodel(JSON.stringify({ prismaSchema: files }));
    } catch (error) {
      throw new Error(
        `${label} Prisma schema rejected by @prisma/prisma-schema-wasm@${this.prisma.version}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  private typescriptSource(fileName: string, source: string): string {
    const kind = /\.(?:tsx|jsx)$/i.test(fileName)
      ? this.typescript.ScriptKind.TSX
      : /\.(?:js|mjs|cjs)$/i.test(fileName)
        ? this.typescript.ScriptKind.JS
        : this.typescript.ScriptKind.TS;
    const sourceFile = this.typescript.createSourceFile(
      fileName,
      source,
      this.typescript.ScriptTarget.Latest,
      true,
      kind,
    );
    if (sourceFile.parseDiagnostics.length !== 0)
      throw new Error(
        `TypeScript parser rejected ${fileName}: ${sourceFile.parseDiagnostics
          .map((diagnostic) => String(diagnostic.messageText))
          .join("; ")}`,
      );
    const ranges = new Map<string, { pos: number; end: number }>();
    const visit = (
      node: EvidenceBenchmarkCodexNeutralStripper.ITsNode,
    ): void => {
      for (const tag of this.typescript.getJSDocTags(node)) {
        const name =
          typeof tag.tagName.text === "string"
            ? tag.tagName.text
            : String(tag.tagName.text);
        if (name === "evidence" || name === "evidenceExclude")
          ranges.set(`${tag.pos}:${tag.end}`, {
            pos: tag.pos,
            end: tag.end,
          });
      }
      this.typescript.forEachChild(node, visit);
    };
    visit(sourceFile);
    let output = source;
    for (const range of [...ranges.values()].sort(
      (left, right): number => right.pos - left.pos,
    ))
      output =
        output.slice(0, range.pos) +
        output.slice(range.pos, range.end).replace(/[^\r\n]/g, " ") +
        output.slice(range.end);
    if (EvidenceBenchmarkCodexNeutralStripper.hasTagToken(output))
      throw new Error(
        `TypeScript arm tag remained outside recognized JSDoc grammar: ${fileName}`,
      );
    return output;
  }

  private markdown(source: string): string {
    let output = "";
    let cursor = 0;
    while (cursor < source.length) {
      const start = source.indexOf("<!--", cursor);
      if (start === -1) {
        output += source.slice(cursor);
        break;
      }
      output += source.slice(cursor, start);
      const end = source.indexOf("-->", start + 4);
      if (end === -1) {
        if (
          EvidenceBenchmarkCodexNeutralStripper.hasTagToken(source.slice(start))
        )
          throw new Error("Markdown contains an unclosed evidence comment");
        output += source.slice(start);
        break;
      }
      const comment = source.slice(start, end + 3);
      const body = source.slice(start + 4, end).trimStart();
      output += EvidenceBenchmarkCodexNeutralStripper.startsWithTag(body)
        ? comment.replace(/[^\r\n]/g, " ")
        : comment;
      cursor = end + 3;
    }
    if (EvidenceBenchmarkCodexNeutralStripper.hasTagToken(output))
      throw new Error(
        "Markdown arm tag remained outside recognized HTML comment grammar",
      );
    return output;
  }

  private prismaSource(source: string): string {
    const lines = source.split(/(?<=\n)/);
    const output = [...lines];
    for (let index = 0; index < lines.length; ++index) {
      const parsed = EvidenceBenchmarkCodexNeutralStripper.prismaDoc(
        lines[index]!,
      );
      if (
        parsed === null ||
        !EvidenceBenchmarkCodexNeutralStripper.startsWithTag(parsed.body)
      )
        continue;
      output[index] = lines[index]!.replace(/[^\r\n]/g, " ");
      for (
        let continuation = index + 1;
        continuation < lines.length;
        ++continuation
      ) {
        const next = EvidenceBenchmarkCodexNeutralStripper.prismaDoc(
          lines[continuation]!,
        );
        if (
          next === null ||
          next.body.trim().length === 0 ||
          next.body.trimStart().startsWith("@")
        )
          break;
        output[continuation] = lines[continuation]!.replace(/[^\r\n]/g, " ");
        index = continuation;
      }
    }
    const result = output.join("");
    if (EvidenceBenchmarkCodexNeutralStripper.hasTagToken(result))
      throw new Error(
        "Prisma arm tag remained outside recognized triple-slash grammar",
      );
    return result;
  }

  private cleanStructured(input: unknown): unknown {
    if (Array.isArray(input))
      return input
        .filter(
          (item): boolean =>
            !EvidenceBenchmarkCodexNeutralStripper.containsArmIdentity(item),
        )
        .map((item): unknown => this.cleanStructured(item));
    if (EvidenceBenchmarkCodexValue.isRecord(input))
      return Object.fromEntries(
        Object.entries(input)
          .filter(
            ([key, value]): boolean =>
              !EvidenceBenchmarkCodexNeutralStripper.containsArmIdentity(key) &&
              !EvidenceBenchmarkCodexNeutralStripper.containsArmIdentity(value),
          )
          .map(([key, value]): [string, unknown] => [
            key,
            this.cleanStructured(value),
          ]),
      );
    return input;
  }

  private resolve<T>(specifier: string): T {
    return this.resolveWithPath<T>(specifier).value;
  }

  private resolveWithPath<T>(specifier: string): {
    value: T;
    sourceSha256: string;
    packageRoot: string;
    entryPath: string;
  } {
    const failures: string[] = [];
    for (const manifest of this.resolverManifests()) {
      try {
        const resolver = createRequire(manifest);
        const resolved = resolver.resolve(specifier);
        const packageRoot =
          EvidenceBenchmarkCodexNeutralStripper.packageRoot(resolved);
        return {
          value: resolver(specifier) as T,
          sourceSha256:
            EvidenceBenchmarkCodexNeutralStripper.packageTreeSha256(resolved),
          packageRoot,
          entryPath: path
            .relative(packageRoot, resolved)
            .split(path.sep)
            .join("/"),
        };
      } catch (error) {
        failures.push(
          `${manifest}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
    throw new Error(
      `unable to resolve pinned parser ${specifier}: ${failures.join("; ")}`,
    );
  }

  private resolveTypeScript(): {
    value: EvidenceBenchmarkCodexNeutralStripper.ITypeScript;
    sourceSha256: string;
    packageRoot: string;
    entryPath: string;
  } {
    const failures: string[] = [];
    for (const manifest of this.resolverManifests()) {
      const resolver = createRequire(manifest);
      for (const specifier of ["typescript-api"]) {
        try {
          const candidate = resolver(
            specifier,
          ) as EvidenceBenchmarkCodexNeutralStripper.ITypeScript;
          if (
            candidate.version === "5.9.3" &&
            typeof candidate.createSourceFile === "function" &&
            typeof candidate.getJSDocTags === "function" &&
            typeof candidate.forEachChild === "function"
          ) {
            const resolved = resolver.resolve(specifier);
            const packageRoot =
              EvidenceBenchmarkCodexNeutralStripper.packageRoot(resolved);
            return {
              value: candidate,
              sourceSha256:
                EvidenceBenchmarkCodexNeutralStripper.packageTreeSha256(
                  resolved,
                ),
              packageRoot,
              entryPath: path
                .relative(packageRoot, resolved)
                .split(path.sep)
                .join("/"),
            };
          }
          failures.push(`${manifest}:${specifier}: no compiler AST API`);
        } catch (error) {
          failures.push(
            `${manifest}:${specifier}: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }
      }
      let cursor = path.dirname(manifest);
      while (true) {
        const candidatePath = path.join(
          cursor,
          "node_modules",
          ".pnpm",
          "typescript@5.9.3",
          "node_modules",
          "typescript",
          "lib",
          "typescript.js",
        );
        if (fs.existsSync(candidatePath)) {
          const candidate = resolver(
            candidatePath,
          ) as EvidenceBenchmarkCodexNeutralStripper.ITypeScript;
          if (
            candidate.version === "5.9.3" &&
            typeof candidate.createSourceFile === "function"
          ) {
            const packageRoot =
              EvidenceBenchmarkCodexNeutralStripper.packageRoot(candidatePath);
            return {
              value: candidate,
              sourceSha256:
                EvidenceBenchmarkCodexNeutralStripper.packageTreeSha256(
                  candidatePath,
                ),
              packageRoot,
              entryPath: path
                .relative(packageRoot, candidatePath)
                .split(path.sep)
                .join("/"),
            };
          }
        }
        const parent = path.dirname(cursor);
        if (parent === cursor) break;
        cursor = parent;
      }
    }
    throw new Error(
      `unable to resolve pinned TypeScript 5.9.3 AST parser: ${failures.join("; ")}`,
    );
  }

  private resolverManifests(): string[] {
    const manifests = [
      path.join(this.projectRoot, "package.json"),
      path.join(process.cwd(), "package.json"),
    ];
    let cursor = path.resolve(process.cwd());
    while (true) {
      manifests.push(path.join(cursor, "packages", "evidence", "package.json"));
      const parent = path.dirname(cursor);
      if (parent === cursor) break;
      cursor = parent;
    }
    const gitFile = path.join(process.cwd(), ".git");
    try {
      const declaration = fs.readFileSync(gitFile, "utf8").trim();
      if (declaration.startsWith("gitdir:")) {
        const gitDirectory = path.resolve(
          process.cwd(),
          declaration.slice("gitdir:".length).trim(),
        );
        const marker = `${path.sep}.git${path.sep}worktrees${path.sep}`;
        const offset = gitDirectory.indexOf(marker);
        if (offset !== -1)
          manifests.push(
            path.join(
              gitDirectory.slice(0, offset),
              "packages",
              "evidence",
              "package.json",
            ),
          );
      }
    } catch {
      // A normal repository directory has no worktree indirection file.
    }
    return [...new Set(manifests)].filter((target): boolean =>
      fs.existsSync(target),
    );
  }

  private static packageTreeSha256(entryPath: string): string {
    const root = EvidenceBenchmarkCodexNeutralStripper.packageRoot(entryPath);
    const entries: Array<{
      path: string;
      kind: "file" | "symlink";
      byteLength: number;
      sha256: string;
    }> = [];
    const visit = (directory: string): void => {
      const children = fs
        .readdirSync(directory, { withFileTypes: true })
        .sort((left, right): number =>
          EvidenceBenchmarkCodexNeutralStripper.utf8Compare(
            left.name,
            right.name,
          ),
        );
      for (const child of children) {
        if (child.name === "node_modules") continue;
        const target = path.join(directory, child.name);
        if (child.isDirectory()) {
          visit(target);
          continue;
        }
        const bytes = child.isSymbolicLink()
          ? Buffer.from(fs.readlinkSync(target), "utf8")
          : fs.readFileSync(target);
        entries.push({
          path: path
            .relative(root, target)
            .split(path.sep)
            .join("/")
            .normalize("NFC"),
          kind: child.isSymbolicLink() ? "symlink" : "file",
          byteLength: bytes.length,
          sha256: EvidenceBenchmarkCodexValue.sha256(bytes),
        });
      }
    };
    visit(root);
    entries.sort((left, right): number =>
      EvidenceBenchmarkCodexNeutralStripper.utf8Compare(left.path, right.path),
    );
    return EvidenceBenchmarkCodexValue.sha256(
      EvidenceBenchmarkCodexValue.canonicalJson(entries),
    );
  }

  private static packageRoot(entryPath: string): string {
    let cursor = path.dirname(entryPath);
    while (!fs.existsSync(path.join(cursor, "package.json"))) {
      const parent = path.dirname(cursor);
      if (parent === cursor)
        throw new Error(`parser package root not found for ${entryPath}`);
      cursor = parent;
    }
    return cursor;
  }

  private static utf8Compare(left: string, right: string): number {
    return Buffer.compare(
      Buffer.from(left, "utf8"),
      Buffer.from(right, "utf8"),
    );
  }

  private static prismaDoc(line: string): { body: string } | null {
    let cursor = 0;
    while (
      cursor < line.length &&
      (line[cursor] === " " || line[cursor] === "\t")
    )
      ++cursor;
    if (line.slice(cursor, cursor + 3) !== "///" || line[cursor + 3] === "/")
      return null;
    cursor += 3;
    if (line[cursor] === " ") ++cursor;
    return { body: line.slice(cursor).replace(/\r?\n$/, "") };
  }

  private static startsWithTag(input: string): boolean {
    const trimmed = input.trimStart();
    return (
      trimmed === "@evidence" ||
      trimmed.startsWith("@evidence ") ||
      trimmed === "@evidenceExclude" ||
      trimmed.startsWith("@evidenceExclude ")
    );
  }

  private static hasTagToken(input: string): boolean {
    return (
      input.includes("@evidence ") ||
      input.includes("@evidence\n") ||
      input.includes("@evidence\r") ||
      input.includes("@evidenceExclude")
    );
  }

  private static containsArmIdentity(input: unknown): boolean {
    if (typeof input !== "string") return false;
    const lowered = input.toLowerCase();
    return (
      lowered.includes("@samchon/lint-plugin-evidence") ||
      lowered.includes("@evidence") ||
      lowered.includes("evidence/graph") ||
      lowered.includes("evidence/documented") ||
      lowered.includes("evidence/singular") ||
      lowered.includes("evidence/todo")
    );
  }
}

/** Parser contracts used by {@link EvidenceBenchmarkCodexNeutralStripper}. */
export namespace EvidenceBenchmarkCodexNeutralStripper {
  /** Immutable parser and grammar provenance archived with each bundle. */
  export interface IProvenance {
    /** Provenance schema version. */
    schemaVersion: 1;

    /** Parser identity by supported syntax. */
    implementations: Record<
      "typescript" | "markdown" | "prisma" | "json" | "yaml",
      {
        /** Package or in-runner grammar name. */
        package: string;

        /** Exact parser implementation version. */
        version: string;

        /** SHA-256 of the exact parser or in-runner implementation bytes. */
        sourceSha256: string;

        /** Exact package or runtime root from which the entry was resolved. */
        resolvedPackageRoot: string;

        /** POSIX path of the loaded entry relative to the resolved root. */
        resolvedEntryPath: string;

        /** SHA-256 of the frozen accepted grammar contract. */
        grammarSha256: string;
      }
    >;
  }

  /** Minimal TypeScript parser surface. */
  export interface ITypeScript {
    /** Exact parser implementation version. */
    version: string;

    /** Script target constants. */
    ScriptTarget: { Latest: number };

    /** Script kind constants. */
    ScriptKind: { TS: number; TSX: number; JS: number };

    /** Parses one source file with JSDoc nodes. */
    createSourceFile: (
      /** Source filename used for script-kind diagnostics. */
      fileName: string,
      /** Exact source text. */
      source: string,
      /** Parser language target. */
      target: number,
      /** Whether parent node links are populated. */
      setParentNodes: boolean,
      /** TypeScript script-kind enum value. */
      scriptKind: number,
    ) => ITsSourceFile;

    /** Visits direct child nodes. */
    forEachChild: (node: ITsNode, visitor: (node: ITsNode) => void) => void;

    /** Returns parsed JSDoc tags attached to one node. */
    getJSDocTags: (node: ITsNode) => ITsTag[];
  }

  /** Minimal TypeScript AST node. */
  export interface ITsNode {}

  /** Minimal parsed TypeScript source file. */
  export interface ITsSourceFile extends ITsNode {
    /** Syntax diagnostics. */
    parseDiagnostics: Array<{ messageText: unknown }>;
  }

  /** Minimal parsed JSDoc tag. */
  export interface ITsTag {
    /** Inclusive source position. */
    pos: number;

    /** Exclusive source position. */
    end: number;

    /** Parsed tag name. */
    tagName: { text: unknown };
  }

  /** Minimal YAML document. */
  export interface IYamlDocument {
    /** Parser errors. */
    errors: unknown[];

    /** Converts YAML AST to JSON-compatible values. */
    toJS: () => unknown;
  }

  /** Minimal YAML parser surface. */
  export interface IYaml {
    /** Parses one YAML document. */
    parseDocument: (source: string) => IYamlDocument;

    /** Serializes a normalized YAML value. */
    stringify: (input: unknown) => string;
  }

  /** Prisma parser module export. */
  export interface IPrismaModule {
    /** Parses a schema file set to a datamodel. */
    get_datamodel?: (params: string) => string;
  }

  /** Resolved Prisma parser. */
  export interface IPrisma {
    /** Parses a schema file set to a datamodel. */
    getDatamodel: (params: string) => string;

    /** Exact parser version. */
    version: string;
  }

  /** Package manifest subset. */
  export interface IPackageManifest {
    /** Exact package version. */
    version: string;
  }
}
