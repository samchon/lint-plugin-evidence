# ERP Corpus Contract

The numbered Markdown documents in this directory are one indivisible normative requirement corpus. No sidecar inventory, generated criterion list, link index, manifest, schema, or executable validator is part of the corpus.

## Requirement and evidence nodes

Every `## REQ-*` heading is a requirement-group node and every `### REQ-*` heading is a leaf requirement node. Their identifiers are stable equality tokens for one frozen corpus version.

The prose and bullets owned by each heading state its obligations directly. A leaf may contain several independently observable obligations, and H2 prose may define integration constraints spanning its descendants. An evaluator must audit that prose and report its evidence and limitations instead of reconstructing an artificial fixed denominator from files, headings, citations, tests, routes, or generated output.

Evidence-graph coverage, leaf product quality, and group-context conformance are different observations. A Markdown file, H1, or H2 citation can acknowledge selected descendant nodes according to the evidence graph, but it cannot prove that the owned product behavior is implemented or exercised.

`@evidenceExclude` can explain why a graph host has no evidence edge. It never excuses an implementation or test omission or converts an unmet requirement into a pass.

## Freeze and change control

The materializer copies the exact Markdown files into `docs/analysis`, retains an immutable input copy, and records their byte identity before a run. It does not rewrite content, filenames, line endings, or identifiers.

After the launch gate freezes a run, no formatter, generator, repair, or requirement edit may touch that retained input. An intentional later correction creates a new frozen corpus revision and new benchmark cells; it never silently changes an in-progress or completed cell.
