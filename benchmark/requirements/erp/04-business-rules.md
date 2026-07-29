# Business Rules, Exceptions, and Refusals

These rules make tenant scope, quantities, lifecycle transitions, posting, approval, immutability, correction, and reporting deterministic. Threshold values remain organization configuration; the requirements define when a threshold changes the outcome.

## REQ-RULE-ORG-ACCESS: Organization Isolation Rules

For Organization, every operation and automated action resolves one currently selected organization before accessing business information. Explicit active membership is the prerequisite for organization data visibility.

Together, roles are evaluated only inside the selected membership. Deletion is refused while the organization keeps a blocker listed in REQ-RULE-ORG-ACCESS-003.

### REQ-RULE-ORG-ACCESS-001: A read, write, command, report, export, approval, audit event, notification, or background job may access only its active organization

A read, write, command, report, export, approval, audit event, notification, or background job may access only its active organization.

### REQ-RULE-ORG-ACCESS-002: Receives no data or authority from it

A user without active membership in the selected organization receives no data or authority from it.

### REQ-RULE-ORG-ACCESS-003: Refuse deletion while organization obligations remain

Organization deletion is refused while pending approvals, active employee contracts, unresolved documents in open periods, or retained posted financial or inventory records exist.

When deletion is eligible, the operational organization is removed but its immutable identity tombstone and deletion audit event remain under REQ-DOM-ORG-003.

### REQ-RULE-ORG-ACCESS-004: Must retain at least one active Owner

Every organization must retain at least one active Owner.

## REQ-RULE-ACCOUNT: User Account Rules

For User Account, one normalized email identifies one global account across memberships. Credential decisions never grant organization authority by themselves.

Together, recovery and deactivation have explicit all-session effects. Profile and credential changes belong to the user instead of an organization manager.

### REQ-RULE-ACCOUNT-001: Must be globally unique

Email identity is compared case-insensitively and must be globally unique.

### REQ-RULE-ACCOUNT-002: Login is refused for invalid credentials, inactive account status, or absence of active memberships

Login is refused for invalid credentials, inactive account status, or absence of active memberships.

### REQ-RULE-ACCOUNT-003: Password change requires the current password

Password change requires the current password, while recovery requires control of the account email.

### REQ-RULE-ACCOUNT-004: Revokes all previously active sessions

Completing credential recovery revokes all previously active sessions.

### REQ-RULE-ACCOUNT-005: Revokes every session and blocks login

Global account deactivation revokes every session and blocks login while retaining attributed business history.

### REQ-RULE-ACCOUNT-006: Account reactivation does not restore a separately revoked organization membership

Account reactivation does not restore a separately revoked organization membership.

## REQ-RULE-MEMBERSHIP: Membership and Role Rules

For Organization Membership, a user has at most one membership record in an organization. Invited, active, suspended, and revoked states control organization access independently of the global account.

Together, later members receive Employee baseline unless an Owner assigns more. Role and membership loss take effect immediately for continued requests.

### REQ-RULE-MEMBERSHIP-001: Invitation email and resolved user uniqueness prevent duplicate memberships

Before acceptance, organization and canonical invitation email identify at most one invited membership. After acceptance, organization and resolved user identify at most one membership, and linking is refused if it would violate either uniqueness rule.

### REQ-RULE-MEMBERSHIP-002: Only active memberships may select an organization or perform organization work

Only active memberships may select an organization or perform organization work.

### REQ-RULE-MEMBERSHIP-003: Receives Employee as its baseline role

A later accepted membership receives Employee as its baseline role.

### REQ-RULE-MEMBERSHIP-004: Effective permission is the union of assigned roles and contains no cross-organization authority

Effective permission is the union of assigned roles and contains no cross-organization authority.

### REQ-RULE-MEMBERSHIP-005: Only Owners assign or revoke roles and membership status

Only Owners assign or revoke roles and membership status.

### REQ-RULE-MEMBERSHIP-006: Removes access from every existing session

Suspending or revoking membership immediately removes access from every existing session.

### REQ-RULE-MEMBERSHIP-007: Reinvitation reuses one revoked membership without restoring authority

Accepting a new invitation after revocation changes the one existing organization-user membership back to active, grants only Employee, and never restores former roles, scoped positions, sessions, or delegated approvals.

## REQ-RULE-ROLE: Role Integrity Rules

For Organization Role, built-in roles keep the explicit authority boundaries in REQ-AUTH-ROLE-001. Custom roles use the same organization permission catalog while not becoming global grades.

Together, assignments target active memberships and are sensitive changes. Deletion protects every current member assignment.

### REQ-RULE-ROLE-001: Built-in roles cannot be deleted

Built-in roles cannot be deleted.

### REQ-RULE-ROLE-002: A custom role may contain any delegable permission combination within its organization

A custom role may contain any delegable permission combination within its organization but cannot contain the non-delegable Owner-only permissions in REQ-AUTH-ROLE-011.

### REQ-RULE-ROLE-003: A role may be assigned only to an active membership in the same organization

A role may be assigned only to an active membership in the same organization.

### REQ-RULE-ROLE-004: A custom role cannot be deleted while any member holds it

A custom role cannot be deleted while any member holds it.

### REQ-RULE-ROLE-005: A role or permission change emits an immutable audit event

A role or permission change emits an immutable audit event.

### REQ-RULE-ROLE-006: Sensitive authority requires enrolled MFA and a new assured session

A sensitive role or permission grant is refused unless the target account has active MFA; a successful grant revokes the target's existing sessions and requires a new second-factor-authenticated session before privileged use.

### REQ-RULE-ROLE-007: Explicit actor restrictions override generic permission labels

A requirement naming Owner or another concrete built-in actor is not satisfied by a custom role unless that requirement explicitly admits a custom permission; generic authorized-user and domain capability labels resolve only delegable permissions.

## REQ-RULE-DOC-LINK: Operational Document Traceability

For Operational Document, every numbered document stays unique within organization and type. Upstream and downstream links keep the complete business chain.

Together, each line exposes original, consumed, corrected, and remaining quantity. Downstream correction restores upstream progress while not rewriting posted history.

### REQ-RULE-DOC-LINK-001: A document number is unique within its organization and document type

A document number is unique within its organization and document type.

### REQ-RULE-DOC-LINK-002: Operational Document its upstream

Every operational document retains its upstream and downstream document relationships.

### REQ-RULE-DOC-LINK-003: Do not consume more than source remainder

A conversion, receipt, shipment, invoice, return, allocation, or payment cannot apply more than its source remaining quantity or balance.

### REQ-RULE-DOC-LINK-004: Bound a quantity override by configured tolerance

Only a receipt, vendor bill, allocation, or sales invoice may exceed source quantity, and only through a completed workflow whose document-type tolerance caps the permitted absolute or percentage excess.

- The override records document type, configured tolerance, original remainder, permitted excess, requester, independent approver, reason, and time.
- A payment never consumes beyond an invoice or bill balance: customer excess becomes unapplied customer credit and vendor excess is refused because vendor prepayment is outside this corpus.

### REQ-RULE-DOC-LINK-005: Updates upstream remaining quantities and statuses

Voiding, reversing, returning, crediting, or cancelling downstream work updates upstream remaining quantities and statuses.

### REQ-RULE-DOC-LINK-006: Financial and stock postings reference the source document that generated them

Financial and stock postings reference the source document that generated them.

## REQ-RULE-FIN-POST: Financial Posting Integrity

For Financial Posting, every financial business event creates a source-linked journal result. Base-currency debit and credit equality is a posting prerequisite.

Together, posting occurs only in an eligible fiscal period and commits all inseparable effects together. Posted history is corrected by new linked evidence instead of mutation.

### REQ-RULE-FIN-POST-001: A financial transaction may post only when total base-currency debits equal total base-currency credits

A financial transaction may post only when total base-currency debits equal total base-currency credits.

### REQ-RULE-FIN-POST-002: Financial Posting transaction currency

Posting retains transaction currency and the exchange rate used to determine base amounts.

### REQ-RULE-FIN-POST-003: New operational posting is allowed only in an open fiscal period

New operational posting is allowed only in an open fiscal period.

### REQ-RULE-FIN-POST-004: A correction in a soft-closed period requires approval

A correction in a soft-closed period requires approval.

### REQ-RULE-FIN-POST-005: Hard-closed periods refuse posting and dated evidence mutation

Hard-closed periods refuse every new posting and every mutation to operational or financial evidence whose effective business date falls in the period; future-dated configuration remains eligible only when it cannot alter closed evidence or snapshots.

### REQ-RULE-FIN-POST-006: A multi-step financial posting succeeds with all source-document and journal effects or leaves none of them applied

A multi-step financial posting succeeds with all source-document and journal effects or leaves none of them applied.

### REQ-RULE-FIN-POST-007: Posted financial records are immutable and corrections use reversal, adjustment, return, credit memo, or a new posting document

Posted financial records are immutable and corrections use reversal, adjustment, return, credit memo, or a new posting document.

### REQ-RULE-FIN-POST-008: Select a unique historical exchange rate

A foreign-currency posting selects the latest organization rate for its ordered currency pair whose effective business date is at or before the document's organization-timezone business date, refuses a missing or ambiguous rate, and stores the selected rate identity, value, and converted base amount.

### REQ-RULE-FIN-POST-009: Post realized exchange gain or loss on settlement

An invoice or bill allocation uses the document's transaction currency; a differently denominated bank account requires an explicit currency-conversion transfer rather than a direct allocation.

- Settlement translates the settled transaction amount at the payment's organization-timezone business date and compares it with the proportional base carrying amount retained by the invoice or bill.
- The difference posts atomically to the configured realized exchange-gain or exchange-loss account with the payment, settlement, and source-document links.

## REQ-RULE-MONEY: Monetary Precision and Rounding Rules

Every amount uses fixed-point decimal arithmetic with explicit currency and scale. Rounding happens only at the named boundary, and the stored source values, exchange rate, rounding result, and any balancing difference remain reproducible.

### REQ-RULE-MONEY-001: Prohibit binary floating-point money

Prices, costs, taxes, discounts, wages, rates, debits, credits, balances, budgets, and payments use fixed-point decimal values and never binary floating-point persistence or arithmetic.

### REQ-RULE-MONEY-002: Apply currency precision at posting boundaries

Transaction-currency document lines round half away from zero to the currency's configured minor-unit precision when the line becomes financially effective.

- Unrounded source quantity, unit price, rate, discount, and tax basis remain retained.
- Document totals equal the sum of their stored rounded lines rather than a separately rounded recomputation.

### REQ-RULE-MONEY-003: Preserve exchange-rate precision

Exchange rates retain at least eight decimal places, and conversion multiplies the stored transaction amount by the stored rate before rounding the base-currency line once to base-currency precision.

### REQ-RULE-MONEY-004: Reconcile tax rounding explicitly

Tax is calculated and rounded at the line level using the effective tax-code rule; any document-level tax difference needed to equal the declared total is a separately identified rounding adjustment, never a silent mutation of an arbitrary line.

### REQ-RULE-MONEY-005: Balance journals after rounding

A journal posts only when stored base-currency debit and credit totals are exactly equal at base-currency precision.

- A permitted rounding difference posts to the organization's configured rounding account as an explicit source-linked line.
- If no rounding account is configured or the difference exceeds one base-currency minor unit, posting is refused.

### REQ-RULE-MONEY-006: Preserve quantity precision separately from money

Inventory, production, time, and service quantities retain the unit-of-measure precision configured for their dimension; monetary rounding never changes a physical quantity, duration, or unit conversion.

## REQ-RULE-JOURNAL: Journal Entry Rules

For Journal Entry, drafts stay editable and deletable until approval or posting begins. Manual thresholds determine required approval.

Together, posting requires complete lines, valid accounts, eligible period, balance, and source context. Posted entries never return to editable draft.

### REQ-RULE-JOURNAL-001: Only a draft journal may be edited or deleted

Only a draft journal may be edited or deleted.

### REQ-RULE-JOURNAL-002: A manual journal above the organization approval threshold requires completed approval before posting

A manual journal above the organization approval threshold requires completed approval before posting.

### REQ-RULE-JOURNAL-003: A journal with inactive or missing account relationships, incomplete currency conversion, or unequal base totals is refused posting

A journal with inactive or missing account relationships, incomplete currency conversion, or unequal base totals is refused posting.

### REQ-RULE-JOURNAL-004: A posted journal cannot be edited or deleted

A posted journal cannot be edited or deleted.

### REQ-RULE-JOURNAL-005: Must identify the posted entry they correct and record a reason

Reversal and adjustment must identify the posted entry they correct and record a reason.

### REQ-RULE-JOURNAL-006: Enforce valid double-entry line shape

A posted journal contains at least two nonzero effective lines. Every line has fixed nonnegative debit and credit amounts, exactly one side is greater than zero, and no zero-only or simultaneously debited-and-credited line is eligible; aggregate debit and credit totals are equal and greater than zero in base currency.

## REQ-RULE-PERIOD: Fiscal Period Rules

For Fiscal Period, soft close begins control while allowing approved correction. Hard close requires every named module validator to pass.

Together, snapshot results stay reproducible by close cycle. Hard close refuses a new posting or a mutation to any operational or financial document whose effective date falls in the closed period, while future-dated configuration remains eligible only when it cannot alter closed evidence. Reopening is exceptional Owner action through approval with reason.

### REQ-RULE-PERIOD-001: Hard close is refused while any outstanding receipt, uninvoiced shipment, inventory valuation issue, unreconciled bank activity, draft journal, pending approval, unposted payroll, unposted depreciation, unresolved production order, or open tax return remains

Hard close is refused while any outstanding receipt, uninvoiced shipment, inventory valuation issue, unreconciled bank activity, draft journal, pending approval, unposted payroll, unposted depreciation, unresolved production order, or open tax return remains.

### REQ-RULE-PERIOD-002: Hard close freezes trial balance, balance sheet, P&L, inventory valuation, AR aging, AP aging, cash balance, budget actual, and tax-summary snapshots

Hard close freezes trial balance, balance sheet, P&L, inventory valuation, AR aging, AP aging, cash balance, budget actual, and tax-summary snapshots.

### REQ-RULE-PERIOD-003: Must reproduce its applicable snapshot

A report against a hard-closed period must reproduce its applicable snapshot.

### REQ-RULE-PERIOD-004: Only an Owner may initiate reopening

Only an Owner may initiate reopening, and the request requires approval plus a recorded reason.

### REQ-RULE-PERIOD-005: Reopening and reclose preserve each prior close cycle and audit history

Reopening and reclose preserve each prior close cycle and audit history.

### REQ-RULE-PERIOD-006: Reconcile control accounts before hard close

Hard close is refused unless inventory movement quantity and valuation reconcile to inventory general-ledger control, accepted uninvoiced receipts reconcile to received-not-invoiced, production WIP reconciles to WIP control, and AR, AP, payroll, tax, asset cost, and accumulated depreciation subledgers reconcile to their named control accounts with every difference identified.

## REQ-RULE-BANK: Bank Reconciliation Rules

For Bank Reconciliation, a match targets only recognized financial documents in the same organization and currency context. Completion requires statement lines and ending balance to reconcile.

Together, completed evidence is immutable. Reopen requires approval and audit before correction.

### REQ-RULE-BANK-001: A bank transaction may match only an eligible customer payment, vendor payment, payroll payment, journal entry, bank transfer, or adjustment in the same organization

A bank transaction may match only an eligible customer payment, vendor payment, payroll payment, journal entry, bank transfer, or adjustment in the same organization.

### REQ-RULE-BANK-002: Reconcile the complete statement without omitted lines

A reconciliation cannot complete until its beginning balance equals the prior completed statement's ending balance, or the bank-account opening balance for the first statement, and every imported line in the exact statement period is included once.

- Every included line is matched to eligible same-currency financial evidence or explicitly ignored with an authorized reason.
- Beginning balance plus every statement-line amount must equal the stated ending balance, and ledger cash after matched adjustments must have zero unexplained difference.
- A missing, duplicated, out-of-period, unresolved, or unexplained statement line refuses completion and identifies the line or balance difference.

### REQ-RULE-BANK-003: A completed reconciliation cannot be edited

A completed reconciliation cannot be edited.

### REQ-RULE-BANK-004: Reopening a completed reconciliation requires approval and emits an audit event

Reopening a completed reconciliation requires approval and emits an audit event.

## REQ-RULE-TAX: Tax Return Filing Rules

A tax return belongs to a jurisdiction and period and must reconcile its lines to posted tax and source activity before filing. Filing freezes the reviewed version. Later correction adds a linked amendment, allowing both the original and changed filing evidence to remain reproducible.

### REQ-RULE-TAX-001: Reconcile a return before filing

A return cannot be filed unless its lines reconcile to posted journals and source documents.

- The filing check compares return lines with posted tax journal entries and their sales-invoice, vendor-bill, payroll, duty, or withholding sources.
- A reconciliation difference leaves the return unfiled and identifies the mismatched line or source.

### REQ-RULE-TAX-002: Keep filed returns immutable

A filed return cannot be edited.

- Filing date, preparer, reviewer, jurisdiction, period, and filed lines remain fixed on the filed version.
- Later payment or correction does not edit that filed evidence.

### REQ-RULE-TAX-003: Correct filing through a linked amendment

A filed-return correction must be a new amendment version linked to the original.

- The amendment is a new version that retains the original filing reference and states its changed lines.
- The original version remains reproducible alongside the amendment.

### REQ-RULE-TAX-004: Post output sales tax

Output sales tax applies the effective rate to the taxable sales basis after line discount and before tax, credits the configured tax-payable account, and preserves invoice, jurisdiction, code, basis, rate, and rounded amount for filing.

### REQ-RULE-TAX-005: Post recoverable input purchase tax

Input purchase tax applies the effective rate to eligible vendor-bill basis, debits the configured tax-receivable account, and preserves bill, jurisdiction, code, recoverability, basis, rate, and rounded amount for filing.

### REQ-RULE-TAX-006: Post withholding tax

Withholding tax applies the effective rate to the configured payment or earning basis, reduces cash paid to the subject party, credits withholding payable, and preserves party, source document, basis, rate, amount, and remittance period.

### REQ-RULE-TAX-007: Post import duty

Import duty applies the effective rate to the retained customs basis, debits inventory or configured duty expense, credits duty payable, and links the import, receipt, item, jurisdiction, code, basis, rate, and amount.

### REQ-RULE-TAX-008: Post payroll tax

Payroll tax applies the effective employee or employer rate to its named payroll earning basis and posts payroll expense or employee deduction against the configured payroll-tax payable account with employee, run, jurisdiction, basis, rate, and amount.

### REQ-RULE-TAX-009: Preserve exempt treatment without a tax posting

An exempt line requires an active exempt code and reason, produces no tax amount or tax journal line, and remains separately identifiable in the source document and applicable filing totals.

### REQ-RULE-TAX-010: Preserve zero-rated taxable turnover

A zero-rated line requires an active zero-rated code and reason, calculates exactly zero tax at the retained zero rate, creates no tax amount posting, and remains included in zero-rated taxable-turnover filing totals.

### REQ-RULE-TAX-011: Settle filed tax balances without changing filed evidence

A tax payment cannot exceed the filed return's remaining liability, and a refund cannot exceed its remaining receivable. Posting atomically changes the remaining balance, cash or bank, tax payable or receivable, source-linked journal, and bank-matchable settlement while leaving filed lines immutable.

### REQ-RULE-TAX-012: Correct tax settlement through reversal

A posted tax settlement cannot be edited or deleted. Reversal identifies the original, restores its remaining tax balance, reverses cash and journal effects, updates bank-match eligibility, and preserves both records.
## REQ-RULE-VENDOR: Vendor Integrity Rules

For Vendor, one primary contact makes the responsible vendor contact unambiguous. Bank-account changes are approval-controlled sensitive actions.

Together, historical purchase relationships prevent deletion. Deactivation keeps vendor identity for documents and reports.

### REQ-RULE-VENDOR-001: Must identify exactly one primary contact

A vendor with contacts must identify exactly one primary contact.

### REQ-RULE-VENDOR-002: A vendor bank-account change cannot apply without completed approval

A vendor bank-account change cannot apply without completed approval.

### REQ-RULE-VENDOR-003: Every vendor bank-account change emits an audit event with before and after values

Every vendor bank-account change emits an audit event with before and after values.

### REQ-RULE-VENDOR-004: A vendor with historical purchase documents cannot be deleted and may only be deactivated

A vendor with historical purchase documents cannot be deleted and may only be deactivated.

## REQ-RULE-PURCHASE-REQUEST: Purchase Request Rules

For Purchase Request, only the requester changes draft business fields. Submission locks the request until a change decision returns it to draft.

Together, routing uses amount, department or project context, account, vendor, requester role, and budget availability. Conversion protects line remainder.

### REQ-RULE-PURCHASE-REQUEST-001: Only the requester may edit a draft purchase request

Only the requester may edit a draft purchase request.

### REQ-RULE-PURCHASE-REQUEST-002: Changes and returns it to draft

A submitted request's business fields remain locked until an approver requests changes and returns it to draft.

### REQ-RULE-PURCHASE-REQUEST-003: Approval routing may depend on amount, department or project context, account, vendor, requester role, and budget availability

Approval routing may depend on amount, department or project context, account, vendor, requester role, and budget availability.

### REQ-RULE-PURCHASE-REQUEST-004: A request line cannot be converted beyond remaining quantity

A request line cannot be converted beyond remaining quantity.

### REQ-RULE-PURCHASE-REQUEST-005: A cancelled, rejected, or fully converted request cannot be submitted or converted again

A cancelled, rejected, or fully converted request cannot be submitted or converted again.

## REQ-RULE-PURCHASE-ORDER: Purchase Order Rules

For Purchase Order, source request quantity and direct-create authority govern entry. Approval freezes business fields.

Together, change orders retain complete before and after evidence. Receipt and unresolved downstream work constrain terminal commands.

### REQ-RULE-PURCHASE-ORDER-001: A request-sourced purchase order may consume only approved request-line remainder

A request-sourced purchase order may consume only approved request-line remainder.

### REQ-RULE-PURCHASE-ORDER-002: Only a user with direct-purchase permission may create an order without a request

Only a user with direct-purchase permission may create an order without a request.

### REQ-RULE-PURCHASE-ORDER-003: An approved purchase order cannot be edited directly

An approved purchase order cannot be edited directly.

### REQ-RULE-PURCHASE-ORDER-004: Records before and after values, requester, approver, reason

A change order records before and after values, requester, approver, reason, and timestamp.

### REQ-RULE-PURCHASE-ORDER-005: Cancellation after any receipt is refused until returns or reversals resolve received quantity

Cancellation after any receipt is refused until returns or reversals resolve received quantity.

### REQ-RULE-PURCHASE-ORDER-006: Closure is refused while receipts, bills, returns, disputes, or payments remain unresolved

Closure is refused while receipts, bills, returns, disputes, or payments remain unresolved.

## REQ-RULE-RECEIPT: Purchase Receipt Rules

For Purchase Receipt, receipt quantity derives from purchase-order remainder. Tracking requirements follow the item.

Together, posting creates immutable stock effects. Correction never changes the receipt.

### REQ-RULE-RECEIPT-001: A receipt line cannot exceed the source order line's remaining receivable quantity without the bounded override

A receipt line cannot exceed the source order line's remaining receivable quantity unless the bounded workflow in REQ-RULE-DOC-LINK-004 has completed.

### REQ-RULE-RECEIPT-002: Must identify valid lots or one serial per unit

Lot-tracked and serial-tracked receipt lines must identify valid lots or one serial per unit.

### REQ-RULE-RECEIPT-003: Creates immutable source-linked stock movements

Posting an inventory-item receipt creates immutable source-linked stock movements.

### REQ-RULE-RECEIPT-004: A posted receipt cannot be edited and is corrected only by purchase return or inventory adjustment

A posted receipt cannot be edited and is corrected only by purchase return or inventory adjustment.

### REQ-RULE-RECEIPT-005: Reconcile received, accepted, and rejected quantities

Each line has nonnegative quantities and must satisfy `received = accepted + rejected`; posting is refused when that equality, source remainder, lot, serial, warehouse, or location validation fails.

- Accepted quantity creates the normal purchase-receipt movement, advances purchase-order fulfillment, and becomes eligible for three-way match.
- Rejected quantity creates one inbound receipt movement directly into the quarantine location or condition, increases warehouse on-hand once, does not advance fulfilled or invoice-matchable quantity, and preserves the order remainder for replacement receipt.

### REQ-RULE-RECEIPT-006: Resolve rejected stock explicitly

Rejected quantity remains unavailable and blocks receipt resolution until a source-linked return-to-vendor, approved use-as-is release, rework disposition, or scrap movement consumes the quarantined balance.

- Approved use-as-is or successful rework converts the quantity to accepted exactly once, consumes still-available purchase-order remainder or a bounded override, advances fulfillment and match eligibility, and moves stock from quarantine to available atomically.
- Return-to-vendor or scrap removes quarantined stock without changing purchase-order fulfillment or restoring remainder that rejection already preserved.
- Concurrent or retried disposition admits one terminal quantity allocation and cannot both accept and remove the same rejected unit.

### REQ-RULE-RECEIPT-007: Bridge accepted inventory receipt to the general ledger

Posting accepted inventory quantity debits inventory and credits received-not-invoiced clearing at the retained purchase-order or receipt base value in the same transaction as the stock movement.

### REQ-RULE-RECEIPT-008: Reverse purchase return at source receipt cost

Each return of accepted quantity reverses fulfillment and value at its source accepted receipt's retained unit cost, debits received-not-invoiced or the linked vendor-credit clearing path, credits inventory, and preserves the receipt, return, bill or credit, movement, and journal chain. Returning rejected quantity affects only its quarantine balance and vendor settlement and never restores purchase-order remainder a second time.

## REQ-RULE-VENDOR-BILL: Vendor Bill Rules

For Vendor Bill, bill quantities and prices are evaluated against orders and receipts. Material variance adds an approval requirement.

Together, posting creates AP plus expense or inventory accrual in one result. Posted correction keeps bill and settlement history.

### REQ-RULE-VENDOR-BILL-001: A bill line cannot exceed eligible source order or receipt quantity without the bounded override

A bill line cannot exceed eligible source order or receipt quantity unless the bounded workflow in REQ-RULE-DOC-LINK-004 has completed.

### REQ-RULE-VENDOR-BILL-002: Three-way match compares purchase-order, receipt

Three-way match compares purchase-order, receipt, and bill quantities and prices.

### REQ-RULE-VENDOR-BILL-003: Variance beyond configured tolerance requires approval before posting

Variance beyond configured tolerance requires approval before posting.

### REQ-RULE-VENDOR-BILL-004: Applies accounts payable and expense or inventory-accrual effects atomically

Bill posting applies accounts payable and expense or inventory-accrual effects atomically.

### REQ-RULE-VENDOR-BILL-005: A posted bill cannot be edited

A posted bill cannot be edited.

### REQ-RULE-VENDOR-BILL-006: A bill cannot be marked fully paid while an unapplied balance remains, and dispute status remains visible until resolved

A bill cannot be marked fully paid while an unapplied balance remains, and dispute status remains visible until resolved.

### REQ-RULE-VENDOR-BILL-007: Clear received-not-invoiced and retain purchase-price variance

For matched accepted inventory quantity, bill posting debits received-not-invoiced at retained receipt value, posts the signed purchase-price or currency variance to its configured account, debits recoverable input tax when eligible, and credits accounts payable.

- A service or non-stock line debits its configured expense instead of inventory or received-not-invoiced.
- The bill never capitalizes the same accepted inventory value a second time, and its source receipt, quantity allocation, rates, variance, tax, journal, and payable remain reproducible.

## REQ-RULE-INVENTORY: Stock Quantity and Valuation Rules

Immutable movements are the quantity ledger for stock increases and decreases, with reservations and quarantine affecting availability. Organization policy decides whether a stock-decreasing posting may cross below zero. Weighted average is the default valuation: receipts change the running cost and shipments consume that cost for COGS.

### REQ-RULE-INVENTORY-001: Derive stock from immutable movements

Stock quantity and history are derived exclusively from immutable stock movements.

- Every increase or decrease contributes an immutable movement with item, warehouse, location, quantity, cost, type, source, date, and operator.
- Stock history is not rewritten when a later return, reversal, transfer, release, or adjustment occurs.

### REQ-RULE-INVENTORY-002: Apply the negative-stock policy

A stock-decreasing posting is refused when it would create negative available stock unless the organization enables negative stock.

- Available quantity includes stock movements less reservations and quarantined quantity at the affected item and location.
- The policy never permits negative quantity for a serial-tracked item; REQ-RULE-SERIAL-003 always requires the exact available serial.
- When negative stock is disabled, the refused posting creates neither a movement nor a partial downstream posting.

### REQ-RULE-INVENTORY-003: Use weighted-average valuation by default

Weighted average is the default costing method; receipts update the running average and shipments use it for COGS.

- When prior on-hand is nonnegative, each receipt recalculates the running weighted average as `(prior on-hand value + receipt value) / resulting on-hand quantity`, using fixed-point quantity and money under REQ-RULE-MONEY.
- A shipment uses the effective running average to post COGS while preserving its source document.

### REQ-RULE-INVENTORY-004: Revalue permitted negative stock explicitly

When negative stock is enabled, an outbound movement that crosses below zero uses the item's configured provisional cost; without a valid provisional cost the posting is refused.

- A later receipt first partitions `min(receipt quantity, absolute prior negative on-hand)` to cover the negative balance and posts a source-linked revaluation between provisional outbound cost and that portion's receipt cost.
- Any receipt quantity remaining after the negative balance reaches zero becomes positive on-hand at the receipt unit cost; the covered quantity is not included again in the positive running-average numerator or denominator.
- Revaluation never rewrites the original outbound or inbound movement and remains reproducible from both sources.

### REQ-RULE-INVENTORY-005: Calculate on-hand and available quantity consistently

On-hand quantity is the sum of immutable physical movements; available quantity is on-hand minus active unconsumed allocations minus quarantined on-hand quantity at the selected item, warehouse, location, lot, and serial scope.

- In-transit transfer quantity is absent from destination on-hand until receipt.
- Quarantining existing available stock uses a zero-sum pair from its available location to a designated quarantine location or condition within the same warehouse; warehouse on-hand is unchanged, the quarantine balance is counted once in the subtraction, and source-location on-hand no longer includes it.
- A rejected purchase receipt instead posts one inbound movement directly to quarantine, so warehouse on-hand increases once and available stock does not increase.
- Release reverses that pair, while return or scrap consumes the quarantine balance; no path both moves quantity out of a scope and subtracts the same quarantine balance from that source scope.
- Reservation changes availability without a physical movement, whereas quarantine, release, return, and scrap retain their named immutable movement types.

### REQ-RULE-INVENTORY-006: Convert units before stock and value effects

A movement in a non-stock unit converts through the effective item-specific unit conversion to the stock unit before quantity, availability, valuation, and serial or lot validation.

- The source quantity, source unit, conversion factor, stock-unit quantity, and rounding result remain on the movement.
- A conversion that rounds a serial-tracked quantity away from an integer unit is refused.

### REQ-RULE-INVENTORY-007: Use one organization-item weighted-average cost pool

The valuation pool key is organization and inventory item, spanning its warehouses, locations, lots, and serials. Every receipt, shipment, return, production movement, and negative-stock revaluation uses that pool, while an internal transfer preserves value and does not change the pool average; a cross-organization movement is a separately valued outbound and inbound transaction.
## REQ-RULE-CUSTOMER: Customer Credit and History Rules

For Customer, one primary contact identifies the responsible customer contact. Credit-limit change is a sensitive approval-controlled action.

Together, exposure is checked before order approval. Historical sales prevent deletion.

### REQ-RULE-CUSTOMER-001: Must identify exactly one primary contact

A customer with contacts must identify exactly one primary contact.

### REQ-RULE-CUSTOMER-002: A credit-limit change cannot apply without completed approval and an audit event

A credit-limit change cannot apply without completed approval and an audit event.

### REQ-RULE-CUSTOMER-003: Sales-order approval checks current credit exposure against the limit

Sales-order approval checks current credit exposure against the limit.

### REQ-RULE-CUSTOMER-004: A customer with historical sales cannot be deleted and may only be deactivated

A customer with historical sales cannot be deleted and may only be deactivated.

## REQ-RULE-SALES-ORDER: Sales Order Rules

For Sales Order, quote-sourced orders require accepted quote status. Credit excess adds approval before allocation.

Together, line quantities stay bounded across allocation, shipment, invoice, return, and cancellation. Post-shipment cancellation waits for corrective documents.

### REQ-RULE-SALES-ORDER-001: A quote may create a sales order only

A quote may create a sales order only while accepted and unconverted.

### REQ-RULE-SALES-ORDER-002: An order that exceeds customer credit limit requires approval before it can become approved

An order that exceeds customer credit limit requires approval before it can become approved.

### REQ-RULE-SALES-ORDER-003: Cumulative document quantities cannot exceed the order plus their exact bounded overrides

Allocated, shipped, invoiced, returned, and cancelled quantities cannot exceed ordered quantity plus the exact document-specific excess approved under REQ-RULE-DOC-LINK-004.

### REQ-RULE-SALES-ORDER-004: Only approved orders may allocate stock

Only approved orders may allocate stock.

### REQ-RULE-SALES-ORDER-005: An order cannot be cancelled after shipment until returns or credits resolve downstream effects

An order cannot be cancelled after shipment until returns or credits resolve downstream effects.

### REQ-RULE-SALES-ORDER-006: Closure is refused while fulfillment, invoice, return, credit, or payment work remains unresolved

Closure is refused while fulfillment, invoice, return, credit, or payment work remains unresolved.

## REQ-RULE-ALLOCATION: Stock Allocation Rules

For Stock Allocation, only eligible stock is reservable. Reservation accounts for existing allocations and quarantine.

Together, concurrent requests cannot over-allocate. Release is limited to unconsumed quantity.

### REQ-RULE-ALLOCATION-001: Allocation may use only available, non-quarantined stock in the selected organization and warehouse

Allocation may use only available, non-quarantined stock in the selected organization and warehouse.

### REQ-RULE-ALLOCATION-002: Concurrent allocations cannot reserve the same available quantity twice

Concurrent allocations cannot reserve the same available quantity twice.

### REQ-RULE-ALLOCATION-003: A partial allocation preserves unallocated order remainder

A partial allocation preserves unallocated order remainder.

### REQ-RULE-ALLOCATION-004: Only unconsumed allocated quantity may be released

Only unconsumed allocated quantity may be released.

### REQ-RULE-ALLOCATION-005: Shipment cannot consume more than the linked allocation and eligible order remainder

Shipment cannot consume more than the linked allocation and eligible order remainder.

- An approved over-allocation under REQ-RULE-DOC-LINK-004 must atomically expand the order's permitted quantity and reserve additional available non-quarantined stock before shipment.
- No approval may make a shipment consume stock that is absent, quarantined, or not represented by the resulting linked allocation.

## REQ-RULE-SHIPMENT: Shipment Rules

For Shipment, shipment lines derive from order and allocation remainder. Tracked items require lot or serial evidence.

Together, shipping applies stock and COGS atomically. Posted shipment correction uses returns or reversal.

### REQ-RULE-SHIPMENT-001: A shipment line cannot exceed its resulting linked allocation

A shipment line cannot exceed unconsumed linked allocation or the order quantity including any exact over-allocation already approved under REQ-RULE-DOC-LINK-004.

### REQ-RULE-SHIPMENT-002: Lot-tracked and serial-tracked shipment lines require valid lot or one serial per unit

Lot-tracked and serial-tracked shipment lines require valid lot or one serial per unit.

### REQ-RULE-SHIPMENT-003: Applies stock decrease, order shipped quantity, allocation consumption

Posting shipment applies stock decrease, order shipped quantity, allocation consumption, and COGS entry atomically.

### REQ-RULE-SHIPMENT-004: A posted shipment cannot be edited

A posted shipment cannot be edited.

### REQ-RULE-SHIPMENT-005: A posted shipment is corrected through a sales return or explicit reversal rather than cancellation

A posted shipment is corrected through a sales return or explicit reversal rather than cancellation.

## REQ-RULE-SALES-INVOICE: Sales Invoice Rules

For Sales Invoice, billable quantity comes from shipment or approved advance-billing policy. Tax derives from line and party facts.

Together, posting applies receivable, revenue, discount, and tax in one result. Payment, overdue, void, and credit do not rewrite the posted invoice.

### REQ-RULE-SALES-INVOICE-001: Invoice quantity cannot exceed shipped and uninvoiced quantity unless advance billing is enabled by organization policy

Invoice quantity cannot exceed shipped and uninvoiced quantity unless advance billing is enabled by organization policy.

### REQ-RULE-SALES-INVOICE-002: Uses party location, item taxability, date

Invoice output tax uses party location, item taxability, date, and tax code.

### REQ-RULE-SALES-INVOICE-003: Applies accounts receivable, revenue, discount

Posting applies accounts receivable, revenue, discount, and tax effects atomically.

### REQ-RULE-SALES-INVOICE-004: A posted invoice cannot be edited

A posted invoice cannot be edited.

### REQ-RULE-SALES-INVOICE-005: Becomes overdue

An unpaid posted invoice past its terms becomes overdue.

### REQ-RULE-SALES-INVOICE-006: Uses void, credit memo, refund, or adjustment with source links

Correction uses void, credit memo, refund, or adjustment with source links.

## REQ-RULE-SALES-RETURN: Sales Return Rules

A sales return is bounded by the still-returnable quantity on its source shipment. Restockable and non-restockable lines have different inventory consequences, and posting keeps the return as the source for the applicable receivable, revenue, tax, COGS, or loss effects. Credit issuance and settlement are governed independently.

### REQ-RULE-SALES-RETURN-001: Bind a return to remaining shipped quantity

A sales return must reference a source shipment and cannot exceed remaining returnable quantity.

- The return retains its originating shipment line and the quantity already returned against that line.
- A request above the shipment line's unreturned quantity is refused without changing return or shipment balances.

### REQ-RULE-SALES-RETURN-002: Restore only restockable returned stock

Only restockable returned quantity restores inventory.

- Restockability is recorded for each accepted return line.
- Non-restockable quantity remains out of available stock and is accounted for as the applicable loss.

### REQ-RULE-SALES-RETURN-003: Post the return's financial effects

Posting a return creates the applicable revenue, receivable, tax, COGS reversal, or loss effects.

- The posted return remains the source for revenue, receivable, tax, and COGS reversals that apply to the original sale.
- Any non-restockable value is distinguished from inventory restoration.

### REQ-RULE-SALES-RETURN-004: Restore source shipment cost by allocation

Each restockable returned quantity restores inventory at the exact retained unit cost consumed by its source shipment allocation and reverses COGS at that value. A non-restockable return restores no inventory and posts that same source cost to the applicable loss; partial or multi-source returns preserve quantity and cost per source allocation.
## REQ-RULE-PAYROLL: Payroll Rules

For Payroll Run, hourly import uses only approved time. Calculation keeps every earning, deduction, tax, benefit, and dimension detail.

Together, posting and payment are distinct financial events. Posted correction uses reversal or adjustment.

### REQ-RULE-PAYROLL-001: Only approved timesheets may be imported for hourly payroll

Only approved timesheets may be imported for hourly payroll.

### REQ-RULE-PAYROLL-002: Payroll calculation preserves regular pay, overtime, bonus, commission, reimbursement, deductions, employer and employee taxes, benefits, net pay, and accounting dimensions per employee

Payroll calculation preserves regular pay, overtime, bonus, commission, reimbursement, deductions, employer and employee taxes, benefits, net pay, and accounting dimensions per employee.

### REQ-RULE-PAYROLL-003: A payroll run cannot post before approval

A payroll run cannot post before approval.

### REQ-RULE-PAYROLL-004: Applies payroll expense, tax liability, benefit liability

Posting applies payroll expense, tax liability, benefit liability, and payroll payable atomically.

### REQ-RULE-PAYROLL-005: Payment cannot exceed payroll payable and reduces the selected bank balance

Payment cannot exceed payroll payable and reduces the selected bank balance.

### REQ-RULE-PAYROLL-006: A posted payroll run cannot be edited and is corrected through reversal or adjustment run

A posted payroll run cannot be edited and is corrected through reversal or adjustment run.

### REQ-RULE-PAYROLL-007: An Employee may view only their own payslips

An Employee may view only their own payslips.

### REQ-RULE-PAYROLL-008: Prevent duplicate ordinary payroll coverage

An employee may belong to at most one non-cancelled ordinary payroll run for the same organization, pay schedule, and exact period.

- Draft creation, employee selection, calculation, and posting recheck this uniqueness transactionally.
- A reversal or adjustment is exempt only when it links the original run and represents a correction delta rather than a second ordinary payment.

### REQ-RULE-PAYROLL-009: Consume approved time at most once

Each approved timelog may contribute to at most one ordinary payroll employee line and at most one customer-billing line; retry returns the prior import result, while reopening first requires reversal of every downstream consumption.

### REQ-RULE-PAYROLL-010: Correct posted and paid payroll without stranding cash

- Reversing an unpaid posted run creates source-linked reversals of payroll expense, tax and benefit liabilities, and payroll payable.
- A paid run cannot reverse until its source payment is reversed or an employee recovery or refund settlement is linked atomically, restoring payroll payable, cash, and bank-match state consistently.
- Published payslips remain immutable and visible as superseded while a corrected payslip links the reversal or adjustment.
- Reversal, payment correction, and adjustment retries use idempotency and transaction uniqueness so concurrent commands cannot settle or reverse the same effect twice.

## REQ-RULE-BUDGET: Budget Rules

For Budget, approval activates one version. Active content changes through a new version.

Together, commitments stay distinct from actual postings. Organization policy selects warning or hard block.

### REQ-RULE-BUDGET-001: An active budget cannot be edited directly

An active budget cannot be edited directly.

### REQ-RULE-BUDGET-002: Creates a new linked version with reason and approval history

A revision creates a new linked version with reason and approval history.

### REQ-RULE-BUDGET-003: Purchase requests, purchase orders, vendor bills, payroll runs, manual journals

Purchase requests, purchase orders, vendor bills, payroll runs, manual journals, and production orders may consume budget.

### REQ-RULE-BUDGET-004: Commitment and posted actual amounts are tracked separately

Commitment and posted actual amounts are tracked separately.

### REQ-RULE-BUDGET-005: Refuses the transaction according to organization policy

A budget check either warns or refuses the transaction according to organization policy.

## REQ-RULE-ASSET: Fixed Asset Rules

For Fixed Asset, material capitalization requires approval. Depreciation follows fiscal period and asset parameters.

Together, transfer affects custody, not acquisition value. Impairment and disposal use posted immutable events.

### REQ-RULE-ASSET-001: Capitalization above the organization threshold requires approval

Capitalization above the organization threshold requires approval.

### REQ-RULE-ASSET-002: Uses the asset's method, useful life, residual value

Depreciation uses the asset's method, useful life, residual value, and fiscal-period schedule.

### REQ-RULE-ASSET-003: An asset transfer cannot change acquisition cost

An asset transfer cannot change acquisition cost.

### REQ-RULE-ASSET-004: Posts impairment loss

Impairment reduces carrying value and posts impairment loss.

### REQ-RULE-ASSET-005: Calculates gain or loss from proceeds and carrying value and posts the result

Disposal calculates gain or loss from proceeds and carrying value and posts the result.

### REQ-RULE-ASSET-006: Posted depreciation, impairment, and disposal records cannot be edited

Posted depreciation, impairment, and disposal records cannot be edited.

### REQ-RULE-ASSET-007: Calculate each supported depreciation method deterministically

- Under a full-period convention, straight-line depreciation is `(acquisition cost - residual value) / useful-life periods`; under an actual-day convention, annual straight-line depreciation is multiplied by eligible days divided by the stored calendar-year day count.
- Declining-balance period depreciation is opening carrying value multiplied by the asset's stored annual rate and eligible day fraction.
- Units-of-production depreciation is depreciable basis multiplied by verified period units divided by stored estimated lifetime units.
- Manual depreciation requires amount, reason, and approval; every method carries rounding residual forward and clamps the final eligible period so accumulated depreciation equals the depreciable basis without carrying value below residual value.

### REQ-RULE-ASSET-008: Apply service dates and later events without rewriting posted rows

The stored placed-in-service business date and organization convention determine the first eligible day or full month; disposal or retirement stops eligibility on its effective business date. Impairment, useful-life revision, or residual-value revision recalculates only unposted future rows from the new carrying value and retained remaining life.

### REQ-RULE-ASSET-009: Account for retirement and disposal completely

Before retirement or disposal, eligible depreciation through the event date is posted or explicitly waived through approval. The event removes asset cost and accumulated depreciation, records proceeds when any, and posts the difference between proceeds and carrying value as gain or loss; retirement without proceeds recognizes the remaining carrying value as loss.

### REQ-RULE-ASSET-010: Post each ordinary depreciation row at most once

Concurrent depreciation runs cannot claim the same asset-period schedule row. Row claim, depreciation expense, accumulated depreciation, schedule status, and journal link commit atomically under a database uniqueness constraint; only a linked reversal or adjustment may correct the posted row.

## REQ-RULE-BOM: BOM Version Rules

An active bill of materials is changed by adding a version, not by rewriting the component design already used by production. Each production order retains the exact version selected for its finished item. Historical drafted, inactive, and superseded versions remain visible, while only an active matching version is eligible for a new order.

### REQ-RULE-BOM-001: Version an active BOM change

Changing an active BOM creates a new version and preserves the prior version.

- The prior BOM version keeps its component quantities, scrap factors, units, issue warehouses, required operations, and status.
- The replacement BOM receives a distinct version identity and may progress independently.

### REQ-RULE-BOM-002: Retain the production order's BOM version

A production order retains the exact BOM version selected at creation.

- Component reservation, consumption, cost, and variance continue to use the version captured when the production order was created.
- Later BOM activation or supersession does not rewrite an existing order.

### REQ-RULE-BOM-003: New production may select only an active BOM valid for the finished item

New production may select only an active BOM valid for the finished item.

- BOM eligibility is evaluated for the order's finished item at selection time.
- Drafted, inactive, or superseded BOM versions remain visible as history but cannot be chosen for a new order.

### REQ-RULE-BOM-004: Refuse recursive active BOM graphs

BOM activation expands every active component BOM transitively and is refused when the finished item reaches itself, any component cycle exists, or an effective child version is missing; the refusal identifies the cycle path and activates no version.
## REQ-RULE-PRODUCTION: Production Order Rules

For Production Order, release reserves eligible components. Consumption and output use immutable movements.

Together, cost distinguishes planned and actual categories. Closure waits for complete operational, quality, and financial evidence.

### REQ-RULE-PRODUCTION-001: Release cannot reserve quarantined stock or unavailable serials

Release cannot reserve quarantined stock or exceed available components unless negative stock is allowed for the non-serial item; serial-tracked components always require the exact available units under REQ-RULE-SERIAL-003.

### REQ-RULE-PRODUCTION-002: Records component consumption through source-linked movements

Starting or continuing production records component consumption through source-linked movements.

### REQ-RULE-PRODUCTION-003: Records finished output through source-linked movements

Completion records finished output through source-linked movements.

### REQ-RULE-PRODUCTION-004: Production Order material

Actual cost separately retains material, labor, machine, and overhead amounts plus variance.

### REQ-RULE-PRODUCTION-005: Production closure is refused while component consumption, labor reporting, output receipt, quality inspection, or cost posting remains unresolved

Production closure is refused while component consumption, labor reporting, output receipt, quality inspection, or cost posting remains unresolved.

### REQ-RULE-PRODUCTION-006: Posts manufacturing variance

Closing posts manufacturing variance.

### REQ-RULE-PRODUCTION-007: Cancellation releases unused reservations and requires posted-effect resolution

Cancellation atomically releases every unconsumed active reservation and retains its history. It is refused while any posted consumption, output, scrap, labor, quality, WIP, or cost effect lacks an explicit reversal, return, scrap, or variance-settlement chain.

### REQ-RULE-PRODUCTION-008: Bound finished output and scrap

Cumulative accepted finished output plus recorded scrap cannot exceed planned quantity plus a configured approved overproduction tolerance. Good output, quarantined output, rework, and scrap use distinct movements, and only accepted good output increases available finished stock.

### REQ-RULE-PRODUCTION-009: Carry actual production cost through WIP

Actual WIP consists of source-linked component movement cost plus approved labor, machine, and overhead entries, less cost already capitalized to accepted output or recognized as scrap or loss.

- Each output event capitalizes only eligible accumulated cost not previously allocated and stores its material, labor, machine, overhead, quantity, and allocation basis.
- Partial completion leaves the unallocated balance in WIP; closure requires WIP to be zero after final output, scrap or loss, and manufacturing-variance postings.

### REQ-RULE-PRODUCTION-010: Bridge production movements and WIP to the general ledger

- Component consumption debits WIP and credits raw inventory at the source movement cost.
- Approved labor, machine, and overhead debit WIP and credit their configured payable, clearing, or absorption accounts.
- Accepted output debits finished inventory and credits WIP at its allocated actual cost.
- Scrap, loss, and final manufacturing variance clear residual WIP through configured accounts, and closure reconciles raw inventory, finished inventory, and WIP subledgers to their general-ledger controls.
- Each stock, cost, and journal effect is source-linked and commits atomically with the production event.

## REQ-RULE-QUALITY: Quality Rules

For Quality Disposition, failed inspection can create a hold on identified stock. Held stock is excluded from every consumption and availability path.

Together, disposition values are the closed set accept, reject, rework, return, scrap, and use-as-is. Material decisions require approval and approved results stay immutable.

### REQ-RULE-QUALITY-001: Quarantined stock cannot be allocated, shipped, consumed, or counted as available

Quarantined stock cannot be allocated, shipped, consumed, or counted as available.

### REQ-RULE-QUALITY-002: Must be accept, reject, rework, return to vendor, scrap, or use as is

A disposition decision must be accept, reject, rework, return to vendor, scrap, or use as is.

### REQ-RULE-QUALITY-003: A disposition above the configured threshold requires approval

A disposition above the configured threshold requires approval.

### REQ-RULE-QUALITY-004: An approved quality result cannot be edited

An approved quality result cannot be edited.

### REQ-RULE-QUALITY-005: Quality Disposition inspection

Return, scrap, rework, or release retains inspection, quarantine, disposition, and stock-movement links.

## REQ-RULE-MAINTENANCE: Maintenance Rules

For Maintenance Work Order, part use always creates stock evidence. Labor cost can create a cost-center posting.

Together, completion synchronizes equipment and plan state. Critical downtime can refuse dependent production scheduling.

### REQ-RULE-MAINTENANCE-001: Creates source-linked stock movements

Maintenance parts consumption creates source-linked stock movements.

### REQ-RULE-MAINTENANCE-002: Eligible maintenance labor may post cost-center expense

Eligible maintenance labor may post cost-center expense.

### REQ-RULE-MAINTENANCE-003: Updates equipment status and maintenance-plan next due date

Completion updates equipment status and maintenance-plan next due date.

### REQ-RULE-MAINTENANCE-004: Production scheduling is refused when it depends on critical equipment currently in downtime

Production scheduling is refused when it depends on critical equipment currently in downtime.

## REQ-RULE-SERVICE: Service Rules

For Service Order, parts always create stock movements. Warranty and billing decisions are explicit and mutually consistent.

Together, billable work creates sales receivable; non-billable warranty work creates expense. Completion keeps case and serial traceability.

### REQ-RULE-SERVICE-001: Creates source-linked stock movements

Service parts consumption creates source-linked stock movements.

### REQ-RULE-SERVICE-002: Service labor is either billed or posted as warranty expense

Service labor is either billed or posted as warranty expense.

### REQ-RULE-SERVICE-003: A non-billable warranty decision cannot also create a customer charge for the same work

A non-billable warranty decision cannot also create a customer charge for the same work.

### REQ-RULE-SERVICE-004: Creates a source-linked sales invoice

Billable service creates a source-linked sales invoice.

### REQ-RULE-SERVICE-005: Service Order customer

Service completion retains customer, case, item, serial, parts, labor, warranty, billing, and resolution relationships.

## REQ-RULE-APPROVAL: Approval Workflow Rules

For Approval Request, one effective workflow version is selected by priority and conditions. Each current step resolves eligible approvers and required count.

Together, documents stay locked while active approval exists. Every action and assignment change stays immutable.

### REQ-RULE-APPROVAL-001: Selects the highest-priority active workflow whose target and conditions match the document

Approval routing selects the highest-priority active workflow whose target and conditions match the document.

### REQ-RULE-APPROVAL-002: Only a resolved current-step approver may approve, reject, request changes, or delegate

Only a resolved current-step approver may approve, reject, request changes, or delegate.

### REQ-RULE-APPROVAL-003: The same person cannot count more than once toward one step's required approvals

The same person cannot count more than once toward one step's required approvals.

### REQ-RULE-APPROVAL-004: A document under active approval cannot have business fields edited

A document under active approval cannot have business fields edited.

### REQ-RULE-APPROVAL-005: Delegation cannot create a loop and remains recorded in history

Delegation cannot create a loop and remains recorded in history.

### REQ-RULE-APPROVAL-006: An overdue step escalates to its configured fallback approver

An overdue step escalates to its configured fallback approver.

### REQ-RULE-APPROVAL-007: Approval history is immutable

Approval history is immutable.

### REQ-RULE-APPROVAL-008: Snapshot and exclude every conflicted approval principal

The requester and last business-field editor of every vendor-bank, customer-credit, payroll, manual-journal, fiscal-reopen, asset-disposal, stock-adjustment, or role-change request cannot contribute an approval to that request.

- A payroll request additionally excludes every employee whose compensation is included; a role-change request additionally excludes the target member.
- Request creation snapshots each ineligible user identity and its cause, and delegation, escalation, later document edits, or role changes never reinterpret that snapshot or restore an ineligible person's vote.

### REQ-RULE-APPROVAL-009: Refuse an approval path that has no independent approver

If separation exclusions leave any required step without its required count of eligible approvers, submission is refused with the deficient step and required count, no approval request becomes active, and the source document remains unlocked and unchanged.

## REQ-RULE-AUDIT: Audit and Notification Rules

For Audit Event, audit evidence is immutable and organization-scoped. Sensitive classes have mandatory event emission.

Together, deactivation never severs historical attribution. High-risk events trigger mandatory recipients.

### REQ-RULE-AUDIT-001: Every audit event records organization, actor, action, target and identity, before and after values, reason, IP address, user agent, timestamp, and risk level

Every audit event records organization, actor, action, target and identity, before and after values, reason, IP address, user agent, timestamp, and risk level.

### REQ-RULE-AUDIT-002: Audit events cannot be changed or deleted through ordinary product operations

Audit events cannot be changed or deleted through ordinary product operations.

### REQ-RULE-AUDIT-003: Audit history remains readable after referenced users, vendors, customers, items, or accounts are deactivated

Audit history remains readable after referenced users, vendors, customers, items, or accounts are deactivated.

### REQ-RULE-AUDIT-004: Emit events for every sensitive action

Audit emission is mandatory for authentication and credential changes; invitation, membership, role, position, and organization changes; approval, delegation, and escalation; vendor bank and customer credit changes; document posting, payment, reversal, void, return, credit, settlement, and reconciliation; payroll calculation, posting, payment, and payslip access; period close and reopen; stock allocation, movement, count, adjustment, quarantine, and disposition; asset capitalization, depreciation, impairment, transfer, and disposal; production and quality completion; sensitive-field reads; attachment access; and bulk report export.

### REQ-RULE-AUDIT-005: A high-risk event must notify organization Owners and relevant managers regardless of ordinary notification preferences

A high-risk event must notify organization Owners and relevant managers regardless of ordinary notification preferences.

## REQ-RULE-REPORT: Report Rules

For Cross-Module Reporting, every report and export uses currently selected organization and role scope. Named dimensions apply where meaningful to the report.

Together, financial and inventory views exclude editable drafts. Exports and hard-close reports reproduce their source result.

### REQ-RULE-REPORT-001: Reports and exports return only data visible in the active organization and caller authority

Reports and exports return only data visible in the active organization and caller authority.

### REQ-RULE-REPORT-002: Applicable filters are fiscal period, date range, department, project, cost center, warehouse, customer, vendor, item, account, employee, currency, and document status

Applicable filters are fiscal period, date range, department, project, cost center, warehouse, customer, vendor, item, account, employee, currency, and document status.

### REQ-RULE-REPORT-003: Reports use posted journal entries rather than editable drafts

Financial reports use posted journal entries rather than editable drafts.

### REQ-RULE-REPORT-004: Reports use immutable stock movements rather than editable drafts

Inventory reports use immutable stock movements rather than editable drafts.

### REQ-RULE-REPORT-005: Must preserve the selected report, filters, organization, currency

An export must preserve the selected report, filters, organization, currency, and result.

### REQ-RULE-REPORT-006: Must reproduce the applicable closing snapshot

A hard-closed-period report must reproduce the applicable closing snapshot.

## REQ-RULE-CONCURRENCY: Concurrent Command Rules

For Concurrent Business Command, commands make decisions against a known current business version. A conflicting later command receives refusal instead of silently overwriting accepted work.

Together, remainders, stock, document numbers, and lifecycle states are protected together. Retry reads the current state before proposing a new valid action.

### REQ-RULE-CONCURRENCY-001: A state-changing command is refused when the target changed after the caller read the version used for its decision

A state-changing command is refused when the target changed after the caller read the version used for its decision.

### REQ-RULE-CONCURRENCY-002: Concurrent source-quantity conversions cannot together exceed remaining quantity

Concurrent source-quantity conversions cannot together exceed remaining quantity.

### REQ-RULE-CONCURRENCY-003: Concurrent stock allocations cannot together exceed eligible availability

Concurrent stock allocations cannot together exceed eligible availability.

### REQ-RULE-CONCURRENCY-004: Concurrent document creation cannot issue the same organization-and-type number

Concurrent document creation cannot issue the same organization-and-type number.

### REQ-RULE-CONCURRENCY-005: Posting, payment, approval, close, and reversal commands cannot apply the same terminal effect twice

Posting, payment, approval, close, and reversal commands cannot apply the same terminal effect twice.

### REQ-RULE-CONCURRENCY-006: Return authorized current state after conflict

A conflict response returns the current aggregate revision, lifecycle status, changed-at instant, applicable remainder or availability, and safe refusal code visible to the caller, so a new command can be based on that exact state.

### REQ-RULE-CONCURRENCY-007: Require an expected aggregate revision

Every state-changing command supplies the positive integer revision returned by the target aggregate's latest authorized detail, and each accepted change advances that revision exactly once.

- A stale revision is refused without applying any source, downstream, audit, numbering, balance, quantity, or status effect.
- Concurrent commands against one revision admit at most one non-commuting success; the loser receives the authorized current revision and state.

### REQ-RULE-CONCURRENCY-008: Make retried terminal commands idempotent

Posting, approval, payment, payroll, close, reversal, shipment, stock movement, depreciation, production completion, and automated jobs require an idempotency identity scoped to organization and operation.

- Replaying the same identity with the same canonical payload returns the original completed result without another business effect.
- Reusing the identity with a different payload is refused and does not alter the original result.

### REQ-RULE-CONCURRENCY-009: Protect balances and remainders in the committing transaction

The committing transaction rechecks source remainder, settlement balance, stock availability, budget availability, document-number uniqueness, approval eligibility, period eligibility, and lifecycle state together with all resulting effects.

- A failed recheck leaves every protected value and downstream record unchanged.
- Database constraints and transaction isolation back the application decision so parallel workers cannot both commit an over-conversion, over-settlement, over-allocation, duplicate number, or duplicate terminal effect.
## REQ-RULE-EMPLOYEE: Employee Identity and Visibility Rules

Employee placement connects a global user to one organization, but it does not replace the membership and scoped roles that authorize work. Placement carries the employee's department, position, manager, and cost center. Personal employment and payroll details use a narrower need-to-know boundary than ordinary directory information, while deactivation or termination leaves attributed work and financial history intact.

### REQ-RULE-EMPLOYEE-001: Separate employee placement from membership authority

An employee links one user and one organization while membership authority remains separately evaluated.

- The employee record carries organizational placement—role, department, position, manager, and cost center—without becoming the source of organization permissions.
- Membership state and scoped-role assignments continue to decide whether the linked user may act in the organization.

### REQ-RULE-EMPLOYEE-002: Limit employee and payroll information visibility

Employee and payroll information is visible only to the subject employee, HR or payroll users performing administration, Finance users limited to payroll-accounting fields, and scoped managers limited to employees inside their recorded responsibility scope.

- The employee can view their own employment and payroll details; HR and payroll users may view the details needed for administration, Finance users may view payroll-accounting details, and a scoped manager may view only employees inside that responsibility scope.
- Deactivation or termination does not erase payroll, time, document, approval, or audit attribution.

## REQ-RULE-CONTRACT: Employment Contract Rules

An employment contract defines one employee's terms for an effective interval. At most one interval is active: activating a replacement closes the prior interval on the preceding day. Expired terms remain immutable evidence for payroll and employment history instead of being overwritten.

### REQ-RULE-CONTRACT-001: Keep one active employment contract

An employee may have only one active employment contract at a time.

- The active-contract constraint is evaluated per employee, so historical contracts remain alongside the single active interval.

### REQ-RULE-CONTRACT-002: End the prior contract before replacement

Activating a new contract ends the previous active contract the day before the new start.

- The prior active contract receives an end date exactly one calendar day before the replacement contract's start date.
- The replacement does not rewrite the prior contract's other terms.

### REQ-RULE-CONTRACT-003: Keep past contracts immutable

Past employment contracts cannot be edited.

- Past salary, employment terms, and effective dates remain available as payroll and employment evidence.
- A correction to current terms is represented by a new effective contract rather than editing a past one.

## REQ-RULE-PROJECT: Project Time Eligibility Rules

Project membership supplies an employee's authority to record time and must cover the work date. A project may retain tasks, membership, budgets, and historical time after completion or archival, but those terminal working states no longer accept new timelogs. Task hierarchy and transition evidence are governed independently below.

### REQ-RULE-PROJECT-001: Require an active dated project assignment

An employee may log time only while assigned to the project for the work date.

- The project-member assignment must include the employee and cover the timelog's work date.
- The assignment's project role and allocation remain available with the resulting timelog.

### REQ-RULE-PROJECT-002: Refuse time on archived or completed projects

Archived or completed projects refuse new timelogs.

- Existing timelogs, membership, tasks, and project history remain visible after archival or completion.
- The refusal applies to creation of new timelogs, not to reading retained history.

## REQ-RULE-TASK: Task Structure and History Rules

Every task belongs to one project and may use a single child level for work breakdown. State changes append who moved the task, when, and the prior and next states; later edits do not replace that evidence. The containing project's state separately determines whether time can still be entered.

### REQ-RULE-TASK-001: Limit task nesting to one subtask level

A task may have one level of subtasks and a subtask cannot have children.

- A top-level task may own subtasks, but a subtask cannot itself become a parent.
- Every task and subtask remains owned by the same project.

### REQ-RULE-TASK-002: Preserve immutable task status history

Every task status change records an immutable prior-state, next-state, actor, and time entry.

- Each transition entry records the prior state, next state, actor, and timestamp.
- Later task changes append history instead of replacing earlier transition evidence.

## REQ-RULE-TIMELOG: Timelog Authority and Lock Rules

Before approval, an employee controls only their own time entries, while a time manager has scoped correction authority over another employee's unlocked entry. Timesheet approval locks all included timelogs and preserves their payroll and billing evidence. Reopening the sheet is the explicit route back to correction.

### REQ-RULE-TIMELOG-001: Limit employee edits to owned unlocked timelogs

An Employee may edit only their own unlocked timelogs.

- Ownership is evaluated from the employee attached to the active organization membership.
- Approval lock state is checked before any change is retained.

### REQ-RULE-TIMELOG-002: Limit time-manager edits to unlocked timelogs

A time manager may edit another employee's timelog only while it is unlocked.

- A time manager's scoped authority is evaluated for the affected employee and project.
- The manager cannot bypass an approval lock.

### REQ-RULE-TIMELOG-003: Lock timelogs when a timesheet is approved

An approved timesheet locks every included timelog against all ordinary edits.

- Approval changes every included timelog's lock state while preserving its date, duration, project, task, rates, billable flag, and description.
- A later timesheet reopening is the explicit recovery path before ordinary timelog correction.

## REQ-RULE-TIMESHEET: Timesheet Submission and Use Rules

A timesheet is the weekly submission unit for one employee and organization. It must contain time and it cannot compete with another submitted or approved sheet for that employee-week. Rejection leaves an explained history; approval both locks the entries and qualifies eligible time for payroll or customer billing.

### REQ-RULE-TIMESHEET-001: Refuse empty timesheet submission

An empty timesheet cannot be submitted.

- Submission requires at least one timelog in the employee's organization week.
- The sheet remains drafted when submission is refused.

### REQ-RULE-TIMESHEET-002: Keep one submitted or approved timesheet per employee-week

One employee and week cannot have more than one submitted or approved timesheet.

- The uniqueness boundary includes both submitted and approved states for the same employee and week.
- Draft, rejected, or reopened sheets do not create a second submitted-or-approved record.

### REQ-RULE-TIMESHEET-003: Require a timesheet rejection reason

Timesheet rejection requires a reason.

- The reason is retained in the immutable approval history with the rejecting actor and time.

### REQ-RULE-TIMESHEET-004: Use only approved timesheets downstream

Only approved timesheets may feed payroll or customer billing.

- Approved hourly time can be imported into payroll and approved billable time can be selected for customer billing.
- Drafted, submitted, rejected, or reopened time remains ineligible for those downstream uses.
## REQ-RULE-CREDIT-MEMO: Credit Memo Rules

A credit memo retains why value was granted: a return, discount, invoice correction, or customer credit. Applying it is bounded by both the memo's unapplied amount and the invoice's open balance; refunding is a separate settlement. Customer overpayment remains identifiable credit until one of those explicit outcomes occurs.

### REQ-RULE-CREDIT-MEMO-001: Restrict credit memo reasons

A credit memo reason must be return, discount, invoice correction, or customer credit.

- The retained reason is exactly return, discount, invoice correction, or customer credit.
- The memo keeps the related return or invoice reference when that reason has a source document.

### REQ-RULE-CREDIT-MEMO-002: Bound credit applications by both balances

A credit application cannot exceed the credit or invoice remaining balance.

- An application is limited to the lesser of unapplied credit and the target invoice's open balance.
- A refused application leaves both balances unchanged and available for another settlement.

### REQ-RULE-CREDIT-MEMO-003: Retain customer overpayments as credit

An overpayment remains customer credit until applied or refunded.

- The credit remains associated with the customer and organization until an explicit invoice application or refund.
- Recording the overpayment does not silently increase an unrelated invoice settlement.
## REQ-RULE-TRANSFER: Warehouse Transfer Rules

A warehouse transfer separates shipment from receipt. Shipment is bounded by the unshipped request and source availability, while receipt is bounded by what is in transit. The outbound and inbound movements share one transfer reference so partial movement and reconciliation remain visible; cycle-count rules do not govern this journey.

### REQ-RULE-TRANSFER-001: Bound transfer shipment quantity

Transfer shipment cannot exceed requested or available source quantity.

- Shipped quantity is limited by the transfer line's unshipped request and the source location's available stock.
- A partial shipment leaves the balance open for a later shipment or cancellation.

### REQ-RULE-TRANSFER-002: Bound transfer receipt quantity

Transfer receipt cannot exceed the quantity shipped and not yet received.

- Received quantity is limited by the transfer line's shipped quantity less prior receipts.
- A partial receipt preserves in-transit quantity under the same transfer.

### REQ-RULE-TRANSFER-003: Pair transfer outbound and inbound movements

Shipping creates outbound movement and receipt creates inbound movement with the same transfer source.

- Shipment posts a source-warehouse outbound movement and receipt posts a destination-warehouse inbound movement.
- Both movements reference the same transfer and item so in-transit reconciliation remains possible.

### REQ-RULE-TRANSFER-004: Preserve transfer value without gain or loss

The outbound movement carries the source lot or serial and inventory unit cost into in-transit value; each destination receipt uses that same per-unit cost, and partial receipts plus remaining in-transit value must equal the shipped quantity and value.

### REQ-RULE-TRANSFER-005: Never cancel unresolved in-transit stock

Cancellation affects only draft or unshipped remainder. Shipped quantity must be received at the destination or returned to the source through approved paired movements before close, and neither route strands quantity or value in transit.
## REQ-RULE-CYCLE-COUNT: Cycle Count and Adjustment Rules

A cycle count compares observed quantity with a fixed expected snapshot, but observation alone does not alter stock. Approval makes its variance eligible for an adjustment movement. The organization's materiality threshold routes large count or standalone adjustments for approval before posting.

### REQ-RULE-CYCLE-COUNT-001: Post only approved count variance

A cycle count adjustment may post only after count approval.

- The approved difference between the fixed expected snapshot and counted quantity determines the adjustment movement.
- Drafted, performed, submitted, or rejected counts do not change stock.

### REQ-RULE-CYCLE-COUNT-002: A standalone or count adjustment above the configured threshold requires approval

A standalone or count adjustment above the configured threshold requires approval.

- The organization's adjustment threshold is evaluated before posting.
- A material variance remains pending until the required approval completes.

### REQ-RULE-CYCLE-COUNT-003: Roll forward movement after the count cutoff

Each count scope retains the immutable movement sequence or instant used for its expected snapshot. Posting recomputes expected quantity by applying every normal source movement after that cutoff and serializes the adjustment against concurrent movement, so normal receipt, shipment, transfer, production, or disposition is never mistaken for count variance.

### REQ-RULE-CYCLE-COUNT-004: Separate quantity adjustment from cost revaluation

A quantity adjustment carries a nonzero quantity delta at the current organization-item pool cost and posts the matching inventory gain or loss journal. A cost-only revaluation carries zero quantity plus a nonzero value delta, requires positive on-hand, updates pool value and average, and posts a balanced configured revaluation journal.

- One adjustment cannot combine quantity and cost deltas; correction uses an immutable source-linked reversal and the appropriate new adjustment.
- Materiality approval, idempotency, and concurrent commit checks apply to both shapes.

## REQ-RULE-ITEM: Item Stock-Effect Rules

Item type controls the physical-stock boundary. Inventory items participate in tracking and movement-derived quantity, while services remain commercial and accounting lines without warehouse movements. Deactivation does not rewrite the type or effects retained on historical documents.

### REQ-RULE-ITEM-001: Inventory items require stock tracking

Inventory items require stock tracking.

- Tracking mode, warehouse quantity, and movement history apply to item types that represent physical inventory.
- The requirement survives deactivation so historical movements remain attributable.

### REQ-RULE-ITEM-002: Prevent service-item stock movements

Service items cannot create stock movements.

- A service line can carry prices, tax, revenue, expense, time, or billing meaning without a warehouse quantity delta.
- A mixed document posts movements only for its stock-tracked lines.
## REQ-RULE-LOT: Inventory Lot Rules

A lot identifies a quantity of one item from receipt through shipment and later operational movement. Lot-tracked entry and exit must name that identity, allowing returns, production, quality, maintenance, and service history to follow the same material.

### REQ-RULE-LOT-001: Require lot identity at receipt and shipment

Lot-tracked receipts and shipments require lot identity.

- Receipt establishes the exact lot receiving quantity and shipment selects the exact lot leaving quantity.
- Returns, quality holds, production, maintenance, and service movements retain that lot identity after entry.

### REQ-RULE-LOT-002: Keep lot codes unique per organization and item

Organization, item, and lot code identify at most one lot. Concurrent receipt either appends its source movement to that existing lot or atomically refuses a conflicting identity; it never creates a second lot with the same key.

## REQ-RULE-SERIAL: Item Serial Rules

A serial identifies one physical unit of an item. Each serial-tracked movement accounts for units one by one, and the code cannot be reused for the same item. That identity follows the unit through receipt, shipment, return, quality, asset, and service activity.

### REQ-RULE-SERIAL-001: Require one serial per moved unit

Serial-tracked movements require one serial per unit.

- Each serial-tracked movement line identifies exactly one unit, so a multi-unit operation provides one serial identity per unit.
- The same serial follows receipt, shipment, return, quality, asset, and service history.

### REQ-RULE-SERIAL-002: Keep serial codes unique per item

A serial code is unique per item.

- Uniqueness is evaluated for the serial code within its item and organization.
- A duplicate serial for the same item is refused before a stock movement is posted.

### REQ-RULE-SERIAL-003: Preserve one current serial context and forbid negative serial stock

A serial-tracked item is never eligible for negative stock. An authorized purchase receipt or production output may atomically create a previously unused organization-item-serial code and set its first receipt or output context; a duplicate genesis insert is refused.

- Every later outbound, consumption, transfer, quarantine, release, return, or inbound transition atomically claims that known serial from its exact current source context and moves it to exactly one next context.
- Retry is idempotent for the same source, while concurrent or different-source creation or claims of the same serial admit exactly one result.
- Unknown serial use outside genesis, or unavailable, already-claimed, or context-mismatched use, is refused without a movement or downstream posting.

## REQ-RULE-TAX-CODE: Tax Code Calculation Rules

Tax treatment is resolved from the party location, item taxability, transaction date, jurisdiction, and effective code rate. Sales invoices calculate output tax and vendor bills calculate input tax. The code and direction select the payable or receivable account retained on the source-linked journal line.

### REQ-RULE-TAX-CODE-001: Resolve transaction tax from effective facts

Sales-invoice output tax and vendor-bill input tax use party location, item taxability, transaction date, jurisdiction, and tax code to select the rate.

- Output tax applies to sales-invoice lines and input tax applies to vendor-bill lines.
- Rate selection uses party location, item taxability, transaction date, jurisdiction, and code effective history.

### REQ-RULE-TAX-CODE-002: Post tax through the code's ledger account

Tax amounts post to the tax payable or receivable account configured by the code.

- The posted tax amount uses the payable or receivable ledger account selected for that code and tax direction.
- The journal line retains the tax code and source document needed for reconciliation.
## REQ-RULE-ROUTING: Routing Version Rules

An active routing is changed by adding a version, leaving the operation sequence already referenced by production intact. Each production order retains its selected routing for labor, machine, and cost evidence. Historical versions remain inspectable, but a new order may select only an active routing for its finished item.

### REQ-RULE-ROUTING-001: Version an active routing change

Changing an active routing creates a new version and preserves the prior version.

- The prior routing keeps its operation sequence, work centers, setup and run times, labor grade, machine, rate, and instructions.
- The replacement routing receives a distinct version identity and may progress independently.

### REQ-RULE-ROUTING-002: Retain the production order's routing version

A production order retains the exact routing version selected at creation.

- Labor, machine, operation progress, and cost continue to use the version captured when the production order was created.
- Later routing activation or supersession does not rewrite an existing order.

### REQ-RULE-ROUTING-003: New production may select only an active routing valid for the finished item

New production may select only an active routing valid for the finished item.

- Routing eligibility is evaluated for the order's finished item at selection time.
- Drafted, inactive, or superseded routing versions remain visible as history but cannot be chosen for a new order.
