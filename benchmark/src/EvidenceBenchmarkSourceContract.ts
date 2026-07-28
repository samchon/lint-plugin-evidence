import fs from "node:fs";
import path from "node:path";

import * as ts from "typescript-api";

/** Enforces the benchmark's reusable-module and executable source boundaries. */
export namespace EvidenceBenchmarkSourceContract {
  const MAX_EXECUTABLE_LINES = 12;

  /**
   * Checks every TypeScript file under one benchmark source root.
   *
   * Executables remain short export-free bootstraps, while reusable modules
   * expose one filename-matched EvidenceBenchmark or IEvidenceBenchmark owner.
   */
  export function main(sourceRoot: string): void {
    const failures: string[] = [];
    const files: string[] = collect(sourceRoot);
    for (const file of files) {
      const relative: string = path.relative(sourceRoot, file);
      const sourceText: string = fs.readFileSync(file, "utf8");
      const source: ts.SourceFile = ts.createSourceFile(
        file,
        sourceText,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TS,
      );
      if (
        relative === "executable" ||
        relative.startsWith(`executable${path.sep}`)
      )
        failures.push(...checkExecutable(relative, source, sourceText));
      else failures.push(...checkReusable(relative, source, sourceText));
    }
    if (failures.length !== 0) {
      for (const failure of failures) console.error(failure);
      process.exitCode = 1;
    } else
      console.log(
        `Source contract passed for ${files.length} TypeScript files under ${path.relative(process.cwd(), sourceRoot)}.`,
      );
  }

  function checkExecutable(
    relative: string,
    source: ts.SourceFile,
    sourceText: string,
  ): string[] {
    const failures: string[] = [];
    const lines: number = physicalLines(sourceText);
    if (lines > MAX_EXECUTABLE_LINES)
      failures.push(
        `${relative}: executable bootstrap exceeds ${MAX_EXECUTABLE_LINES} physical lines (${lines})`,
      );
    const imports: ts.ImportDeclaration[] = source.statements.filter(
      ts.isImportDeclaration,
    );
    const actions: ts.Statement[] = source.statements.filter(
      (statement) => !ts.isImportDeclaration(statement),
    );
    if (
      source.statements.some((statement) =>
        hasModifier(statement, ts.SyntaxKind.ExportKeyword),
      )
    )
      failures.push(
        `${relative}: executable bootstrap must not export symbols`,
      );
    if (imports.length !== 1)
      failures.push(
        `${relative}: executable bootstrap must import exactly one owner`,
      );
    const bindings: readonly ts.ImportSpecifier[] =
      imports[0]?.importClause?.namedBindings !== undefined &&
      ts.isNamedImports(imports[0].importClause.namedBindings)
        ? imports[0].importClause.namedBindings.elements
        : [];
    if (bindings.length !== 1)
      failures.push(
        `${relative}: executable bootstrap requires one named owner import`,
      );
    if (actions.length !== 1 || !ts.isExpressionStatement(actions[0]!)) {
      failures.push(
        `${relative}: executable bootstrap must contain one Owner.main(...) call`,
      );
      return failures;
    }
    const expression: ts.Expression = ts.isAwaitExpression(
      actions[0]!.expression,
    )
      ? actions[0]!.expression.expression
      : actions[0]!.expression;
    if (
      !ts.isCallExpression(expression) ||
      !ts.isPropertyAccessExpression(expression.expression) ||
      expression.expression.name.text !== "main" ||
      !ts.isIdentifier(expression.expression.expression)
    ) {
      failures.push(
        `${relative}: executable bootstrap must contain one Owner.main(...) call`,
      );
      return failures;
    }
    const owner: string = expression.expression.expression.text;
    const imported: string | undefined = bindings[0]?.name.text;
    if (owner !== imported || !/^EvidenceBenchmark/.test(owner))
      failures.push(
        `${relative}: executable bootstrap owner ${owner} must be its named EvidenceBenchmark import`,
      );
    return failures;
  }

  function checkReusable(
    relative: string,
    source: ts.SourceFile,
    sourceText: string,
  ): string[] {
    const failures: string[] = [];
    const declarations: Array<
      ts.ClassDeclaration | ts.InterfaceDeclaration | ts.ModuleDeclaration
    > = [];
    for (const statement of source.statements) {
      if (ts.isImportDeclaration(statement)) continue;
      if (
        !hasModifier(statement, ts.SyntaxKind.ExportKeyword) ||
        (!ts.isClassDeclaration(statement) &&
          !ts.isInterfaceDeclaration(statement) &&
          !ts.isModuleDeclaration(statement))
      ) {
        failures.push(
          `${relative}: top-level declarations must belong to one exported class, interface, or namespace`,
        );
        continue;
      }
      declarations.push(statement);
    }
    const names: Set<string> = new Set(
      declarations.flatMap((declaration) =>
        declaration.name === undefined
          ? []
          : [declaration.name.getText(source)],
      ),
    );
    if (names.size !== 1) {
      failures.push(
        `${relative}: reusable module requires one exported owner, found ${[...names].join(", ") || "none"}`,
      );
      return failures;
    }
    const owner: string = [...names][0]!;
    if (path.basename(relative, ".ts") !== owner)
      failures.push(
        `${relative}: filename must equal exported owner ${owner}.ts`,
      );
    if (!/^(?:I)?EvidenceBenchmark[A-Za-z0-9_$]*$/.test(owner))
      failures.push(
        `${relative}: owner ${owner} requires the EvidenceBenchmark or IEvidenceBenchmark prefix`,
      );
    for (const declaration of declarations) {
      failures.push(...requireJsDoc(relative, sourceText, declaration, owner));
      failures.push(
        ...checkOwnedDeclaration(relative, sourceText, declaration),
      );
    }
    return failures;
  }

  function checkOwnedDeclaration(
    relative: string,
    sourceText: string,
    declaration:
      ts.ClassDeclaration | ts.InterfaceDeclaration | ts.ModuleDeclaration,
  ): string[] {
    if (ts.isClassDeclaration(declaration))
      return checkClass(relative, sourceText, declaration);
    if (ts.isInterfaceDeclaration(declaration))
      return checkInterface(relative, sourceText, declaration);
    const body: ts.ModuleBody | undefined = declaration.body;
    if (body === undefined || !ts.isModuleBlock(body))
      return [`${relative}: exported namespace requires a module block`];
    const failures: string[] = [];
    for (const statement of body.statements) {
      if (!hasModifier(statement, ts.SyntaxKind.ExportKeyword)) continue;
      const name: string = declarationName(statement);
      failures.push(...requireJsDoc(relative, sourceText, statement, name));
      if (ts.isInterfaceDeclaration(statement))
        failures.push(...checkInterface(relative, sourceText, statement));
      else if (ts.isClassDeclaration(statement))
        failures.push(...checkClass(relative, sourceText, statement));
    }
    return failures;
  }

  function checkClass(
    relative: string,
    sourceText: string,
    declaration: ts.ClassDeclaration,
  ): string[] {
    const failures: string[] = [];
    for (const member of declaration.members) {
      const visibility: boolean =
        hasModifier(member, ts.SyntaxKind.PublicKeyword) ||
        hasModifier(member, ts.SyntaxKind.PrivateKeyword) ||
        hasModifier(member, ts.SyntaxKind.ProtectedKeyword);
      if (!visibility)
        failures.push(
          `${relative}: class member ${declarationName(member)} requires explicit visibility`,
        );
      if (hasModifier(member, ts.SyntaxKind.PublicKeyword))
        failures.push(
          ...requireJsDoc(
            relative,
            sourceText,
            member,
            declarationName(member),
          ),
        );
    }
    return failures;
  }

  function checkInterface(
    relative: string,
    sourceText: string,
    declaration: ts.InterfaceDeclaration,
  ): string[] {
    return declaration.members.flatMap((member) =>
      requireJsDoc(relative, sourceText, member, declarationName(member)),
    );
  }

  function requireJsDoc(
    relative: string,
    sourceText: string,
    node: ts.Node,
    name: string,
  ): string[] {
    const leading: string = sourceText
      .slice(node.getFullStart(), node.getStart())
      .trim();
    return /\/\*\*[\s\S]*\*\/$/.test(leading)
      ? []
      : [`${relative}: ${name} requires leading JSDoc`];
  }

  function declarationName(node: ts.Node): string {
    if (ts.isConstructorDeclaration(node)) return "constructor";
    if ("name" in node && node.name !== undefined)
      return (node.name as ts.Node).getText();
    return ts.SyntaxKind[node.kind] ?? "member";
  }

  function hasModifier(node: ts.Node, kind: ts.SyntaxKind): boolean {
    return (
      ts.canHaveModifiers(node) &&
      (ts.getModifiers(node)?.some((modifier) => modifier.kind === kind) ??
        false)
    );
  }

  function collect(root: string): string[] {
    return fs
      .readdirSync(root, { withFileTypes: true })
      .flatMap((entry): string[] => {
        const target: string = path.join(root, entry.name);
        if (entry.isDirectory()) return collect(target);
        return entry.isFile() && entry.name.endsWith(".ts") ? [target] : [];
      })
      .sort((left, right) => left.localeCompare(right, "en"));
  }

  function physicalLines(source: string): number {
    if (source.length === 0) return 0;
    const lines: string[] = source.split(/\r\n|\r|\n/);
    return lines[lines.length - 1] === "" ? lines.length - 1 : lines.length;
  }
}
