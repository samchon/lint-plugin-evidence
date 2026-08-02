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
 * Ownership declarations live in `///` documentation comments immediately above
 * their model or field. Both `@evidence <target> <reason>` and
 * `@evidenceExclude <target> <reason>` require a target and a non-empty
 * explanation.
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
 * A matching claim file has one exclusion-only exception: an unattached
 * top-level `/// @evidenceExclude` run is a file-level carrier. This supports a
 * lint-only `.schema` ledger outside Prisma generation. `@evidence` in the same
 * position remains invalid.
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
   * Excludes this claim from graph loading and evaluation.
   *
   * The configuration shape is still validated, but this claim contributes no
   * populations, references, coverage obligations, completion hints, or watched
   * inputs. Omit this property or set it to `false` to enable the claim.
   *
   * @default false
   */
  disabled?: boolean;

  /**
   * Directory this claim's {@link files} patterns resolve against.
   *
   * Omit this property to resolve against the active `ttsc` project root, which
   * is where every population resolved before this property existed.
   *
   * The value names one directory, never a glob. It may sit inside the project
   * (`prisma`), above it (`../../prisma`), or on an absolute path
   * (`/srv/schema`, `C:/schema`). A drive-relative Windows path such as
   * `C:prisma` is refused, because it resolves against whatever directory that
   * drive currently sits on rather than against a stable base.
   *
   * A rooted claim reads its declaration hosts from outside the project, so a
   * schema shared by two services can carry citations both of them owe.
   * Diagnostics name the resolved base, and the resolved patterns are published
   * to the `ttsc` host as watched inputs.
   */
  root?: string;

  /**
   * Glob patterns for the Prisma schema files that must cite the referenced
   * evidence, resolved against {@link root} or against the project root when
   * none is declared. Every matching regular file is parsed as part of one
   * schema regardless of extension.
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
   * Prisma node kind or kinds eligible to host this claim's ownership evidence.
   *
   * Omit this property to select models, columns, and relations. A single value
   * selects one kind; a non-empty array selects the union of its kinds.
   *
   * The default is the widest one, because on the claiming side a selector
   * narrows where ownership evidence may sit rather than what must be covered.
   * Narrow it to `"model"` when only tables owe an answer and a column-level
   * citation should be reported as out of scope. A file-level exclusion carrier
   * is eligible independently of this selector.
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
