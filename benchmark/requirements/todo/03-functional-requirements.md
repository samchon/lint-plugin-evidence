# Functional Requirements

## REQ-FUNC-PROFILE Profile Operations

The profile surface is the private account holder's place to inspect and change their display identity. It always resolves from the authenticated account; there is no profile search, public directory, or other-user lookup.

Viewing returns the current display name. Editing replaces only that name and relies on the separate display-name rule for accepted values. Neither operation changes credentials, account identity, or Todo ownership.

### REQ-FUNC-PROFILE-1 View the Current User's Profile

An authenticated user may view the one profile belonging to their account. The result contains the current display name and represents no other account's profile.

The view returns no other user's email, display name, account identity, or profile existence. It changes no account, credential, profile, Todo, trash, or history information.

Without a valid authenticated account, no private profile information is returned.

### REQ-FUNC-PROFILE-2 Edit the Display Name

An authenticated user may replace the display name on their own profile. The proposed name must satisfy REQ-RULE-PROFILE before any change occurs.

On success, subsequent views of the profile show the new display name. The edit does not change the email, password, account identity, Todo ownership, Todo content, or Todo edit history.

An invalid display name or an ownership mismatch is refused. A refused edit preserves the prior display name and all other account information.

## REQ-FUNC-TODO Todo Operations

Active todos form the user's normal working collection. Creation adds an incomplete task to that collection; browsing and detail let the owner discover its current information; and content, completion, and trash commands change independently observable parts of its state. Lists carry each task's opaque Todo ID, and every detail or change operation uses that ID inside the authenticated ownership boundary.

The normal surface never includes trash. List results use a compact task summary, while detail returns the full description and every other current task fact. Content edits alone create edit-history entries; completion changes and soft deletion preserve that history without adding to it.

### REQ-FUNC-TODO-1 Create a Todo

An authenticated user may create a todo by providing:

- a required title;
- an optional description, which may be empty;
- an optional start date, which may be empty; and
- an optional due date, which may be empty.

Each optional value can be omitted independently. The values must satisfy REQ-RULE-CONTENT before creation.

On success, the product assigns a new opaque Todo ID, assigns the authenticated account as permanent owner, records the creation date, and creates the todo as `active`, `incomplete`, and content revision 1. Creation produces no edit history entry because no earlier Todo content existed to change.

Invalid content or dates refuse the request. A refused creation produces no Todo or history state.

### REQ-FUNC-TODO-2 Browse Active Todos

An authenticated user may browse one page of their own active todos. The product first limits the candidates to active todos owned by that account, then applies the selected completion filter and sort order, and finally returns the requested page.

Each list item shows:

- the opaque Todo ID needed to select the exact task;
- title;
- completion status;
- start date when set;
- due date when set;
- creation date; and
- current content revision.

The completion filter accepts `all`, `complete-only`, or `incomplete-only`. Sorting accepts creation date in newest-first or oldest-first order, start date in earliest-first or latest-first order, or due date in earliest-first or latest-first order. Missing task dates and the complete pagination, default, and tie-break behavior follow REQ-RULE-BROWSE.

Trashed todos and other users' todos never enter the candidate result. A request with an unsupported page value, filter, sort field, or direction is refused without returning a partial interpretation.

### REQ-FUNC-TODO-3 View an Active Todo

An authenticated user may view one active todo they own by Todo ID. The result includes its Todo ID, title, full description, start date, due date, completion status, creation date, content revision, and `active` availability.

An optional description or date that is empty remains visibly empty rather than becoming unknown information. The result contains no other account's information, and viewing changes no content, completion, availability, ownership, or history.

Edit history is available through the separate full-history query. A trashed, absent, or other-owned target returns no private Todo detail.

### REQ-FUNC-TODO-4 Edit Todo Content

An authenticated owner may edit one or more of an active todo's title, description, start date, and due date by supplying its Todo ID and the expected content revision previously returned by current detail. Optional description and date values may be cleared. At least one supplied value must differ from the current value, and the resulting content and date combination must satisfy REQ-RULE-CONTENT.

On success, only supplied fields with different values change and the content revision increases by exactly one. Todo ID, completion status, creation date, active availability, owner, and all prior history entries remain unchanged.

The same successful outcome adds exactly one history entry with the new content revision, edit time, and new value of every participating field. An unchanged field has no changed-to value in that entry; an optional field cleared to empty is recorded explicitly as described by REQ-DOM-HISTORY-1. The updated todo and matching history entry become visible together.

The request is refused if the todo is not an owned active todo, any proposed value is invalid, no editable value changes, or the expected content revision differs from the Todo's current revision. A stale refusal returns no private current values beyond the ordinary unavailable boundary; an authorized owner may reload current detail and history before retrying. Every refused edit preserves the current revision, Todo content, and history.

### REQ-FUNC-TODO-5 Mark a Todo Complete

An authenticated owner may mark an active incomplete todo `complete`. The new status appears in later active-list and detail views.

Todo ID, title, description, start date, due date, creation date, content revision, active availability, owner, and edit history remain unchanged. The completion action creates no content-edit history entry.

Requesting `complete` for an already complete active todo succeeds without another state change under REQ-RULE-STATE. A trashed, absent, or other-owned target is refused and returns no private Todo.

### REQ-FUNC-TODO-6 Mark a Todo Incomplete

An authenticated owner may mark an active complete todo `incomplete`. The new status appears in later active-list and detail views.

Todo ID, title, description, start date, due date, creation date, content revision, active availability, owner, and edit history remain unchanged. The incomplete action creates no content-edit history entry.

Requesting `incomplete` for an already incomplete active todo succeeds without another state change under REQ-RULE-STATE. A trashed, absent, or other-owned target is refused and returns no private Todo.

### REQ-FUNC-TODO-7 Move a Todo to Trash

An authenticated owner may soft-delete an active todo. On success, the same todo changes to `trashed`, disappears from the normal list, and becomes available in the owner's trash.

The transition preserves Todo ID, title, description, start date, due date, completion status, creation date, content revision, owner, and every edit history entry. It creates no content-edit history entry.

An already trashed, absent, or other-owned target is refused. A refused soft deletion leaves the todo in its prior state and list.

## REQ-FUNC-HISTORY Edit History Inspection

History inspection explains the content changes made to one owned todo. It remains available while that todo is active or retained in trash because soft deletion preserves the same task and history.

The result traverses the complete content-edit chronology through bounded pages, newest accepted content revision first. It does not mix completion or availability transitions into the changed-title, changed-description, changed-start-date, and changed-due-date record. An ownership mismatch returns no Todo, account, or history information.

### REQ-FUNC-HISTORY-1 Traverse a Todo's Complete Edit History

An authenticated owner may traverse the complete edit history of one active or trashed todo by Todo ID. One response returns one bounded page under REQ-RULE-BROWSE-5, ordered by accepted content revision from highest to lowest.

The page identifies the Todo ID and current content revision and reports the total history-entry count, total page count, current page, and requested page size. Traversing every page reaches every retained entry once; bounded responses do not truncate the complete chronology.

Each entry shows the accepted content revision, when the edit occurred, and whichever of these changed-to values participated in that edit: title, description, start date, and due date. Completion, soft-delete, and restoration events do not appear as content-edit entries.

Viewing history changes no Todo or history information. An absent or other-owned Todo returns no private Todo or history information.

## REQ-FUNC-TRASH Trash Recovery Journey

Trash is the authenticated account's recovery view for soft-deleted todos. It is separate from active work: the user first discovers retained tasks in a paginated list, may inspect one task and its separate history, and then chooses either restoration or irreversible deletion.

Restoration preserves the same task and returns it to the normal list. Permanent deletion is available only while the task is in trash and removes both the todo and its history. All four steps remain owner-scoped.

### REQ-FUNC-TRASH-1 Browse Trashed Todos

An authenticated user may browse one page of their own currently trashed todos. The list is ordered by the most recent move into trash, newest first, with the deterministic tie-break defined by REQ-RULE-BROWSE.

Each item shows:

- the opaque Todo ID needed to select the exact task;
- title;
- completion status;
- start date when set;
- due date when set;
- creation date; and
- current content revision; and
- the date and time of the most recent move into trash.

The list uses the shared pagination limits and page totals. It includes no active or other-owned Todo. It does not apply the active list's completion filters or user-selectable sort choices.

Pagination values outside the shared rule are refused rather than partially interpreted.

### REQ-FUNC-TRASH-2 View a Trashed Todo

An authenticated user may inspect one trashed todo they own by Todo ID before choosing restoration or permanent deletion. The result includes the preserved Todo ID, title, full description, start date, due date, completion status, creation date, content revision, trash-entry time, and `trashed` availability.

The result is the same Todo identity that previously appeared in the active list. Its full edit history remains available through REQ-FUNC-HISTORY-1. Viewing changes no content, completion, owner, availability, trash-entry time, or history.

An active, absent, or other-owned Todo returns no private trash detail.

### REQ-FUNC-TRASH-3 Restore a Todo from Trash

An authenticated owner may restore a trashed todo. On success, the same Todo changes to `active`, leaves trash, and returns to the normal list.

The restored Todo keeps its ID, owner, title, description, start date, due date, completion status, creation date, content revision, and complete edit history. Restoration creates no content-edit history entry and makes the task eligible again for normal detail and change operations.

An active, absent, or other-owned target is refused. A refused restoration leaves the Todo in its current state and view.

### REQ-FUNC-TRASH-4 Permanently Delete a Todo from Trash

An authenticated owner may permanently delete a trashed todo. Success removes the Todo and every edit history entry attached to it.

The task disappears from trash, remains absent from the active list, and has no remaining detail or history view. No restore, edit, completion, or later permanent-delete action remains for the absent Todo.

An active, absent, or other-owned target is refused. A refused permanent deletion leaves the Todo and all of its history unchanged.
