import type { ITtscLintConfig } from "@ttsc/lint";

/** The contract package runs shared rules and excludes Nestia-owned output. */
export default {
  extends: "../../config/lint.config.ts",
  ignores: ["src/functional/**/*.ts"],
} satisfies ITtscLintConfig;
