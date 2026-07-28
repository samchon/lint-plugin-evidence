import {
  assertIncludes,
  assertStatus,
  createProject,
  runCheck,
  type IEvidenceProject,
  type IRunResult,
} from "../internal/index.ts";

/**
 * Verifies a Markdown population declared above the ttsc project resolves, and
 * that its targets are addressed from the declared root.
 *
 * A monorepo keeps one requirements set that several packages implement
 * together, and each package is its own ttsc project. Before `root`, the
 * ceiling was that project root: the only ways to compile were duplicating the
 * documents per package or gating one package and leaving the rest open. The
 * root-relative address is what makes the escape adoptable rather than merely
 * possible — the same citation text works in every package that declares the
 * same base, so the sibling package copies the line and nothing else.
 *
 * 1. Write a requirements document beside the project rather than inside it.
 * 2. Cite it by its path inside the declared root, with no `..` in the target.
 * 3. Assert the real `ttsc check` closes the graph.
 */
export const test_evidence_graph_cites_documents_above_the_project =
  (): void => {
    const project: IEvidenceProject = createProject({
      name: "root-markdown",
      lintConfig: [
        'import type { ITtscLintConfig } from "@ttsc/lint";',
        'import { evidence, type IEvidenceGraphConfig } from "@samchon/lint-plugin-evidence";',
        "",
        "const graph: IEvidenceGraphConfig = {",
        "  claims: [{",
        '    type: "typescript",',
        '    files: ["src/**/*.ts"],',
        '    symbol: "type",',
        "    reference: {",
        '      type: "markdown",',
        '      root: "../docs",',
        '      files: ["requirements/**"],',
        '      symbol: "h2",',
        "    },",
        "  }],",
        "};",
        "",
        "export default {",
        '  plugins: { "evidence": evidence },',
        '  rules: { "evidence/graph": ["error", graph] },',
        "} satisfies ITtscLintConfig;",
        "",
      ].join("\n"),
      workspaceFiles: {
        "docs/requirements/pricing.md": "## Discount Policy {#discounts}\n",
      },
      files: {
        "src/sale.ts": [
          "/** @evidence requirements/pricing.md#discounts Discount stacking follows this section. */",
          "export interface ISale {}",
          "",
        ].join("\n"),
      },
    });
    try {
      const result: IRunResult = runCheck(project.directory);
      assertStatus(
        result,
        0,
        "A document set beside the project must be citable through a declared root.",
      );
    } finally {
      project.cleanup();
    }
  };

/**
 * Verifies the negative twin: an uncited section of a rooted population fails,
 * and the diagnostic names both the root-relative target and the location a
 * reader has to open.
 *
 * Without this, the passing case above is equally satisfied by a rule that
 * silently materialized nothing — a population selecting no files is exactly as
 * quiet as one whose every obligation is met. The message is asserted too,
 * because a citation that resolves outside the project cannot be repaired from
 * the target alone: `requirements/pricing.md` names no path the reader can open
 * from the project directory.
 *
 * 1. Select two sections of the shared document and cite only one.
 * 2. Assert the check fails.
 * 3. Assert the diagnostic carries the rooted target and the ascending path.
 */
export const test_evidence_graph_reports_an_uncited_document_above_the_project =
  (): void => {
    const project: IEvidenceProject = createProject({
      name: "root-markdown-uncited",
      lintConfig: [
        'import type { ITtscLintConfig } from "@ttsc/lint";',
        'import { evidence, type IEvidenceGraphConfig } from "@samchon/lint-plugin-evidence";',
        "",
        "const graph: IEvidenceGraphConfig = {",
        "  claims: [{",
        '    type: "typescript",',
        '    files: ["src/**/*.ts"],',
        '    symbol: "type",',
        "    reference: {",
        '      type: "markdown",',
        '      root: "../docs",',
        '      files: ["requirements/**"],',
        '      symbol: "h2",',
        "    },",
        "  }],",
        "};",
        "",
        "export default {",
        '  plugins: { "evidence": evidence },',
        '  rules: { "evidence/graph": ["error", graph] },',
        "} satisfies ITtscLintConfig;",
        "",
      ].join("\n"),
      workspaceFiles: {
        "docs/requirements/pricing.md": [
          "## Discount Policy {#discounts}",
          "",
          "## Refund Policy {#refunds}",
          "",
        ].join("\n"),
      },
      files: {
        "src/sale.ts": [
          "/** @evidence requirements/pricing.md#discounts Discount stacking follows this section. */",
          "export interface ISale {}",
          "",
        ].join("\n"),
      },
    });
    try {
      const result: IRunResult = runCheck(project.directory);
      assertStatus(
        result,
        2,
        "An uncited section of a shared document set must still fail the build.",
      );
      assertIncludes(
        result,
        "Missing acknowledgement for 'requirements/pricing.md#refunds'",
        "The target must stay relative to the declared root, so the same citation works in every project that shares it.",
      );
      assertIncludes(
        result,
        "at ../docs/requirements/pricing.md:3",
        "The location must ascend out of the project, or the reader cannot find the file the target names.",
      );
    } finally {
      project.cleanup();
    }
  };
