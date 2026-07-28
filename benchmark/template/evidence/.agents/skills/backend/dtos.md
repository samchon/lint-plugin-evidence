# DTOs

A DTO carries two obligations, and they sit at different granularities.

**The type answers to a requirement and a table.** It exists because the specification named a concept, and it represents a row someone can point at.

**A property answers to the schema alone.** It does not cite a requirement. It cites the column or the relation it carries, because that is the question a property can actually answer: where does this value come from.

```ts
/**
 * Seller sales products.
 *
 * @evidence docs/analysis/domain.md#sales The sale concept this document
 * describes, as a caller receives it.
 * @evidence prisma:shopping_sales Represents one sale identity row.
 */
export interface IShoppingSale {
  /**
   * Primary Key.
   *
   * @evidence prisma:shopping_sales.id
   */
  id: string & tags.Format<"uuid">;

  /**
   * Opening time of sale.
   *
   * If `null`, the sale has not opened yet.
   *
   * @evidence prisma:shopping_sales.opened_at
   */
  openedAt: null | (string & tags.Format<"date-time">);

  /**
   * Registering seller.
   *
   * @evidence prisma:shopping_sales.sellerCustomer
   */
  seller: IShoppingSeller.ISummary;
}
```

The build fails until every selected property carries one. That is the mechanism that removes the phantom: a property with no column and no relation has nothing to cite, and it cannot be argued into existence.

Read [the campaign skill](../campaign/SKILL.md) before starting.

{{base}}

## What Each Granularity Can And Cannot Say

**A type citing only a requirement** leaves the reader unable to find the row it represents. **A type citing only a table** leaves nobody able to say why the type exists. Both are needed and they answer different questions.

**A property citing a requirement instead of a column** is the common mistake here, and it passes nothing: the property obligation is against the schema, so the requirement citation does not discharge it, and the build keeps reporting the property while the tag sits there looking like work.

## A Computed Property Has No Column

A count, a total, or a joined display value has nothing in the schema to point at. That is what `@evidenceExclude` is for, and the reason is the derivation:

```ts
/**
 * Number of active subscribers.
 *
 * @evidenceExclude prisma:shopping_sales Aggregated from the subscription
 * relation at read time; no column stores it.
 */
subscriberCount: number & tags.Type<"uint32">;
```

Write the derivation, not the word computed. A reviewer comparing that reason to the transformer can tell whether the aggregate is real.

**An exclusion is not the escape from a property you have not mapped yet.** If the value should come from a column, add the column and cite it.

## When The Diagnostic Points Here

A property that cannot cite anything usually means the schema is missing a column, not that the property is computed. Check the model before reaching for an exclusion.

A type that cannot cite a requirement usually means the DTO was invented for the implementation's convenience. Find the section that asks for the concept, and if there is none, the type is the defect.
