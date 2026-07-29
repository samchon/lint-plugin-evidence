import fs from "node:fs";
import path from "node:path";

import * as ts from "typescript-api";

import { EvidenceBenchmarkHash } from "./EvidenceBenchmarkHash.ts";
import type { IEvidenceBenchmarkMaterialization } from "./structures/IEvidenceBenchmarkMaterialization.ts";

/** Captures and verifies immutable benchmark lint configuration contracts. */
export namespace EvidenceBenchmarkLintBaseline {
  /** Package lint configurations whose graph populations are campaign inputs. */
  export const PATHS = [
    "packages/api/lint.config.ts",
    "packages/backend/lint.config.ts",
    "packages/frontend/lint.config.ts",
    "packages/backend/lint.config.main.ts",
  ] as const;

  /** Compiler Programs whose lint-config routing is a frozen campaign input. */
  export const PROGRAMS = [
    {
      path: "packages/api/tsconfig.json",
      lintConfig: PATHS[0],
      configFile: "./lint.config.ts",
    },
    {
      path: "packages/backend/tsconfig.json",
      lintConfig: PATHS[3],
      configFile: "./lint.config.main.ts",
    },
    {
      path: "packages/backend/tsconfig.lint.json",
      lintConfig: PATHS[1],
      configFile: "./lint.config.ts",
    },
    {
      path: "packages/backend/tsconfig.test.json",
      lintConfig: PATHS[1],
      configFile: "./lint.config.ts",
    },
    {
      path: "packages/frontend/tsconfig.json",
      lintConfig: PATHS[2],
      configFile: "./lint.config.ts",
    },
  ] as const;

  /** Package command surfaces that may not replace or wrap measured gates. */
  export const SCRIPTS = [
    { path: "packages/api/package.json", lintConfig: PATHS[0] },
    { path: "packages/backend/package.json", lintConfig: PATHS[1] },
    { path: "packages/frontend/package.json", lintConfig: PATHS[2] },
    { path: "package.json", lintConfig: PATHS[3] },
  ] as const;

  /** API, canonical backend, and source-program projection final identities. */
  export const BACKEND_PATHS: readonly string[] = [
    PATHS[0],
    PATHS[1],
    PATHS[3],
  ];

  /** Captures exact bytes and literal graph semantics from an in-memory tree. */
  export function capture(
    files: ReadonlyMap<string, Uint8Array>,
    arm: IEvidenceBenchmarkMaterialization.Arm,
  ): IEvidenceBenchmarkMaterialization.ILintConfigBaseline[] {
    const programs: readonly {
      lintConfig: string;
      baseline: IEvidenceBenchmarkMaterialization.ILintProgramBaseline;
    }[] = PROGRAMS.map((program) => ({
      lintConfig: program.lintConfig,
      baseline: readProgram(files, program),
    }));
    const scripts: readonly {
      lintConfig: string;
      baseline: IEvidenceBenchmarkMaterialization.ILintScriptsBaseline;
    }[] = SCRIPTS.map((entry) => ({
      lintConfig: entry.lintConfig,
      baseline: readScripts(files, entry.path),
    }));
    return PATHS.map((relative) => {
      const content: Uint8Array | undefined = files.get(relative);
      if (content === undefined)
        throw new Error(
          `Benchmark lint baseline source is missing: ${relative}.`,
        );
      const graph: IEvidenceBenchmarkMaterialization.ILintGraphBaseline | null =
        readGraph(relative, Buffer.from(content).toString("utf8"), arm);
      return {
        path: relative,
        sha256: EvidenceBenchmarkHash.bytes(content),
        semanticSha256: EvidenceBenchmarkHash.object(graph),
        graph,
        programs: programs
          .filter((program) => program.lintConfig === relative)
          .map((program) => program.baseline),
        scripts: scripts
          .filter((entry) => entry.lintConfig === relative)
          .map((entry) => entry.baseline),
      };
    });
  }

  /** Captures the canonical and projected lint configurations from a workspace. */
  export function captureDirectory(
    workspace: string,
    arm: IEvidenceBenchmarkMaterialization.Arm,
  ): IEvidenceBenchmarkMaterialization.ILintConfigBaseline[] {
    return capture(
      new Map(
        [
          ...PATHS,
          ...PROGRAMS.map((program) => program.path),
          ...SCRIPTS.map((entry) => entry.path),
        ].map((relative) => {
          const location: string = path.join(workspace, ...relative.split("/"));
          const stat: fs.Stats | undefined = fs.lstatSync(location, {
            throwIfNoEntry: false,
          });
          if (!stat?.isFile() || stat.isSymbolicLink())
            throw new Error(
              `Benchmark lint configuration is not a regular file: ${relative}.`,
            );
          return [relative, fs.readFileSync(location)] as const;
        }),
      ),
      arm,
    );
  }

  /**
   * Requires selected configurations to match their sealed semantics and bytes.
   *
   * The semantic comparison names population drift before the exact-byte gate
   * rejects less visible rule bypasses, conditional changes, or stale
   * comments.
   */
  export function assertRestored(
    workspace: string,
    arm: IEvidenceBenchmarkMaterialization.Arm,
    baselines: readonly IEvidenceBenchmarkMaterialization.ILintConfigBaseline[],
    selected: readonly string[] = PATHS,
  ): string {
    validateBaselines(baselines, arm);
    const expected: ReadonlyMap<
      string,
      IEvidenceBenchmarkMaterialization.ILintConfigBaseline
    > = new Map(baselines.map((entry) => [entry.path, entry]));
    const actual: ReadonlyMap<
      string,
      IEvidenceBenchmarkMaterialization.ILintConfigBaseline
    > = new Map(
      captureDirectory(workspace, arm).map((entry) => [entry.path, entry]),
    );
    for (const relative of selected) {
      const before = expected.get(relative);
      const after = actual.get(relative);
      if (before === undefined || after === undefined)
        throw new Error(
          `Unknown lint restoration path requested: ${relative}.`,
        );
      if (after.semanticSha256 !== before.semanticSha256)
        throw new Error(
          [
            `Lint graph semantics were not restored for ${relative}.`,
            `Expected semantic SHA-256: ${before.semanticSha256}.`,
            `Actual semantic SHA-256: ${after.semanticSha256}.`,
            claimChangeSummary(before.graph, after.graph),
          ].join("\n"),
        );
      if (after.sha256 !== before.sha256)
        throw new Error(
          `Lint configuration bytes were not restored for ${relative}: expected ${before.sha256}, received ${after.sha256}.`,
        );
      if (
        JSON.stringify(
          after.programs.map((program) => ({
            path: program.path,
            configFile: program.configFile,
          })),
        ) !==
        JSON.stringify(
          before.programs.map((program) => ({
            path: program.path,
            configFile: program.configFile,
          })),
        )
      )
        throw new Error(
          `Lint Program routing was not restored for ${relative}.`,
        );
      for (const expectedProgram of before.programs) {
        const actualProgram = after.programs.find(
          (program) => program.path === expectedProgram.path,
        );
        if (actualProgram?.sha256 !== expectedProgram.sha256)
          throw new Error(
            `Lint Program bytes were not restored for ${expectedProgram.path}: expected ${expectedProgram.sha256}, received ${actualProgram?.sha256 ?? "missing"}.`,
          );
      }
      if (
        JSON.stringify(
          after.scripts.map((entry) => ({
            path: entry.path,
            sha256: entry.sha256,
          })),
        ) !==
        JSON.stringify(
          before.scripts.map((entry) => ({
            path: entry.path,
            sha256: entry.sha256,
          })),
        )
      )
        throw new Error(
          `Benchmark package command surface was not restored for ${relative}.`,
        );
    }
    return digest(baselines, selected);
  }

  /**
   * Requires immutable Program routes, package commands, and main projection.
   *
   * Evidence claim objects may be deferred during an authorized later-layer
   * phase, so this gate deliberately excludes canonical claim bytes while
   * retaining every mechanism that decides whether the measured gates run.
   */
  export function assertInfrastructureRestored(
    workspace: string,
    arm: IEvidenceBenchmarkMaterialization.Arm,
    baselines: readonly IEvidenceBenchmarkMaterialization.ILintConfigBaseline[],
  ): string {
    validateBaselines(baselines, arm);
    const actual: ReadonlyMap<
      string,
      IEvidenceBenchmarkMaterialization.ILintConfigBaseline
    > = new Map(
      captureDirectory(workspace, arm).map((entry) => [entry.path, entry]),
    );
    for (const before of baselines) {
      const after = actual.get(before.path);
      if (after === undefined)
        throw new Error(
          `Benchmark infrastructure lost lint policy owner: ${before.path}.`,
        );
      if (
        EvidenceBenchmarkHash.object(after.programs) !==
        EvidenceBenchmarkHash.object(before.programs)
      )
        throw new Error(
          `Benchmark lint Program routing was not restored for ${before.path}.`,
        );
      if (
        EvidenceBenchmarkHash.object(after.scripts) !==
        EvidenceBenchmarkHash.object(before.scripts)
      )
        throw new Error(
          `Benchmark package command surface was not restored for ${before.path}.`,
        );
    }
    const expectedMain = baselines.find((entry) => entry.path === PATHS[3]);
    const actualMain = actual.get(PATHS[3]);
    if (
      expectedMain === undefined ||
      actualMain === undefined ||
      expectedMain.semanticSha256 !== actualMain.semanticSha256 ||
      expectedMain.sha256 !== actualMain.sha256
    )
      throw new Error(
        "Benchmark backend source-Program projection was not restored.",
      );
    return infrastructureDigest(baselines);
  }

  /** Returns the immutable Program, command, and projection identity. */
  export function infrastructureDigest(
    baselines: readonly IEvidenceBenchmarkMaterialization.ILintConfigBaseline[],
  ): string {
    return EvidenceBenchmarkHash.object(
      baselines.map((entry) => ({
        path: entry.path,
        programs: entry.programs,
        scripts: entry.scripts,
        ...(entry.path === PATHS[3]
          ? {
              sha256: entry.sha256,
              semanticSha256: entry.semanticSha256,
            }
          : {}),
      })),
    );
  }

  /** Returns the sealed identity for a selected restoration gate. */
  export function digest(
    baselines: readonly IEvidenceBenchmarkMaterialization.ILintConfigBaseline[],
    selected: readonly string[] = PATHS,
  ): string {
    const entries: ReadonlyMap<
      string,
      IEvidenceBenchmarkMaterialization.ILintConfigBaseline
    > = new Map(baselines.map((entry) => [entry.path, entry]));
    return EvidenceBenchmarkHash.object(
      selected.map((relative) => {
        const entry = entries.get(relative);
        if (entry === undefined)
          throw new Error(`Unknown lint baseline path requested: ${relative}.`);
        return entry;
      }),
    );
  }

  function validateBaselines(
    baselines: readonly IEvidenceBenchmarkMaterialization.ILintConfigBaseline[],
    arm: IEvidenceBenchmarkMaterialization.Arm,
  ): void {
    if (
      JSON.stringify(baselines.map((entry) => entry.path)) !==
      JSON.stringify(PATHS)
    )
      throw new Error(
        "Benchmark lint baselines do not contain the canonical package inventory and source-program projection.",
      );
    for (const entry of baselines) {
      if (entry.semanticSha256 !== EvidenceBenchmarkHash.object(entry.graph))
        throw new Error(
          `Benchmark lint semantic seal is corrupt: ${entry.path}.`,
        );
      if ((entry.graph === null) !== (arm === "plain"))
        throw new Error(
          `Benchmark ${arm} lint baseline has the wrong graph mechanism: ${entry.path}.`,
        );
      for (const claim of entry.graph?.claims ?? [])
        if (claim.sha256 !== EvidenceBenchmarkHash.object(claim.definition))
          throw new Error(
            `Benchmark lint claim seal is corrupt: ${entry.path}#${claim.name}.`,
          );
      const expectedPrograms = PROGRAMS.filter(
        (program) => program.lintConfig === entry.path,
      );
      if (
        JSON.stringify(
          entry.programs.map((program) => ({
            path: program.path,
            configFile: program.configFile,
          })),
        ) !==
        JSON.stringify(
          expectedPrograms.map((program) => ({
            path: program.path,
            configFile: program.configFile,
          })),
        )
      )
        throw new Error(
          `Benchmark lint Program inventory is corrupt: ${entry.path}.`,
        );
      const expectedScripts = SCRIPTS.filter(
        (scripts) => scripts.lintConfig === entry.path,
      );
      if (
        JSON.stringify(entry.scripts.map((scripts) => scripts.path)) !==
          JSON.stringify(expectedScripts.map((scripts) => scripts.path)) ||
        entry.scripts.some(
          (scripts) =>
            scripts.sha256 !== EvidenceBenchmarkHash.object(scripts.scripts),
        )
      )
        throw new Error(
          `Benchmark package command seal is corrupt: ${entry.path}.`,
        );
    }
  }

  function readProgram(
    files: ReadonlyMap<string, Uint8Array>,
    expected: (typeof PROGRAMS)[number],
  ): IEvidenceBenchmarkMaterialization.ILintProgramBaseline {
    const content: Uint8Array | undefined = files.get(expected.path);
    if (content === undefined)
      throw new Error(
        `Benchmark lint Program source is missing: ${expected.path}.`,
      );
    const parsed: unknown = JSON.parse(Buffer.from(content).toString("utf8"));
    const plugins: unknown =
      typeof parsed === "object" &&
      parsed !== null &&
      !Array.isArray(parsed) &&
      "compilerOptions" in parsed &&
      typeof parsed.compilerOptions === "object" &&
      parsed.compilerOptions !== null &&
      !Array.isArray(parsed.compilerOptions) &&
      "plugins" in parsed.compilerOptions
        ? parsed.compilerOptions.plugins
        : undefined;
    const required = [
      {
        transform: "@ttsc/lint",
        configFile: expected.configFile,
      },
    ];
    if (JSON.stringify(plugins) !== JSON.stringify(required))
      throw new Error(
        `Benchmark lint Program ${expected.path} must load ${expected.configFile} through its sole @ttsc/lint plugin entry.`,
      );
    return {
      path: expected.path,
      configFile: expected.configFile,
      sha256: EvidenceBenchmarkHash.bytes(content),
    };
  }

  function readScripts(
    files: ReadonlyMap<string, Uint8Array>,
    relative: string,
  ): IEvidenceBenchmarkMaterialization.ILintScriptsBaseline {
    const content: Uint8Array | undefined = files.get(relative);
    if (content === undefined)
      throw new Error(
        `Benchmark package command source is missing: ${relative}.`,
      );
    const parsed: unknown = JSON.parse(Buffer.from(content).toString("utf8"));
    const value: unknown =
      typeof parsed === "object" &&
      parsed !== null &&
      !Array.isArray(parsed) &&
      "scripts" in parsed
        ? parsed.scripts
        : undefined;
    if (
      typeof value !== "object" ||
      value === null ||
      Array.isArray(value) ||
      Object.values(value).some((command) => typeof command !== "string")
    )
      throw new Error(
        `Benchmark package scripts must be a string-valued object: ${relative}.`,
      );
    const scripts: Readonly<Record<string, string>> = Object.fromEntries(
      Object.entries(value as Record<string, string>).sort(([left], [right]) =>
        left.localeCompare(right, "en"),
      ),
    );
    return {
      path: relative,
      sha256: EvidenceBenchmarkHash.object(scripts),
      scripts,
    };
  }

  function readGraph(
    relative: string,
    content: string,
    arm: IEvidenceBenchmarkMaterialization.Arm,
  ): IEvidenceBenchmarkMaterialization.ILintGraphBaseline | null {
    const source: ts.SourceFile = ts.createSourceFile(
      relative,
      content,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    );
    const declarations = topLevelVariables(source, "graph");
    const loaderGuards = topLevelVariables(source, "isNestiaConfigLoader");
    const rules: ts.ObjectLiteralExpression | undefined = exportedRules(
      relative,
      source,
    );
    const rule: ts.PropertyAssignment | undefined =
      rules === undefined
        ? undefined
        : directProperty(relative, rules, "evidence/graph", "rules");
    if (arm === "plain") {
      if (declarations.length !== 0 || rule !== undefined)
        throw new Error(
          `Plain lint configuration unexpectedly declares an evidence graph: ${relative}.`,
        );
      return null;
    }
    if (
      declarations.length !== 1 ||
      declarations[0]!.constant === false ||
      rule === undefined
    )
      throw new Error(
        `Evidence lint configuration must declare one top-level const graph and one active evidence/graph rule: ${relative}.`,
      );
    const initializer: ts.Expression | undefined =
      declarations[0]!.declaration.initializer;
    if (initializer === undefined)
      throw new Error(`Evidence graph has no initializer: ${relative}.`);
    const graph: ts.Expression = unwrap(initializer);
    if (!ts.isObjectLiteralExpression(graph))
      throw new Error(`Evidence graph must be an object literal: ${relative}.`);
    const claimsProperty: ts.PropertyAssignment | undefined = directProperty(
      relative,
      graph,
      "claims",
      "graph",
    );
    if (claimsProperty === undefined)
      throw new Error(`Evidence graph has no claims array: ${relative}.`);
    const claimsExpression: ts.Expression = unwrap(claimsProperty.initializer);
    if (!ts.isArrayLiteralExpression(claimsExpression))
      throw new Error(`Evidence graph claims must be an array: ${relative}.`);
    const claims = claimsExpression.elements.map(
      (element): IEvidenceBenchmarkMaterialization.ILintClaimBaseline => {
        const expression: ts.Expression = unwrap(element);
        if (!ts.isObjectLiteralExpression(expression))
          throw new Error(
            `Evidence graph claim must be an object literal: ${relative}.`,
          );
        const definition = literalObject(relative, expression);
        const name: unknown = definition.name;
        if (typeof name !== "string" || name.length === 0)
          throw new Error(
            `Evidence graph claim requires a literal name: ${relative}.`,
          );
        return {
          name,
          sha256: EvidenceBenchmarkHash.object(definition),
          definition,
        };
      },
    );
    if (new Set(claims.map((claim) => claim.name)).size !== claims.length)
      throw new Error(
        `Evidence graph claim names are duplicated: ${relative}.`,
      );

    const ruleExpression: ts.Expression = unwrap(rule.initializer);
    if (relative === PATHS[1] || relative === PATHS[3]) {
      if (
        loaderGuards.length !== 1 ||
        loaderGuards[0]!.constant === false ||
        !isAuthorizedLoaderGuard(loaderGuards[0]!.declaration.initializer) ||
        !ts.isConditionalExpression(ruleExpression) ||
        !ts.isIdentifier(unwrap(ruleExpression.condition)) ||
        (unwrap(ruleExpression.condition) as ts.Identifier).text !==
          "isNestiaConfigLoader" ||
        !isString(unwrap(ruleExpression.whenTrue), "off") ||
        !isErrorGraphTuple(unwrap(ruleExpression.whenFalse))
      )
        throw new Error(
          `Backend evidence graph rule must use only the authorized Nestia loader bypass and otherwise remain ["error", graph]: ${relative}.`,
        );
    } else if (loaderGuards.length !== 0 || !isErrorGraphTuple(ruleExpression))
      throw new Error(
        `Evidence graph rule must remain the direct ["error", graph] tuple: ${relative}.`,
      );
    validateSupportingRules(
      relative,
      rules,
      relative === PATHS[1] || relative === PATHS[3],
    );
    return {
      severity: "error",
      claims,
    };
  }

  function validateSupportingRules(
    relative: string,
    rules: ts.ObjectLiteralExpression,
    loaderGuarded: boolean,
  ): void {
    const names: readonly string[] =
      relative === PATHS[2]
        ? ["evidence/documented", "evidence/todo"]
        : ["evidence/documented", "evidence/singular", "evidence/todo"];
    for (const name of names) {
      const property: ts.PropertyAssignment | undefined = directProperty(
        relative,
        rules,
        name,
        "rules",
      );
      if (property === undefined)
        throw new Error(
          `Evidence lint configuration is missing required ${name} severity: ${relative}.`,
        );
      const expression: ts.Expression = unwrap(property.initializer);
      if (loaderGuarded) {
        if (
          !ts.isConditionalExpression(expression) ||
          !ts.isIdentifier(unwrap(expression.condition)) ||
          (unwrap(expression.condition) as ts.Identifier).text !==
            "isNestiaConfigLoader" ||
          !isString(unwrap(expression.whenTrue), "off") ||
          !isString(unwrap(expression.whenFalse), "error")
        )
          throw new Error(
            `Backend ${name} must use only the authorized Nestia loader bypass and otherwise remain "error": ${relative}.`,
          );
      } else if (!isString(expression, "error"))
        throw new Error(
          `Evidence ${name} must remain at "error" severity: ${relative}.`,
        );
    }
  }

  function literalObject(
    relative: string,
    node: ts.ObjectLiteralExpression,
  ): Readonly<Record<string, unknown>> {
    const output: Record<string, unknown> = {};
    for (const property of node.properties) {
      if (!ts.isPropertyAssignment(property))
        throw new Error(
          `Lint baseline accepts only literal property assignments: ${relative}.`,
        );
      const name: string | undefined = propertyName(property.name);
      if (name === undefined)
        throw new Error(
          `Lint baseline property name is not literal: ${relative}.`,
        );
      if (Object.hasOwn(output, name))
        throw new Error(
          `Lint baseline property is duplicated: ${relative}#${name}.`,
        );
      output[name] = literalValue(relative, property.initializer);
    }
    return output;
  }

  function literalValue(relative: string, input: ts.Expression): unknown {
    const node: ts.Expression = unwrap(input);
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node))
      return node.text;
    if (ts.isNumericLiteral(node)) return Number(node.text);
    if (node.kind === ts.SyntaxKind.TrueKeyword) return true;
    if (node.kind === ts.SyntaxKind.FalseKeyword) return false;
    if (node.kind === ts.SyntaxKind.NullKeyword) return null;
    if (ts.isArrayLiteralExpression(node))
      return node.elements.map((element) => literalValue(relative, element));
    if (ts.isObjectLiteralExpression(node))
      return literalObject(relative, node);
    throw new Error(
      `Lint baseline contains a non-literal claim value in ${relative}: ${node.getText()}.`,
    );
  }

  function unwrap(input: ts.Expression): ts.Expression {
    let node: ts.Expression = input;
    while (
      ts.isParenthesizedExpression(node) ||
      ts.isAsExpression(node) ||
      ts.isSatisfiesExpression(node) ||
      ts.isTypeAssertionExpression(node)
    )
      node = node.expression;
    return node;
  }

  function propertyName(input: ts.PropertyName): string | undefined {
    if (
      ts.isIdentifier(input) ||
      ts.isStringLiteral(input) ||
      ts.isNumericLiteral(input)
    )
      return input.text;
    return undefined;
  }

  function exportedRules(
    relative: string,
    source: ts.SourceFile,
  ): ts.ObjectLiteralExpression | undefined {
    const assignments: ts.ExportAssignment[] = source.statements.filter(
      (statement): statement is ts.ExportAssignment =>
        ts.isExportAssignment(statement) && statement.isExportEquals !== true,
    );
    if (assignments.length !== 1)
      throw new Error(
        `Lint configuration must contain exactly one default export: ${relative}.`,
      );
    const expression: ts.Expression = unwrap(assignments[0]!.expression);
    if (!ts.isObjectLiteralExpression(expression))
      throw new Error(
        `Lint configuration default export must be a direct object literal: ${relative}.`,
      );
    const property: ts.PropertyAssignment | undefined = directProperty(
      relative,
      expression,
      "rules",
      "default export",
    );
    if (property === undefined) return undefined;
    const rules: ts.Expression = unwrap(property.initializer);
    if (!ts.isObjectLiteralExpression(rules))
      throw new Error(
        `Lint configuration rules must be a direct object literal: ${relative}.`,
      );
    return rules;
  }

  function directProperty(
    relative: string,
    object: ts.ObjectLiteralExpression,
    target: string,
    label: string,
  ): ts.PropertyAssignment | undefined {
    const names: Set<string> = new Set();
    let found: ts.PropertyAssignment | undefined;
    for (const property of object.properties) {
      if (!ts.isPropertyAssignment(property))
        throw new Error(
          `Lint configuration ${label} accepts only direct property assignments: ${relative}.`,
        );
      const name: string | undefined = propertyName(property.name);
      if (name === undefined)
        throw new Error(
          `Lint configuration ${label} property name is not literal: ${relative}.`,
        );
      if (names.has(name))
        throw new Error(
          `Lint configuration ${label} property is duplicated: ${relative}#${name}.`,
        );
      names.add(name);
      if (name === target) found = property;
    }
    return found;
  }

  function topLevelVariables(
    source: ts.SourceFile,
    target: string,
  ): {
    declaration: ts.VariableDeclaration;
    constant: boolean;
  }[] {
    const output: {
      declaration: ts.VariableDeclaration;
      constant: boolean;
    }[] = [];
    for (const statement of source.statements) {
      if (!ts.isVariableStatement(statement)) continue;
      const constant: boolean =
        (statement.declarationList.flags & ts.NodeFlags.Const) !== 0;
      for (const declaration of statement.declarationList.declarations)
        if (
          ts.isIdentifier(declaration.name) &&
          declaration.name.text === target
        )
          output.push({ declaration, constant });
    }
    return output;
  }

  function isAuthorizedLoaderGuard(input: ts.Expression | undefined): boolean {
    if (input === undefined) return false;
    const node: ts.Expression = unwrap(input);
    if (
      !ts.isBinaryExpression(node) ||
      node.operatorToken.kind !== ts.SyntaxKind.EqualsEqualsEqualsToken ||
      !isString(unwrap(node.right), "1")
    )
      return false;
    const variable: ts.Expression = unwrap(node.left);
    return (
      ts.isPropertyAccessExpression(variable) &&
      variable.name.text === "NESTIA_SDK_TRANSFORM" &&
      ts.isPropertyAccessExpression(variable.expression) &&
      variable.expression.name.text === "env" &&
      ts.isIdentifier(variable.expression.expression) &&
      variable.expression.expression.text === "process"
    );
  }

  function isErrorGraphTuple(node: ts.Expression): boolean {
    return (
      ts.isArrayLiteralExpression(node) &&
      node.elements.length === 2 &&
      isString(unwrap(node.elements[0]!), "error") &&
      ts.isIdentifier(unwrap(node.elements[1]!)) &&
      (unwrap(node.elements[1]!) as ts.Identifier).text === "graph"
    );
  }

  function isString(node: ts.Expression, value: string): boolean {
    return (
      (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) &&
      node.text === value
    );
  }

  function claimChangeSummary(
    before: IEvidenceBenchmarkMaterialization.ILintGraphBaseline | null,
    after: IEvidenceBenchmarkMaterialization.ILintGraphBaseline | null,
  ): string {
    const expected: ReadonlyMap<string, string> = new Map(
      (before?.claims ?? []).map((claim) => [claim.name, claim.sha256]),
    );
    const actual: ReadonlyMap<string, string> = new Map(
      (after?.claims ?? []).map((claim) => [claim.name, claim.sha256]),
    );
    const changed: string[] = [
      ...new Set([...expected.keys(), ...actual.keys()]),
    ]
      .filter((name) => expected.get(name) !== actual.get(name))
      .sort();
    const shown: string[] = changed.slice(0, 8).map(summarizeClaimName);
    const suffix: string =
      changed.length > shown.length
        ? `, and ${changed.length - shown.length} more`
        : "";
    return [
      `Expected claims: ${expected.size}; actual claims: ${actual.size}.`,
      `Changed claim names (${changed.length}): ${
        shown.length === 0 ? "none" : `${shown.join(", ")}${suffix}`
      }.`,
    ].join("\n");
  }

  function summarizeClaimName(name: string): string {
    const encoded: string = JSON.stringify(name);
    return encoded.length <= 64 ? encoded : `${encoded.slice(0, 63)}…`;
  }
}
