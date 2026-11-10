# Paper upload assignment preflight

Selecting a Spiritual Practitioner in Participant Functions does not create an assignment. The **Spiritual Practitioner for Agreement** selector now intersects eligible practitioners with active assignments for the currently selected Participant. The separate assignment selector retains the full eligible pool for the existing explicit assignment action. Paper upload still requires an active saved Participant/practitioner assignment; the database enforces this before reserving a request or storing a file.

The controller now refreshes the existing assignment query before generating a request key, saving an uncertain checkpoint or dispatching a file. The returned row must match both the selected Participant and practitioner and have active status. Missing, inactive, mismatched or unreadable assignments stop locally with guidance to select an assigned practitioner or have authorized staff use **Assign Spiritual Practitioner** first. Selection/account drift during the lookup also stops dispatch. The database guard remains authoritative if an assignment changes later.

## Native development verification

On `chatgpt_development` with `signaturegate_test`:

- Read-only SQL confirmed the selector uses practitioner person IDs and distinguished an unassigned selection from an active saved pairing. No assignment or role was created or changed.
- An unassigned selection produced the new actionable message. Check saved paper upload then reported no saved request; no uncertain checkpoint was created.
- Selecting an existing active assignment for the same test Participant succeeded through the newly imported paper workflow and original active webhook. One synthetic PDF was saved pending review; saved-request lookup confirmed it without resending.
- The evidence link opened the expected synthetic PDF. Browser download matched all 1,528 source bytes, SHA-256 `0199df12bfb7afb476a7a8cd8de2676eb44b28d77fc3bfa8b9fe02a3dc290182`.
- This new regression agreement remains pending review. The previously accepted approval/audit test is not repeated or replaced.
- Temporary read-only diagnostic query removed. No production/master, database schema, n8n workflow/credential, assignment or role changes.

Targeted checks: `node tests/paper-upload.mjs` covers active/missing/inactive/wrong-person/wrong-Participant assignments, lookup errors, lookup-time selection/account drift and preservation of receipt recovery. `node scripts/check-binding-syntax.mjs` compiles 30 collections and 802 widget/action expressions. No complete SQL suite or accepted browser workflow rerun.

## Recover an earlier failed dispatch

Use **Check saved paper upload** first. If unresolved, inspect that request's n8n execution before retrying. An `Assigned practitioner required` error at PG Begin occurs before the reservation insert and storage nodes, but retain the normal receipt/recovery process: confirm that no execution is still running and no file was stored, then use **Resolve pending upload** with a reason. Wait for confirmed cancellation before a separate attempt. This correction never clears an uncertain checkpoint or replays a file automatically.

Choose an existing active assignment for the next attempt. If a different assignment is intended, authorized staff must explicitly save that assignment first; choosing a dropdown option alone does not grant access or persist it.

## Assigned-only agreement options

The agreement dropdown and its default now require an active assignment for the currently selected Participant. Inactive assignments, stale rows for a previous Participant and practitioners absent from the eligible pool do not produce options. Existing assignment controls and the pre-dispatch/database guards are retained.

Native `chatgpt_development` verification after save and reload: two Participants with different assignments each showed only their assigned practitioner; changing Participant cleared the previous selection; a Participant without assignments showed no results. The separate assignment dropdown still offered the full eligible pool. No assignments, roles, uploads or production changes were made for these checks.

Targeted checks: `node tests/agreement-practitioner-options.mjs`, `node tests/paper-upload.mjs` and `node scripts/check-binding-syntax.mjs` pass (30 collections, 804 unique widget/action expressions). The options test evaluates the actual saved widget bindings and covers stale/inactive/missing/eligibility/default cases while preserving the separate assignment selector.
