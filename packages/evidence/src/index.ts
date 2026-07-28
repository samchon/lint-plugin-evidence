/// <reference types="node" />

import type { ITtscLintPlugin } from "@ttsc/lint";
import path from "node:path";
import type { IEvidenceGraphConfig } from "./structures/index";
import { version } from "../package.json";

export * from "./structures/index";
export * from "./typings/index";

/**
 * The `@ttsc/lint` contributor that checks a project's evidence graph.
 *
 * Import this value into `lint.config.ts` and register it under the
 * `"evidence"` plugin name. You can then enable `"evidence/graph"` and pass an
 * {@link IEvidenceGraphConfig} that describes which documents and TypeScript
 * symbols must remain connected.
 *
 * The plugin contributes four rules, enabled independently.
 *
 * - `"evidence/graph"` — the configured evidence graph. Every declaration target
 *   must resolve, and every selected evidence unit must be acknowledged. Takes
 *   an {@link IEvidenceGraphConfig}. It also offers the configured targets as
 *   editor completions, on the cycles where it passes: the host publishes a
 *   rule's completions only while that rule reports nothing.
 * - `"evidence/singular"` — one public identity per TypeScript file, named after
 *   the file. Takes no options, so it carries a bare severity.
 * - `"evidence/documented"` — a JSDoc block on every selected export, which is
 *   the only place an `@evidence` tag is ever read from. Takes an
 *   {@link IEvidenceDocumentedConfig}.
 * - `"evidence/todo"` — no remaining JSDoc `@todo` tag anywhere in a checked
 *   file, exported or not. Each tag is an unrealized contract reported with its
 *   own text, so the diagnostics read as the ledger of what remains to realize.
 *   Takes no options, so it carries a bare severity.
 *
 * @example <caption>Configure the plugin in `lint.config.ts`</caption>
 *   import type { ITtscLintConfig } from "@ttsc/lint";
 *   import {
 *     evidence,
 *     type IEvidenceGraphConfig,
 *   } from "@samchon/lint-plugin-evidence";
 *
 *   const graph: IEvidenceGraphConfig = {
 *     claims: [
 *       {
 *         type: "typescript",
 *         files: ["src/**"],
 *         reference: {
 *           type: "markdown",
 *           files: ["docs/*.md"],
 *         },
 *       },
 *     ],
 *   };
 *
 *   export default {
 *     plugins: {
 *       evidence: evidence,
 *     },
 *     files: ["src/**"],
 *     rules: {
 *       "evidence/graph": ["error", graph],
 *       "evidence/singular": "error",
 *     },
 *   } satisfies ITtscLintConfig;
 */
export const evidence = {
  meta: {
    name: "@samchon/lint-plugin-evidence",
    namespace: "evidence",
    version,
  } as const,
  rules: ["graph", "singular", "documented", "todo"] as const,
  source: path.resolve(__dirname, "..", "native"),
} satisfies ITtscLintPlugin;
export default evidence;
