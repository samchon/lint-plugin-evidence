import type { ITtscLintConfig } from "@ttsc/lint";

/**
 * Generic lint rules for tool-owned configuration modules.
 *
 * Nestia and Prisma require dotted filenames, so their modules use this
 * separate tool configuration while retaining the shared compile and lint
 * contract.
 */
export default {
  extends: "../../config/lint.config.ts",
} satisfies ITtscLintConfig;
