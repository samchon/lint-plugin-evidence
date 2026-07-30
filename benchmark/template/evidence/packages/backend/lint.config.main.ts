import {
  evidence,
  type IEvidenceGraphConfig,
} from "@samchon/lint-plugin-evidence";
import type { ITtscLintConfig } from "@ttsc/lint";

declare const process: {
  env: Record<string, string | undefined>;
};

/**
 * Immutable Evidence Graph projection for the source-only backend program.
 *
 * `tsconfig.json` contains `src` but not `test`, so only claims whose authored
 * hosts can exist in that Program belong here. The canonical backend lint
 * configuration retains all five backend-phase claims and owns manual
 * whole-claim deferral during development. Only this immutable projection
 * disables the graph for Nestia's private config-loader Program.
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
