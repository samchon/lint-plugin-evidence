# Reddit Requirement Corpus Contract

The five numbered Markdown documents define the product requirements. `acceptance-criteria.jsonl` is their normative grading inventory: each nonblank line is one JSON object identifying one independently passable or fail-able acceptance clause.

The frozen corpus contains 48 H2 groups, 176 `### REQ-*` leaves, and 255 acceptance clauses. Every leaf has at least one inventory row. The `requirement` field names that exact heading ID, the `id` field is stable and unique inside this corpus, the `source` field names the owning numbered document, and the `criterion` field states the observable obligation without prescribing a source file, framework, database, transport library, or UI component.

The grading denominator is the number of inventory rows, not the number of Markdown files, H2 groups, H3 leaves, citations, tests, routes, database tables, or generated lines. One artifact or test may prove several rows, but each row receives its own result and evidence. A passing `@evidence` acknowledgement is traceability data and does not by itself prove that a criterion is implemented.

An `@evidenceExclude` decision remains part of graph coverage but does not remove an inventory row from product-quality grading. The grader records excluded, implemented, exercised, and passed states separately.

Any edit that adds, removes, splits, merges, or changes the meaning of a leaf requirement updates the inventory in the same frozen-input revision. Harness validation must reject malformed JSON, duplicate criterion IDs, an unknown requirement ID, a leaf requirement with no row, an inventory requirement absent from the Markdown corpus, a source-document mismatch, or a document, group, leaf, or clause total that differs from this contract.

This file and the inventory are benchmark inputs. Freeze and hash them with the numbered documents before the first run, and never reconstruct their contents from a generated application.
