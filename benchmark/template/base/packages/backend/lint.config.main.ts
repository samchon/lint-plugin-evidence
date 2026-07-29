import type { ITtscLintConfig } from "@ttsc/lint";

/**
 * Uses the backend package policy for the source-only compiler Program.
 */
export default {
  extends: "./lint.config.ts",
} satisfies ITtscLintConfig;
