# Shopping Requirement Corpus Contract

The numbered Markdown documents in this directory are the complete normative requirement corpus. No sidecar inventory, generated criterion list, manifest, schema, or validator is part of the corpus.

Every `## REQ-*` heading is a requirement group and every `### REQ-*` heading is a leaf requirement. The prose and bullets owned by those headings state the obligations directly. A leaf may contain several independently observable obligations, so an evaluator must audit the actual prose and report its evidence and limitations instead of substituting a file count, heading count, citation count, test count, or generated denominator.

An `@evidence` citation records traceability and does not by itself prove that the cited requirement is implemented or tested. An `@evidenceExclude` decision explains graph coverage and does not excuse an unmet product requirement.

Shopping includes seller-owned and platform-owned coupons with deterministic discount stacking. The corpus fixes ownership authority, code identity, lifecycle, validity, audiences, targets, minimums, quotas, fixed and percentage calculations, seller-before-platform precedence, exclusivity, multi-seller allocation, integer-minor-unit rounding, checkout reservations, payment idempotency, order evidence, cancellation, refund, deletion, privacy, abuse, and boundary tests. Tax, shipping fee, service fee, credit, gift card, split tender, and partial-quantity or partial-amount line reversal remain unsupported; an order item is the indivisible cancellation and refund unit.

The materializer freezes and hashes the exact Markdown bytes before a run. Any later requirement edit creates a new frozen corpus revision and never changes an in-progress or completed cell.
