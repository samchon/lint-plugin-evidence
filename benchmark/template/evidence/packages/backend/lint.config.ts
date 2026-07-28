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
 * answers to the requirements, the published accessors, and the contract
 * shapes. Cross-package TypeScript populations are read from the installed API
 * package, because that is the artifact a test actually imports.
 */
const graph: IEvidenceGraphConfig = {
  claims: [
    // The schema stores what the requirements say must persist.
    {
      name: "schema-models",
      type: "prisma",
      files: ["prisma/schema/**/*.prisma"],
      symbol: "model",
      reference: {
        type: "markdown",
        root: "../..",
        files: ["docs/analysis/**/*.md"],
        symbol: ["h2", "h3"],
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
          files: ["src/functional/**/*.ts"],
          symbol: ["function"],
        },
        {
          type: "typescript",
          package: "{{apiPackageName}}",
          files: ["src/structures/**/*.ts"],
          symbol: ["type"],
        },
      ],
    },
    // Providers are deliberately outside the mechanical graph. The identical
    // Phase One/Two residual lens in both arms checks operations, requirements,
    // and schema invariants against provider implementation.
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
    // Package-wide: every exported type, function, and property carries the
    // JSDoc block a citation is read from, and one public identity per file
    // keeps citation addresses stable.
    "evidence/documented": "error",
    "evidence/singular": "error",
  },
} satisfies ITtscLintConfig;
