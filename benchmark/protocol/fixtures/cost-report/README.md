# Token-safety report fixtures

`schema/cost-report.schema.json` is the immutable per-cell artifact contract; `schema/block-safety-report.schema.json` is the append-only outer-coordinator contract. Neither is a Codex output schema. The production validator first applies the relevant schema and then enforces arithmetic and cross-artifact relations the JSON Schema vocabulary cannot express:

- `thresholdReached` equals `observedTotalTokens >= maximumObservedTotalTokens`;
- `responseObservedOvershootTokens` equals `max(0, observedTotalTokens - maximumObservedTotalTokens)`;
- an observed threshold requires the immediate response-stop trigger;
- deadline-reached and wall-clock-stop flags agree;
- a forced stop with incomplete terminal usage sets `usageAfterStopLowerBound = true`.
- cell and block absolute deadlines equal their write-once start instants plus frozen durations;
- every outer response ID occurs once, every cell report binds the same `blockId`, block plan, and write-once execution-safety artifact, and a block stop has one shared durable event digest referenced by every affected cell cost report and terminal seal.

The launch gate must pass every valid record and materialize each `invalidSemantic` base-plus-patch case, then reject it for the named reason.
