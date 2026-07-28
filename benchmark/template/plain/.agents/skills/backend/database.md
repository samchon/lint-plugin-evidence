# Database

Every persistent requirement fact needs an exact model/column mapping, and every authored model and column needs a requirement or reasoned infrastructure owner. The compiler proves schema form, not this semantic relationship.

Read [the database completeness check](../completeness/database.md) before modeling and keep the current mappings in the ledger. Check lifecycle, nullability, uniqueness, relations, deletion/retention, ordering, units, and derived-versus-stored meaning in both directions.

<!-- benchmark-template-splice: base-body -->
{{base}}

## After A Schema Change

Regenerate the Prisma client and ERD. Invalidate API, provider, and test reviews that used the previous schema meaning. Semantic changes can preserve compilation while making every old mapping false.
