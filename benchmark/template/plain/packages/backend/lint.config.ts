import type { ITtscLintConfig } from "@ttsc/lint";

/** The backend runs shared rules and excludes the Prisma-generated client. */
export default {
  extends: "../../config/lint.config.ts",
  ignores: ["src/prisma/**/*.ts"],
} satisfies ITtscLintConfig;
