import { evidence } from "@samchon/lint-plugin-evidence";
import type { ITtscLintConfig } from "@ttsc/lint";

/**
 * The backend package rules, with the two file rules the Evidence arm adds.
 *
 * `evidence/singular` keeps one public identity per file, named after the file,
 * and `evidence/todo` fails the build on every remaining JSDoc `@todo` until
 * the declaration it marks is realized. Both are file rules, so they belong to
 * the package Program that selects `src/`; the graph claims stay in
 * `test/lint.config.ts`, which is the Program holding every host they select.
 */
export default {
  extends: "../../config/lint.config.ts",
  // Prisma owns this generated client, and `include` selects it with the rest
  // of `src`.
  ignores: ["src/prisma/**/*.ts"],
  plugins: {
    evidence,
  },
  rules: {
    "no-duplicate-imports": ["error", { allowSeparateTypeImports: true }],
    "evidence/singular": "error",
    "evidence/todo": "error",
  },
} satisfies ITtscLintConfig;
