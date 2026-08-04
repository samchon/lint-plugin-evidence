import { evidence } from "@samchon/lint-plugin-evidence";
import type { ITtscLintConfig } from "@ttsc/lint";

/**
 * The evidence obligations of the backend, declared once in the test Program.
 *
 * All three claims live here because this is the Program that holds every host.
 * `test/tsconfig.json` compiles the backend source together with the tests, so
 * controllers and test functions are both selected from it, while the package
 * Program sees only `src/` and could never reach the tests.
 *
 * The schema answers to the requirements, every requirement and every model
 * answers to some controller operation, and every published operation answers
 * to a test. Each edge is many to many, so an obligation counts the units it
 * must cover rather than citations per host.
 *
 * Roots are relative to the package directory, which is where every backend
 * command runs from: `check:watch`, `build:sdk`, and `test` are declared in
 * `packages/backend/package.json`, so the package manager makes that directory
 * the working directory for each of them.
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
          // The schema stores what the requirements say must persist.
          {
            name: "schema-models",
            type: "prisma",
            root: ".",
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
          // The operations realize the requirements and expose the schema.
          {
            name: "api-operations",
            type: "typescript",
            root: ".",
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
                root: ".",
                files: ["prisma/schema/**/*.prisma"],
                symbol: ["model"],
              },
            ],
            // Remove after every controller contract is complete and build:sdk
            // passes.
            disabled: true,
          },
          // A test answers for the one published operation it proves. Its
          // operation population is the generated SDK accessor surface alone,
          // so no operation may answer "not applicable" and one test proves
          // exactly one of them. TypeScript targets are cited as `{@link ...}`
          // resolved through the test file's own imports.
          {
            name: "backend-tests",
            type: "typescript",
            root: "test",
            files: ["features/**/*.ts"],
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
            // Remove after every public-operation test and evidence mapping is
            // complete.
            disabled: true,
          },
        ],
      },
    ],
  },
} satisfies ITtscLintConfig;
