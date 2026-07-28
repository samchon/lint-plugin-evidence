# Protocol identity fixtures

These fixtures keep formal review identity separate from the runtime digest of the sealed protocol raw tree. A protocol document cannot contain and validate the digest of the byte tree that contains that digest. The runtime plan records the tree algorithm and digest after sealing; the formal protocol record identifies the reviewed merged commit and review.

The negative cases reject the legacy self-referential field, duplicate formal/runtime digest fields, and raw-tree mutation after sealing.
