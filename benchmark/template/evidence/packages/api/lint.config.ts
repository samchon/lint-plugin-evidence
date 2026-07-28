import {
  evidence,
  type IEvidenceGraphConfig,
} from "@samchon/lint-plugin-evidence";
import type { ITtscLintConfig } from "@ttsc/lint";

/**
 * The evidence obligations of the contract package.
 *
 * This package declares every DTO, so this graph binds the contract to what
 * justifies it: a type answers to the requirement that asked for it and the
 * table it represents, and a property answers to the column it carries.
 * Markdown targets are addressed from the workspace root, so a citation reads
 * `docs/analysis/...` here exactly as it does in every other package.
 */
const graph: IEvidenceGraphConfig = {
  claims: [
    // A DTO type answers to the requirement it serves and the table it
    // represents. Its properties are a separate claim below, because the two
    // granularities tally independently and never collide.
    {
      type: "typescript",
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
          root: "../backend",
          files: ["prisma/schema/**/*.prisma"],
          symbol: ["model"],
        },
      ],
    },
    // A DTO property answers to the schema alone: the column it carries.
    {
      type: "typescript",
      files: ["src/structures/**/*.ts"],
      symbol: "property",
      reference: {
        type: "prisma",
        root: "../backend",
        files: ["prisma/schema/**/*.prisma"],
        symbol: ["column"],
      },
    },
  ],
};

export default {
  extends: "../../config/lint.config.ts",
  plugins: {
    evidence,
  },
  rules: {
    "evidence/graph": ["error", graph],
    // Every DTO and property carries the JSDoc block its citation is read
    // from, and one public identity per file keeps citation addresses stable.
    "evidence/documented": "error",
    "evidence/singular": "error",
    // DTOs are declared during the interface phase, so every remaining @todo
    // is an unrealized contract: the realize ledger.
    "evidence/todo": "error",
  },
} satisfies ITtscLintConfig;
