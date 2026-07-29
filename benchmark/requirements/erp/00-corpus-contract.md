# ERP Corpus Contract

This directory is one indivisible benchmark input. The materializer copies every file into `docs/analysis` without rewriting content, filenames, line endings, identifiers, metadata, or hashes. A run may start only after `node docs/analysis/validate.mjs` succeeds inside the materialized workspace.

## Requirement and evidence nodes

The five numbered narrative documents define the product. Every `REQ-*` H2 heading is a requirement-group node and every numbered H3 heading is a leaf requirement node. Their identifiers are stable equality tokens for one frozen corpus version.

Evidence-graph coverage, leaf product-quality coverage, and group-context conformance are different measurements. A Markdown file, H1, or H2 citation can acknowledge selected descendant nodes according to the evidence graph, but it cannot merge or satisfy independently scored leaf acceptance rows or group-context rows.

## Atomic acceptance denominator

`acceptance-criteria.jsonl` is the exhaustive leaf product-quality denominator. Every H3 leaf owns one or more criteria, in source order, under identifiers of the form `<requirement>.AC-01`. Each row corresponds to the smallest independently observable prose sentence or bullet retained in that leaf. A sentence that names effects required to commit atomically remains one criterion; separate bullets remain separate criteria.

`context-criteria.jsonl` exhaustively records the introductory prose that each H2 owns before its first child, under identifiers of the form `<requirement>.CTX-01`. These rows measure cross-leaf integration and group-context conformance separately. They are never added to the leaf acceptance denominator because H2 prose intentionally summarizes descendant behavior and combining the two would double-count product quality.

The two inventories include every retained owned statement exactly once in source order. Field inventories and inseparable transactional effects remain one row, while independently refused, concurrent, security, performance, and accessibility outcomes remain separate rows.

`@evidenceExclude` can explain why a graph host has no evidence edge. It never removes a leaf-acceptance or group-context row, lowers either reported category, excuses an implementation or test omission, or converts an unmet criterion into a pass.

## Cross-reference index

`requirement-links.jsonl` is an undirected H2 navigation index. `same-topic` connects actor, domain, operation, rule, and matching non-functional groups that share one unambiguous topic. `cross-cutting` connects a specialized or quality group to the requirement group it qualifies. `journey` connects each end-to-end journey to exactly one principal non-journey source group. Every H2 appears in at least one link, every endpoint must resolve, and a link adds no acceptance points by itself.

Literal `REQ-*` references in narrative text are also validated. An unknown reference, malformed heading, duplicate identifier, non-contiguous child sequence, or source ownership mismatch invalidates the corpus.

## Freeze and change control

`corpus-manifest.json` records the exact H2, H3, leaf-acceptance-row, group-context-row, and link counts plus SHA-256 hashes for every frozen input other than the manifest itself, including the validator. The aggregate digest is computed over sorted UTF-8 filename, NUL, bytes, NUL tuples.

After the launch gate freezes a run, no formatter, generator, repair, or requirement edit may touch this directory. An intentional later correction creates a new frozen corpus version, regenerates the metadata and manifest before launch, and requires new benchmark cells; it never silently changes an in-progress or completed cell.
