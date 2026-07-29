# Product-visible quality and continuity requirements

This document states the reliability, integrity, continuity, and privacy outcomes that customers, sellers, and administrators can rely on. It does not redefine the operations and business rules that produce those outcomes.

## REQ-NFR-AUDIT-INTEGRITY Commercial change evidence integrity

Commercial evidence remains understandable and trustworthy across edits, disputes, and live-record retirement. Owners see evidence for subjects they own, and administrators use platform-wide oversight; unrelated actors do not gain history access.

Snapshots preserve immutable before-and-after states. Product evidence represents the complete merchandise aggregate at one time, while stock and purchase evidence use their own durable movement and order forms.

### REQ-NFR-AUDIT-INTEGRITY-1 Keep commercial change evidence immutable

Every snapshot created for a product, variant, seller profile, order item, review, cancellation request, or refund request remains immutable after creation and stays available to its authorized relevant parties after later edits or live deletion. The evidence has no edit or delete capability.

An owner with a usable identity may inspect evidence for their own retained subject. Regular and super administrators retain dispute-oversight access. An unrelated customer or seller, unauthorized actor, or attempt to alter or delete evidence is refused.

### REQ-NFR-AUDIT-INTEGRITY-2 Reconstruct each recorded modification

Each editable-data snapshot identifies when the modification occurred, what fields or collection members changed, and their complete before-and-after values. Unchanged aggregate context needed to understand the time point remains present.

Decision snapshots show prior and resulting request status. Review evidence shows prior and resulting rating and text. Seller-profile evidence shows prior and resulting shop name, description, and logo.

### REQ-NFR-AUDIT-INTEGRITY-3 Preserve a complete product time point

Every product or variant edit captures product name, description, category, base price, ordered images, and every contemporaneous variant's SKU code, option values, and optional price override. Image order identifies the thumbnail, and variants untouched by that particular edit remain represented.

Later product or variant deletion does not remove the snapshot. Inventory quantity remains traceable through movement history rather than being mistaken for a variant snapshot field.

### REQ-NFR-AUDIT-INTEGRITY-4 Trace stock and purchase evidence end to end

Each retained inventory movement exposes signed quantity, reason, and time. Current live stock reconciles to the sum of the variant's complete working history, and automatic purchase, cancellation, refund, and force-action movements identify their order item or resolution cause.

Every purchased line retains product, variant, seller, unit price, quantity, shipping address, payment, and later resolution evidence. When live SKU retirement removes working inventory, order and snapshot evidence still explains purchased and later restored quantities under the retired SKU identity. Account or catalog deletion does not erase purchase-time evidence.

Only the relevant customer, item seller, or administrator may inspect the corresponding commercial history.

## REQ-NFR-PURCHASE-CONSISTENCY Purchase and resolution consistency

Customers can rely on money, merchandise, stock, carts, and order evidence agreeing at every terminal purchase or resolution outcome. A successful payment appears once as a complete purchase; a confirmed failure leaves a clean retry state.

Later cancellation and refund outcomes keep money, status, evidence, and stock synchronized without disturbing unrelated lines in a mixed-seller order.

### REQ-NFR-PURCHASE-CONSISTENCY-1 Expose one complete successful purchase outcome

For each confirmed payment attempt, the customer sees exactly one corresponding order whose `paid` items, purchase evidence, exact stock decreases, and purchased-cart removal become visible together. A successful charge is never left without its order outcome.

The order gross total equals captured gross item prices, discount total equals coupon allocations, and net charge equals the confirmed gateway charge. Each purchased quantity agrees across its item, negative inventory movement, and removed cart line. Repeated gateway notification duplicates neither the order, coupon use, nor any other effect; a mismatch remains in payment reconciliation until a consistent outcome is available.

### REQ-NFR-PURCHASE-CONSISTENCY-2 Preserve a clean state after payment failure

After a confirmed payment failure, the customer sees no order, item, purchase snapshot, inventory movement, or cart removal from that attempt. Every selected line remains in the cart at its saved quantity, and released stock holds no longer reduce available-to-purchase stock.

A fresh attempt begins from current revalidated facts. An unknown result remains visibly unresolved through reconciliation and is not presented as a confirmed failure.

### REQ-NFR-PURCHASE-CONSISTENCY-3 Keep each commercial reversal synchronized

An approved cancellation, approved refund, or administrator force resolution changes the target terminal status, customer funds, exact stock-restoration evidence, request or forced-action evidence, and derived order status as one visible outcome and at most once.

Cancellation produces `cancelled`; refund produces `refunded` according to the owning action. The returned money is the preserved item net after coupon allocations and the restored quantity is the purchased quantity. Consumed coupon uses are not restored. A replay cannot pay or restore the line again. If a required effect fails, the prior commercial state remains visible until resolution succeeds.

### REQ-NFR-PURCHASE-CONSISTENCY-4 Preserve independent item progress

When one item or shipment changes, every unrelated order item retains its own status, seller, shipment, request, snapshot, unit price, quantity, and inventory evidence. One cancellation or refund does not stop another seller's fulfillment, and one shipment or delivery changes no item outside that shipment.

Overall order status changes only through its documented derivation from all resulting item states. A whole-order force action changes only its complete eligible set and reports every other line unchanged.

### REQ-NFR-PURCHASE-CONSISTENCY-5 Reconcile uncertain money returns exactly once

Every approved cancellation, approved refund, or administrator force resolution that returns money owns a durable refund-attempt identifier bound to the order item, terminal cause, and exact preserved net line amount. The gateway receives that identifier as its idempotency key, so one commercial reversal can produce at most one money return.

An explicit gateway failure leaves request, item, money, inventory, snapshot, and derived order state unchanged and permits a new attempt only after the failure is recorded. An unknown result blocks a competing resolution or new refund attempt and is reconciled under the same identifier.

Confirmed gateway success finalizes the matching request or force action, item terminal state, stock restoration, decision or force evidence, and derived order state exactly once. If that local commit fails, startup and periodic reconciliation preserve the successful refund outcome and retry only the missing local finalization; repeated commands and callbacks return the one recorded result rather than returning money or stock again.

## REQ-NFR-HISTORY-CONTINUITY Commercial history and privacy continuity

Commercial history stays intelligible when accounts, catalog records, addresses, profiles, and reviews change or retire. Past orders present what was purchased and confirmed at that time, while fulfillment facts continue to reflect current progress.

Retention does not make history public. Customers, item sellers, review authors, and administrators receive only the history their ownership or platform authority makes relevant, and customer closure removes live personal identity from future presentation.

### REQ-NFR-HISTORY-CONTINUITY-1 Keep commercial history through retirement

Retained orders and immutable snapshots remain usable after related customer or seller closure and after product, variant, seller-profile source, or review retirement.

Customer closure does not remove seller or administrator access to order evidence. Seller closure does not remove customer or administrator access to purchase evidence. Product or variant deletion does not remove order-item or product snapshots. Review deletion removes public feedback but not its immutable edit evidence.

### REQ-NFR-HISTORY-CONTINUITY-2 Keep past-order presentation stable

Past orders continue to show purchase-time product name and description, variant options and gross unit price, seller shop name and logo, quantity, coupon codes and allocations, gross total, discount total, net charge, and the complete confirmed shipping address. Later live edits, coupon changes, or deletion do not rewrite those values.

The address retains recipient name, phone number, street address, city, state or province, postal code, and country. Current item status, shipment membership, carrier, tracking number, and shipping or delivery time remain live fulfillment facts. Deleted live subjects are represented by retained identifiers or purchase snapshots.

### REQ-NFR-HISTORY-CONTINUITY-3 Remove former-customer identity from live presentation

After customer account deletion, the former display name, phone number, credentials, saved addresses, and profile link are no longer available. Retained public reviews keep their rating and optional text but identify the author only as `deleted user`.

Orders retain their immutable destination as purchase evidence without restoring a customer profile. A new registration using the former email receives no attribution to retained orders or reviews, and the deleted customer has no authenticated history access.

### REQ-NFR-HISTORY-CONTINUITY-4 Limit retained history to relevant parties

The purchasing customer may inspect their retained orders. Each seller may inspect only their attributed items and owned evidence, including fulfillment and request records needed for existing-order duties. A review author with a usable identity may inspect their own review evidence.

Current regular and super administrators may inspect platform records under oversight authority; super-only governance data keeps its separate higher-grade rule. An unauthenticated, deleted, banned, unrelated, or insufficiently graded actor is refused, and no account-state change broadens access for anyone else.

## REQ-NFR-CONCURRENCY-TIME Concurrent commerce and authoritative time

Commands that compete for stock, state transitions, or one-time effects resolve against committed state rather than stale application reads. Time-dependent eligibility uses one authoritative UTC instant captured for the committing operation, so retries, scheduler work, and boundary tests agree.

### REQ-NFR-CONCURRENCY-TIME-1 Serialize stock holds and inventory movements

Concurrent checkout confirmations and seller inventory deductions for one variant serialize their available-stock check with the hold or movement they commit. The total of active holds and committed deductions never consumes more than the committed stock available to them, and each losing command is refused without a hold, charge, order, movement, or cart effect.

Releasing, consuming, or reconciling one hold changes that hold exactly once. A stale read cannot overwrite a later movement, resurrect a released hold, or make the live inventory sum negative.

### REQ-NFR-CONCURRENCY-TIME-2 Select one winner for competing item transitions

Shipment creation, cancellation decision, refund decision, administrator force action, delivery confirmation, and automatic delivery each recheck the target request, item, and shipment states in the same transaction as their effects. If two commands race for an incompatible transition, at most one commits and every loser reports the resulting conflict without money, stock, request, snapshot, shipment, or status side effects.

Replaying the winning command or callback returns its already-recorded terminal outcome when it has an idempotency identity. It never repeats a refund, stock restoration, shipment, decision, or delivery transition.

### REQ-NFR-CONCURRENCY-TIME-3 Use one UTC instant at every time boundary

Persisted business times are UTC instants. One command captures one authoritative instant and uses it for eligibility, state, snapshots, movements, and response data; client clocks and display time zones do not decide business rules.

A refund request committing exactly at `delivery time + 7 days` is timely and one committing later is refused. Automatic delivery becomes due exactly at `shipping time + 14 days`, records that deadline as delivery time, and does not shift because a scheduler observes it later.

### REQ-NFR-CONCURRENCY-TIME-4 Recover due work after interruption

Startup and periodic scheduler passes find every shipment whose fourteen-day deadline is due and whose items remain shipped. Each pass applies the same idempotent package-wide transition, so downtime delays observation but neither changes the recorded deadline nor strands an eligible shipment.

An unresolved payment attempt is reconciled with the gateway before its hold can be released or a replacement attempt can start. Process restart does not turn an unknown result into failure, lose a confirmed success, or create a second charge.

## REQ-NFR-PAGINATION-ERRORS Stable traversal and refusal semantics

Collection traversal remains complete under equal timestamps and concurrent writes. Refusals use a stable machine-readable contract and reveal no cross-owner resource existence; every rejected command has the no-partial-effect behavior stated by its requirement.

### REQ-NFR-PAGINATION-ERRORS-1 Bind a cursor to a stable result snapshot

Every paginated response orders by its documented business key followed by a stable unique identifier and returns an opaque continuation cursor. The cursor is bound to the acting authorization scope, filter, sort, page size, and an upper result watermark captured for the first page.

Following that cursor reaches every row in the first-page result snapshot exactly once even when later inserts occur. A cursor reused with another actor, query, sort, or page size, or a malformed or expired cursor, is refused rather than interpreted in a broader context.

### REQ-NFR-PAGINATION-ERRORS-2 Bound every collection response

A paginated query defaults to `20` rows and accepts an integer page size from `1` through `100`. A zero, negative, fractional, nonnumeric, or larger value is refused, and no collection endpoint silently returns an unbounded retained history.

Aggregate values such as current stock, dashboard counts, rating average, cart total, and order total use the complete authorized dataset rather than only the current page.

### REQ-NFR-PAGINATION-ERRORS-3 Return stable errors without partial effects

Every refusal returns a nonblank stable error `code`, a human-readable `message`, and the request correlation identifier. Authentication failure, authorization or ownership failure, invalid input, missing resource, stale state, conflicting transition, payment reconciliation, and unsupported capability have distinct codes.

No refusal returns credentials, recovery values, session values, another actor's private fields, gateway secrets, or stack traces. Unless a requirement explicitly defines an idempotent already-completed outcome, a refused command commits no domain record, snapshot, movement, hold, payment initiation, cart change, session change, or scheduler effect.

## REQ-NFR-SECURITY-PRIVACY Credential, boundary, and input protection

Credentials and bearer capabilities receive stronger protection than ordinary profile data. Authorization is enforced at the persisted ownership query or committing transition, and untrusted text, identifiers, images, and gateway callbacks cannot escape their intended data boundary.

### REQ-NFR-SECURITY-PRIVACY-1 Protect stored credentials and bearer values

Passwords are stored only through a salted, deliberately slow password hash accepted for password storage; plaintext or reversibly encrypted passwords are never persisted or logged. Session, recovery, and payment-callback secrets are generated from cryptographically secure randomness, stored as nonreversible digests where later plaintext recovery is unnecessary, and compared without timing-dependent early disclosure.

Application logs, errors, snapshots, analytics, and administrator views redact passwords, session tokens, recovery challenges, gateway signatures, and full payment credentials.

### REQ-NFR-SECURITY-PRIVACY-2 Make recovery challenges short-lived and single-use

A customer or seller recovery challenge expires fifteen minutes after issuance, is scoped to one account type and identity, and succeeds at most once. Issuing a newer challenge invalidates every older outstanding challenge for that identity.

Successful recovery atomically consumes the challenge, changes the password, and revokes earlier sessions. An expired, replayed, mismatched, or already consumed challenge has the same externally safe refusal shape and changes no password or session.

### REQ-NFR-SECURITY-PRIVACY-3 Limit credential guessing and account enumeration

Registration, login, and recovery initiation use canonical identity comparison but do not reveal through their public message whether an email exists, which credential failed, or whether another account type uses the same email. In a rolling fifteen-minute window, the sixth failed credential or recovery proof for one normalized account identity is refused without evaluating another proof, and the fifty-first failure from one request source is refused across identities.

A successful credential proof clears that identity's failure count but not the source-wide count; expiry of each recorded failure removes only that failure from its window. A deterministic test clock can advance and clear the limiter. Rate limiting creates no authenticated session and never changes the account's ban, approval, profile, order, or administrator state.

### REQ-NFR-SECURITY-PRIVACY-4 Enforce ownership in the data operation

Reads and writes that target customer, seller, product, cart, order, shipment, request, review, snapshot, or administrator records include the acting ownership or grade boundary in the persisted lookup or committing predicate. Fetching a record and checking ownership only after a mutable gap is insufficient.

An unrelated actor cannot infer a private target's existence from response fields or gain it through identifier substitution, pagination cursor reuse, batch selection, nested identifiers, or a concurrent owner-state change.

### REQ-NFR-SECURITY-PRIVACY-5 Validate text, identifiers, uploads, and callbacks at trust boundaries

Structured input rejects unknown capability-bearing fields, malformed identifiers, nonfinite numbers, executable markup where plain text is required, and values outside the explicit requirement ranges. User-provided text is rendered as text rather than executable HTML or script.

Image upload accepts only the configured image media types after content inspection, assigns a platform-controlled name, and enforces a ten-megabyte per-file limit. Gateway callbacks verify the configured signature over the unmodified payload before reconciliation; an invalid signature changes no payment, hold, order, stock, or cart state.

## REQ-NFR-COUPON-ASSURANCE Coupon concurrency, abuse, privacy, and boundary assurance

Coupon correctness is a money and scarcity property. Tests and production behavior must cover quota races, canonical-code abuse, private eligibility, exact time and subtotal boundaries, integer allocation remainders, payment uncertainty, and post-order reversals rather than only a successful single-coupon example.

### REQ-NFR-COUPON-ASSURANCE-1 Serialize quota and payment outcomes

Concurrent attempts for the final total use or one customer's final allowed use produce exactly one complete reservation winner. Every loser starts no charge, creates no stock hold, and consumes no coupon quota.

Reservation consumption, release, and reconciliation are idempotent by payment attempt and coupon. A process restart or callback reordering cannot overrun quota, strand a released reservation, or create redemption without the matching order.

### REQ-NFR-COUPON-ASSURANCE-2 Limit code guessing and replay abuse

Coupon-code entry canonicalizes before lookup and returns one safe inapplicable shape for unknown and private-ineligible codes. In a rolling fifteen-minute window, the twenty-first failed code entry by one customer or the one-hundred-first failed code entry from one request source is rate-limited before another coupon lookup.

A successful applicable lookup clears that customer's coupon failure count but not the source-wide count. Selection replay, payment callback replay, account recreation, Unicode case variants, and surrounding whitespace cannot create another use or bypass per-customer quota.

### REQ-NFR-COUPON-ASSURANCE-3 Minimize coupon and redemption disclosure

Customer responses omit allowlist members, hidden target sets, exact remaining global quota, other customers' usage, and reservation identifiers. Seller responses contain only owned seller coupons and that seller's item allocations; they omit another seller's coupon terms and line amounts.

Administrator inspection includes the policy and audit facts needed for moderation but never exposes credentials, session values, gateway secrets, full payment credentials, or the coupon-quota lineage token. Customer deletion removes live profile presentation without erasing attributed redemption evidence or the minimal nonpublic count lineage needed to prevent account-recreation quota bypass.

### REQ-NFR-COUPON-ASSURANCE-4 Exercise every discount boundary

The automated suite covers start minus one minor clock tick, exact start, end minus one tick, exact end, subtotal below minimum, exact minimum, each quota immediately below and at limit, fixed discount below and above eligible amount, percentage floor, percentage cap, zero remainder, nonzero remainder, equal fractional remainder, one seller plus platform stack, multiple seller partitions plus platform stack, exclusive conflict, and every duplicate-layer conflict.

Each boundary test asserts gross, per-coupon realized discount, per-item allocation, total discount, net charge, reservation count, redemption count, and refusal side effects. A percentage-only aggregate assertion does not prove minor-unit allocation.

### REQ-NFR-COUPON-ASSURANCE-5 Exercise failure and reversal continuity

The automated suite covers explicit payment failure, unknown payment then success, unknown payment then failure, callback replay, process restart, coupon pause or expiry during an active reservation, cancellation, refund, administrator force action, full-order reversal, and seller or customer deletion after redemption.

Each scenario proves exact money return from preserved item net, exact stock restoration, no consumed quota restoration, immutable coupon and allocation evidence, and no change to unrelated order items. Failure injection after gateway success and before local commit is mandatory for both charge and money-return reconciliation.

## REQ-NFR-ACCESSIBILITY-PERFORMANCE Usable and bounded customer experience

The customer, seller, and administrator journeys remain operable without a pointing device and do not hide correctness behind an unbounded response. Performance is measured against a repeatable local reference profile rather than an unspecified production promise.

### REQ-NFR-ACCESSIBILITY-PERFORMANCE-1 Support keyboard and focus operation

Every interactive control in registration, login, catalog discovery, cart, checkout, order tracking, request, seller fulfillment, and administrator moderation is reachable and operable by keyboard alone in a logical order. Focus is visible, dialogs trap and restore focus, and a route or validation transition moves focus to the new heading or first invalid field.

No essential action depends only on hover, pointer precision, drag, color, or an unannounced timed change.

### REQ-NFR-ACCESSIBILITY-PERFORMANCE-2 Expose names, state, and errors accessibly

Forms associate visible labels, instructions, required state, and validation errors with their controls. Images have meaningful alternatives or explicit decorative treatment; tables identify headers; status, availability, price, rating, tracking, and request changes are available to assistive technology.

Core workflow pages pass automated WCAG 2.2 AA checks with no serious or critical violation, retain readable content at 200 percent zoom, and meet AA text and control contrast. Automated checks supplement rather than replace keyboard and focus assertions.

### REQ-NFR-ACCESSIBILITY-PERFORMANCE-3 Meet the reference query budget

With a warm single application instance and benchmark database containing at least 10,000 live products, 50,000 retained order items, and 100,000 combined inventory, snapshot, request, and review records, each documented 20-row paginated list and detail query completes at or below `750 ms` at the 95th percentile over 100 sequential measurements after 10 warm-up measurements on the benchmark host.

The measurement records host, runtime, database, seed, query, filters, warm-up count, all sample durations, and percentile method. A smaller dataset, omitted authorization, omitted aggregate, cache-only stub, or response with fewer required fields does not satisfy the budget.

### REQ-NFR-ACCESSIBILITY-PERFORMANCE-4 Keep command latency bounded separately from gateways

Excluding time spent waiting on the external payment or refund gateway, authenticated commands that do not upload an image complete at or below `1,000 ms` at the 95th percentile under the same reference profile and sample procedure. Gateway time and application time are recorded separately.

Meeting a latency budget never permits a skipped ownership check, stale checkout validation, weakened transaction, incomplete snapshot, partial response, or reduced test assertion.
