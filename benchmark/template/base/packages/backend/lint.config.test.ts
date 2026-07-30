import type { ITtscLintConfig } from "@ttsc/lint";

/** The backend test program runs the shared workspace rules. */
export default {
  extends: "./lint.config.ts",
} satisfies ITtscLintConfig;
