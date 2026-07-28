import {
  evidence,
  type IEvidenceGraphConfig,
} from "@samchon/lint-plugin-evidence";
import type { ITtscLintConfig } from "@ttsc/lint";

/**
 * The obligation graph this workspace is checked against.
 *
 * Every claim-reference pair is one independent obligation: each selected unit
 * on the reference side must be acknowledged by an `@evidence` tag from a
 * selected host on the claim side, or the build fails naming the exact target.
 *
 * Keep this current. An edge that is not declared here is not checked, and its
 * silence is indistinguishable from full coverage. When a new artifact kind
 * appears, add its claim here in the same change, shaped like the ones below.
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
    // represents. Its properties are a separate claim below, because the two
    // granularities tally independently and never collide.
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
    // A DTO property answers to the schema alone: the column it carries.
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
    // The e2e suite verifies the requirements, every published operation, and
    // every shape the contract exchanges. TypeScript targets are cited as
    // `{@link ...}` resolved through the test file's own imports.
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
          type: "typescript",
          files: ["packages/api/src/functional/**/*.ts"],
          symbol: ["function"],
        },
        {
          type: "typescript",
          files: ["packages/api/src/structures/**/*.ts"],
          symbol: ["type"],
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
    // The browser journeys walk the requirements end to end. Each journey is
    // an exported function precisely so it can host this citation.
    {
      type: "typescript",
      files: ["packages/frontend/tests/journeys/**/*.ts"],
      symbol: "function",
      reference: {
        type: "markdown",
        files: ["docs/analysis/**/*.md"],
        symbol: ["h2", "h3"],
      },
    },
    // There is deliberately no claim over `packages/backend/src/providers`.
    // A provider implements an operation that already cites the requirement
    // and the model, so a claim here would acknowledge the same targets a
    // second time from a layer no consumer reads. The provider skill owns
    // what that silence costs and where the real check for that layer lives.
  ],
};

/**
 * The workspace lint configuration for the evidence arm.
 *
 * The ordinary rules prove the code is well formed. The evidence rules are
 * the mechanism this arm exists for: the graph reports every unmet
 * obligation, `documented` requires the JSDoc block a citation is read from,
 * and `singular` keeps one public identity per file so citation addresses
 * stay stable.
 */
export default {
  format: {
    // Formatting is applied by `ttsc format`, not reported as a lint failure,
    // so a formatting difference never competes with a real diagnostic.
    severity: "off",
    semi: true,
    singleQuote: false,
    arrowParens: "always",
    bracketSpacing: true,
    quoteProps: "as-needed",
    trailingComma: "all",
    printWidth: 80,
    tabWidth: 2,
    useTabs: false,
    endOfLine: "lf",
    sortImports: {
      order: ["^@/(.*)$", "<THIRD_PARTY_MODULES>", "^[./]"],
    },
    jsDoc: true,
  },
  plugins: {
    evidence,
  },
  rules: {
    "evidence/graph": ["error", graph],
    "evidence/documented": "error",
    "evidence/singular": "error",
  },
} satisfies ITtscLintConfig;
