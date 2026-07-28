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

## A Computed Property Cites Everything It Is Computed From

**A declaration may carry as many `@evidence` tags as it needs.** This is the difference that makes a computed value expressible: an aggregate does not correspond to one column, so it cites every column and relation the computation draws on.

```ts
/**
 * Number of currently active subscribers.
 *
 * @evidence prisma:shopping_sale_subscriptions Counted from this relation.
 * @evidence prisma:shopping_sale_subscriptions.state Only rows in the active
 * state are counted.
 * @evidence prisma:shopping_sale_subscriptions.shopping_sale_id Scoped to this
 * sale.
 */
subscriberCount: number & tags.Type<"uint32">;
```

Read what that does. A reviewer can now check the transformer against three named sources and see whether the aggregate is the one the property claims. A single exclusion saying "computed" would have told them nothing.

A statistics or dashboard type does the same at the type level: it cites every requirement it serves and every model it draws on, rather than declining to cite because it maps to no single table.

**Do not reach for an exclusion because a value has no single owner.** Having several owners is a reason to name all of them.

## Keep Citations Disjoint

The one constraint on multiple tags is that two scopes within the same obligation must not overlap. A citation acknowledges its target and every selected descendant, so citing a model **and** one of that model's columns from the same host reports a duplicate.

Cite siblings, not a parent and its child. Either name the model, or name the specific columns, whichever matches what the property actually draws on.

## When Nothing Can Be Cited

That is genuinely rare once multiple tags are available, and it usually means something upstream is missing rather than something here being computed.

A property that can cite nothing at all usually means the schema lacks a column it should have. Check the model first. A type that cannot cite a requirement usually means the DTO was invented for the implementation's convenience; find the section that asks for the concept, and if there is none, the type is the defect.
