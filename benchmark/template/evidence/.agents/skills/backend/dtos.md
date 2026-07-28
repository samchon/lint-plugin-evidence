# DTOs

A DTO carries two obligations, and they sit at different granularities.

**The type answers to a requirement and a table.** It exists because the specification named a concept, and it represents a row someone can point at.

**A property answers to the schema alone.** It does not cite a requirement. It cites the column it carries, because that is the question a property can actually answer: where does this value come from.

```ts
/**
 * Seller sales products.
 *
 * @evidence docs/analysis/02-domain-model.md#sales The sale concept this document
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
   * @evidence prisma:shopping_sales.shopping_seller_customer_id The seller this
   * sale belongs to, loaded through the foreign key.
   */
  seller: IShoppingSeller.ISummary;
}
```

The build fails until every selected property carries one. That is the mechanism that removes the phantom: a property with no column has nothing to cite, and it cannot be argued into existence.

Read [the campaign skill](../campaign/SKILL.md) before starting.

{{base}}

## What Each Granularity Can And Cannot Say

**A type citing only a requirement** leaves the reader unable to find the row it represents. **A type citing only a table** leaves nobody able to say why the type exists. Both are needed and they answer different questions.

**A property citing a requirement instead of a column** is the common mistake here, and it passes nothing: the property obligation is against the schema, so the requirement citation does not discharge it, and the build keeps reporting the property while the tag sits there looking like work.

**A property that carries a nested object cites the foreign key column that reaches it**, as `seller` does above. The join is how the value is loaded; the column is where the value comes from, and it is the column that has to exist for the property to be fillable at all.

## A Computed Property Cites Everything It Is Computed From

**A declaration may carry as many `@evidence` tags as it needs.** This is the difference that makes a computed value expressible: an aggregate does not correspond to one column, so it cites every column the computation draws on.

```ts
/**
 * Number of customers who have favorited this sale.
 *
 * @evidence prisma:shopping_sale_favorites.shopping_sale_id Counted over the
 * favorite rows pointing at this sale.
 * @evidence prisma:shopping_sale_favorites.deleted_at Rows a customer has
 * un-favorited are excluded from the count.
 */
favoriteCount: number & tags.Type<"uint32">;
```

Read what that does. A reviewer can now check the transformer against two named columns and see whether the aggregate is the one the property claims. A single exclusion saying "computed" would have told them nothing.

A statistics or dashboard type does the same at the type level: it cites every requirement it serves and every model it draws on, rather than declining to cite because it maps to no single table.

**Do not reach for an exclusion because a value has no single owner.** Having several owners is a reason to name all of them.

## The Two Granularities Are Two Claims

The type obligation and the property obligation are configured as **separate claims**: one selecting types and referencing requirements and models, one selecting properties and referencing columns.

That is what makes the design work rather than collapse. Each claim counts its acknowledgements in its own tally, so a type citing a model and a property citing one of that model's columns never collide. They are answering different questions in different obligations.

Within one claim the disjointness rule below applies in full. Across the two, it does not apply at all.

## One Target, One Citation, Across The Whole Claim

The constraint on multiple tags is disjointness, and its scope is wider than one declaration. Two citations of the same target inside one obligation are a duplicate **even when they sit on different properties**, because the obligation is counted across every host the claim selects.

Three shapes report a duplicate:

- the same target cited twice from one property;
- a model and one of that model's columns cited from one property, since a citation covers its target and every selected descendant;
- the same column cited by two different properties.

The third is the one that surprises. If two aggregates both derive from a `deleted_at` column, only one of them may name it. Give the column to the property whose meaning depends on it most directly, and let the other cite the sources that are its own.

So the rule is not "name everything the computation touches" without qualification. It is: **name every source that is yours to name.** Within one property, cite the full set it draws on. Across properties, a source belongs to one of them.

When two properties genuinely cannot be separated that way, they are usually one property, or one of them belongs to a different DTO.

## When Nothing Can Be Cited

That is genuinely rare once multiple tags are available, and it usually means something upstream is missing rather than something here being computed.

A property that can cite nothing at all usually means the schema lacks a column it should have. Check the model first. A type that cannot cite a requirement usually means the DTO was invented for the implementation's convenience; find the section that asks for the concept, and if there is none, the type is the defect.
