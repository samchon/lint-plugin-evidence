import {
  evidence,
  type IEvidenceGraphConfig,
} from "@samchon/lint-plugin-evidence";
import type { ITtscLintConfig } from "@ttsc/lint";

/**
 * The evidence obligations of the frontend package.
 *
 * Two populations carry citations here, and both are deliberately narrow. The
 * screens are the page components in their domain folders: a primitive, the
 * layout chrome, and a composed provider serve every requirement at once and
 * therefore none in particular, so selecting them would breed citations that
 * state nothing. The journeys are the exported functions under
 * `tests/journeys/`; the ui-review and readme specs verify presentation and
 * stay outside the graph.
 *
 * The journey claim references the screens as well as the requirements: a spec
 * cites each page it traverses as `{@link ThatPage}` resolved through its own
 * type-only import, so a screen no journey walks is a build failure rather than
 * a discovery made in review.
 *
 * There is deliberately no claim binding the SDK's accessors to screens. The
 * frontend builds a coherent product rather than an endpoint list, and the
 * deliberate omissions live in `packages/frontend/wiki/omissions.md` as
 * recorded decisions; an obligation here would turn every recorded omission
 * into a diagnostic to silence.
 *
 * `evidence/singular` is deliberately absent: a domain folder holds a page
 * beside the sub-components only it uses, so one-public-identity-per-file would
 * fight the layout the architecture prescribes.
 */
const graph: IEvidenceGraphConfig = {
  claims: [
    // The screens deliver the requirements a user can reach. The dev gallery
    // is tooling, not delivery.
    {
      type: "typescript",
      files: ["src/components/*/*-page.tsx", "!src/components/dev/**"],
      symbol: "function",
      reference: {
        type: "markdown",
        root: "../..",
        files: ["docs/analysis/**/*.md"],
        symbol: ["h2", "h3"],
      },
    },
    // The browser journeys walk the requirements end to end, through the
    // screens they cite.
    {
      type: "typescript",
      files: ["tests/journeys/**/*.ts"],
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
          files: ["src/components/*/*-page.tsx", "!src/components/dev/**"],
          symbol: ["function"],
        },
      ],
    },
  ],
};

export default {
  extends: "../../config/lint.config.frontend.ts",
  plugins: {
    evidence,
  },
  rules: {
    "evidence/graph": ["error", graph],
    // Every page and journey carries the JSDoc block its citation is read
    // from.
    "evidence/documented": "error",
    // Screens are born as prop-enumerated stubs and cracked one by one, so
    // every remaining @todo is an unrealized contract: the realize ledger.
    "evidence/todo": "error",
  },
} satisfies ITtscLintConfig;
