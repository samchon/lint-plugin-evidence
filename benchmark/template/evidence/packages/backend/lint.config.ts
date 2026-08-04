/// <reference types="node" />
import {
  evidence,
  type IEvidenceGraphConfig,
} from "@samchon/lint-plugin-evidence";
import type { ITtscLintConfig } from "@ttsc/lint";

/** The directory of this configuration, so a nested Program reuses the graph. */
const here: string = __dirname;

/**
 * The evidence obligations of the backend package.
 *
 * The schema answers to the requirements, and every requirement and every model
 * answers to some controller operation. Both edges are many to many, so each
 * obligation counts the units it must cover rather than citations per host.
 *
 * Every root is absolute, so the test Program inherits these claims unchanged
 * and adds its own.
 */
export const graph: IEvidenceGraphConfig = {
  claims: [
    // The schema stores what the requirements say must persist.
    {
      name: "schema-models",
      type: "prisma",
      root: here,
      files: ["prisma/schema/**/*.prisma", "prisma/schema/exclude.schema"],
      symbol: "model",
      reference: {
        type: "markdown",
        root: `${here}/../..`,
        files: ["docs/analysis/**/*.md"],
        symbol: ["h2", "h3"],
      },
      // Remove after the complete schema passes build:prisma and schema.
      disabled: true,
    },
    // The operations realize the requirements and expose the schema.
    {
      name: "api-operations",
      type: "typescript",
      root: here,
      files: ["src/controllers/**/*.ts"],
      symbol: "function",
      reference: [
        {
          type: "markdown",
          root: `${here}/../..`,
          files: ["docs/analysis/**/*.md"],
          symbol: ["h2", "h3"],
        },
        {
          type: "prisma",
          root: here,
          files: ["prisma/schema/**/*.prisma"],
          symbol: ["model"],
        },
      ],
      // Remove after every controller contract is complete and build:sdk passes.
      disabled: true,
    },
  ],
};

export default {
  extends: "../../config/lint.config.ts",
  // Prisma owns this generated client, and `include` selects it with the rest
  // of `src`. The authored schema stays selected through the graph's own
  // external population.
  ignores: ["src/prisma/**/*.ts"],
  plugins: {
    evidence,
  },
  rules: {
    // Carried from the plain configuration this file replaces. The treatment
    // variable is the graph alone, so no unrelated rule may be stricter in one
    // arm than in the other.
    "no-duplicate-imports": ["error", { allowSeparateTypeImports: true }],
    "evidence/graph": ["error", graph],
  },
} satisfies ITtscLintConfig;
