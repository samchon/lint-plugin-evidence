import {
  evidence,
  type IEvidenceGraphConfig,
} from "@samchon/lint-plugin-evidence";
import type { ITtscLintConfig } from "@ttsc/lint";

/**
 * The evidence obligations of the frontend package.
 *
 * A screen answers to the requirement it delivers, and a browser journey
 * answers to the requirement it walks end to end. Each journey is an exported
 * function precisely so it can host this citation.
 *
 * `evidence/singular` is deliberately absent: a domain folder holds a page
 * beside the sub-components only it uses, so one-public-identity-per-file would
 * fight the layout the architecture prescribes.
 */
const graph: IEvidenceGraphConfig = {
  claims: [
    // The screens deliver the requirements a user can reach.
    {
      type: "typescript",
      files: ["src/components/**/*.tsx"],
      symbol: "function",
      reference: {
        type: "markdown",
        root: "../..",
        files: ["docs/analysis/**/*.md"],
        symbol: ["h2", "h3"],
      },
    },
    // The browser journeys walk the requirements end to end.
    {
      type: "typescript",
      files: ["tests/journeys/**/*.ts"],
      symbol: "function",
      reference: {
        type: "markdown",
        root: "../..",
        files: ["docs/analysis/**/*.md"],
        symbol: ["h2", "h3"],
      },
    },
  ],
};

export default {
  extends: "../../config/lint.config.ts",
  plugins: {
    evidence,
  },
  rules: {
    "evidence/graph": ["error", graph],
    // Every component and journey carries the JSDoc block its citation is
    // read from.
    "evidence/documented": "error",
  },
} satisfies ITtscLintConfig;
