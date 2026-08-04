import { evidence } from "@samchon/lint-plugin-evidence";
import type { ITtscLintConfig } from "@ttsc/lint";

import { graph } from "../lint.config.ts";

/** The directory of this configuration. */
const here: string = import.meta.dirname;

/**
 * The backend test Program inherits the package policy and its evidence graph.
 *
 * The package claims carry absolute roots, so they select the same populations
 * here that they select in the package Program. The e2e obligation is added
 * because the tests are its hosts and this is the Program they live in: the
 * operation population is the generated SDK accessor surface alone, so no
 * operation may answer "not applicable" and one test proves exactly one of
 * them; DTO shapes answer to the DTO claims instead. TypeScript targets are
 * cited as `{@link ...}` resolved through the test file's own imports.
 */
export default {
  extends: "../lint.config.ts",
  plugins: {
    evidence,
  },
  rules: {
    "evidence/graph": [
      "error",
      {
        claims: [
          ...graph.claims,
          {
            name: "backend-tests",
            type: "typescript",
            root: here,
            files: ["features/**/*.ts"],
            symbol: "function",
            reference: [
              {
                type: "markdown",
                root: `${here}/../../..`,
                files: ["docs/analysis/**/*.md"],
                symbol: ["h2", "h3"],
              },
              {
                type: "typescript",
                package: "{{apiPackageName}}",
                files: ["src/functional/**/*.ts"],
                symbol: ["function"],
                noExclude: true,
                singleEvidencePerSymbol: true,
              },
            ],
            // Remove after every public-operation test and evidence mapping is
            // complete.
            disabled: true,
          },
        ],
      },
    ],
  },
} satisfies ITtscLintConfig;
