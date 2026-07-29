# Non-Functional Requirements

## REQ-NFR-PRIVACY Private Data Isolation

An account's email identity, display name, active todos, trashed todos, and edit histories form one confidential product boundary. The same isolation applies to lists, individual views, changes, and recovery actions; no surface becomes a weaker path to another account's information.

The product has no public profile, sharing, transfer, or cross-account access capability. An ownership mismatch reveals no private target and changes no owner's information.

### REQ-NFR-PRIVACY-1 Isolate Every Account's Private Information

Each authenticated user can view and change only their own profile and Todo information. Active lists, trash lists, individual details, and full histories contain no information owned by another account.

A direct cross-owner attempt has the same unavailable outcome as an absent private target, so it reveals neither content nor existence. The attempt changes no profile, Todo, completion value, trash state, history, credential, or account.

No product capability makes an account's email, display name, active todos, trashed todos, or histories public, shared, transferable, or assignable to another user. This guarantee applies consistently to viewing, editing, completion, soft deletion, history inspection, restoration, permanent Todo deletion, and account deletion.

## REQ-NFR-INTEGRITY Change and Deletion Integrity

Users can rely on linked Todo effects becoming visible as complete outcomes. A content edit and its matching history entry agree; recoverable deletion moves the same task and history between active work and trash; and permanent deletion removes the complete selected ownership scope.

When one of these changes does not complete, the previously accepted Todo, history, profile, account, and authority state remains the visible truth. Recovery paths apply only to soft deletion; successful permanent deletion has no partial remainder or restoration path.

### REQ-NFR-INTEGRITY-1 Keep Todo Edits and History Consistent

After a successful content edit, the accepted Todo values, its incremented content revision, and exactly one matching history entry become visible together. The entry's revision, edit time, and changed-to values describe that same accepted change.

An accepted Todo edit is never visible without its history entry, and no history entry is visible for Todo changes that were not accepted. A stale, invalid, state-ineligible, or unauthorized edit preserves the previously accepted Todo, revision, and history together.

### REQ-NFR-INTEGRITY-2 Preserve Recoverable Todo State

Soft deletion makes the same complete Todo and history unavailable in active work and available through trash and history surfaces. Restoration makes that same complete Todo and history unavailable in trash and available again through active and history surfaces.

Both transitions preserve Todo ID, content, dates, content revision, completion, ownership, creation information, and the full history as one recoverable set. If soft deletion or restoration does not complete, the entire set remains in its prior state and view.

### REQ-NFR-INTEGRITY-3 Complete Permanent Deletion as One Outcome

Permanent Todo deletion removes the trashed Todo and every attached history entry together. Permanent account deletion removes the account, profile, every active and trashed Todo, every attached history entry, every recovery proof, and every account session together.

A completed deletion leaves no orphaned profile, Todo, history entry, or usable account session inside its selected scope, and that scope has no recovery path. If permanent deletion is refused or does not complete, the full preexisting scope remains available and authoritative.

## REQ-NFR-SECURITY Credential and Session Security

Passwords, recovery proofs, and session credentials are authority-bearing secrets rather than product information. Their stored and transported forms prevent a database, log, URL, public response, or unrelated origin from becoming a weaker path to account authority.

Every session has both inactivity and absolute lifetime boundaries. Authentication and continuation apply those boundaries consistently with explicit logout, credential replacement, and account deletion.

### REQ-NFR-SECURITY-1 Protect Password and Recovery Secrets

No registration, login, password-change, recovery, profile, Todo, history, or trash response returns a password or stored password verifier. Application and audit logs contain neither submitted passwords nor raw recovery proofs.

The retained password verifier cannot be reversed to recover the submitted password and is independently salted for each account. The retained recovery verifier cannot recover the delivered raw proof. A database record alone therefore does not reveal either submitted secret.

Recovery delivery exposes the raw proof only to the registered email channel. Public recovery initiation remains neutral, and a raw proof never appears in a URL, analytics event, or unrelated response.

### REQ-NFR-SECURITY-2 Protect Browser Session Authority

Each issued session credential has at least 128 bits of unpredictable entropy and identifies only one account session. It is never accepted from a URL and never appears in application logs or public responses.

In a production browser context, the credential is sent only over an encrypted connection and is never exposed to an unrelated origin through a URL, referrer, message, or permissive cross-origin response. Whether the product carries authority explicitly or the browser attaches it automatically, a cross-origin state-changing request without product authorization is refused without changing account or Todo state.

Revoked, expired, malformed, or unknown session credentials produce the same unauthenticated authority boundary and cannot be continued.

### REQ-NFR-SECURITY-3 Expire Sessions Predictably

Each session expires after 7 consecutive days without successful continuation and no later than 30 days after initial issue. Successful continuation before inactivity expiry begins a new 7-day inactivity window but never moves the 30-day absolute deadline. Ordinary private operations do not move either deadline.

At or after either deadline, the session cannot authenticate or continue. Expiration affects only that session, changes no profile or Todo information, and never terminates another unexpired session by itself.

Registration and login issue fresh deadlines. Logout, credential replacement, recovery, and account deletion may end sessions earlier under their own requirements.

## REQ-NFR-ACCESS Accessible Private Task Management

The complete account and Todo journeys remain operable without pointer input and understandable through visible and assistive feedback. Focus, labels, state changes, validation, color, contrast, and reflow preserve the meaning needed to complete private work.

### REQ-NFR-ACCESS-1 Support Keyboard Operation and Focus

Registration, login, recovery, profile editing, active and trash browsing, Todo creation, detail, content editing, completion, history traversal, soft deletion, restoration, permanent deletion, session logout, and account deletion are reachable and operable by keyboard in a logical focus order.

Opening a menu or dialog moves focus into it. Closing it returns focus to the invoking control. No journey traps focus, requires hovering, or hides an unavailable action until activation.

### REQ-NFR-ACCESS-2 Expose Labels, Validation, and State Changes

Every interactive control has a meaningful visible or programmatic label, and every field-specific validation identifies the affected control and the correction needed. Visible focus identifies the current control.

Completion, trash, restoration, deletion, profile, credential, session, and pagination outcomes are announced to assistive technology without requiring focus to move. Headings, lists, dialogs, and history entries preserve a logical reading structure.

Completion and availability states, validation failures, destructive actions, and current-page state never rely on color alone.

### REQ-NFR-ACCESS-3 Preserve Contrast and Reflow

Normal text has a contrast ratio of at least 4.5:1 against its background. Text at least 24 CSS pixels, or at least 18.66 CSS pixels when bold, is large text and has at least 3:1 contrast. Focus indicators and meaningful non-text control boundaries have at least 3:1 contrast against adjacent colors.

At a viewport width of 320 CSS pixels, core journeys reflow without two-dimensional page scrolling and without losing content or controls. Zooming text to 200 percent preserves every operation and message.

## REQ-NFR-PERFORMANCE Bounded Interactive Work

Interactive latency and response size remain bounded at a declared subject scale. Measurement uses the pinned benchmark environment and records fixture size, runtime versions, warm-up, repetitions, and percentile calculation so a result can be reproduced rather than inferred.

### REQ-NFR-PERFORMANCE-1 Meet the Todo Subject Latency Budget

The acceptance fixture contains one account with 10,000 active todos, 10,000 trashed todos, and 100 retained edit-history entries on each of 100 selected todos. The measured operations are active list, trash list, active detail, trash detail, history page, create, content edit, mark complete, mark incomplete, soft delete, and restore.

For each measured operation, twenty authenticated sessions issue exactly five requests each with at most twenty requests in flight. Every state-changing request receives an independent eligible target or input so success, rather than a no-op or refusal, is the expected outcome. After five unmeasured warm-up requests for that operation, the nearest-rank 95th percentile of the 100 read requests is at or below 500 milliseconds and of the 100 state-changing requests is at or below 750 milliseconds. No measured request fails, leaks another account's data, skips an accepted mutation, or weakens a response-size boundary.

Startup, dependency installation, database migration, fixture creation, and external network or email delivery time are excluded from operation latency and recorded separately. The environment and raw samples remain part of the acceptance record.

### REQ-NFR-PERFORMANCE-2 Bound Collection Responses

Active, trash, and history responses never carry more entries than the accepted page size. Default size 20 and maximum size 100 apply before serialization.

Totals may describe the complete matching collection without materializing it in one response. Detail and mutation responses contain only the selected Todo and directly matching outcome rather than embedding the account's collection or complete history.
