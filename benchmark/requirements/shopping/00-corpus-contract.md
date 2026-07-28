# Shopping Requirement Corpus Contract

The five product Markdown documents numbered `01` through `05` define the product requirements; this `00` contract makes six corpus Markdown files in total. `acceptance-criteria.jsonl` is their normative grading inventory: each nonblank line is one JSON object identifying one independently passable or fail-able acceptance clause.

The frozen corpus contains 93 H2 groups, 471 `### REQ-*` leaves, and 2,083 acceptance clauses. Every leaf has at least one inventory row. The `requirement` field names that exact heading ID, the `id` field is stable and unique inside this corpus, the `source` field names the owning numbered document, and the `criterion` field states the observable obligation without prescribing a source file, framework, database transport, UI component, or test name.

The grading denominator is the number of inventory rows, not the number of Markdown files, H2 groups, H3 leaves, citations, tests, routes, database tables, or generated lines. One artifact or test may prove several rows, but each row receives its own result and evidence. A passing `@evidence` acknowledgement is traceability data and does not by itself prove that a criterion is implemented.

An `@evidenceExclude` decision remains part of graph coverage but does not remove an inventory row from product-quality grading. The grader records excluded, implemented, exercised, and passed states separately.

Shopping includes seller-owned and platform-owned coupons with deterministic discount stacking. The corpus fixes ownership authority, code identity, lifecycle, validity, audiences, targets, minimums, quotas, fixed and percentage calculations, seller-before-platform precedence, exclusivity, multi-seller allocation, integer-minor-unit rounding, checkout reservations, payment idempotency, order evidence, cancellation, refund, deletion, privacy, abuse, and boundary tests. Tax, shipping fee, service fee, credit, gift card, split tender, and partial-quantity or partial-amount line reversal remain unsupported; an order item is the indivisible cancellation and refund unit.

Any edit that adds, removes, splits, merges, or changes the meaning of a leaf requirement updates the inventory in the same frozen-input revision. Harness validation must reject malformed JSON, duplicate criterion IDs, an unknown requirement ID, a leaf requirement with no row, an inventory requirement absent from the Markdown corpus, a source-document mismatch, or a document, group, leaf, or clause total that differs from this contract.

This file and the inventory are benchmark inputs. Freeze and hash them with the numbered documents before the first run, and never reconstruct their contents from a generated application.
