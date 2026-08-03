import {
  evidence,
  type IEvidenceGraphConfig,
} from "@samchon/lint-plugin-evidence";
import type { ITtscLintConfig } from "@ttsc/lint";

/**
 * The evidence obligations of the frontend package.
 *
 * Three populations carry citations here, and the first two are deliberately
 * narrow. The screens are the page components in their domain folders: a
 * primitive, the layout chrome, and a composed provider serve every requirement
 * at once and therefore none in particular, so selecting them would breed
 * citations that state nothing. The journeys are the exported functions under
 * `tests/journeys/`; the ui-review and readme specs verify presentation and
 * stay outside the graph.
 *
 * The journey claim references the screens as well as the requirements: a spec
 * cites each page it traverses as `{@link ThatPage}` resolved through its own
 * type-only import, so a screen no journey walks is a build failure rather than
 * a discovery made in review.
 *
 * The hooks are the third population. `lib/<domain>/hooks.ts` is the only place
 * a generated accessor is called, so a hook is the one artifact that can
 * truthfully own an operation; a page fetches through hooks and would be naming
 * a call it does not make.
 *
 * Owning an operation is not delivering it, so the three claims form one chain:
 * a hook answers for the operations it calls, a screen answers for the hooks it
 * uses, and a journey answers for the screens it walks. A hook wrapping an
 * accessor that no screen ever renders fails at the screen claim, which is the
 * hole that hook coverage alone would leave open. Only the requirement
 * obligations accept an exclusion; an unconsumed operation, an unused hook, and
 * an unwalked screen are all build failures.
 *
 * The operation obligation does not constrain how many operations one hook may
 * cite. What matters is that nothing goes unconsumed, and a hook composing two
 * calls for one screen is ordinary; demanding one call per hook would dictate
 * layout instead.
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
      reference: [
        {
          type: "markdown",
          root: "../..",
          files: ["docs/analysis/**/*.md"],
          symbol: ["h2", "h3"],
        },
        {
          type: "typescript",
          files: ["src/lib/*/hooks.ts"],
          symbol: ["function"],
          noExclude: true,
        },
      ],
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
    // The hooks deliver the published API to the product. One hook owns one
    // generated call, so an operation no hook reaches is a missing feature
    // rather than a note in `wiki/omissions.md`.
    {
      name: "frontend-hooks",
      type: "typescript",
      files: ["src/lib/*/hooks.ts"],
      symbol: "function",
      reference: {
        type: "typescript",
        package: "{{apiPackageName}}",
        files: ["src/functional/**/*.ts"],
        symbol: ["function"],
        noExclude: true,
      },
      // Remove after every published operation reaches a hook.
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
