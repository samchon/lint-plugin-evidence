# Errors

This document owns the two kinds of failure and the path each one takes to the screen.

## Classify By The Contract

**Expected**: the operation's contract states the rejection, and it arrives as `IDiagnosis[]`. It is product behavior, so it renders where the workflow is: on the field its accessor names, or inline in the flow that attempted it. [forms.md](forms.md) owns that rendering.

**Unexpected**: network loss, a 500, a bug. The contract says nothing about it, so no workflow can render it meaningfully, and it goes to the boundary.

The test is one question: did the contract state it? A refusal treated as a crash teaches users the product is broken; a crash treated as a refusal blames them for it.

## Boundaries Sit At Route Seams

One error boundary per route layout. A render error in the order detail must not blank the catalog, the navigation, or the cart: the shell survives, and the broken route shows a fallback whose retry resets the boundary and invalidates that route's queries.

Per-component boundaries hide defects instead of containing them. A card that quietly swallows its own crash removes the signal that something is wrong.

## Retry Follows Idempotency

Queries may retry automatically, a bounded number of times, because reading twice is reading.

**Mutations never retry automatically.** The failure surfaces, the input survives, and the user decides. An automatic resubmit of a non-idempotent write is how one click becomes two orders on a flaky connection. The one sanctioned automatic recovery is the single refresh-then-retry on an expired session, and [session.md](session.md) owns it.

## One Toast Channel, For The Unexpected Only

Unexpected failures toast once, deduplicated by cause, so five queries dying on the same lost connection produce one message rather than a stack of five.

Expected rejections never arrive as toast-only: a toast vanishes, and a refusal's meaning belongs beside the thing refused. The one toaster lives in the providers file, and no component constructs its own.

## Swallowed Is Worse Than Thrown

Every boundary catch is reported with its route and the action in flight, even when reporting is only a structured console entry in this deployment. A silent catch converts a diagnosable crash into a bug report that says the page sometimes goes blank.
