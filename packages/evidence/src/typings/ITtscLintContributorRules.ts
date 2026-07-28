import type { TtscLintRuleSetting } from "@ttsc/lint";

declare module "@ttsc/lint" {
  interface ITtscLintContributorRules {
    /**
     * Requires one public identity per TypeScript file, named after the file.
     *
     * The counted unit is an identity rather than an export, so declaration
     * merging of a single name stays legal: `export interface ISomething`
     * beside `export namespace ISomething`, `export class Something` beside
     * `export namespace Something`, and `export const something` beside `export
     * default something` are each one identity.
     *
     * A file that only re-exports owns no identity and is never reported, and
     * an `index` file is exempt from the name match while still limited to one
     * identity.
     *
     * The rule takes no options; per-directory scoping belongs in the outer
     * `files` setting of `lint.config.ts`.
     */
    "evidence/singular"?: TtscLintRuleSetting;

    /**
     * Reports every JSDoc `@todo` tag in a checked file.
     *
     * A remaining `@todo` is a contract the declaration has not realized yet,
     * so each tag fails the build with its own text until the declaration is
     * realized and the tag removed. Every declaration's block is read, exported
     * or not, on any symbol kind.
     *
     * The rule takes no options; per-directory scoping belongs in the outer
     * `files` setting of `lint.config.ts`.
     */
    "evidence/todo"?: TtscLintRuleSetting;
  }
}
