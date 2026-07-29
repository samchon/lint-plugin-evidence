import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { EvidenceBenchmarkHash } from "./EvidenceBenchmarkHash.ts";
import { EvidenceBenchmarkLintBaseline } from "./EvidenceBenchmarkLintBaseline.ts";
import { EvidenceBenchmarkProcess } from "./EvidenceBenchmarkProcess.ts";
import type { IEvidenceBenchmarkMaterialization } from "./structures/IEvidenceBenchmarkMaterialization.ts";

/** Builds a non-vacuous Evidence-template fixture with every graph claim active. */
export namespace EvidenceBenchmarkConsumerProof {
  const REQUIREMENT =
    "docs/analysis/acceptance-fixture.md#visible-acceptance-marker";

  /**
   * Proves `.schema` is a lint-only input against a generated Prisma model.
   *
   * The same model is generated without the carrier, with invalid Prisma syntax
   * under the ignored extension, and with the active exclusion. Exact client
   * and ERD bytes bind both the generated schema inventory and its rendered
   * relationship view, while the later green graph proves that the Evidence
   * plugin alone consumes the restored exclusion.
   */
  export const verifyPrismaIsolation = async (
    cell: IEvidenceBenchmarkMaterialization,
  ): Promise<void> => {
    const backend: string = path.join(cell.workspace, "packages", "backend");
    const schema: string = path.join(backend, "prisma", "schema");
    writeNew(
      path.join(schema, "acceptance-fixture.prisma"),
      ["model FixtureRecord {", "  id String @id", "}", ""].join("\n"),
    );

    const carrier: string = path.join(schema, "exclude.schema");
    const originalCarrier: Buffer = fs.readFileSync(carrier);
    fs.rmSync(carrier);
    let withoutCarrier: ReadonlyMap<string, Uint8Array> | undefined;
    try {
      await generatePrisma(backend, cell.environment, "without .schema");
      withoutCarrier = readPrismaProducts(cell.workspace);
      writeNew(
        carrier,
        "@@@ invalid Prisma schema sentinel: this file must be ignored @@@\n",
      );
      await generatePrisma(
        backend,
        cell.environment,
        "with invalid .schema sentinel",
      );
      assert.deepEqual(
        readPrismaProducts(cell.workspace),
        withoutCarrier,
        "Prisma must ignore the .schema extension rather than merely produce coincidentally equal output",
      );

      fs.writeFileSync(
        carrier,
        `/// @evidenceExclude ${REQUIREMENT} The acceptance screen owns this stateless presentation requirement.\n`,
      );
      await generatePrisma(
        backend,
        cell.environment,
        "with active exclusion carrier",
      );
      assert.deepEqual(
        readPrismaProducts(cell.workspace),
        withoutCarrier,
        "an active exclude.schema carrier must preserve the Prisma client, schema inventory, and ERD exactly",
      );
    } catch (error) {
      fs.writeFileSync(carrier, originalCarrier);
      throw error;
    }
  };

  /**
   * Completes a coherent one-section graph and builds the real Evidence arm.
   *
   * All seven template claims retain their original populations and severities.
   * The fixture gives every reference kind a non-empty population, exercises a
   * model ancestor through both DTO claims, and leaves ownership citations on
   * the actual screen and journey declarations.
   */
  export const verifyActiveGraph = async (
    cell: IEvidenceBenchmarkMaterialization,
    variables: IEvidenceBenchmarkMaterialization.IVariables,
  ): Promise<void> => {
    const workspace: string = cell.workspace;
    replaceRequirements(workspace);
    writeDto(workspace);
    writeCarriers(workspace, variables.apiPackageName);
    writeFrontend(workspace, variables);
    EvidenceBenchmarkLintBaseline.assertRestored(
      workspace,
      "evidence",
      cell.lintBaselines,
    );

    await EvidenceBenchmarkProcess.pnpm(["run", "build"], {
      cwd: workspace,
      env: cell.environment,
      label: "packaged Evidence template active-graph build",
    });
    await EvidenceBenchmarkProcess.pnpm(["run", "lint"], {
      cwd: workspace,
      env: cell.environment,
      label: "packaged Evidence template active-graph lint",
    });
    await verifyHealthRuntime(workspace, cell.environment);
  };

  /** Proves the typed health e2e is discovered in source and compiled modes. */
  const verifyHealthRuntime = async (
    workspace: string,
    environment: NodeJS.ProcessEnv,
  ): Promise<void> => {
    const backend: string = path.join(workspace, "packages", "backend");
    for (const result of [
      await EvidenceBenchmarkProcess.pnpm(["run", "test"], {
        cwd: backend,
        env: environment,
        label: "packaged Evidence source health e2e",
      }),
      await EvidenceBenchmarkProcess.run(
        process.execPath,
        ["bin/test/index.js"],
        {
          cwd: backend,
          env: environment,
          label: "packaged Evidence compiled health e2e",
        },
      ),
    ]) {
      const match: RegExpMatchArray | null = result.stdout.match(
        /TEST_AUTOMATION_REPORT=(\{[^\r\n]+\})/,
      );
      assert.ok(match, "the Evidence health runner did not publish its report");
      const report = JSON.parse(match[1]!) as {
        executions: Array<{
          name: string;
          value?: unknown;
          error: string | null;
          stack: string | null;
        }>;
      };
      const execution = report.executions.find(
        (candidate) => candidate.name === "test_api_health",
      );
      assert.ok(
        execution,
        "the Evidence health runner did not discover test_api_health",
      );
      assert.equal(execution.error, null);
      assert.equal(execution.stack, null);
      assert.equal(execution.value, 3);
    }
  };

  const generatePrisma = (
    backend: string,
    environment: NodeJS.ProcessEnv,
    state: string,
  ): Promise<EvidenceBenchmarkProcess.IResult> =>
    EvidenceBenchmarkProcess.pnpm(["run", "build:prisma"], {
      cwd: backend,
      env: environment,
      label: `Prisma carrier isolation ${state}`,
    });

  const readPrismaProducts = (
    workspace: string,
  ): ReadonlyMap<string, Uint8Array> => {
    const client: string = path.join(
      workspace,
      "packages",
      "backend",
      "src",
      "prisma",
    );
    const output: Map<string, Uint8Array> = new Map(
      [...EvidenceBenchmarkHash.directory(client)].map(
        ([relative, content]) => [`client/${relative}`, content] as const,
      ),
    );
    const modelInventory: string[] = [...output.keys()]
      .filter((relative) => /^client\/models\/[^/]+\.ts$/.test(relative))
      .map((relative) => path.posix.basename(relative, ".ts"))
      .sort();
    assert.equal(
      modelInventory.includes("FixtureRecord"),
      true,
      "Prisma client inventory must contain the non-vacuous fixture model",
    );
    output.set(
      "schema-inventory.json",
      Buffer.from(`${JSON.stringify(modelInventory)}\n`),
    );
    const erd: string = path.join(workspace, "docs", "ERD.md");
    const diagram: Buffer = fs.readFileSync(erd);
    assert.match(diagram.toString("utf8"), /FixtureRecord/);
    output.set("docs/ERD.md", diagram);
    return output;
  };

  const replaceRequirements = (workspace: string): void => {
    const analysis: string = path.join(workspace, "docs", "analysis");
    fs.rmSync(analysis, { recursive: true, force: true });
    fs.mkdirSync(analysis, { recursive: true });
    writeNew(
      path.join(analysis, "acceptance-fixture.md"),
      [
        "# Consumer Acceptance Fixture",
        "",
        "## Visible Acceptance Marker",
        "",
        "The application renders a visible acceptance marker and its browser",
        "journey reaches that screen through the public root route.",
        "",
      ].join("\n"),
    );
  };

  const writeDto = (workspace: string): void => {
    const structures: string = path.join(
      workspace,
      "packages",
      "api",
      "src",
      "structures",
    );
    writeNew(
      path.join(structures, "IAcceptanceMarker.ts"),
      [
        "/**",
        " * Public contract for the visible consumer acceptance marker.",
        " *",
        ` * @evidence ${REQUIREMENT}`,
        " *           Defines the text rendered by the acceptance screen.",
        " */",
        "export interface IAcceptanceMarker {",
        "  /** Text that must be visible on the acceptance screen. */",
        "  text: string;",
        "}",
        "",
      ].join("\n"),
    );
    fs.writeFileSync(
      path.join(structures, "index.ts"),
      'export type { IAcceptanceMarker } from "./IAcceptanceMarker";\n',
    );
  };

  const writeCarriers = (workspace: string, apiPackageName: string): void => {
    const backend: string = path.join(workspace, "packages", "backend");
    const api: string = path.join(workspace, "packages", "api");
    fs.writeFileSync(
      path.join(backend, "prisma", "schema", "exclude.schema"),
      [
        `/// @evidenceExclude ${REQUIREMENT} The acceptance screen owns this stateless presentation requirement.`,
        "",
      ].join("\n"),
    );
    fs.writeFileSync(
      path.join(
        backend,
        "src",
        "controllers",
        "CONTROLLER_EVIDENCE_EXCLUDE.ts",
      ),
      [
        "/**",
        " * Reviewed exclusions for the consumer acceptance API graph.",
        " *",
        ` * @evidenceExclude ${REQUIREMENT}`,
        " *                  The frontend owns this presentation-only marker.",
        " * @evidenceExclude prisma:FixtureRecord",
        " *                  No operation exposes the generator-isolation model.",
        " */",
        "export const CONTROLLER_EVIDENCE_EXCLUDE = true;",
        "",
      ].join("\n"),
    );
    fs.writeFileSync(
      path.join(api, "src", "structures", "DTO_EVIDENCE_EXCLUDE.ts"),
      [
        "/**",
        " * Reviewed exclusions for the consumer acceptance DTO graph.",
        " *",
        " * @evidenceExclude prisma:FixtureRecord",
        " *                  The generator-isolation model is internal and no",
        " *                  public DTO transports it or any of its columns.",
        " */",
        "export const DTO_EVIDENCE_EXCLUDE = true;",
        "",
      ].join("\n"),
    );
    fs.writeFileSync(
      path.join(backend, "test", "features", "TEST_EVIDENCE_EXCLUDE.ts"),
      [
        `import type { IAcceptanceMarker } from "${apiPackageName}/structures";`,
        "",
        "/**",
        " * Reviewed exclusions for the consumer acceptance test graph.",
        " *",
        ` * @evidenceExclude ${REQUIREMENT}`,
        " *                  The browser journey owns the visible marker proof.",
        " * @evidenceExclude {@link IAcceptanceMarker}",
        " *                  No backend operation exchanges the frontend marker.",
        " */",
        "export const TEST_EVIDENCE_EXCLUDE = true;",
        "",
      ].join("\n"),
    );
  };

  const writeFrontend = (
    workspace: string,
    variables: IEvidenceBenchmarkMaterialization.IVariables,
  ): void => {
    const frontend: string = path.join(workspace, "packages", "frontend");
    const page: string = path.join(
      frontend,
      "src",
      "components",
      "fixture",
      "fixture-page.tsx",
    );
    fs.mkdirSync(path.dirname(page), { recursive: true });
    writeNew(
      page,
      [
        `import type { IAcceptanceMarker } from "${variables.apiPackageName}/structures";`,
        "",
        "const marker = {",
        '  text: "Central exclusion acceptance fixture",',
        "} satisfies IAcceptanceMarker;",
        "",
        "/**",
        " * Renders the marker used by the complete-graph consumer proof.",
        " *",
        ` * @evidence ${REQUIREMENT}`,
        " *           Makes the acceptance marker visible on the root screen.",
        " */",
        "export function FixturePage() {",
        "  return <p>{marker.text}</p>;",
        "}",
        "",
      ].join("\n"),
    );

    const app: string = path.join(frontend, "src", "App.tsx");
    let source: string = fs.readFileSync(app, "utf8");
    source = replaceExactly(
      source,
      'import { AppProviders } from "./components/providers/app-providers";',
      [
        'import { FixturePage } from "./components/fixture/fixture-page";',
        'import { AppProviders } from "./components/providers/app-providers";',
      ].join("\n"),
    );
    source = replaceExactly(
      source,
      "        </section>",
      ["          <FixturePage />", "        </section>"].join("\n"),
    );
    fs.writeFileSync(app, source);

    fs.writeFileSync(
      path.join(frontend, "tests", "journeys", "scaffold.spec.ts"),
      [
        'import { expect, test, type Page } from "@playwright/test";',
        "",
        'import type { FixturePage } from "../../src/components/fixture/fixture-page";',
        "",
        "/**",
        " * Navigates to the generated application through its public route.",
        " *",
        ` * @evidence ${REQUIREMENT}`,
        " *           Traverses the public root route that renders the marker.",
        " * @evidence {@link FixturePage}",
        " *           Traverses the screen through the application entry route.",
        " */",
        "export async function journey_scaffold_loads(page: Page): Promise<void> {",
        '  const response = await page.goto("/");',
        '  if (response === null) throw new Error("Navigation returned no response.");',
        "  if (response.ok() === false)",
        "    throw new Error(`Navigation failed with status ${response.status()}.`);",
        "}",
        "",
        'test("the production scaffold loads", async ({ page }) => {',
        "  await journey_scaffold_loads(page);",
        "  await expect(",
        '    page.getByText("Central exclusion acceptance fixture"),',
        "  ).toBeVisible();",
        '  await expect(page.getByRole("heading", { level: 1 })).toContainText(',
        `    ${JSON.stringify(variables.name)},`,
        "  );",
        "});",
        "",
      ].join("\n"),
    );
  };

  const writeNew = (location: string, content: string): void => {
    fs.mkdirSync(path.dirname(location), { recursive: true });
    fs.writeFileSync(location, content, { flag: "wx" });
  };

  const replaceExactly = (
    source: string,
    before: string,
    after: string,
  ): string => {
    const first: number = source.indexOf(before);
    assert.notEqual(
      first,
      -1,
      `consumer mutation target is missing: ${before}`,
    );
    assert.equal(
      source.indexOf(before, first + before.length),
      -1,
      `consumer mutation target is ambiguous: ${before}`,
    );
    return `${source.slice(0, first)}${after}${source.slice(first + before.length)}`;
  };
}
