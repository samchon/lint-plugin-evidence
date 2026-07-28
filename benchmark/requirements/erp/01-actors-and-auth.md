# Actors, Authentication, Memberships, and Authority

One global User identity authenticates by email and password and may participate in several organizations. The active organization, its membership state, assigned role union, and scoped department or project responsibilities determine what that User may do. Customers and vendors remain non-authenticating external parties, while scheduled work is attributed to an organization-specific System principal.

## REQ-AUTH-PROVISION: Account Provisioning and Login

Membership begins with an Owner-issued invitation, not public registration. Accepting that invitation either creates the recipient's single global identity or adds another organization to an existing identity; the membership itself remains organization-specific.

Email-and-password authentication establishes only the global signed-in context. The user must still choose an active membership before operational work, and inactive accounts or users without an active membership cannot enter the ERP.

### REQ-AUTH-PROVISION-001: Owner issues membership invitation

An organization Owner sends a membership invitation to a person's email for one organization. The invitation is a separate organization-and-canonical-email record and does not require a global user identity to exist.

The invitation identifies the issuing organization, intended canonical email, inviter, initial Employee role, status, creation time, and expiry.

- Its secret proof has at least 128 bits of cryptographic entropy.
- The proof is delivered only to the intended canonical email.
- Expiry is exactly 72 hours after issuance, and verification succeeds only when `verifiedAt < expiresAt`; equality is expired.
- Proof consumption is atomic and admits at most one success across retries or concurrent acceptance.

Invitation issuance does not create public self-registration or grant authority before acceptance. For a new email it creates an invited membership whose user link is empty and whose canonical email is unique in the organization; successful acceptance creates or resolves the global user and links that membership atomically. A non-Owner or duplicate pending invitation is refused without creating another invitation or membership.

An Owner may revoke a pending invitation or issue a replacement for the same organization and canonical email. Replacement atomically supersedes the earlier unused proof so that only the newest pending invitation can be accepted.

### REQ-AUTH-PROVISION-002: Accept invitation and establish identity

When a recipient presents an active organization invitation issued to their email, the recipient accepts it, establishes their global email-and-password identity, and activates the invited organization membership.

The recipient must prove control of the invitation and create a password accepted by REQ-NFR-SECURITY-001. The accepted canonical email becomes the identity used for later sign-in and global profile ownership. The account remains global while the new membership and Employee baseline remain specific to the inviting organization.

An invitation that is expired, superseded, revoked, already accepted, or issued to another canonical email is refused without establishing an account or membership.

### REQ-AUTH-PROVISION-003: Accept invitation into another organization

When an invitation email resolves to an existing global user, that authenticated user presents the invitation and gains an active membership in the inviting organization without creating another account or profile.

The authenticated account's canonical email must equal the invitation email. Existing credentials and the global profile remain unchanged. The additional membership begins with the invited organization's Employee baseline, and every other membership remains unchanged.

Acceptance is refused when the user already has an active or suspended membership in that organization; an Owner must use the applicable membership command instead. For one revoked membership, accepting a new Owner-issued invitation reuses that same membership identity, changes it to active, removes every former role assignment, and grants only the Employee baseline.

### REQ-AUTH-PROVISION-004: Authenticate and begin a session

An active user with at least one active organization membership authenticates with email and password and receives a signed-in session that has no operating organization until selection.

The session identifies the global user but grants no organization data access before an active membership is selected. The user can inspect their active memberships solely for choosing the operating organization.

### REQ-AUTH-PROVISION-005: Refuse ineligible authentication

When a person attempts email-and-password authentication, the product refuses the attempt if credentials are invalid, the global account is inactive, or no active organization membership remains.

No signed-in session or active organization context is created. The response does not reveal whether the email, password, account status, or membership status caused the refusal.

### REQ-AUTH-PROVISION-006: Bootstrap the first Owner exactly once

Only while the deployment contains no organization or user, a deployment-supplied one-time bootstrap proof creates the first global account, first organization, active Owner membership, and enrolled multi-factor authenticator in one transaction.

- The proof has at least 128 bits of cryptographic entropy, is supplied outside source control, is consumed at most once, and is disabled permanently as soon as any organization exists.
- Benchmark fixtures inject bootstrap email, password, and TOTP material through protected environment input and never commit a usable secret.
- A failed or replayed bootstrap leaves no account, organization, membership, session, or authenticator.

## REQ-AUTH-SESSION: Session and Logout

For Session and Logout, a signed-in user can keep more than one concurrent session so work on one device does not silently terminate another. Session continuation keeps the authenticated identity but never bypasses current membership eligibility.

Together, ending the current session and ending every session are distinct user choices with different scope. A membership or account status change takes effect on later requests even when a session was issued earlier.

### REQ-AUTH-SESSION-001: Issues an independent session after successful login and allows concurrent active sessions

The product issues an independent session after successful login and allows concurrent active sessions. The session credential has at least 128 bits of cryptographic entropy and receives the inactivity and absolute deadlines in REQ-NFR-SECURITY-003.

### REQ-AUTH-SESSION-002: Continues an eligible current session without re-entering credentials

A user continues an eligible current session without re-entering credentials. Successful continuation may renew only the inactivity deadline and never the absolute deadline in REQ-NFR-SECURITY-003.

### REQ-AUTH-SESSION-003: Logs out the current session without ending other active sessions

A user logs out the current session without ending other active sessions.

### REQ-AUTH-SESSION-004: Revokes all of their active sessions in one action

A user revokes all of their active sessions in one action.

### REQ-AUTH-SESSION-005: Rechecks that the account and selected organization membership remain active

Every continued request rechecks that the account and selected organization membership remain active.

## REQ-AUTH-ACCOUNT: User Account Management

One global user profile follows the person across organization memberships, while roles and employee placement stay scoped to each organization. Only the user controls personal profile and credential actions. Password change, recovery, deactivation, and reactivation have different proof and session effects, and none silently changes a separately revoked membership. After authentication, explicit active-organization selection is the boundary for every operational action; switching repeats membership eligibility before moving that boundary.

### REQ-AUTH-ACCOUNT-001: View the global user profile

A user views their global profile containing display name, avatar, phone, locale, and timezone preference.

- The view represents one identity across every organization membership and does not merge organization roles or employee placement into the global profile.
- The user can see only their own credential-bound profile through this self-service outcome.

### REQ-AUTH-ACCOUNT-002: Update the global user profile

A user updates their own global profile fields.

- The editable fields are display name, avatar, phone, locale, and timezone preference; login email and password use their own credential actions.
- A successful change is visible in every membership because the profile belongs to the global user, not to one organization.

### REQ-AUTH-ACCOUNT-003: Change the password while signed in

A signed-in user changes their password after proving the current password.

- The new password replaces the credential for the global account after current-password verification succeeds.
- Other active sessions for the same account are revoked; the session completing the change remains usable and retains its current organization context.

An incorrect current password refuses the change and leaves the existing credential and sessions unchanged.

### REQ-AUTH-ACCOUNT-004: Recover account access by email

A user who cannot authenticate recovers access through an email-bound recovery flow.

- Recovery initiation returns one neutral public result for active, unknown, and deactivated accounts.
- For an eligible account it sends a proof with at least 128 bits of cryptographic entropy only to the verified login email.
- The proof expires exactly 30 minutes after issuance, and verification succeeds only when `verifiedAt < expiresAt`; equality is expired.
- A newer proof supersedes every older unused proof.
- No raw proof appears in the initiating response, URL, or log.
- Completing recovery replaces the password and revokes existing sessions but does not choose an active organization.

Only the newest unused proof before its 30-minute boundary may complete recovery. Concurrent completion attempts using the same proof admit exactly one success. A missing, malformed, expired, superseded, reused, or mismatched proof is refused through one neutral outcome without changing password, account, session, or membership state.

### REQ-AUTH-ACCOUNT-005: Deactivate the global user account

A user deactivates their global account and immediately loses access in every organization while business history remains attributable.

- Deactivation revokes every active session and prevents authentication regardless of still-resident organization memberships.
- Documents, postings, approvals, comments, time, payroll, and audit events retain the deactivated user's identity as historical attribution.

### REQ-AUTH-ACCOUNT-006: Reactivate a deactivated account

A deactivated user reactivates the global account through credential recovery without restoring a membership that was separately revoked.

- Successful email-bound recovery returns the global account to active status and permits login.
- Each organization membership keeps its own invited, active, suspended, or revoked state; reactivation does not change those states or role assignments.

Recovery is refused when the email-bound proof is invalid, and the account remains deactivated.

### REQ-AUTH-ACCOUNT-007: Select the active organization after login

After login, a user selects one active organization membership as the operating context.

- The selectable catalog contains only organizations in which the user has an active membership.
- Every subsequent query, command, report, export, approval, audit event, and background request initiated in the session carries the selected organization context.

A nonmember, invited, suspended, or revoked membership cannot be selected and does not establish an operating context.

### REQ-AUTH-ACCOUNT-008: Switch the active organization

A signed-in user switches the operating context to another active membership without signing in again.

- The target is rechecked as an active membership before the context changes.
- After switching, authorization, roles, data visibility, reports, and commands use only the target organization; no prior-organization query or draft context carries forward.

If the target membership is no longer active, the switch is refused and the current valid organization context remains selected.

### REQ-AUTH-ACCOUNT-009: Enroll multi-factor authentication

A signed-in user proves the current password and one newly generated authenticator-app code before multi-factor authentication becomes active.

- Enrollment displays the shared secret once, stores the TOTP secret encrypted at rest under a separated rotatable key, and generates single-use recovery codes whose raw values are shown once and whose stored values are salted one-way verifiers.
- Regenerating recovery codes invalidates every earlier unused recovery code.

### REQ-AUTH-ACCOUNT-010: Complete privileged sign-in with a second factor

An account holding Owner, any built-in manager role, or a custom role containing a sensitive permission in an active membership must complete a second-factor challenge after correct email-and-password verification before receiving a signed-in session. Sensitive permissions include organization, membership, role, workflow, approval, journal posting, payment, bank, payroll, period-close, tax-return, stock-adjustment, credential, or audit administration.

- TOTP uses 30-second steps and accepts a code only for the current or immediately previous step; a future step is refused, and an accepted account-step pair cannot be replayed for another successful challenge.
- A recovery code is consumed atomically at most once; concurrent use admits exactly one success.

### REQ-AUTH-ACCOUNT-011: Reset or disable multi-factor authentication safely

A signed-in user may disable or replace multi-factor authentication only after proving the current password and an active second factor.

- A user who has lost every second factor completes the neutral email recovery flow and receives a single-purpose enrollment grant with no organization or data authority and only new-factor-enrollment capability.
- The grant expires exactly 10 minutes after issuance and is eligible only when `usedAt < expiresAt`; equality is expired.
- Enrollment through that grant requires the newly set password and one valid code from the new authenticator; success consumes the grant, revokes every active session, and still requires a normal privileged sign-in before organization selection.
- Successful reset revokes every active session and invalidates all previous authenticator and recovery-code verifiers.

## REQ-AUTH-MEMBERSHIP: Organization Membership Lifecycle

For Organization Membership, one global user can have a different membership state and different roles in each organization. Invited, active, suspended, and revoked states distinguish pending entry, usable access, temporary loss, and terminal removal.

Together, membership suspension or revocation removes organization access while not erasing documents, approvals, audit attribution, or employment history. Only Owners administer later membership entry and status changes, subject to last-owner protection.

### REQ-AUTH-MEMBERSHIP-001: A membership preserves invitation identity until it can link one user

An invited membership records organization and unique canonical invitation email with an empty user link. Acceptance atomically resolves exactly one global user, sets that non-null user link, and changes status to active; active, suspended, and revoked memberships always retain exactly one user.

### REQ-AUTH-MEMBERSHIP-002: Recipient acceptance atomically activates the pending membership

The recipient's successful proof consumption atomically changes the pending membership to active. The Owner issues, revokes, or replaces the invitation but does not perform a second activation action.

### REQ-AUTH-MEMBERSHIP-003: An Owner suspends an active membership and immediately removes its organization authority

An Owner suspends an active membership and immediately removes its organization authority.

### REQ-AUTH-MEMBERSHIP-004: Reactivates a suspended membership with its retained role assignments

An Owner reactivates a suspended membership with its retained role assignments.

### REQ-AUTH-MEMBERSHIP-005: Revocation blocks access until a new invitation is accepted

An Owner revokes a membership and prevents later access. A later Owner-issued invitation may reactivate the same membership identity only through recipient acceptance under REQ-AUTH-PROVISION-003, with former roles removed and the Employee baseline restored.

### REQ-AUTH-MEMBERSHIP-006: Refuses membership actions that would leave it without an active Owner

An organization refuses membership actions that would leave it without an active Owner.

## REQ-AUTH-ROLE: Organization Roles and Permissions

For Organization Role, effective authority is the union of all roles held within the currently selected organization; no role grants authority in another organization. Built-in roles use the explicit boundaries in REQ-AUTH-ROLE-001, while custom roles select individual permissions from the same organization-scoped catalog.

Together, Department Manager and Project Manager stay responsibility positions and never become organization-wide permission profiles. Role assignment and removal are Owner-controlled sensitive actions whose effects apply immediately.

In every requirement, an `authorized user` means an active member whose built-in or custom role grants the named read or command permission in the selected organization and whose department, project, employee, warehouse, or document scope includes the target. Domain labels such as posting user, master-data manager, project administrator, time manager, quality user, maintenance user, and service user are capability labels resolved from that same permission catalog; they do not create undeclared roles or bypass the explicit built-in-role boundaries.

### REQ-AUTH-ROLE-001: The built-in role catalog preserves Owner, Finance Manager, Procurement Manager, Sales Manager, Warehouse Manager, HR Manager, Production Manager, and Employee with the following organization-scoped boundaries:

The built-in role catalog preserves Owner, Finance Manager, Procurement Manager, Sales Manager, Warehouse Manager, HR Manager, Production Manager, and Employee with the following organization-scoped boundaries:

- Owner manages organization configuration, memberships, roles, and workflows and includes every built-in manager capability, but remains subject to period locks, immutable history, and separation-of-duty rules.
- Finance Manager manages ledger, journal, banking, tax, budget, asset, close, finance reporting, and accounting-side payroll results.
- Procurement Manager manages vendors, purchase requests, purchase orders, receipts, returns, vendor bills, credits, and procurement reporting, but cannot bypass required Finance posting or approval.
- Sales Manager manages customers, pricing, quotes, sales orders, invoices, credits, customer settlement, and sales reporting, but cannot bypass warehouse stock authority or required Finance posting.
- Warehouse Manager manages items, warehouses, locations, stock, allocations, shipments, returns, transfers, counts, adjustments, lots, serials, and inventory reporting.
- HR Manager manages employees, departments, contracts, time, timesheets, payroll calculation, payslips, and HR reporting; payroll bank and accounting effects still require their separately authorized steps.
- Production Manager manages BOMs, routings, work centers, machines, MRP, production, inspection, quarantine, equipment, maintenance, service, and their reports.
- Employee is limited to self-service profile, assigned work, owned timelogs and timesheets, own payslips, and records explicitly shared by another permission.

### REQ-AUTH-ROLE-002: A member's effective authority is the union of every built-in and custom role assigned in the active organization

A member's effective authority is the union of every built-in and custom role assigned in the active organization.

### REQ-AUTH-ROLE-003: Every manager role includes the Employee self-service baseline

Every manager role includes the Employee self-service baseline, and Owner includes every built-in manager capability.

### REQ-AUTH-ROLE-004: An Owner composes a custom role from delegable permissions

An Owner composes a custom role from any combination in the delegable organization permission catalog.

### REQ-AUTH-ROLE-005: Updates the permission composition of a custom role

An Owner updates the permission composition of a custom role.

### REQ-AUTH-ROLE-006: Assigns one or more built-in or custom roles to an active member

An Owner assigns one or more built-in or custom roles to an active member.

### REQ-AUTH-ROLE-007: Revokes a named role from an active member

An Owner revokes a named role from an active member.

### REQ-AUTH-ROLE-008: Built-in roles cannot be deleted, and a custom role can be deleted only while no member holds it

Built-in roles cannot be deleted, and a custom role can be deleted only while no member holds it.

### REQ-AUTH-ROLE-009: The organization creator becomes the first Owner and a later member begins as Employee unless an Owner assigns another role

The organization creator becomes the first Owner and a later member begins as Employee unless an Owner assigns another role.

### REQ-AUTH-ROLE-010: Require MFA before granting sensitive permission and invalidate lower-assurance sessions

An Owner may grant a built-in manager role or a custom role containing any sensitive permission named in REQ-AUTH-ACCOUNT-010 only to an account with active multi-factor authentication.

- The successful grant revokes every existing session for the target account, including sessions opened before the permission change.
- A later privileged login and every privileged command require the second-factor assurance established for that new session; a password-only or enrollment-only session cannot select an organization or exercise the permission.

### REQ-AUTH-ROLE-011: Preserve explicit Owner-only precedence

Organization deletion, membership invitation and status, role creation and assignment, approval-workflow administration, and fiscal-period reopening initiation are non-delegable Owner-only permissions and are absent from the custom-role catalog.

- When a requirement names a concrete actor, that actor restriction takes precedence over the generic `authorized user` definition and no custom permission broadens it.
- Delegable custom permissions remain subject to tenant and record scope, last-owner protection, separation of duty, MFA, period locks, and immutable history.

## REQ-AUTH-PRINCIPAL: Acting Principals

For Acting Principal, a User is the sole credentialed actor and carries organization-scoped roles from Owner to Employee. Customers and vendors stay referenced external parties whose interactions are mediated by authorized users and documents.

Together, automated work is attributed to an organization-scoped System principal while not a human login or session. Human and automated actions share tenant isolation, immutability, and audit attribution boundaries.

### REQ-AUTH-PRINCIPAL-001: The product distinguishes credentialed Users, non-authenticating external parties

The product distinguishes credentialed Users, non-authenticating external parties, and non-interactive System principals as one cohesive acting-principal catalog.

### REQ-AUTH-PRINCIPAL-002: Customers and vendors never receive portal credentials and users mediate all interaction with them

Customers and vendors never receive portal credentials and users mediate all interaction with them.

### REQ-AUTH-PRINCIPAL-003: Each organization has a System principal for scheduled depreciation, MRP, exchange-rate refresh, numbering, reminders, and notification dispatch

Each organization has a System principal for scheduled depreciation, MRP, exchange-rate refresh, numbering, reminders, and notification dispatch.

### REQ-AUTH-PRINCIPAL-004: Every System action is scoped to one organization and attributed under the same audit and immutability rules as a User action

Every System action is scoped to one organization and attributed under the same audit and immutability rules as a User action.

### REQ-AUTH-PRINCIPAL-005: Give each automated job least-privilege authority

Each scheduled or queued attempt carries one organization, immutable job-definition version, permitted operation set, source trigger, and System attribution.

- A System principal has no interactive login, membership, Owner inheritance, or arbitrary command authority.
- Depreciation, MRP, rate refresh, numbering, reminder, and notification jobs receive only their named read and write capabilities, and any out-of-scope operation is refused and audited.

## REQ-AUTH-POSITION: Scoped Manager Positions

For Manager Position, a manager position is attached to one department or project instead of to the user's global identity. Department and project positions provide contextual approval responsibility while not granting unrelated module authority.

Together, position assignment changes who resolves a matching approval step but does not alter the member's role union. Only an authorized organization administrator can assign or clear these responsibility positions.

### REQ-AUTH-POSITION-001: Assigns or clears the Department Manager of a specific department

An authorized Owner or HR Manager assigns or clears the Department Manager of a specific department.

### REQ-AUTH-POSITION-002: Assigns or clears the Project Manager of a specific project

An authorized Owner, Production Manager, or custom-role holder with project-administration permission assigns or clears the Project Manager of a specific project.

### REQ-AUTH-POSITION-003: Approval routing resolves Department Manager and Project Manager approvers from the document's own department or project context

Approval routing resolves Department Manager and Project Manager approvers from the document's own department or project context.
