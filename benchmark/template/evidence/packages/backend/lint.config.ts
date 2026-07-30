import {
  evidence,
  type IEvidenceGraphConfig,
} from "@samchon/lint-plugin-evidence";
import type { ITtscLintConfig } from "@ttsc/lint";

/**
 * The evidence obligations of the backend package.
 *
 * The schema answers to the requirements, every controller operation answers to
 * the requirement it realizes and the model it exposes, and the e2e suite
 * answers to the requirements, the published operations, and the contract
 * shapes. DTO claims select the explicitly included sibling API source through
 * a rooted Program population; package references remain the published
 * contract a test actually imports.
 */
const graph: IEvidenceGraphConfig = {
  claims: [
    // The schema stores what the requirements say must persist.
    {
      name: "schema-models",
      type: "prisma",
      files: [
        "prisma/schema/**/*.prisma",
        "prisma/schema/exclude.schema",
      ],
      symbol: "model",
      reference: {
        type: "markdown",
        root: "../..",
        files: ["docs/analysis/**/*.md"],
        symbol: ["h2", "h3"],
      },
    },
    // A DTO type answers to the requirement it serves and the table it
    // represents. The rooted claim changes only the population base; the
    // backend lint tsconfig explicitly supplies the API source files.
    {
      name: "dto-types",
      type: "typescript",
      root: "../api",
      files: ["src/structures/**/*.ts"],
      symbol: "type",
      reference: [
        {
          type: "markdown",
          root: "../..",
          files: ["docs/analysis/**/*.md"],
          symbol: ["h2", "h3"],
        },
        {
          type: "prisma",
          files: ["prisma/schema/**/*.prisma"],
          symbol: ["model"],
        },
      ],
    },
    // A DTO property answers to the schema column it carries.
    {
      name: "dto-properties",
      type: "typescript",
      root: "../api",
      files: ["src/structures/**/*.ts"],
      symbol: "property",
      reference: {
        type: "prisma",
        files: ["prisma/schema/**/*.prisma"],
        symbol: ["column"],
      },
    },
    // The operations realize the requirements and expose the schema.
    {
      name: "api-operations",
      type: "typescript",
      files: ["src/controllers/**/*.ts"],
      symbol: "function",
      reference: [
        {
          type: "markdown",
          root: "../..",
          files: ["docs/analysis/**/*.md"],
          symbol: ["h2", "h3"],
        },
        {
          type: "prisma",
          files: ["prisma/schema/**/*.prisma"],
          symbol: ["model"],
        },
      ],
    },
    // The e2e suite verifies the requirements, every published operation, and
    // every shape the contract exchanges. TypeScript targets are cited as
    // `{@link ...}` resolved through the test file's own imports.
    {
      name: "backend-tests",
      type: "typescript",
      files: ["test/features/**/*.ts"],
      symbol: "function",
      reference: [
        {
          type: "markdown",
          root: "../..",
          files: ["docs/analysis/**/*.md"],
          symbol: ["h2", "h3"],
        },
        {
          type: "typescript",
          package: "{{apiPackageName}}",
          symbol: ["function"],
        },
        {
          type: "typescript",
          package: "{{apiPackageName}}",
          file: "src/structures/index.ts",
          symbol: ["type"],
        },
      ],
    },
    // Providers are deliberately outside the mechanical graph. Both arms
    // review operations, requirements, and schema invariants against provider
    // implementation.
  ],
};

export default {
  extends: "../../config/lint.config.ts",
  // Prisma owns this generated client. The authored schema remains selected by
  // the graph through its explicit external population.
  ignores: ["src/prisma/**/*.ts"],
  plugins: {
    evidence,
  },
  rules: {
    "evidence/graph": ["error", graph],
  },
} satisfies ITtscLintConfig;
