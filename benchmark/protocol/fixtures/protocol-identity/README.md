# Protocol identity fixtures

These fixtures keep tracked protocol policy separate from runtime source and review identity. A tracked protocol document cannot contain its final merged commit, a review created after that commit, or the digest of the byte tree containing that digest. Those tracked fields remain null templates. After merge, the runtime plan records the reviewed PR head, final COMMENT review, merge commit, exact matching Git tree identities, and the independently sealed protocol raw-tree digest.

The negative cases reject legacy self-referential fields, population of tracked final-source or final-review templates, mismatched runtime merge identities, a reviewed/merged tree mismatch, a non-COMMENTED final review, and raw-tree mutation after sealing.
