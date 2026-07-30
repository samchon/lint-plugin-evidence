import {
  evidence,
  type IEvidenceGraphConfig,
} from "@samchon/lint-plugin-evidence";
import type { ITtscLintConfig } from "@ttsc/lint";

declare const process: {
  env: Record<string, string | undefined>;
};

/**
 * The evidence obligations of the backend package.
 *
 * The schema answers to the requirements, every controller operation answers to
 * the requirement it realizes and the model it exposes, and the e2e suite
 * answers to the requirements, the published operations, and the contract
 * shapes. Cross-package TypeScript populations are read from the installed API
 * package, because that is the artifact a test actually imports.
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

const isNestiaConfigLoader: boolean =
  process.env.NESTIA_SDK_TRANSFORM === "1";

export default {
  extends: "../../config/lint.config.ts",
  // Prisma owns this generated client. The authored schema remains selected by
  // the graph through its explicit external population.
  ignores: ["src/prisma/**/*.ts"],
  plugins: {
    evidence,
  },
  rules: {
    // Nestia compiles only nestia.config.ts in a temporary one-file Program
    // before it loads the real controller project. Evidence populations do not
    // exist in that private loader pass; the normal build and lint Programs
    // retain every rule at error severity.
    "evidence/graph": isNestiaConfigLoader ? "off" : ["error", graph],
    // Package-wide: every exported type, function, and property carries the
    // JSDoc block a citation is read from, and one public identity per file
    // keeps citation addresses stable.
    "evidence/documented": isNestiaConfigLoader ? "off" : "error",
    "evidence/singular": isNestiaConfigLoader ? "off" : "error",
    "evidence/todo": isNestiaConfigLoader ? "off" : "error",
  },
} satisfies ITtscLintConfig;
