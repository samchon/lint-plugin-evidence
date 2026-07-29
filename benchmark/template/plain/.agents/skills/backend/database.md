# Database

Every persistent requirement fact needs an exact model/column mapping, and every authored model and column needs a requirement or reasoned infrastructure owner. The compiler proves schema form, not this semantic relationship.

For each requirement fact, decide whether it is stored, derived, or deliberately absent, then identify the exact model and column or the falsifiable reason for non-storage. Reverse-walk every authored model and column to a requirement or necessary infrastructure owner.

Check lifecycle states, nullability, uniqueness, relations, deletion and retention, ordering, units, actor ownership, and derived-versus-stored meaning in both directions. Names are not proof: read the schema semantics and the requirement together.

<!-- benchmark-template-splice: base-body -->
{{base}}

## After A Schema Change

Regenerate the Prisma client and ERD. Invalidate API, provider, and test reviews that used the previous schema meaning. Semantic changes can preserve compilation while making every old mapping false.
