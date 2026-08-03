import type { ITtscLintConfig } from "@ttsc/lint";

/** The backend package runs the shared workspace rules. */
export default {
  extends: "../../config/lint.config.ts",
  ignores: ["src/prisma/**/*.ts"],
  rules: {
    "no-duplicate-imports": ["error", { allowSeparateTypeImports: true }],
  },
} satisfies ITtscLintConfig;
