import type { ITtscLintConfig } from "@ttsc/lint";

import base from "./lint.config.base";

/**
 * Lint configuration for this workspace.
 *
 * The shared rule set lives in `lint.config.base.ts` and is not repeated here,
 * so a rule change is one edit rather than one per package.
 *
 * Nothing in this configuration checks whether the specification is realized.
 * The rules below prove that the code is well formed; establishing that every
 * requirement has an artifact is the campaign skill's job, and it is performed
 * by reading rather than by the build.
 */
export default {
  ...base,
} satisfies ITtscLintConfig;
