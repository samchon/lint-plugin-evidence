# Frontend Campaign

Read [SKILL.md](SKILL.md) first. This campaign discharges `docs/analysis/ -> frontend` and `API -> frontend`, plus the frontend's own internal graph.

## Requirements To Screens

For every requirement that describes something a user does or sees, name the screen that lets them do or see it.

A requirement is not realized because an endpoint exists. It is realized when a user can reach the behavior the document describes. An operation nothing calls is a requirement that was built and never delivered.

Walk each journey the documents describe end to end, as the actor performing it: what they see before acting, while it is in flight, when it succeeds, and when it is refused. A screen that renders the data but offers no path to the action the requirement names does not satisfy it.

Then walk backward. Every screen names the requirement it serves. A screen with no requirement is either a requirement you have not read or a feature you invented.

## Contract To Screens

For every operation the SDK exposes, either name the screen that consumes it or record why none does.

Not every operation becomes a feature, and forcing one produces a worse product than leaving it out. But the decision must be recorded. An unrecorded absence is indistinguishable from an oversight, so you will re-derive it every round.

Then walk backward from every data call to the operation it uses. A call assembled by hand rather than through the generated accessor is a finding: it will survive a contract change that should have broken it.

## The Frontend's Own Graph

Once the folders take shape the frontend grows internal obligations, and they need the same treatment as the outer edges.

```
requirement   ->  screen
screen        ->  component
screen        ->  SDK operation
adapter       ->  SDK contract
```

- **Every component traces to a screen that uses it.** A component nothing renders is dead code that still costs review attention.
- **Every screen traces to the operations it consumes**, and every field it renders traces to a property those responses actually carry. A field rendered from a property the contract does not have will compile and fail at runtime.
- **Every place the contract is wrapped traces to the contract.** Whatever layer holds the SDK types, it owes an account of the operations it covers, and a wrapper that exposes a shape the contract cannot produce is a finding.

This subgraph does not exist until the frontend has a structure, which is why it is easy to skip. Add its edges to the graph in `SKILL.md` as soon as the structure appears, and campaign over them like the rest.

## Every State Is A Requirement

A screen is not the success case with the rest deferred.

For each screen, walk loading, empty, error, retry, and post-mutation invalidation. Then walk the refusals: every rejection the contract states has a visible outcome in words a user can act on. The business rules say what the refusal means; the screen says it.

A screen that renders a spinner forever when a request fails is a defect the requirements never had to state.

## Verify By Running It

The compiler cannot tell you a control does nothing.

Each round, run the flows: click through them at mobile, tablet, and desktop widths, confirm every control causes an observable change, and confirm search, sort, pagination, page size, toggles, dialogs, and forms actually work wherever they appear.

Development happens against the SDK's simulation mode, which answers from the real contract without a running server. That proves shape and flow. It does not prove the server behaves, so integration against the live backend is a separate, later pass that closes the work rather than a formality.

## Rounds

A round is a complete pass over every requirement, every operation, every screen, and every edge of the internal subgraph.

Any finding resets the count. The campaign stops only when a complete review establishes that not a single omission remains, confirmed by **two consecutive complete rounds** producing nothing new.

Vary the traversal. Walk by requirement in one round; by route in the next; by actor in a third, performing every journey that actor has as one continuous session. The actor traversal finds the flow whose every step works and whose sequence does not.

## The Cascade

**Into here:** requirements findings and contract changes both re-open this campaign in full. A logic change re-opens it when it alters what a response carries or when a refusal changes meaning.

**Out of here:** a finding here often belongs upstream. A screen that cannot be built because no operation exposes what it needs is a finding against the API campaign, not a reason to invent a frontend-only call. Send it up and accept that everything below that layer re-opens.

## Exit

Dry when two consecutive complete rounds find nothing new, every user-facing requirement has a screen or a recorded omission, every operation has a consumer or a recorded reason, every internal edge is accounted for, every screen handles every state, and the flows have been run rather than only compiled.
