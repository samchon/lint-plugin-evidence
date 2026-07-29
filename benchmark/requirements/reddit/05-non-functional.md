# Product-Visible Quality Requirements

This document defines privacy, integrity, continuity, and accessibility outcomes that users and community moderators can rely on while using the product.

## REQ-NFR-PRIVACY Account and Moderation Privacy

Account secrets and private sign-in identity remain separate from public profiles. Pending and resolved moderation information belongs only to the responsible community's current moderators. Those privacy boundaries coexist with the intentionally public profile, community, content, and aggregate reading journeys.

### REQ-NFR-PRIVACY-001 Keep Credentials and Email Private

An email address is visible only to its owning authenticated account. Profiles, posts, comments, community lists, feeds, votes, bans, reports, and moderation history never expose it to another user.

Passwords are never returned after registration, login, change, or recovery. Recovery proof is visible only within the recovery journey and becomes unusable after completion. Neutral login and recovery responses do not reveal whether an email identifies an account.

### REQ-NFR-PRIVACY-002 Keep Moderation Records Community-Private

Pending reports, report reasons, reporter identities, active bans, and unified moderation history are visible only to current owners and moderators of their own active community. Losing the scoped role ends access immediately, including before a later history or queue page is returned. Archived communities expose no private moderation surface.

Removed content is not retained in history. Deleted actors, affected users, and reporters use one non-identifying marker that exposes no former username, email, account identifier, profile field, or authorship. Public content shows no report count, pending-report state, moderation event, or ban history.

### REQ-NFR-PRIVACY-003 Preserve Public Profiles and Community Content

Available profiles, communities, Popular and Community feeds, posts, comment threads, vote scores, karma, and subscriber counts remain readable to their defined public audiences. Logged-out visitors can use public profiles, community discovery, public feeds, post detail, and comment threads.

Non-subscribers and banned users retain public viewing. Archived communities and their remaining content stay public. Deleted and private information remains unavailable under its own lifecycle or privacy rule.

## REQ-NFR-INTEGRITY Visible Aggregate Integrity

Vote transitions, subscription transitions, comment changes, and deletions affect several reader views at once. After an action completes, every fresh score, karma total, count, list, feed, profile, thread, and queue presents one mutually consistent product state. A continuation explicitly bound to an earlier snapshot preserves that snapshot rather than mixing it with the fresh state.

### REQ-NFR-INTEGRITY-001 Keep Vote Score and Karma Mutually Consistent

After vote creation, direction change, removal, or deletion reversal completes, target score and author karma both reflect the same accepted signed transition. A fresh content or profile view never shows one new value with the other still old.

Same-direction and absent-removal no-ops preserve both values. Negative scores and karma remain valid consistent results.

### REQ-NFR-INTEGRITY-002 Keep Subscription Count and Home Feed Mutually Consistent

Subscribe adds one active relationship to subscriber count, the user's subscription list and Home scope, and posting membership together. Unsubscribe removes the same three effects together.

Duplicate subscribe and absent unsubscribe change none. Creator bootstrap presents count one, Home inclusion, and posting membership together. An unsubscribed owner or moderator affects none of these subscription-derived values.

An owner-initiated archive preserves current relationships as residual subscriptions, keeps their count and archived Home eligibility together, and blocks new relationships. A Home or subscription-list traversal keeps the membership snapshot captured at its first page; a fresh traversal reflects each later subscription transition.

### REQ-NFR-INTEGRITY-003 Keep Comment Count Consistent With Comment Availability

Each successful top-level comment or reply increments the post comment count once. Deleting comment content decrements it once. A neutral deleted marker contributes zero while its available descendants continue to count.

Failed or refused comment actions make no count change. Post detail and feed cards show the same completed count; deleting the post removes the count with it.

### REQ-NFR-INTEGRITY-004 Keep Deletion Effects Consistent Across Public Views

After account, post, or comment deletion completes, profiles, feeds, direct views, threads, queues, scores, karma, and counts agree on which content and participation remain. Deleted content never remains on one public surface after disappearing from another.

Dependent votes, reports, and authored lists reflect the same outcome. Account deletion completes all cascades and community-ownership effects together or leaves the account active. Neutral markers and de-identified moderation history expose only their explicitly preserved information.

### REQ-NFR-INTEGRITY-005 Prevent Lost Updates and False Edit Activity

Profile, post, and comment edits compare the caller's observed revision with the current revision before applying values. Of concurrent material edits using one revision, at most one succeeds; each later request is refused without overwriting the accepted change.

A current-revision request that repeats the normalized current values is a no-change success. It changes no revision, timestamp, content projection, feed order, report, vote, count, or moderation event.

## REQ-NFR-CONTINUITY Browsing Continuity

Paginated lists preserve one traversal meaning from first page to last and provide a visible fresh start when continuation becomes unusable. Nested discussions remain navigable through deletion. Relative-age labels continue to describe immutable creation moments without changing ranking identity.

### REQ-NFR-CONTINUITY-001 Provide Stable Paginated Continuation

A valid continuation preserves list scope, filters, order, page size, and snapshot until the final page. Stable tie fields ensure that equal-ranked root items are not duplicated or skipped.

Each unchanged root item in the snapshot is reachable once before traversal ends. Opaque post, comment, report, and moderation-event identifiers break their named exact ties in the declared descending direction. An item deleted during traversal may disappear, but surviving snapshot items retain their order.

Home and subscription-list snapshots preserve their captured subscription identities even after the user subscribes or unsubscribes. Fresh traversal is the only way to adopt the new membership scope.

### REQ-NFR-CONTINUITY-002 Recover From an Invalid or Stale Continuation

An unknown, stale, or mismatched continuation returns the fresh first page under current inputs, visibly marks the reset, and begins a new snapshot. It never mixes a partial next page with first-page results.

The reader can continue normally from the reset page. Recovery changes no product data or permission. A valid final page has no next continuation rather than triggering a reset.

### REQ-NFR-CONTINUITY-003 Preserve Navigable Reply Structure

Every available reply remains reachable from its post and top-level branch at any depth. Deleting an ancestor preserves the same parent position with a neutral marker; descendants are never promoted to an unrelated parent.

Bounded top-level and immediate-child pages can be continued independently until every finite descendant has been visited; no product depth, descendant-count, or response-truncation limit makes a reply unreachable. Sorting changes only sibling order.

A marker remains for every deletion cause whenever any available descendant depends on it, regardless of descendant author, and is pruned when none remains. It exposes no removed author, text, score, vote, report, revision, timestamp, target identifier, or deletion cause. Deleting the post removes the complete tree so no orphan branch remains.

### REQ-NFR-CONTINUITY-004 Keep Relative Time Anchored to Creation

Post and comment age labels update as time passes but always derive from the immutable original creation moment. Editing never resets age, and every view of the same item uses that same origin.

Examples such as “3 hours ago” do not impose a fixed unit. New, Top time windows, Hot age, and comment New all use original creation time.

## REQ-NFR-ACCESS Accessible Community Participation

Every complete page and responsive state in the defined public, account, participation, and moderation journeys conforms to WCAG 2.2 Level A and Level AA. Core journeys remain operable without pointer input and understandable through visible and assistive feedback. Focus, labels, state changes, nesting, color, and imagery all preserve the meaning a participant or moderator needs to complete the journey.

### REQ-NFR-ACCESS-001 Support Keyboard Operation for Core Journeys

Registration, login, recovery, profile editing, community discovery, subscription, post and comment creation or correction, voting, reporting, and moderation controls are reachable and operable by keyboard in a logical focus order.

Nested comments do not trap focus or require hovering. Opening a menu or dialog moves focus into it, and closing returns focus to the invoking control. Unavailable actions are identifiable before activation.

### REQ-NFR-ACCESS-002 Expose Understandable Labels, Focus, and Validation Feedback

Interactive controls present visible focus and meaningful labels associated with their fields. Email, password, username, profile, community, post, comment, report, sort, and moderation inputs are identifiable.

Field-specific validation identifies the affected control and correction. Vote, subscription, report, ban, and deletion outcomes announce their visible state change. Headings and nested comment relationships preserve a logical reading structure.

### REQ-NFR-ACCESS-003 Avoid Color-Only or Image-Only Meaning

Upvote and downvote direction, selected vote state, and score remain distinguishable without color. Post type, archived status, report pending/approved/dismissed state, active ban, and validation errors have text or equivalent semantic meaning.

An absent avatar still shows username and display name; an absent community icon still shows community name; an image post exposes its authored alternative text and title. A thumbnail is never the only way to identify or open a post.

### REQ-NFR-ACCESS-004 Apply the Fixed WCAG 2.2 A and AA Criteria

The fixed applicable perception criteria are 1.1.1 Non-text Content; 1.3.1 Info and Relationships; 1.3.2 Meaningful Sequence; 1.3.3 Sensory Characteristics; 1.3.4 Orientation; 1.3.5 Identify Input Purpose; 1.4.1 Use of Color; 1.4.3 Contrast (Minimum); 1.4.4 Resize Text; 1.4.5 Images of Text; 1.4.10 Reflow; 1.4.11 Non-text Contrast; 1.4.12 Text Spacing; and 1.4.13 Content on Hover or Focus.

The fixed applicable operation criteria are 2.1.1 Keyboard; 2.1.2 No Keyboard Trap; 2.1.4 Character Key Shortcuts; 2.2.1 Timing Adjustable; 2.2.2 Pause, Stop, Hide; 2.3.1 Three Flashes or Below Threshold; 2.4.1 Bypass Blocks; 2.4.2 Page Titled; 2.4.3 Focus Order; 2.4.4 Link Purpose (In Context); 2.4.5 Multiple Ways; 2.4.6 Headings and Labels; 2.4.7 Focus Visible; 2.4.11 Focus Not Obscured (Minimum); 2.5.1 Pointer Gestures; 2.5.2 Pointer Cancellation; 2.5.3 Label in Name; 2.5.4 Motion Actuation; 2.5.7 Dragging Movements; and 2.5.8 Target Size (Minimum).

The fixed applicable understanding and compatibility criteria are 3.1.1 Language of Page; 3.1.2 Language of Parts; 3.2.1 On Focus; 3.2.2 On Input; 3.2.3 Consistent Navigation; 3.2.4 Consistent Identification; 3.2.6 Consistent Help when a help mechanism is provided; 3.3.1 Error Identification; 3.3.2 Labels or Instructions; 3.3.3 Error Suggestion; 3.3.4 Error Prevention (Legal, Financial, Data) for destructive account, community, post, and comment actions; 3.3.7 Redundant Entry; 3.3.8 Accessible Authentication (Minimum); 4.1.2 Name, Role, Value; and 4.1.3 Status Messages.

The corpus defines no audio, video, or other time-based media, so 1.2.1 through 1.2.5 and 1.4.2 have no test fixture. Introducing such media makes the corresponding A and AA criteria applicable rather than exempting the page.

### REQ-NFR-ACCESS-005 Fix Measurable Accessibility Outcomes

Normal text has at least 4.5:1 contrast and large text at least 3:1. Meaningful graphics, control boundaries, states, and focus indicators have at least 3:1 contrast against adjacent colors. Text resizes to 200 percent without loss, and content reflows at 320 CSS pixels without two-dimensional scrolling except for content whose meaning requires it.

Keyboard focus is visible, follows the reading and operation order, is not entirely hidden by authored overlays, and returns to the invoking control after a dialog or menu closes. Pointer targets are at least 24 by 24 CSS pixels or satisfy the WCAG spacing or equivalent-control exception. Any drag action has a non-drag single-pointer alternative.

Authentication permits paste and password-manager completion and imposes no memory puzzle without a conforming alternative or assistance mechanism. Validation and asynchronous status changes are programmatically exposed without moving focus, and destructive deletion or permanent archival requires reviewable confirmation before data is committed.

## REQ-NFR-SECURITY Fixed Security Verification

Security grading uses one fixed black-box subset across both benchmark arms. Passing a convenient happy path is insufficient: the same subject must prove credential lifecycle, object and community authorization, untrusted-input handling, private-output boundaries, and concurrent transition safety.

### REQ-NFR-SECURITY-001 Verify Credentials, Recovery, and Sessions

The fixed cases cover unknown-email and wrong-password login with indistinguishable public outcomes; recovery request for existing and absent accounts; expired, used, and superseded recovery proof; old-password refusal after change or recovery; current-session logout; all-session revocation; other-session revocation after password change; and permanent refusal after account deletion.

Public and moderation responses, logs exposed by product journeys, and error details disclose no password, recovery proof, or session credential. Replaying a consumed proof or revoked session produces no authenticated action or state change.

### REQ-NFR-SECURITY-002 Verify Object and Community Authorization

For every authenticated command that names a profile, post, comment, report, user, or community, the fixed cases replace the valid opaque identifier with another user's or another community's identifier. The product refuses cross-account edits, cross-community moderation, unauthorized private queues and history, moderator use of owner-only actions, and action after role revocation.

Logged-out, deleted-account, banned, non-subscriber, owner, moderator, and archived-community states are exercised against the capability distinctions in these requirements. Opaque identifiers never substitute for authorization, and an unavailable object does not reveal private existence through a different refusal.

### REQ-NFR-SECURITY-003 Verify Text, Link, and Image Boundaries

Every bounded text field is exercised at empty, whitespace-only where invalid, maximum, and maximum-plus-one length, including multi-byte characters. Stored text containing markup, script, event-handler, URL, and query-language metacharacters remains inert text in every public and moderation projection.

Link inputs cover HTTP, HTTPS, relative, malformed, credential-bearing, and non-HTTP schemes. Upload cases cover each accepted format, corrupt input, signature or media-type mismatch, animated input, embedded active content, 10 MiB and 10 MiB plus one byte, 8,192 and 8,193 pixel dimensions, and the 40,000,000-pixel boundary. A refusal creates no partial replacement or public file.

### REQ-NFR-SECURITY-004 Verify Private and Deleted Projections

Public profile, community, feed, post, comment, and error responses are scanned for email, credentials, sessions, recovery state, report state, ban history, and moderation events. Unauthorized queue and history requests return no item, count, reset page, or field that confirms private state.

After account or content deletion, the fixed cases revisit public views, active queues, unified history, authored lists, continuations, and direct identifiers. Deleted markers and de-identified history expose only their declared fields, and removed text, media, username, email, account identifier, and target identifier cannot be recovered through those journeys.

### REQ-NFR-SECURITY-005 Verify Concurrent and Replay-Safe Transitions

The fixed concurrent cases submit the same observed revision to two material profile, post, and comment edits; opposite and duplicate vote transitions; duplicate subscribe and unsubscribe commands; duplicate unresolved reports; competing report decisions; duplicate ban and unban commands; and competing ownership or archive outcomes.

Each pair produces one state permitted by the corresponding lifecycle, with no lost update, duplicate relationship, duplicate history event, double aggregate delta, mixed deletion, or partial role change. Replaying a completed or no-change command preserves the already accepted state and its counts.
