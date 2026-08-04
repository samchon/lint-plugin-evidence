import {
  evidence,
  type IEvidenceGraphConfig,
} from "@samchon/lint-plugin-evidence";
import type { ITtscLintConfig } from "@ttsc/lint";

/** The directory of this configuration, so a nested Program reuses the graph. */
const here: string = import.meta.dirname;

/**
 * The evidence obligations of the backend package.
 *
 * The schema answers to the requirements, every requirement and every model
 * answers to some controller operation, and the e2e suite answers to the
 * requirements and the one published operation each test proves. One
 * requirement may be realized by several operations and one model may be
 * exposed by several, so those obligations count units rather than hosts; only
 * a test has a single subject, which is why only its operation reference does.
 * DTO claims select the explicitly included sibling API source through a rooted
 * Program population; package references remain the published contract a test
 * actually imports. Every root is absolute, so the test Program inherits these
 * claims unchanged and adds its own.
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
    // A DTO type answers to the requirement it serves and the table it
    // represents. The rooted claim changes only the population base; the
    // backend lint tsconfig explicitly supplies the API source files.
    {
      name: "dto-types",
      type: "typescript",
      root: `${here}/../api`,
      files: ["src/structures/**/*.ts"],
      symbol: "type",
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
      // Remove after every DTO and its truthful evidence mapping is complete.
      disabled: true,
    },
    // A DTO property answers to the schema column it carries.
    {
      name: "dto-properties",
      type: "typescript",
      root: `${here}/../api`,
      files: ["src/structures/**/*.ts"],
      symbol: "property",
      reference: {
        type: "prisma",
        root: here,
        files: ["prisma/schema/**/*.prisma"],
        symbol: ["column"],
      },
      // Remove after every DTO and its truthful evidence mapping is complete.
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
  plugins: {
    evidence,
  },
  rules: {
    // Carried from the plain backend configuration this file replaces. The
    // treatment variable is the graph and nothing else, so an unrelated rule
    // must not be stricter in one arm than in the other.
    "no-duplicate-imports": ["error", { allowSeparateTypeImports: true }],
    "evidence/graph": ["error", graph],
  },
} satisfies ITtscLintConfig;
