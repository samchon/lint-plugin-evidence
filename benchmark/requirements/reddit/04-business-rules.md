# Business Rules

This document owns validation, uniqueness, eligibility, ranking, calculation, conflict, and refusal policies. It does not redefine domain information or repeat the commands whose inputs these rules qualify.

## REQ-RULE-IDENTITY Account Identity Rules

Email identifies one private sign-in identity and username identifies one public account. Both are compared without letter-case distinctions and remain reserved after deletion. Registration also applies one concrete allowed-form boundary so people receive correctable field-specific refusals.

### REQ-RULE-IDENTITY-001 Enforce Case-Insensitive Email and Username Uniqueness

No two existing or deleted accounts may reserve case-equivalent email addresses or usernames. Email uniqueness ensures one login identity; username uniqueness ensures one public profile and author identity.

Comparison ignores letter case, while the selected username casing remains visible publicly. A conflict identifies email, username, or both and creates no account.

### REQ-RULE-IDENTITY-002 Require Complete Registration Credentials

Registration accepts only:

- a nonblank, well-formed email address of at most 254 characters;
- a username of 3 through 30 letters, digits, or underscores; and
- a password of 8 through 128 characters.

Leading and trailing whitespace is removed from email and username before validation and comparison. Username display casing is preserved. Password characters are neither trimmed nor transformed. Every invalid field is identified for correction.

### REQ-RULE-IDENTITY-003 Reserve Deleted Account Identifiers

Permanent deletion keeps the former normalized email and username unavailable. That reservation permits no login, recovery, profile view, or reactivation, but prevents impersonation of the deleted public identity.

A new account may be created only with a different available email and username. Attempting either reserved value is refused as an identity conflict.

### REQ-RULE-IDENTITY-004 Keep Public and Moderation Identifiers Opaque

Post, comment, report, and moderation-history identifiers are case-sensitive opaque values. A client may compare one only for exact equality and pass it back to the corresponding product journey; its characters, length, or relative order carry no product meaning.

No identifier embeds or reveals a database sequence, author or reporter identity, community, parent, target, creation time, rank, or lifecycle state. Unknown and well-formed-but-nonexistent values receive the same unavailable outcome appropriate to that journey.

Whenever an exact ordered tie remains after every named business field, post, comment, report, and moderation-history lists use the corresponding opaque identifier descending. The direction is part of the order contract even though the identifier's internal form is not.

## REQ-RULE-PROFILE Profile Validation Rules

Profile editing validates the three public fields as one atomic change. Display name remains visible text, bio may be empty, and avatar may be absent or a valid upload. Account identity, credentials, karma, and authorship cannot be rewritten through this surface.

### REQ-RULE-PROFILE-001 Validate Profile Field Changes

A supplied display name must contain 1 through 100 visible characters after leading and trailing whitespace is removed. Bio may contain 0 through 10,000 characters. Avatar may be a valid image under REQ-RULE-MEDIA or may be explicitly removed.

Username, email, password, account status, karma, and authored relationships are not profile-edit fields. A valid partial edit preserves omitted values. The observed edit revision must equal the current profile revision before any supplied value is applied.

If any supplied field is invalid, unsupported, or stale, the entire edit is refused and the current profile remains unchanged. A current-revision request whose normalized values equal the current values is a no-change success and does not advance the revision or any timestamp.

## REQ-RULE-COMMUNITY Community Validation and Discovery Rules

Community creation needs a stable, human-readable public name plus descriptive text and icon. Name conflicts ignore letter case, and archived names remain reserved. Search uses the same normalized name meaning, matches substrings only in that field, and returns a deterministic public order.

### REQ-RULE-COMMUNITY-001 Validate Community Creation Fields and Unique Name

A community name contains 3 through 50 letters, digits, hyphens, or underscores. Leading and trailing whitespace is removed before validation and case-insensitive uniqueness comparison; accepted public casing is preserved. Active and archived communities both reserve their names.

Description must contain visible non-whitespace text and may contain at most 1,000 characters. A valid icon under REQ-RULE-MEDIA is required. Any missing, invalid, or conflicting field refuses the whole creation.

### REQ-RULE-COMMUNITY-002 Match and Order Community Name Search

The trimmed query matches a community when its name contains that text without regard to letter case. Description, posts, and comments do not participate.

An empty query matches the complete active-and-archived catalog. Results are ordered by normalized community name and then stable community identity for an exact tie. No matches yields an empty result.

### REQ-RULE-COMMUNITY-003 Restrict Permanent Community Archival to the Owner

Only the current owner of an active community may accept the permanent archive transition. The decision is refused when the caller's owner authority is absent or stale, the community is already archived, or the caller attempts to preserve active owner or moderator powers after archival.

Success is one atomic outcome: status becomes archived, all owner and moderator assignments end, every current subscription becomes residual, and one unified moderation-history event is appended. Failure leaves status, roles, subscriptions, content, and history unchanged.

## REQ-RULE-POST Post Content Rules

Post validation preserves the required title and exact text, link, or image distinction. Each type has a concrete valid payload, and edits remain within the originally selected type. Multi-field creation and editing are atomic: one invalid supplied value leaves no partial post change.

### REQ-RULE-POST-001 Validate Required Title and Exact Post Payload

A title contains 1 through 300 visible characters after leading and trailing whitespace is removed. The post then contains exactly one matching payload:

- text post: 1 through 40,000 characters and not all whitespace;
- link post: one URL and no text or image payload; or
- image post: one uploaded image with 1 through 1,000 visible characters of alternative text and no text or URL payload.

A blank or oversized title or text, absent payload, extra payload, or type-payload mismatch refuses creation or editing.

### REQ-RULE-POST-002 Validate Link and Image Payloads

A link URL is absolute, uses HTTP or HTTPS, contains a parseable host, contains no embedded username or password, and has at most 2,048 characters. Its host supplies the feed-card domain. Relative URLs, credential-bearing URLs, and other schemes are refused.

An image post owns one image accepted under REQ-RULE-MEDIA and its thumbnail. Failed link or image validation creates no post and leaves an edited post entirely unchanged.

### REQ-RULE-POST-003 Restrict Post Editing to Title and Same-Type Content

The author may replace the title, the current type's payload, or both; omitted editable values remain unchanged. Text remains text, link remains link, and image remains image. An image payload edit validates its image and alternative text together.

Author, community, original creation time, and every field outside title and current payload are immutable through editing. The observed edit revision must equal the current post revision before values are applied. Any attempted type, identity, community, unsupported-field, or stale-revision change is refused.

All supplied values validate together, so one invalid value preserves the complete current post. A current-revision request whose normalized title and payload equal the current values is a no-change success and advances no revision or timestamp. Two material edits using one revision cannot both succeed.

## REQ-RULE-PARTICIPATION Community Participation Rules

Post creation needs an active subscription. Commenting needs authentication but not subscription. An active community ban overrides both creation paths without hiding public content or blocking separately permitted actions. These predicates use current state in the one community where the action occurs.

### REQ-RULE-PARTICIPATION-001 Require Subscription for Post Creation

Post creation checks for an active subscription to the target community at that moment. An ended subscription, or owner or moderator authority without subscriber status, does not satisfy the requirement. The creator of a new community already qualifies through creator subscription.

Editing or deleting an existing authored post does not require subscription. Only new post creation is refused when the relationship is absent.

### REQ-RULE-PARTICIPATION-002 Allow Non-Subscribers to Comment

An authenticated user without a subscription may create a top-level comment or reply at any depth on available content in an active community, provided no active ban applies.

Commenting creates no subscription or home-feed inclusion. It does not permit post creation without membership. Absence of subscription is intentionally not a comment refusal.

### REQ-RULE-PARTICIPATION-003 Refuse Banned-User Posting and Commenting

While a community ban is active, the platform refuses new posts, top-level comments, and replies in that community. No content, count, profile, or feed state changes.

The same user may participate in another community where no ban applies and may edit or delete their existing content in an active community. Unbanning restores comment eligibility and subscription-dependent post eligibility.

### REQ-RULE-PARTICIPATION-004 Preserve Banned-User Viewing Access

A banned user may still browse the community catalog and feed, open posts and comment threads, view profiles and vote scores, and use the same public views while logged out. The community remains visible in name search and browsing.

Voting and reporting remain available on active-community content because the ban forbids only posts and comments. Private moderation lists remain unavailable unless the user independently holds current moderator authority.

## REQ-RULE-FEED Feed Ranking and Pagination Rules

All three feed scopes use the same four orders. New follows original creation time; Top follows score within a named rolling age window; Hot balances positive score against age decay; Controversial balances vote volume against proximity to zero. Every order has deterministic ties and remains stable within one paginated traversal.

### REQ-RULE-FEED-001 Order Feeds by New

New orders original creation time from newest to oldest. An exact time tie uses opaque post identifier descending.

Editing does not move a post because original creation time is unchanged. Deletion removes the post without changing surviving items' relative New order. Home, Popular, and Community use the same rule after applying their own scope.

### REQ-RULE-FEED-002 Order Feeds by Top and Selected Time Range

Top first selects posts by original creation time:

| Range | Included age at the traversal snapshot |
| --- | --- |
| Today | Prior 24 hours |
| This week | Prior 7 days |
| This month | Prior 30 days |
| This year | Prior 365 days |
| All time | No age cutoff |

A post exactly at the cutoff is included. Within the selected population, vote score orders highest first, then creation time newest first, then opaque post identifier descending. A fresh traversal reflects current scores.

### REQ-RULE-FEED-003 Order Feeds by Hot

Hot ranks highest to lowest by:

`log10(max(vote score, 1)) − age in hours / 12.5`

Age runs from original creation time to the traversal snapshot. A score of zero or below receives no positive score boost and continues to decay. Exact rank ties use newer creation time and then opaque post identifier descending. A fresh traversal reflects current score and age.

### REQ-RULE-FEED-004 Order Feeds by Controversial

Controversial ranks highest to lowest by:

`(active upvotes + active downvotes) / (absolute vote score + 1)`

Balanced positive and negative voting therefore ranks above one-sided voting with the same total. Exact ratio ties use greater total votes, then newer creation time, then opaque post identifier descending. A post with no votes has value zero.

### REQ-RULE-FEED-005 Apply Deterministic Pagination Boundaries

A feed continuation binds the ranked values and tie fields to feed scope, sort, Top range, and traversal snapshot. Equal-ranked posts are neither duplicated nor skipped.

Votes and new posts after the snapshot appear only in a fresh traversal. A deleted post may disappear from a later page without changing surviving snapshot order. Page size and invalid continuation follow REQ-RULE-PAGINATION and REQ-NFR-CONTINUITY.

For Home, the traversal snapshot also binds the exact subscribed-community identities. A subscription created or ended later does not invalidate or rewrite that continuation; a fresh Home traversal reflects the new membership. Account deletion still makes the continuation unusable because its viewer no longer exists.

## REQ-RULE-VOTE Voting and Aggregate Rules

Post and comment voting share one state router and the same signed calculations. One user-target pair has at most one active vote. Score equals current upvotes minus downvotes, and author karma receives the same transition delta. Removing content or an account reverses contributions that no longer have a valid target or participant.

### REQ-RULE-VOTE-001 Enforce One Active Vote per User and Target

For an authenticated user and available post or comment in an active community:

- no vote plus upvote or downvote creates that value;
- the opposite active value changes direction;
- the same active value makes no change; and
- removal returns an active value to no vote.

Only the voter controls change or removal. No route creates two active votes. Logged-out users, unavailable content, and archived-community targets cannot change vote state.

### REQ-RULE-VOTE-002 Calculate Content Vote Score

Post and comment score equals active upvotes minus active downvotes. Upvote contributes +1, downvote −1, and no vote zero.

Changing direction replaces the prior sign; removal contributes nothing. The final total may be positive, zero, or negative.

### REQ-RULE-VOTE-003 Adjust Author Karma for Vote Transitions

Post votes adjust the post author and comment votes adjust the comment author:

- creation applies +1 for upvote or −1 for downvote;
- direction change applies +2 or −2; and
- removal applies the inverse of the prior active value.

The voter receives no other karma effect for acting. Score and karma change as one product outcome, and karma may pass below zero.

### REQ-RULE-VOTE-004 Reverse Vote Aggregates When Content Is Deleted

Deleting a post or comment removes every active vote on that target and reverses each remaining author-karma contribution. Deleted target score is no longer presented.

Post deletion applies the same rule transitively to all removed comments. Account deletion separately removes the deleted user's votes from surviving targets. The completed deletion never exposes a target/karma mismatch.

## REQ-RULE-COMMENT Comment Tree and Sorting Rules

Every reply belongs to one acyclic same-post tree, with no maximum depth. Best, New, and Controversial order each sibling set independently. Their exact ties keep pagination deterministic. A deleted marker derives its position from the strongest surviving direct reply under the selected order.

### REQ-RULE-COMMENT-001 Validate Same-Post Acyclic Reply Relationships

A top-level comment has no parent. A reply selects exactly one available immediate parent on the same post.

The parent cannot be the reply itself, its descendant, a comment on another post, or a deleted marker. Parent identity is not editable. An invalid relationship creates no comment or count change.

### REQ-RULE-COMMENT-002 Allow Unlimited Reply Depth

Depth alone never refuses a reply. A valid reply at any finite depth is accepted when the actor, text, post, parent, community, and ban conditions are satisfied.

Every accepted reply remains reachable from its top-level ancestor. Sorting applies independently to sibling sets at every depth.

### REQ-RULE-COMMENT-003 Order Comments by Best

Best orders vote score highest first within each sibling set. An equal score uses original creation time oldest first, then opaque comment identifier descending.

Older time preserves an established discussion position. A deleted marker takes the Best position of its highest-ranked surviving direct reply. A fresh traversal reflects current scores.

### REQ-RULE-COMMENT-004 Order Comments by New

New orders creation time newest first within each sibling set and uses opaque comment identifier descending for an exact time tie. Editing does not affect position.

A deleted marker takes the New position of its newest surviving direct reply.

### REQ-RULE-COMMENT-005 Order Comments by Controversial

Controversial orders highest to lowest by:

`(active upvotes + active downvotes) / (absolute vote score + 1)`

An exact ratio tie uses greater total votes, then newer creation time, then opaque comment identifier descending. No votes yields zero. A deleted marker takes the Controversial position of its highest-ranked surviving direct reply.

### REQ-RULE-COMMENT-006 Validate Comment Text and Edit Revisions

Top-level comments and replies contain 1 through 10,000 visible characters after leading and trailing whitespace is removed. Blank, whitespace-only, or oversized text creates no comment and changes no post count.

An edit supplies the currently observed edit revision. A stale revision is refused before text is changed. A current-revision edit that repeats the normalized current text is a no-change success and advances no revision or timestamp; a material edit advances the revision once, so concurrent material edits using one revision cannot both succeed.

### REQ-RULE-COMMENT-007 Traverse Descendants Without a Product Limit

Top-level roots and each immediate-child set use bounded pages independently. A child continuation binds post, immediate parent, selected sort, page size, and traversal snapshot; it cannot be reused for another branch or sibling sort.

No page or branch may claim completion while an available child remains unreachable. Repeated continuation reaches every finite available descendant at any depth without a maximum-depth refusal, fixed total-descendant cap, recursion truncation, or promotion to a different parent.

### REQ-RULE-COMMENT-008 Project and Prune Deleted Markers

A deleted marker exists only while at least one available descendant depends on its parent position. It takes the selected sibling-sort position of its highest-ranked direct surviving child, applying the same rule recursively through a chain of markers. When its last available descendant disappears, that marker and each newly empty ancestor marker are pruned.

The projection contains no former author, text, score, viewer vote, report state, revision, timestamp, deletion reason, or moderation actor. It contributes nothing to profile authorship or post comment count and refuses vote, report, reply, edit, and delete-content commands.

## REQ-RULE-REPORT Reporting Rules

Reports require one available content target and a bounded nonblank reason. One reporter cannot duplicate unresolved work on the same target. Only current community moderators see or decide pending reports, and each report accepts only one terminal outcome.

### REQ-RULE-REPORT-001 Require a Valid Report Target and Reason

A report targets exactly one available post or comment in an active community. Its textual reason contains 1 through 2,000 non-whitespace characters after leading and trailing whitespace is removed.

The reporter need not subscribe and may be banned or be the target author. A blank or oversized reason, invalid target kind, unavailable target, or archived community creates no report.

### REQ-RULE-REPORT-002 Refuse Duplicate Unresolved Reports

When one reporter-target pair already has an unresolved report, a second submission is refused and leaves the existing report and content unchanged. Changing the reason does not bypass the conflict.

Another user may report the same target. The original reporter may submit again after resolution if the content remains available.

### REQ-RULE-REPORT-003 Restrict Report Queue Visibility and Resolution

Each queue view, approval, and dismissal requires current owner or moderator authority in the target content's exact community. Authority elsewhere grants nothing, and losing the scoped role ends access immediately.

Reporter status, target authorship, subscription, and ban state do not independently grant moderation access. Public profile and content views expose no report state or reason.

### REQ-RULE-REPORT-004 Refuse Repeat Report Resolution

Approval or dismissal applies only while the report is unresolved and its target remains available. An approved report cannot receive either decision again, and neither can a dismissed report.

A sibling report removed with deleted content cannot later be decided. Concurrent attempts produce one terminal outcome; each later attempt is refused without changing content, queue, or moderation history.

## REQ-RULE-MODERATION-HISTORY Unified History Rules

Unified history has one event vocabulary, one permission boundary, one stable order, and one de-identification policy across report, content-deletion, ban, role, ownership, and archive outcomes.

### REQ-RULE-MODERATION-HISTORY-001 Append Exactly One Event per Completed Outcome

A completed moderator assignment, moderator removal, moderator post deletion, moderator comment deletion, report approval, report dismissal, ban activation, ban end, ownership succession, owner-initiated archive, or automatic ownerless archive appends exactly one event of the corresponding kind.

A report approval records the report outcome rather than an additional direct-content-deletion event. An archive records one archive event rather than one event per ended role. A refusal, duplicate assignment, absent removal, duplicate ban, absent unban, repeated report decision, or failed archive appends no event. Retrying a completed command cannot create a second history event for the same state transition.

### REQ-RULE-MODERATION-HISTORY-002 Enforce Current Community Authority on Every Page

Only a current owner or moderator of the exact active community may view its history. Permission is evaluated for the first page and every continuation. Authority in another community, former authority, public access, and archived-community state disclose no history item.

When permission is absent, an invalid or stale continuation is refused rather than reset, so recovery cannot become an oracle for private history existence.

### REQ-RULE-MODERATION-HISTORY-003 Order and Snapshot Unified History

History orders occurrence time newest first and opaque event identifier descending for an exact tie. The first page snapshots the ordered event identities; later events appear only in a fresh traversal.

Later account or content deletion may de-identify a retained event in place but cannot reveal a former value, change its order, duplicate it, or remove the fact that the moderation outcome occurred.

### REQ-RULE-MODERATION-HISTORY-004 Apply One De-identification Projection

Deleted actors, affected users, and reporters become the same non-identifying deleted-user marker. No former username, email, account identifier, profile field, or authored content survives in a history response.

Deleted targets retain target kind and outcome context but expose no former title, text, media, author, opaque target identifier, or direct link. Available report targets may expose their current public description and opaque identifier only while the viewer remains authorized and the target remains available.

## REQ-RULE-MODERATION Moderation Authority Rules

Moderation authority is current, community-scoped, and inactive in archives. The owner-only revoke edge protects owner and peer roles from moderators. The current owner is also protected from a community ban so lower-order authority cannot disable the community's highest authority.

### REQ-RULE-MODERATION-001 Confine Moderation Actions to the Assigned Community

Deleting content, managing bans, viewing or deciding reports, and assigning or removing moderators require a current owner or moderator role in the exact target community. Authority in one community grants nothing in another.

Losing the role immediately ends these actions. Public viewing remains independent. Archived communities accept no moderation changes. A mismatched scope, expired role, or archive is refused.

### REQ-RULE-MODERATION-002 Protect Owner and Moderator Assignments From Moderator Removal

The owner is not a moderator-removal target for any caller. A moderator cannot remove their own role or a peer's role. Each such attempt preserves all scoped roles.

The current owner may remove another user's moderator role, but not the owner role. Moderator-initiated removal and protected targets are refused.

### REQ-RULE-MODERATION-003 Protect the Owner From Community Bans

The current owner cannot be banned in the owned community, whether the caller is a moderator or the owner targeting themselves. The refusal preserves owner access and all existing ban state.

Other moderators remain eligible ban targets. Ownership succession changes which user is protected, and the same user may be banned in a different community they do not own.

## REQ-RULE-MEDIA Uploaded Image Rules

Avatar, community-icon, and image-post uploads share one accepted media boundary. Accepted images remain tied to their owning public context. Image posts also receive a bounded aspect-preserving thumbnail while keeping the full image available.

### REQ-RULE-MEDIA-001 Validate Uploaded Image Format and Size

An upload must decode successfully as JPEG, PNG, or WebP, contain no more than 10 MiB, have width and height each from 1 through 8,192 pixels, and contain no more than 40,000,000 decoded pixels. Its declared media type, filename extension when supplied, detected signature, and decoded content must agree.

Empty, corrupt, unsupported, mismatched, animated, dimensionless, oversized, or excessive-pixel input is refused. Embedded executable content and active metadata are not part of the accepted image. A failed replacement leaves the current avatar, community icon, or post image unchanged.

### REQ-RULE-MEDIA-002 Present Uploaded Images and Post Thumbnails

An accepted image remains viewable with its owning profile, community, or post. An image-post thumbnail fits inside a 400-by-400-pixel box without cropping, stretching, or enlarging a smaller image. Opening the post keeps the full image and its required alternative text available.

Avatars remain accompanied by username and display name, community icons by community name, and post images by post title. Replacing or deleting the owning image removes the obsolete public presentation.

## REQ-RULE-PAGINATION Shared Pagination Rules

Feeds, communities, subscriptions, profile authorship, top-level comments, comment child branches, ban lists, report queues, and moderation history share one page-size and continuation contract. A traversal keeps its scope, filters, ordering, page size, and snapshot. Invalid continuation recovers through a clearly marked fresh first page rather than an ambiguous partial result, except that a private-history caller who has lost permission receives a refusal with no result.

### REQ-RULE-PAGINATION-001 Validate Requested Page Size

An omitted size selects 25 items. A supplied size is an integer from 1 through 100 and remains fixed for every continuation in that traversal. Zero, negative, fractional, or greater-than-100 values are refused.

The final page may contain fewer items. Feed, community, subscription, profile post/comment, top-level comment, immediate-child comment, ban, report, and moderation-history lists share this boundary. A root page and every child page apply the size independently; neither silently includes unbounded descendants outside its own count.

### REQ-RULE-PAGINATION-002 Validate Continuation Scope and Recover From Stale State

A continuation is valid only for the unchanged current user where relevant, community, list kind, parent comment where relevant, filters, sort, time range, page size, and traversal snapshot that created it. A Home continuation additionally binds the subscription identities captured at its snapshot and remains valid when current subscription membership later changes.

An unknown, stale, or mismatched continuation returns a fresh first page under the caller's current inputs and a visible reset indicator. The reset begins a new snapshot. Unified moderation history first rechecks current authority and refuses an unauthorized caller instead of returning a reset page. A final or empty page has no next continuation.
