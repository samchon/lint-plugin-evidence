import type { ITtscLintConfig } from "@ttsc/lint";

/** The backend package runs the shared workspace rules. */
export default {
  extends: "../../config/lint.config.ts",
  // The backend Program includes the SDK sources so it can typecheck against
  // the contract it publishes, which drags the generated accessors into this
  // package's linting. The API package already excludes exactly these files
  // from its own, and generated output answers to its generator: Nestia types
  // a route with no response body as `Resolved<void>`, which the shared
  // `no-invalid-void-type` rule rejects, so every such route would be an error
  // no author can fix without changing the published contract.
  ignores: ["src/prisma/**/*.ts", "**/api/src/functional/**/*.ts"],
  rules: {
    "no-duplicate-imports": ["error", { allowSeparateTypeImports: true }],
  },
} satisfies ITtscLintConfig;
