import type { EvidenceGraphPrismaSymbol } from "../typings/EvidenceGraphPrismaSymbol";
import type { IEvidenceGraphReference } from "./IEvidenceGraphReference";

/**
 * A Prisma schema claiming its referenced evidence.
 *
 * A schema is authored, not generated, so it can carry its own citations. This
 * is what turns "this table exists" into "this table exists because of that
 * requirement", and it is the direction a data model most needs: a column
 * nobody asked for is invisible until someone reads the whole schema against
 * the whole specification.
 *
 * Declarations live in `///` documentation comments. Both `@evidence <target>
 * <reason>` and `@evidenceExclude <target> <reason>` require a target and a
 * non-empty explanation.
 *
 * A triple-slash comment and a block comment both host a citation, because
 * Prisma documents a declaration with either and both reach the generated
 * client types. A double-slash line comment is discarded by Prisma itself and
 * hosts nothing — a citation written in one is reported rather than ignored,
 * because a tag that silently does nothing is the exact failure this rule
 * exists to remove.
 *
 * A comment documents the declaration that immediately follows it, which is
 * Prisma's own rule. A blank line before a top-level block detaches the comment
 * entirely, and a comment above a block attribute or a closing brace documents
 * nothing; a citation in any of those positions is reported.
 *
 * ```prisma
 * /// @evidence docs/requirements.md#pricing Sale price derives from this section.
 * model Sale {
 *   /// @evidence docs/requirements.md#coupons The stacking limit is stored here.
 *   coupon_limit Int
 * }
 * ```
 */
export interface IEvidenceGraphPrismaClaim {
  /** Identifies the claiming artifacts as a Prisma schema. */
  type: "prisma";

  /**
   * Optional human-readable label shown with diagnostics for this claim. It
   * does not identify evidence nodes or establish relationships between
   * configuration entries.
   */
  name?: string;

  /**
   * Project-relative glob patterns for the Prisma schema files that must cite
   * the referenced evidence. Every matching regular file is parsed as part of
   * one schema regardless of extension.
   *
   * These are globs, not regular expressions. `*` matches within one path
   * segment, `**` crosses any number of path segments, and `?` matches one
   * character. Both `/` and `\` are accepted as separators, while path identity
   * remains case-sensitive on every operating system.
   *
   * Patterns are evaluated from left to right. A pattern prefixed with `!`
   * removes its matches; a later positive pattern can include them again. The
   * array must contain at least one positive pattern.
   *
   * A bare directory such as `prisma` or `prisma/` does not include its
   * children; write `prisma/schema/**` when the whole folder belongs to this
   * claim.
   */
  files: string[];

  /**
   * Prisma node kind or kinds eligible to host this claim's declarations.
   *
   * Omit this property to select models, columns, and relations. A single value
   * selects one kind; a non-empty array selects the union of its kinds.
   *
   * The default is the widest one, because on the claiming side a selector
   * narrows where a citation may sit rather than what must be covered. Narrow
   * it to `"model"` when only tables owe an answer and a column-level citation
   * should be reported as out of scope.
   *
   * @default ["model", "column", "relation"]
   */
  symbol?: EvidenceGraphPrismaSymbol | EvidenceGraphPrismaSymbol[];

  /**
   * One evidence population or independently complete evidence populations that
   * this claim must cite.
   *
   * A single reference requires this claim's schema to acknowledge every
   * evidence unit it materializes. An array creates a separate 100% obligation
   * for every element: acknowledgements toward one reference never count toward
   * another, and partially covered references cannot be pooled. The array must
   * not be empty.
   */
  reference: IEvidenceGraphReference | IEvidenceGraphReference[];
}
