import {
  assertFailure,
  assertIncludes,
  assertStatus,
  createProject,
  runCheck,
  type IEvidenceProject,
} from "../internal/index.ts";

const lintConfig: string = [
  'import type { ITtscLintConfig } from "@ttsc/lint";',
  "import {",
  "  evidence,",
  "  type IEvidenceGraphAcknowledgementPolicy,",
  "  type IEvidenceGraphConfig,",
  '} from "@samchon/lint-plugin-evidence";',
  "",
  "const acknowledgement: IEvidenceGraphAcknowledgementPolicy = {",
  "  forbidEvidenceExclude: true,",
  "  exactEvidenceUnitsPerHost: 1,",
  "  minimumEvidenceHostsPerUnit: 2,",
  "};",
  "",
  "const graph: IEvidenceGraphConfig = {",
  "  claims: [{",
  '    type: "typescript",',
  '    files: ["src/**"],',
  '    symbol: "function",',
  "    reference: {",
  '      type: "markdown",',
  '      files: ["docs/spec.md"],',
  '      symbol: "h2",',
  "      acknowledgement,",
  "    },",
  "  }],",
  "};",
  "",
  "export default {",
  "  plugins: { evidence },",
  '  rules: { "evidence/graph": ["error", graph] },',
  "} satisfies ITtscLintConfig;",
  "",
].join("\n");

/**
 * Verifies reference acknowledgement policy through the published real binary.
 *
 * Native tests pin each evaluator branch, while this consumer proves the public
 * policy type is exported, all three JSON names survive config loading, the
 * shipped Go contributor emits the actionable diagnostics, and a fully
 * satisfied twin passes.
 *
 * 1. Run a typed strict policy against one forbidden exclusion.
 * 2. Assert forbid, exact-host, missing, and minimum-host diagnostics reach
 *    `ttsc`.
 * 3. Replace it with two distinct positive hosts and assert the same policy
 *    passes.
 */
export const test_evidence_graph_enforces_reference_acknowledgement_policy =
  (): void => {
    const rejected: IEvidenceProject = createProject({
      name: "reference-acknowledgement-policy-rejected",
      lintConfig,
      files: {
        "docs/spec.md": "## Contract {#contract}\n",
        "src/rejected.ts": [
          "/** @evidenceExclude docs/spec.md#contract No implementation. */",
          "export function rejected(): void {}",
          "",
        ].join("\n"),
      },
    });
    try {
      const result = runCheck(rejected.directory);
      assertFailure(result, "A strict reference must reject an exclusion.");
      assertIncludes(
        result,
        "acknowledgement.forbidEvidenceExclude requires positive @evidence",
        "The forbidden-exclusion policy must survive the native config boundary.",
      );
      assertIncludes(
        result,
        "acknowledgement.exactEvidenceUnitsPerHost requires exactly 1",
        "The selected function must be counted even though it has no positive tag.",
      );
      assertIncludes(
        result,
        "this reference forbids @evidenceExclude",
        "Forbidden exclusion must leave ordinary coverage missing.",
      );
      assertIncludes(
        result,
        "acknowledgement.minimumEvidenceHostsPerUnit requires at least 2",
        "An exclusion must contribute no positive evidence host.",
      );
    } finally {
      rejected.cleanup();
    }

    const accepted: IEvidenceProject = createProject({
      name: "reference-acknowledgement-policy-accepted",
      lintConfig,
      files: {
        "docs/spec.md": "## Contract {#contract}\n",
        "src/first.ts": [
          "/** @evidence docs/spec.md#contract First independent proof. */",
          "export function first(): void {}",
          "",
        ].join("\n"),
        "src/second.ts": [
          "/** @evidence docs/spec.md#contract Second independent proof. */",
          "export function second(): void {}",
          "",
        ].join("\n"),
      },
    });
    try {
      const result = runCheck(accepted.directory);
      assertStatus(
        result,
        0,
        "Two positive semantic hosts must satisfy the complete strict policy.",
      );
    } finally {
      accepted.cleanup();
    }
  };
