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
    // There is deliberately no claim over `src/providers`. A provider
    // implements an operation that already cites the requirement and the
    // model, so a claim here would acknowledge the same targets a second time
    // from a layer no consumer reads. The provider skill owns what that
    // silence costs and where the real check for that layer lives.
  ],
};

export default {
  extends: "../../config/lint.config.ts",
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
    // This package is where stubs live, so every remaining @todo is an
    // unrealized contract: the report is the realize ledger.
    "evidence/todo": "error",
  },
} satisfies ITtscLintConfig;
