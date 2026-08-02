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
 * There is deliberately no mechanical claim binding SDK accessors to screens.
 * Both benchmark arms instead run the same residual review: every
 * product-facing operation maps to a screen/journey or to a requirement-backed
 * decision in `packages/frontend/wiki/omissions.md`.
 */
const graph: IEvidenceGraphConfig = {
  claims: [
    // The screens deliver the requirements a user can reach. The dev gallery
    // is tooling, not delivery.
    {
      name: "frontend-screens",
      type: "typescript",
      files: [
        "src/components/*/*-page.tsx",
        "src/components/SCREEN_EVIDENCE_EXCLUDE.ts",
        "!src/components/dev/**",
      ],
      symbol: "function",
      reference: {
        type: "markdown",
        root: "../..",
        files: ["docs/analysis/**/*.md"],
        symbol: ["h2", "h3"],
      },
      // Remove after every required screen and evidence mapping is complete.
      disabled: true,
    },
    // The browser journeys walk the requirements end to end, through the
    // screens they cite.
    {
      name: "frontend-journeys",
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
      // Remove after every requirement-backed journey and mapping is complete.
      disabled: true,
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
  },
} satisfies ITtscLintConfig;
