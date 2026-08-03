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
 * answers to the requirements and the one published operation each test proves.
 * DTO claims select the explicitly included sibling API source through a rooted
 * Program population; package references remain the published contract a test
 * actually imports.
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
      // Remove after the complete schema passes build:prisma and schema.
      disabled: true,
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
      // Remove after every DTO and its truthful evidence mapping is complete.
      disabled: true,
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
      // Remove after every DTO and its truthful evidence mapping is complete.
      disabled: true,
    },
    // The operations realize the requirements and expose the schema.
    {
      name: "api-operations",
      type: "typescript",
      // The scaffold health probe is infrastructure, not a product operation.
      files: [
        "src/controllers/**/*.ts",
        "!src/controllers/HealthController.ts",
      ],
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
      // Remove after every controller contract is complete and build:sdk passes.
      disabled: true,
    },
    // The e2e suite verifies the requirements and every published operation.
    // The operation population is the generated SDK accessor surface alone, so
    // no operation may answer "not applicable" and one test proves exactly one
    // of them; DTO shapes answer to the DTO claims instead. TypeScript targets
    // are cited as `{@link ...}` resolved through the test file's own imports.
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
          noExclude: true,
          singleEvidencePerSymbol: true,
        },
      ],
      // Remove after every public-operation test and evidence mapping is complete.
      disabled: true,
    },
    // Providers are deliberately outside the mechanical graph. Both arms
    // review operations, requirements, and schema invariants against provider
    // implementation.
  ],
};

const isNestiaSdkTransform: boolean =
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
    // Carried from the plain backend configuration this file replaces. The
    // treatment variable is the graph and nothing else, so an unrelated rule
    // must not be stricter in one arm than in the other.
    "no-duplicate-imports": ["error", { allowSeparateTypeImports: true }],
    "evidence/graph": isNestiaSdkTransform ? "off" : ["error", graph],
  },
} satisfies ITtscLintConfig;
