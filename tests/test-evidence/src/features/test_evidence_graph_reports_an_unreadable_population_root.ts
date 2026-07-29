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
 * Verifies `root` is refused on a TypeScript population, and that the message
 * names the channel that does work.
 *
 * A TypeScript population is materialized from the ttsc program, so a directory
 * outside the project contributes no file to it — a root accepted there would
 * silently select nothing, which reads exactly like a glob that matches
 * nothing. An author reaching for it has a real out-of-project population in
 * mind, and `package` is the channel that already serves it.
 *
 * 1. Declare `root` on a TypeScript claim.
 * 2. Run the real `ttsc check`.
 * 3. Assert the configuration diagnostic redirects to `package`.
 */
export const test_evidence_graph_refuses_a_typescript_population_root =
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
        "A root on a population the ttsc program owns must be a configuration error.",
      );
      assertIncludes(
        result,
        "Select an installed package with 'package'",
        "The diagnostic must send the author to the channel that reaches an out-of-project TypeScript population.",
      );
    } finally {
      project.cleanup();
    }
  };
