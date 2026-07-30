import {
  evidence,
  type IEvidenceGraphConfig,
} from "@samchon/lint-plugin-evidence";
import type { ITtscLintConfig } from "@ttsc/lint";

declare const process: {
  env: Record<string, string | undefined>;
};

/**
 * Immutable Evidence Graph projection for the backend test Program.
 *
 * The test Program emits backend source and tests only. DTO claims belong to
 * the canonical no-emit lint Program, which explicitly includes API source;
 * adding that sibling source here would duplicate emitted API output.
 */
const graph: IEvidenceGraphConfig = {
  claims: [
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
  ],
};

const isNestiaConfigLoader: boolean =
  process.env.NESTIA_SDK_TRANSFORM === "1";

export default {
  extends: "../../config/lint.config.ts",
  ignores: ["src/prisma/**/*.ts"],
  plugins: {
    evidence,
  },
  rules: {
    "evidence/graph": isNestiaConfigLoader ? "off" : ["error", graph],
  },
} satisfies ITtscLintConfig;
