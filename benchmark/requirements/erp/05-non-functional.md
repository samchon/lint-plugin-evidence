# Product-Visible Quality and Delivery Outcomes

Organizations can rely on private tenant boundaries, consistent cross-module outcomes, immutable and correctable history, reproducible reporting, attributable automation, and a complete working full-stack ERP across every requirement group in this corpus.

## REQ-NFR-TENANT: Tenant Privacy and Authority

For Tenant Isolation, a person sees and changes only information permitted by an currently selected organization membership and its role union. Reports, exports, approvals, audit history, notifications, and automated work receive the same isolation as interactive records.

Together, sensitive personal, payroll, banking, tax, and commercial values stay limited to roles that need them. Membership or role loss takes effect immediately for continued access.

### REQ-NFR-TENANT-001: Records and activity from users without explicit membership

Organizations can rely on complete isolation of their records and activity from users without explicit membership.

### REQ-NFR-TENANT-002: Users can rely on role and scoped-position checks being applied consistently to every read, command, approval, report, export, audit view, notification, and automated result

Users can rely on role and scoped-position checks being applied consistently to every read, command, approval, report, export, audit view, notification, and automated result.

### REQ-NFR-TENANT-003: Organizations can rely on immediate removal of access after membership suspension, revocation, role loss, or global account deactivation

Organizations can rely on immediate removal of access after membership suspension, revocation, role loss, or global account deactivation.

### REQ-NFR-TENANT-004: Users can rely on sensitive employee, payroll, bank, tax

Users can rely on sensitive employee, payroll, bank, tax, and party information being visible only within its specific authorized purpose.

## REQ-NFR-ATOMIC: Cross-Module Outcome Consistency

For Transactional Consistency, a source document and all of its accounting, stock, budget, status, and audit effects appear together. A failed step leaves the business in its prior coherent state instead of a partially posted state.

Together, concurrent commands protect remaining quantities, availability, numbering, and lifecycle decisions. Users receive a visible conflict and current state when work cannot safely complete.

### REQ-NFR-ATOMIC-001: Organizations can rely on multi-step financial, inventory, payroll, asset, manufacturing

Organizations can rely on multi-step financial, inventory, payroll, asset, manufacturing, and cross-module actions applying all inseparable effects or none.

### REQ-NFR-ATOMIC-002: Users can rely on quantities, balances, status, source links

Users can rely on quantities, balances, status, source links, and audit evidence agreeing after every successful command.

### REQ-NFR-ATOMIC-003: Updates refusing stale or duplicative effects instead of overwriting accepted work

Users can rely on concurrent updates refusing stale or duplicative effects instead of overwriting accepted work.

### REQ-NFR-ATOMIC-004: After a failed or conflicting action, authorized users can inspect the unchanged or current state and safely retry a valid command

After a failed or conflicting action, authorized users can inspect the unchanged or current state and safely retry a valid command.

## REQ-NFR-HISTORY: Immutable and Recoverable History

For Historical Integrity, posted finance, stock, payroll, asset, closing, filed-tax, approved-quality, reconciliation, approval, and audit evidence stays unchanged. Correction adds linked reversal, adjustment, return, credit, amendment, reopen, or replacement evidence.

Together, deactivation keeps attribution and source relationships. Readers can follow before, after, reason, actor, and downstream effects.

### REQ-NFR-HISTORY-001: Organizations can rely on posted and approved business evidence remaining immutable and attributable

Organizations can rely on posted and approved business evidence remaining immutable and attributable.

### REQ-NFR-HISTORY-002: Users can correct an error through a source-linked preserving path without erasing the original event

Users can correct an error through a source-linked preserving path without erasing the original event.

### REQ-NFR-HISTORY-003: Authorized readers can trace upstream, downstream, reversal, return, credit, amendment

Authorized readers can trace upstream, downstream, reversal, return, credit, amendment, and reclose relationships across the full business chain.

### REQ-NFR-HISTORY-004: Historical reports and audit views remain understandable after related users, parties, items, accounts, or equipment are deactivated

Historical reports and audit views remain understandable after related users, parties, items, accounts, or equipment are deactivated.

## REQ-NFR-REPORT: Reproducible and Reconciled Reporting

For Reporting Integrity, financial results derive from posted accounting and inventory results from immutable movements. Tax results reconcile to postings and their source documents.

Together, hard-close reports reproduce frozen snapshots for the selected close cycle. Exports keep the same scope, filters, currency, and result.

### REQ-NFR-REPORT-001: Reports reconciling to their authoritative posted business records

Organizations can rely on financial, inventory, and tax reports reconciling to their authoritative posted business records.

### REQ-NFR-REPORT-002: Reports from its closing snapshots

Users can reproduce a hard-closed period's named reports from its closing snapshots.

### REQ-NFR-REPORT-003: Users can rely on a report export matching the authorized on-screen result for the same filters and organization

Users can rely on a report export matching the authorized on-screen result for the same filters and organization.

### REQ-NFR-REPORT-004: Users can trace a reported balance or quantity back to its source postings and operational documents

Users can trace a reported balance or quantity back to its source postings and operational documents.

## REQ-NFR-AUTOMATION: Attributable Operational Automation

For System Automation, each organization owns a distinct System principal for scheduled work. Depreciation, MRP, rate refresh, numbering, reminders, and dispatch operate inside one tenant context.

Together, automated work obeys the same period, approval, availability, immutability, and audit rules as human work. Failures stay visible and retryable while not duplicating completed business effects.

### REQ-NFR-AUTOMATION-001: Organizations can rely on scheduled depreciation, MRP, exchange-rate refresh, numbering, reminders, and notification dispatch being attributed to their own System principal

Organizations can rely on scheduled depreciation, MRP, exchange-rate refresh, numbering, reminders, and notification dispatch being attributed to their own System principal.

### REQ-NFR-AUTOMATION-002: Automated work cannot cross organization boundaries or bypass the business rules that apply to Users

Automated work cannot cross organization boundaries or bypass the business rules that apply to Users.

### REQ-NFR-AUTOMATION-003: Authorized users can inspect the trigger, result, audit evidence

Authorized users can inspect the trigger, result, audit evidence, and failure state of automated work.

### REQ-NFR-AUTOMATION-004: Retrying failed automated work does not duplicate a completed posting, number, recommendation, reminder, or notification

Retrying failed automated work does not duplicate a completed posting, number, recommendation, reminder, or notification.

## REQ-NFR-SECURITY: Credential, Session, and Data Security

Security applies to every interactive, export, attachment, integration, and automated path. Product outcomes are transport- and framework-neutral: a conforming implementation must preserve confidentiality, integrity, tenant authority, revocation, and neutral refusal regardless of whether it carries credentials in cookies or authorization headers.

### REQ-NFR-SECURITY-001: Accept and protect strong passwords

- Every password has at least 15 Unicode code points.
- The input accepts at least 64 Unicode code points without silent truncation.
- Spaces are permitted.
- Password-manager paste and autofill are permitted.
- A password is rejected when its complete value appears in the product's common-or-compromised password blocklist.
- The product imposes no mandatory character-class mixture.
- The product imposes no periodic change without user request or evidence of compromise.
- Passwords are stored only as per-password salted, configurable-cost, memory-hard verifier outputs.
- Raw passwords never persist or enter application logs.

### REQ-NFR-SECURITY-002: Rate-limit neutral credential verification

Login, invitation, recovery, and second-factor verification return a neutral public failure for unknown identity, wrong secret, expired proof, superseded proof, replay, and ineligible account state.

- Rate limits apply per account and per originating client without exposing whether an account exists.
- A refused or throttled attempt creates no account, membership, session, active organization, or business-state change.

### REQ-NFR-SECURITY-003: Expire and revoke sessions predictably

Every session has a one-hour inactivity deadline and a 24-hour absolute deadline measured from issuance.

- A request is eligible only when its authenticated instant is strictly earlier than both deadlines; equality with either deadline is expired.
- Successful eligible activity sets inactivity expiry to `last eligible activity + 1 hour`, capped at the unchanged absolute deadline.
- Expiry, logout, password recovery, multi-factor reset, global deactivation, or membership loss revokes the affected authority immediately on the next request.

### REQ-NFR-SECURITY-004: Protect browser and network authority

- Production authentication and application traffic use authenticated encrypted transport.
- Downloads and uploads use authenticated encrypted transport.
- Browser credentials are never placed in a URL.
- Cross-origin requests cannot exercise session authority unless the origin is explicitly trusted.
- A state-changing browser request satisfies the selected session transport's forgery defense.
- Session, invitation, recovery, second-factor, and integration secrets have at least 128 bits of cryptographic entropy where they are not human-entered codes.
- A secret never appears in a response body except at its single defined issuance point.

### REQ-NFR-SECURITY-005: Validate files, exports, and untrusted input

- Every input is checked against its typed length, range, currency, date, identifier, organization, and lifecycle contract before persistence or side effects.
- Attachments enforce configured size limits.
- Attachments validate declared and detected content type against the allowed catalog.
- Attachment bytes use generated storage identities outside executable and public paths.
- Upload and download each recheck current target-record authority.
- CSV or spreadsheet exports encode formula-leading untrusted text as inert data.
- An export retains the same tenant, role, filter, and field-redaction scope as the on-screen report.

### REQ-NFR-SECURITY-006: Redact sensitive output and audit access

Passwords, session credentials, invitation and recovery proofs, second-factor secrets, recovery codes, bank account values, payroll values, and private attachment locations are absent from ordinary logs, URLs, errors, metrics, and traces.

- Authorized product views reveal only the fields required by the caller's purpose and record access to payroll, bank, tax-identity, credential-administration, and bulk-export surfaces as sensitive audit events.
- Refusals disclose no other-tenant record existence, secret verifier state, or inaccessible field value.

### REQ-NFR-SECURITY-007: Protect sensitive state at rest

MFA secrets, bank and payroll values, tax identities, private attachment bytes, and backup media are encrypted at rest using deployment-managed keys separated from the data store.

- Key identity and version are retained with ciphertext, rotation can rewrap or re-encrypt without exposing plaintext to ordinary logs or exports, and retiring a key is refused while required ciphertext remains unreadable without it.
- Password and recovery-code verifier material remains one-way; encryption never substitutes for the salted memory-hard or salted one-way storage required by the credential rules.

## REQ-NFR-TIME: Calendar, Clock, and Effective-Time Semantics

Business dates and instants have different meanings. Every stored instant is unambiguous, while fiscal, payroll, due-date, tax, inventory, and effective-version decisions use the organization timezone and calendar-date rules that owned the event.

### REQ-NFR-TIME-001: Store instants unambiguously

Creation, update, approval, posting, movement, audit, session, proof, dispatch, and automation times are stored as UTC instants and presented in the authorized user's chosen display timezone without changing order or identity.

### REQ-NFR-TIME-002: Evaluate business dates in the organization timezone

Fiscal periods, posting dates, due dates, work dates, pay periods, tax periods, effective rates, and effective versions are calendar dates evaluated in the owning organization's timezone rather than the server timezone.

### REQ-NFR-TIME-003: Resolve daylight-saving boundaries deterministically

Date-only business values never shift when displayed in another timezone, and a scheduled local time that is skipped or repeated by a timezone transition follows one documented earlier/later-offset policy recorded with the job result.

### REQ-NFR-TIME-004: Control time in boundary verification

Automated verification uses a controllable clock to test exact invitation, recovery, session, effective-date, fiscal-period, due-date, and schedule boundaries without waiting for wall-clock time.

### REQ-NFR-TIME-005: Version timezone-dependent business facts

An organization timezone change records an effective instant and affects only business facts created after that instant. Existing fiscal periods, due dates, pay periods, posting dates, effective versions, and scheduled-job occurrences retain the timezone and rule version used when they were created.

## REQ-NFR-PAGINATION: Bounded Collections and Stable Traversal

Every unbounded list, history, audit, notification, approval, report-detail, journal-line, stock-movement, attachment, comment, and search result is traversed through a deterministic bounded contract.

### REQ-NFR-PAGINATION-001: Bound every collection response

Collection requests use 1-based pages with default size 20 and maximum size 100. A size outside 1 through 100 is refused rather than coerced, a response never exceeds the accepted size, and a complete result is returned only when the matching result count itself fits that page.

### REQ-NFR-PAGINATION-002: Preserve deterministic order

Every collection defines a business sort direction and ends all ties with its stable opaque record ID in a declared direction, so identical dates, numbers, names, or amounts cannot make order ambiguous.

### REQ-NFR-PAGINATION-003: Traverse one stable scope completely

The first page fixes an opaque query-snapshot identity over the canonical authorized filter and sort scope with 15-minute inactivity and 24-hour absolute deadlines.

- Following the snapshot returns every record in that initial scope exactly once even when later writes occur.
- Each eligible page read may renew inactivity to 15 minutes after that read capped by the unchanged absolute deadline; equality with either deadline is expired.
- Every page rechecks current account, membership, field, and target authority and is refused after authority loss even while the snapshot remains alive.
- An authorized response exposes the accepted page, page size, snapshot result total, next-page availability, and opaque snapshot identity without leaking inaccessible counts.

## REQ-NFR-PERFORMANCE: ERP Workload and Latency

Performance is measured from request acceptance to complete response on the benchmark's pinned local environment. Database provisioning, fixture construction, process startup, external email delivery, and client think time are recorded separately and excluded from operation latency.

### REQ-NFR-PERFORMANCE-001: Measure a representative retained dataset

The measured organization contains at least 50,000 parties, 20,000 items, 25,000 employees, 100,000 operational documents, 250,000 journal lines, 250,000 stock movements, and 100,000 audit events, with retained open, closed, corrected, and deactivated states.

- The benchmark harness owns a versioned implementation-neutral logical dataset generator using seed `20260729`; its algorithm, schema, seed, output files, and canonical logical hashes are frozen before either arm starts.
- For every lifecycle that supports them, the logical manifest fixes exact open, terminal, corrected, and deactivated counts and includes boundary, common, and rare filter values.
- Each arm imports the byte-identical logical input through its own schema adapter and must reproduce the same canonical record and aggregate hashes before measurement; implementation-specific database bytes are not compared.
- Canonical projection uses manifest-supplied stable logical IDs, sorted record and relation keys, fixed decimal strings, ISO UTC instants, ISO business dates, explicit nulls, and an adapter identity map; implementation-only IDs, defaults, and storage fields are excluded before hashing.

### REQ-NFR-PERFORMANCE-002: Measure named interactive reads

The workload manifest covers active-organization selection; paged party, item, document, approval, journal, stock, employee, and audit search; one record detail with source links; stock availability; and trial-balance, aging, inventory-valuation, payroll, and production-summary report reads.

- Every named read records an exact actor, organization, filter, sort, page size, expected result count or aggregate hash, and common, boundary, or rare selectivity class.
- Both arms execute the same ordered manifest and refuse measurement when an expected count or hash differs.

### REQ-NFR-PERFORMANCE-003: Meet interactive read latency

Each named read operation receives five unmeasured warm-ups followed by at least 100 measured samples scheduled across twenty authenticated sessions with at most twenty requests in flight. Nearest-rank p95 is calculated per operation and is at most 750 milliseconds for paged search or detail and at most 3,000 milliseconds for each named aggregate report.

### REQ-NFR-PERFORMANCE-004: Meet state-changing latency without weakening outcomes

The frozen write manifest names create, edit, submit, approve, post, allocate, move, and settle cases with exact independent eligible targets, actors, payloads, and expected state hashes. Each named write operation receives five warm-ups on disposable targets and at least 50 measured samples under at most twenty requests in flight; per-operation nearest-rank p95 is at most 1,000 milliseconds.

- No request may be skipped, deduplicated incorrectly, partially applied, or measured with a weaker authorization or integrity path.
- Cleanup is excluded from latency and cannot mutate the next measured target.

### REQ-NFR-PERFORMANCE-005: Preserve reproducible performance evidence

The result records hardware, operating system, runtime, dependency lock, database mode, generator and workload hashes, dataset seed and exact distributions, warm-ups, concurrency schedule, ordered raw samples, failures, expected-result checks, and nearest-rank percentile calculation separately for every named operation.

## REQ-NFR-ACCESS: Accessible ERP Operation

Every delivered route, responsive state, dialog, form, table, chart, report, empty state, loading state, error state, and destructive action in the working web application conforms to WCAG 2.2 Level AA. The seven required end-to-end journeys are minimum automated samples and do not limit conformance scope.

### REQ-NFR-ACCESS-001: Operate every journey by keyboard

- Every delivered operation is reachable and operable by keyboard in logical focus order.
- Menus and dialogs move initial focus and restore it to the invoking control when closed.
- No interaction traps focus or requires hover, dragging, or pointer-only input.

### REQ-NFR-ACCESS-002: Expose names, structure, and state

- Every control has a programmatic name and a visible label or visible contextual instruction.
- Headings, landmarks, lists, forms, and table header relationships use semantic structure.
- Current sort, filter, page, expansion, and selection state is exposed to assistive technology.
- Asynchronous success, refusal, validation, and progress changes are announced without forcing unrelated focus movement.

### REQ-NFR-ACCESS-003: Prevent and correct consequential errors

- Validation identifies every affected field and its corrective action in text and programmatic error association.
- Posting, payment, payroll, period-close, deletion, reversal, shipment, and stock-adjustment actions present the exact affected scope for review.
- Each consequential action requires explicit confirmation before commitment and returns focus to a useful outcome after success or refusal.

### REQ-NFR-ACCESS-004: Preserve contrast, color independence, and focus visibility

- Normal text has at least 4.5:1 contrast.
- Large text and meaningful non-text controls, boundaries, and focus indicators have at least 3:1 contrast.
- Lifecycle, approval, variance, error, and availability meaning never relies on color alone.

### REQ-NFR-ACCESS-005: Reflow dense business information

- Every delivered route preserves content and controls at 320 CSS pixels and 200 percent text zoom.
- Wide tables provide an accessible responsive or internally scrollable representation.
- The surrounding workflow does not require two-dimensional page scrolling.

## REQ-NFR-RESILIENCE: Durable Recovery and Safe Retry

Committed business outcomes survive process restart, failed attempts remain inspectable without partial effects, and recovery never invents, duplicates, or rewrites accounting, stock, payroll, approval, or audit history.

### REQ-NFR-RESILIENCE-001: Survive application restart

A clean or forced application-process restart preserves every committed account, membership, configuration, document, posting, movement, approval, notification, and audit result and exposes no uncommitted partial result.

### REQ-NFR-RESILIENCE-002: Back up one consistent database state

A backup captures one transactionally consistent database state with its schema version and organization data, while credential and encryption material required for restoration is handled as protected deployment input rather than embedded in ordinary exports.

### REQ-NFR-RESILIENCE-003: Restore and reconcile the product

A restore into an empty compatible environment reproduces record counts, posted debit-credit equality, stock movement totals, open settlements, document source links, approval history, and tenant isolation before the restored application becomes eligible for use.

### REQ-NFR-RESILIENCE-004: Resume interrupted automation safely

An interrupted scheduled or queued job resumes from durable job state or retries with the same idempotency identity, preserving an inspectable attempt, failure, or completion record.

- Automatic retry uses bounded exponential backoff with a configured maximum attempt count; exhaustion creates an operator-visible terminal intervention state rather than silently abandoning work.
- Once dependencies recover and the job remains eligible, automatic or operator retry eventually records one completion and the business effect occurs exactly once; a permanent business refusal records a typed terminal outcome with no effect.

### REQ-NFR-RESILIENCE-005: Enforce record-class retention and legal holds

Deployment policy defines each retained record class, positive retention duration, start event, eligible deletion outcome, and fields preserved in a tombstone; posted financial and inventory evidence, approval history, audit events, payroll history, comments, attachments, and organization deletion all resolve through that schedule.

- A legal hold identifies organization, record or class scope, issuer, reason, start, optional release, and audit event and blocks deletion even after ordinary retention expires.
- Eligible deletion requires expired retention, no active hold, no unresolved source or settlement dependency, and an audited deterministic result; backups age out under the same class policy and never silently resurrect deleted operational access.

### REQ-NFR-RESILIENCE-006: Back up and restore attachment and queue state

A recovery point coordinates database state with attachment bytes, attachment metadata and content hashes, and durable queued-job identities.

- Restore verifies every retained attachment reference has bytes whose hash matches and every durable job is completed or safely resumable under its idempotency identity.
- Missing or corrupt attachment content, orphan bytes, or ambiguous queued effects block restored-environment readiness and produce an operator-visible reconciliation result.

## REQ-NFR-OBSERVABILITY: Attributable and Redacted Operations

Operators can determine which tenant, principal, request, source document, and job produced a failure without exposing secrets or private values beyond their operational purpose.

### REQ-NFR-OBSERVABILITY-001: Correlate requests and jobs

Every request and background attempt has a correlation identity carried through application logs, errors, audit linkage, and job outcomes without replacing the business document or audit identity.

### REQ-NFR-OBSERVABILITY-002: Record structured failure outcomes

Operational failures record time, component, organization identity where authorized, principal or System attribution, operation class, safe error code, retryability, and correlation identity while obeying REQ-NFR-SECURITY-006.

### REQ-NFR-OBSERVABILITY-003: Measure saturation and failure

The application exposes request latency, error count, job backlog, job age, database failure, and retry count by safe operation class and never uses raw email, document content, bank, payroll, token, or attachment values as metric labels.

### REQ-NFR-OBSERVABILITY-004: Distinguish business refusal from system failure

Expected authorization, validation, conflict, approval, and lifecycle refusals remain typed product outcomes, while unavailable dependencies, invariant violations, and unexpected exceptions are separately observable system failures.

### REQ-NFR-OBSERVABILITY-005: Expose operator readiness and alertable backlog

Liveness reports only process viability, while readiness remains false until schema, database, protected-key access, attachment storage, durable queue, and restore reconciliation are usable.

- Configured thresholds for error rate, job backlog age, database failure, and repeated automation failure emit deduplicated operator alerts with correlation identity.
- Operational logs, metrics, traces, and alert history have configured access and retention controls and preserve request-to-job correlation across asynchronous boundaries.

## REQ-NFR-DELIVERY: Production Full-Stack Delivery

For Production Delivery, the delivered product is an executable production-grade full-stack application covering the complete ERP scope. Operational state is durable and every major concept keeps explicit relational identity and lifecycle instead of being collapsed into generic records.

Together, consumers receive typed operational commands with tenant authority, audit, and transactional outcomes. End-to-end verification demonstrates the seven required business cycles and their accounting, stock, payroll, asset, manufacturing, quality, service, and close effects.

### REQ-NFR-DELIVERY-001: Run as a working production-grade full-stack ERP

The delivered product runs as a working production-grade web application and typed backend across every H2 requirement group in the five narrative documents.

### REQ-NFR-DELIVERY-002: Organizations can rely on durable operational state with explicit business relationships, lifecycle status, uniqueness, transition, concurrency, deactivation, and immutability outcomes

Organizations can rely on durable operational state with explicit business relationships, lifecycle status, uniqueness, transition, concurrency, deactivation, and immutability outcomes.

### REQ-NFR-DELIVERY-003: Expose typed commands for every required operation

Consumers can invoke typed lifecycle commands for every H3 operation in `03-functional-requirements.md` and receive consistent authorization, source-link, posting, and audit results.

### REQ-NFR-DELIVERY-004: The completed product proves procure-to-pay, order-to-cash, plan-to-produce, hire-to-retire and payroll, acquire-to-retire, period close, and quality and service journeys end to end

The completed product proves procure-to-pay, order-to-cash, plan-to-produce, hire-to-retire and payroll, acquire-to-retire, period close, and quality and service journeys end to end.

### REQ-NFR-DELIVERY-005: Each journey verification confirms the required accounting, inventory, budget, payroll, asset, manufacturing, quality, service, tenant visibility, audit, lifecycle, and close outcomes

Each journey verification confirms the required accounting, inventory, budget, payroll, asset, manufacturing, quality, service, tenant visibility, audit, lifecycle, and close outcomes.

### REQ-NFR-DELIVERY-006: Verify a clean-checkout production path

From a clean checkout with the pinned dependency lock, documented environment contract, and no generated or persistent local state, one canonical verification installs dependencies, builds typed API, backend, and frontend packages, applies database schema, performs one-time protected bootstrap and deterministic seed, starts persistent non-mock storage and both application surfaces, and passes backend health, frontend render, typed API, restart-durability, and browser journey smoke checks.
