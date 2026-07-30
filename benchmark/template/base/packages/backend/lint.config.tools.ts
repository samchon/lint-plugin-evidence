import type { ITtscLintConfig } from "@ttsc/lint";

/**
 * Generic lint rules for tool-owned configuration modules.
 *
 * Nestia and Prisma require dotted filenames that cannot take a TypeScript
 * identity name, so their modules stay outside the Evidence singularity rule
 * while retaining the complete shared compile and lint contract.
 */
export default {
  extends: "../../config/lint.config.ts",
} satisfies ITtscLintConfig;
