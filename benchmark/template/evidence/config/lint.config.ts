import { evidence, type IEvidenceGraphConfig } from "@samchon/lint-plugin-evidence";
import type { ITtscLintConfig } from "@ttsc/lint";

import base from "./lint.config.base";

/**
 * The obligation graph this workspace is checked against.
 *
 * Every claim-reference pair is one independent obligation: each selected unit
 * on the reference side must be acknowledged by an `@evidence` tag from the
 * claim side, or the build fails naming the exact target.
 *
 * Keep this current. An edge that is not declared here is not checked, and its
 * silence is indistinguishable from full coverage.
 */
const graph: IEvidenceGraphConfig = {
  claims: [
    // The schema stores what the requirements say must persist.
    {
      type: "prisma",
      files: ["packages/backend/prisma/schema/**/*.prisma"],
      symbol: "model",
      reference: {
        type: "markdown",
        files: ["docs/analysis/**/*.md"],
        symbol: ["h2", "h3"],
      },
    },
    // A DTO type answers to the requirement it serves and the table it
    // represents. Its properties answer to the schema alone.
    {
      type: "typescript",
      files: ["packages/api/src/structures/**/*.ts"],
      symbol: "type",
      reference: [
        {
          type: "markdown",
          files: ["docs/analysis/**/*.md"],
          symbol: ["h2", "h3"],
        },
        {
          type: "prisma",
          files: ["packages/backend/prisma/schema/**/*.prisma"],
          symbol: ["model"],
        },
      ],
    },
    {
      type: "typescript",
      files: ["packages/api/src/structures/**/*.ts"],
      symbol: "property",
      reference: {
        type: "prisma",
        files: ["packages/backend/prisma/schema/**/*.prisma"],
        symbol: ["column"],
      },
    },
    // The operations realize the requirements and expose the schema.
    {
      type: "typescript",
      files: ["packages/backend/src/controllers/**/*.ts"],
      symbol: "function",
      reference: [
        {
          type: "markdown",
          files: ["docs/analysis/**/*.md"],
          symbol: ["h2", "h3"],
        },
        {
          type: "prisma",
          files: ["packages/backend/prisma/schema/**/*.prisma"],
          symbol: ["model"],
        },
      ],
    },
    // The providers implement the requirements against the schema.
    {
      type: "typescript",
      files: ["packages/backend/src/providers/**/*.ts"],
      symbol: "function",
      reference: [
        {
          type: "markdown",
          files: ["docs/analysis/**/*.md"],
          symbol: ["h2", "h3"],
        },
        {
          type: "prisma",
          files: ["packages/backend/prisma/schema/**/*.prisma"],
          symbol: ["model"],
        },
      ],
    },
    // The tests verify the requirements and every published operation.
    {
      type: "typescript",
      files: ["packages/backend/test/features/**/*.ts"],
      symbol: "function",
      reference: [
        {
          type: "markdown",
          files: ["docs/analysis/**/*.md"],
          symbol: ["h2", "h3"],
        },
        {
          type: "swagger",
          file: "packages/api/swagger.json",
        },
      ],
    },
    // The screens deliver the requirements a user can reach.
    {
      type: "typescript",
      files: ["packages/frontend/src/components/**/*.tsx"],
      symbol: "function",
      reference: {
        type: "markdown",
        files: ["docs/analysis/**/*.md"],
        symbol: ["h2", "h3"],
      },
    },
  ],
};

export default {
  ...base,
  plugins: {
    evidence,
  },
  rules: {
    ...base.rules,
    "evidence/graph": ["error", graph],
    "evidence/documented": "error",
    "evidence/singular": "error",
  },
} satisfies ITtscLintConfig;
