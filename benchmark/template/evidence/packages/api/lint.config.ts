import {
  evidence,
  type IEvidenceGraphConfig,
} from "@samchon/lint-plugin-evidence";
import type { ITtscLintConfig } from "@ttsc/lint";

/**
 * The evidence obligations of the API package.
 *
 * The DTO claims are declared here because a TypeScript claim selects only
 * files the owning `tsconfig` already includes, and this package's `tsconfig`
 * is the one that includes `src/structures/`. The schema they cite belongs to
 * the backend package, which is why the Prisma references root there.
 *
 * Both edges are many to many — one requirement may be represented by several
 * DTOs, and one model exposed by several — so each obligation counts the units
 * it must cover rather than citations per host.
 */
export const graph: IEvidenceGraphConfig = {
  claims: [
    // A DTO type answers to the requirement it serves and the table it
    // represents.
    {
      name: "dto-types",
      type: "typescript",
      root: ".",
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
      // Remove after every DTO and its truthful evidence mapping is complete.
      disabled: true,
    },
    // A DTO property answers to the schema column it carries.
    {
      name: "dto-properties",
      type: "typescript",
      root: ".",
      files: ["src/structures/**/*.ts"],
      symbol: "property",
      reference: {
        type: "prisma",
        root: "../backend",
        files: ["prisma/schema/**/*.prisma"],
        symbol: ["column"],
      },
      // Remove after every DTO and its truthful evidence mapping is complete.
      disabled: true,
    },
  ],
};

export default {
  extends: "../../config/lint.config.ts",
  ignores: ["src/functional/**/*.ts"],
  plugins: {
    evidence,
  },
  rules: {
    "evidence/graph": ["error", graph],
  },
} satisfies ITtscLintConfig;
