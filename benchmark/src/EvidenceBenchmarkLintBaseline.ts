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
  ] as const;

  /** Captures exact bytes and literal graph semantics from an in-memory tree. */
  export function capture(
    files: ReadonlyMap<string, Uint8Array>,
    arm: IEvidenceBenchmarkMaterialization.Arm,
  ): IEvidenceBenchmarkMaterialization.ILintConfigBaseline[] {
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
      };
    });
  }

  /** Captures the three package lint configurations from one workspace. */
  export function captureDirectory(
    workspace: string,
    arm: IEvidenceBenchmarkMaterialization.Arm,
  ): IEvidenceBenchmarkMaterialization.ILintConfigBaseline[] {
    return capture(
      new Map(
        PATHS.map((relative) => {
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
            `Expected: ${JSON.stringify(before.graph)}`,
            `Actual: ${JSON.stringify(after.graph)}`,
          ].join("\n"),
        );
      if (after.sha256 !== before.sha256)
        throw new Error(
          `Lint configuration bytes were not restored for ${relative}: expected ${before.sha256}, received ${after.sha256}.`,
        );
    }
    return digest(baselines, selected);
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
        "Benchmark lint baselines do not contain the canonical package inventory.",
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
    }
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
    const declarations: ts.VariableDeclaration[] = [];
    const rules: ts.PropertyAssignment[] = [];
    const visit = (node: ts.Node): void => {
      if (
        ts.isVariableDeclaration(node) &&
        ts.isIdentifier(node.name) &&
        node.name.text === "graph"
      )
        declarations.push(node);
      if (
        ts.isPropertyAssignment(node) &&
        propertyName(node.name) === "evidence/graph"
      )
        rules.push(node);
      ts.forEachChild(node, visit);
    };
    visit(source);
    if (arm === "plain") {
      if (declarations.length !== 0 || rules.length !== 0)
        throw new Error(
          `Plain lint configuration unexpectedly declares an evidence graph: ${relative}.`,
        );
      return null;
    }
    if (declarations.length !== 1 || rules.length !== 1)
      throw new Error(
        `Evidence lint configuration must declare one graph and one evidence/graph rule: ${relative}.`,
      );
    const initializer: ts.Expression | undefined = declarations[0]!.initializer;
    if (initializer === undefined)
      throw new Error(`Evidence graph has no initializer: ${relative}.`);
    const graph: ts.Expression = unwrap(initializer);
    if (!ts.isObjectLiteralExpression(graph))
      throw new Error(`Evidence graph must be an object literal: ${relative}.`);
    const claimsProperty: ts.PropertyAssignment | undefined =
      graph.properties.find(
        (property): property is ts.PropertyAssignment =>
          ts.isPropertyAssignment(property) &&
          propertyName(property.name) === "claims",
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

    const activeTuples: ts.ArrayLiteralExpression[] = [];
    const findActiveTuple = (node: ts.Node): void => {
      if (
        ts.isArrayLiteralExpression(node) &&
        node.elements.length === 2 &&
        ts.isStringLiteral(unwrap(node.elements[0]!)) &&
        (unwrap(node.elements[0]!) as ts.StringLiteral).text === "error" &&
        ts.isIdentifier(unwrap(node.elements[1]!)) &&
        (unwrap(node.elements[1]!) as ts.Identifier).text === "graph"
      )
        activeTuples.push(node);
      ts.forEachChild(node, findActiveTuple);
    };
    findActiveTuple(rules[0]!.initializer);
    if (activeTuples.length !== 1)
      throw new Error(
        `Evidence graph rule must contain one active ["error", graph] branch: ${relative}.`,
      );
    return {
      severity: "error",
      claims,
    };
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
}
