# Database Check

Read [SKILL.md](SKILL.md) first. This check covers `requirements -> models/columns` and the reverse ownership of every authored Prisma model and column.

## Forward Walk

For each requirement identity, decide which facts persist, which are derived at query time, and which need no storage. Map every persistent fact to the exact `prisma:<model>` or `prisma:<model>.<column>` identity. Record justified non-storage decisions with the observable behavior that still realizes the requirement.

Check lifecycle states, nullability, uniqueness, relation ownership, deletion/retention, ordering, timestamps, and actor boundaries. A model name alone does not cover every field implied by a section.

## Reverse Walk

Enumerate every authored model and column from `packages/backend/prisma/schema/**/*.prisma`. Map each back to one or more H2/H3 identities or to a reasoned infrastructure decision. Generated Prisma client code and `docs/ERD.md` are outputs, not denominator units.

Read schema comments and semantics, not just names. A column can be present and still encode the opposite nullability, state, unit, or ownership.

## Consequences

A schema change invalidates the API and logic mappings that consume it and the tests that prove those consumers. Regenerate the Prisma client and ERD, recheck the affected mappings at the new digest, and never preserve a prior verdict by row identity alone.
