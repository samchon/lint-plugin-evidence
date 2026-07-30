# Screens

A screen is where a requirement stops being a capability and becomes something a person can do.

Every user-facing requirement needs a screen that delivers it, and every screen needs a requirement that asked for it. An operation nobody can reach from the interface is a requirement that was built into the backend and never delivered, and it passes every backend check there is.

**Nothing checks that for you.** A frontend that type-checks and builds is a frontend whose types agree, not one that realizes the specification.

Read [the campaign skill](../campaign/SKILL.md) and [its frontend edge](../campaign/frontend.md) before starting. Note that the frontend is not one node in that graph: once its folders take shape it grows its own internal obligations, and those need campaigning like the outer ones.

<!-- benchmark-template-splice: base-body -->
{{base}}

## Write The Screen Plan Before The Screen

For each screen, the requirement it serves and the operations it consumes. In the ledger, before you build.

That plan is what makes a missing screen visible while there is still time to build it, rather than at the end when everything else is done and the gap looks like a scoping decision.

## The Internal Graph Needs Campaigning Too

As soon as the structure exists, the frontend's own obligations exist with it, and [the frontend edge](../campaign/frontend.md) defines the minimum set. Record any newly discovered relationship in the campaign ledger when the structure grows, so one place answers what the current subgraph is. Do not edit the frozen skill documents.

Two of those edges are worth naming here because they fail quietly. **A component nothing renders is dead code** that still costs review attention. **A field rendered from a property the contract does not carry** should fail strict compilation; a cast, `any`, or local redeclaration that hides that failure is itself the defect.

Walk both directions on each edge. Forward finds the screen nobody built; backward finds the component nobody uses.

## After Any Contract Change

The frontend dimension of the current campaign round re-opens in full. A changed response can leave a screen reading a field that no longer exists, and a changed rejection can leave an error state saying the wrong thing.

If a screen needs something the SDK does not expose, that finding belongs to the campaign's API dimension. Send it up rather than improvising a path around it.
