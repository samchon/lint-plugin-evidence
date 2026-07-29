import "reflect-metadata";

import { DynamicModule } from "@nestia/core";
import type { Type } from "@nestjs/common";
import { MODULE_METADATA } from "@nestjs/common/constants";
import type { ModuleMetadata } from "@nestjs/common/interfaces";
import type { INestiaConfig } from "@nestia/sdk";
import fs from "node:fs";
import path from "node:path";

/**
 * Owns the one controller population shared by runtime and Nestia generation.
 */
export namespace MyModule {
  /**
   * Returns the authored TypeScript controller population for Nestia.
   *
   * @returns Include and exclude roots consumed by Nestia generation.
   */
  export const input = (): INestiaConfig.IInput => {
    const root: string = path.resolve(process.cwd(), "src", "controllers");
    assertDirectory(root, "Nestia controller source root");
    const sources: readonly string[] = readTypeScriptSources(root);
    if (sources.length === 0)
      throw new Error(
        `Nestia controller source root contains no TypeScript source: ${root}.`,
      );
    if (sources.some(isNestControllerSource) === false)
      throw new Error(
        `Nestia controller source root contains no NestJS controller source: ${root}.`,
      );
    return {
      include: [root],
      exclude: [],
    };
  };

  /**
   * Discovers every runtime controller and mounts shared Nest metadata.
   *
   * @param metadata Shared imports, providers, exports, and module metadata.
   * @returns A Nest module containing the discovered controller population.
   */
  export const mount = async (
    metadata: Omit<ModuleMetadata, "controllers"> = {},
  ): Promise<Type<unknown>> => {
    const root: string = path.join(__dirname, "controllers");
    assertDirectory(root, "Runtime controller root");
    const module: Type<unknown> = await DynamicModule.mount(
      {
        include: [root],
        exclude: [],
      },
      metadata,
    );
    const controllers: readonly Type<unknown>[] = readControllers(module);
    if (controllers.length === 0)
      throw new Error(`No NestJS controller was discovered under ${root}.`);
    const identities: Set<Type<unknown>> = new Set(controllers);
    if (identities.size !== controllers.length)
      throw new Error(
        `A NestJS controller was discovered more than once under ${root}; export each controller from its defining file only.`,
      );
    return module;
  };
}

const assertDirectory = (root: string, label: string): void => {
  let stats: fs.Stats;
  try {
    stats = fs.statSync(root);
  } catch {
    throw new Error(`${label} does not exist: ${root}.`);
  }
  if (stats.isDirectory() === false)
    throw new Error(`${label} is not a directory: ${root}.`);
};

const readTypeScriptSources = (root: string): string[] =>
  fs.readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const location: string = path.join(root, entry.name);
    if (entry.isDirectory()) return readTypeScriptSources(location);
    if (entry.isFile() === false) return [];
    const lower: string = entry.name.toLowerCase();
    return /\.(?:[cm]?ts)$/.test(lower) &&
      /\.(?:d\.[cm]?ts|d\.ts)$/.test(lower) === false
      ? [location]
      : [];
  });

const isNestControllerSource = (location: string): boolean => {
  const ts: typeof import("typescript-api") = require("typescript-api");
  const source: import("typescript-api").SourceFile = ts.createSourceFile(
    location,
    fs.readFileSync(location, "utf8"),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const identifiers: Set<string> = new Set();
  const namespaces: Map<string, ReadonlySet<string>> = new Map();
  for (const statement of source.statements) {
    if (
      ts.isImportDeclaration(statement) === false ||
      ts.isStringLiteral(statement.moduleSpecifier) === false ||
      statement.importClause?.namedBindings === undefined
    )
      continue;
    const module: string = statement.moduleSpecifier.text;
    const expected: ReadonlySet<string> =
      module === "@nestjs/common"
        ? new Set(["Controller"])
        : module === "@nestia/core"
          ? new Set(["TypedController"])
          : new Set();
    if (expected.size === 0) continue;
    const bindings = statement.importClause.namedBindings;
    if (ts.isNamespaceImport(bindings))
      namespaces.set(bindings.name.text, expected);
    else
      for (const element of bindings.elements)
        if (expected.has((element.propertyName ?? element.name).text))
          identifiers.add(element.name.text);
  }
  const exported: Set<string> = new Set();
  for (const statement of source.statements)
    if (
      ts.isExportDeclaration(statement) &&
      statement.isTypeOnly === false &&
      statement.moduleSpecifier === undefined &&
      statement.exportClause !== undefined &&
      ts.isNamedExports(statement.exportClause)
    )
      for (const element of statement.exportClause.elements)
        if (element.isTypeOnly === false)
          exported.add((element.propertyName ?? element.name).text);
    else if (
      ts.isExportAssignment(statement) &&
      statement.isExportEquals === false &&
      ts.isIdentifier(statement.expression)
    )
      exported.add(statement.expression.text);
  return source.statements.some((statement) => {
    if (ts.isClassDeclaration(statement) === false) return false;
    const isDirectExport: boolean =
      statement.modifiers?.some(
        (modifier) =>
          modifier.kind === ts.SyntaxKind.ExportKeyword ||
          modifier.kind === ts.SyntaxKind.DefaultKeyword,
      ) === true;
    if (
      isDirectExport === false &&
      (statement.name === undefined || exported.has(statement.name.text) === false)
    )
      return false;
    return (ts.getDecorators(statement) ?? []).some((decorator) => {
      const expression: import("typescript-api").Expression =
        ts.isCallExpression(decorator.expression)
          ? decorator.expression.expression
          : decorator.expression;
      if (ts.isIdentifier(expression))
        return identifiers.has(expression.text);
      return (
        ts.isPropertyAccessExpression(expression) &&
        ts.isIdentifier(expression.expression) &&
        namespaces
          .get(expression.expression.text)
          ?.has(expression.name.text) === true
      );
    });
  });
};

const readControllers = (
  module: Type<unknown>,
): readonly Type<unknown>[] => {
  const value: unknown = Reflect.getMetadata(
    MODULE_METADATA.CONTROLLERS,
    module,
  );
  if (
    Array.isArray(value) === false ||
    value.some((controller) => typeof controller !== "function")
  )
    throw new Error(
      "Nestia DynamicModule returned invalid controller metadata.",
    );
  return value as Type<unknown>[];
};
