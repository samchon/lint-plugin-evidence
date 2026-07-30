import {
  assertExcludes,
  assertIncludes,
  assertStatus,
  createProject,
  runCheck,
  type IEvidenceProject,
  type IRunResult,
} from "../internal/index.ts";

/**
 * Verifies a `root` that names no directory is reported as a root, naming both
 * the spelling the author wrote and the location it resolved to.
 *
 * A root off by one segment is the mistake this property introduces, and the
 * population it selects is then empty for a reason no pattern explains. The
 * resolved path is in the message because that is the whole question once a
 * root ascends: `../documents` is either the right directory or a directory
 * nobody created, and nothing in the configuration distinguishes the two.
 *
 * 1. Declare a root one segment away from the shared documents.
 * 2. Run the real `ttsc check`.
 * 3. Assert the diagnostic names the root as written and as resolved.
 */
export const test_evidence_graph_reports_an_unreadable_population_root =
  (): void => {
    const project: IEvidenceProject = createProject({
      name: "root-missing",
      lintConfig: [
        'import evidence from "@samchon/lint-plugin-evidence";',
        "",
        "export default {",
        '  plugins: { "evidence": evidence },',
        "  rules: {",
        '    "evidence/graph": ["error", {',
        "      claims: [",
        "        {",
        '          type: "typescript",',
        '          files: ["src/**/*.ts"],',
        '          symbol: "type",',
        "          reference: {",
        '            type: "markdown",',
        '            root: "../documents",',
        '            files: ["requirements/**"],',
        '            symbol: "h2",',
        "          },",
        "        },",
        "      ],",
        "    }],",
        "  },",
        "};",
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
        2,
        "A population whose root does not exist must fail rather than pass vacuously.",
      );
      assertIncludes(
        result,
        "could not read the markdown root '../documents', which resolves to '",
        "The diagnostic must name the property the author edits and the directory it landed on.",
      );
      assertExcludes(
        result,
        "Unresolved evidence target",
        "A failed population cannot prove that its declaration target is unresolved.",
      );
    } finally {
      project.cleanup();
    }
  };

/**
 * Verifies a rooted TypeScript population with no Program source reports its
 * empty selection.
 *
 * A TypeScript root changes the address space used to select sources already
 * supplied by ttsc; it does not scan that directory. Reporting the unmatched
 * rooted population distinguishes a valid root with no admitted source from an
 * invalid configuration or an implicit filesystem scan.
 *
 * 1. Declare a sibling `root` with no matching source in the Program.
 * 2. Run the real `ttsc check`.
 * 3. Assert the diagnostic names the empty population and its root.
 */
export const test_evidence_graph_reports_empty_rooted_typescript_population =
  (): void => {
    const project: IEvidenceProject = createProject({
      name: "root-typescript",
      lintConfig: [
        'import evidence from "@samchon/lint-plugin-evidence";',
        "",
        "export default {",
        '  plugins: { "evidence": evidence },',
        "  rules: {",
        '    "evidence/graph": ["error", {',
        "      claims: [",
        "        {",
        '          type: "typescript",',
        '          root: "../shared",',
        '          files: ["src/**/*.ts"],',
        '          symbol: "type",',
        '          reference: { type: "markdown", files: ["docs/**"], symbol: "h2" },',
        "        },",
        "      ],",
        "    }],",
        "  },",
        "};",
        "",
      ].join("\n"),
      files: {
        "docs/spec.md": "## Alpha\n",
        "src/sale.ts": [
          "/** @evidence docs/spec.md#alpha The sale contract follows this section. */",
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
        "A rooted TypeScript population with no Program source must fail explicitly.",
      );
      assertIncludes(
        result,
        "matched no typescript files",
        "The diagnostic must identify the empty TypeScript population.",
      );
      assertIncludes(
        result,
        "under root '../shared'",
        "The diagnostic must name the rooted address space the author can fix.",
      );
      assertExcludes(
        result,
        "Select an installed package with 'package'",
        "A supported TypeScript root must not be rejected as a configuration error.",
      );
    } finally {
      project.cleanup();
    }
  };
