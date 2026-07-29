import type { ITtscLintConfig } from "@ttsc/lint";

/** The backend source Program uses the canonical Plain package policy. */
export default {
  extends: "./lint.config.ts",
} satisfies ITtscLintConfig;
