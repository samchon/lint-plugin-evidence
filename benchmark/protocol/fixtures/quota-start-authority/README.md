# Start quota authority fixtures

The CLI validates this artifact immediately before execution through `quota-start-authority.schema.json` and `validateStartQuotaAuthorityAdmissionValue`. Start authority is a new live controller request, not a replay of prepare: it uses `phase: start`, a fresh 256-bit request nonce distinct from the closed plan's retained prepare nonce, the exact closed block-plan SHA-256, the same block ID and ordered subject wave, and a newly captured bounded quota interval.

Both the controller-request digest and sanitized attestation use the protocol's closed printable-ASCII projection. Within that deliberately restricted domain, the local key-sorted canonical encoder is asserted equivalent to the required RFC 8785 encoding; it is not advertised as a general-purpose JCS implementation.

Negative cases reject the prepare nonce or phase at start, another plan, block, or wave, stale or timed-out start capture, a substituted request digest, and a missing boundary.
