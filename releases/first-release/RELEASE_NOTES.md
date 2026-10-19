# First SignatureGate-Appsmith release — draft

This draft belongs to the SignatureGate v1.2.0 release set. It is not a published release and does not certify deployment. The final Appsmith version/tag, production-bound master SHA, publication revision and exact export checksum remain pending the coordinated release gates. There is no prior Appsmith release baseline.

The [combined SignatureGate changelog](https://github.com/RayzorDuff/SignatureGate/blob/main/docs/CHANGELOG.md) remains authoritative. These notes describe the resulting application and its prerequisites rather than duplicating every intermediate repair.

## Application behavior

- Directory distinguishes Individual and Company identities from Participant/Contributor capacities and access appointments.
- Explicit Individual/Company profiles support guarded identity, contacts, capacity history, notes and company contact-person relationships. Context pages require a selected UUID and isolate stale account/route loads.
- Intake preserves two-contact requirements, optional date of birth, scoped collisions, independent mailing consent and shared contact roles. Digital agreement/signing requests report stages and partial-save recovery warnings.
- Participant and Spiritual Practitioner functions retain signed resource checks, independent appointments and scoped agreement/location/release access. Reviewer and Directory Manager permissions do not require Participant capacity.
- Contributor functions cover identified/anonymous/provider donations, guarded resolution/enrollment and audited attribution correction.
- Cash Deposits supports verified cash reconciliation, reasoned exclusion/revival, immutable batch composition, preparation/confirmation, printing/tally, narrow confirmed-date correction and durable ERP synchronization/retry boundaries.
- Reports prioritize explicit Contributor-linked donation attribution, retain a separate optional overlapping active-Participant subset, and count Participant/Contributor capacity creation independently from people/companies. Financial and Contributor creation metrics retain Donations Reviewer scope; Participant metrics retain document-reviewer/assigned-practitioner scope. Configured labels apply to metric choices, charts and report rows. Audit display uses configurable headings, escaped values and validated links without translating stored record wording.
- Four generated workflow groups use canonical current-account capabilities and preserve Directory navigation on denied pages. Static captions, workflow notifications and report labels consume shared terminology; stable SQL/page identifiers remain compatible.
- Navigation is accepted across all pages. Ten duplicate page-name headings are removed. Agreement Templates displays Created/Updated timestamps as dates, independently of document URLs. Table column titles use readable deployment defaults: Appsmith 2.4.2's title editor does not support the dynamic terminology bindings used by other captions; changing table titles requires regenerating the source registry.
- Source and empty-table checks cover guarded action modes, safe startup state, exact export preservation and retained datasource/PDF-library descriptors.

## Required environment and promotion order

1. Close the SignatureGate production schema/ordered-manifest/restored-copy gates before changing the development datasource.
2. Pin the accepted released/deployed RootedOps dependency and reviewed n8n signing, inventory, donation and mailing revisions/targets. Map Listmonk and Documenso configuration privately.
3. Verify the actual PostgreSQL datasource targets: development `signaturegate_test`, production `signaturegate`. A display name alone is not evidence. Current observed test runtime is PostgreSQL 16.13 with Appsmith Community 2.4.2 and n8n 2.16.1.
4. Reconcile current master hotfixes, review the production environment delta, publish the accepted application and validate its read-only/synthetic runtime boundaries.
5. Run SignatureGate's existing Regenerate Appsmith export action with the exact accepted production-bound SHA. Commit its JSON in SignatureGate, verify source/export identity and record the action run, checksum, packaging commit and final tags.

## Remaining release gates

Paper upload remains blocked before records/files pending destination and principal validation. Installed PostgreSQL 16 ownership/grants and restored-upgrade verification of atomic Intake and native unified Intake retirement acceptance, external delivery/authorization, mobile/keyboard/native SDK/Git synchronization and protected upgrade/recovery still need acceptance. The operator accepted all-page navigation; that does not certify unrelated workflow outcomes. Unlisted event/queue pages remain in source; their presence is not workflow acceptance. The duplicate legacy Intake page is retired after unified parity checks.

The development ERP default and both explicit synchronization calls remain `test`; the reviewed production candidate must update all three only after backend/integration acceptance. Existing executed agreements and historical records are preserved. No v1.2.0 VERSION change, Appsmith master promotion, export packaging or release tag is performed by this draft.

## Final provenance checklist

Record the accepted Appsmith master/source SHA and tree, published revision and observed datasource proof; SignatureGate release/tag and packaging SHA; export action run and SHA-256; RootedOps released tag and deployed revision; reviewed n8n revisions; migration/recovery evidence; and final open-item dispositions. Keep operational names, contacts, values, account/configuration mappings and credentials outside Git.

## Interrupted Intake handling

Before the first identity write, Intake persists an account-scoped checkpoint containing controlled stage text and technical IDs only. A rejected request, lost response or signing failure leaves a review notice and blocks ordinary resubmission, including after a reload that retains Appsmith storage. Known identity/agreement IDs are retained privately. Reset after an incomplete outcome requires explicit review acknowledgment; it starts a separate intake and does not replay, finish, delete or roll back saved records. Successful intake also requires Reset before another submission. The busy indicator is temporary; the checkpoint is persistent.

Real source SQL/controller fault tests exercise failures before and after individual action commits and retain the existing 24 successful enrollment cases. The browser checkpoint is a recovery aid. The active Intake API additionally provides database transactionality and owner/key/payload idempotency. Different request keys, installed ownership/grants, cleared storage and external delivery retain their separate runtime/policy gates.


## Atomic active Intake candidate

The active Intake page now persists the new identity, selected capacities, contacts, notes, practitioner assignment, pending digital agreement, mailing queue entries and completion audit in one database call. A durable UUID request key, canonical owner and payload fingerprint make a repeated committed request return the same receipt. Invalid/failed transactions leave no partial enrollment. Known technical IDs can be recovered through Check saved Intake without replaying creation or signing. A missing receipt can still mean an in-flight request; its local guard remains.

Progress feedback remains, with database-stage completion reported after commit. Digital signing occurs afterward with the existing agreement ID as its external key. A failed/uncertain HTTP response still requires delivery reconciliation; it does not undo enrollment or permit automatic resubmission. Apply SignatureGate's `atomic_intake.sql` to test before pulling this candidate. There is no fallback to the old multi-action write sequence. Legacy Intake retirement is implemented in the development successor; native acceptance remains; restored PostgreSQL 16 ownership/grants/concurrent-session acceptance and external delivery remain open.

## Remaining terminology controls

Select captions/placeholders and Directory's per-row Participant/Contributor action buttons now use configured labels. Profile enrollment/contact-role captions retain stable capacity values while showing deployment labels. Terminology Administration displays the complete installed active/reserved structure in a read-only table and refreshes current-page labels after saving. Older installed `member=Member` configuration requires an explicit audited adoption to Participant; configuration overrides are preserved. Rooted Psyche's expected Participant wording uses `member`, not the separately reserved event `participant` concept.

## Deferred agreement parity

Intake now offers an explicit Create agreement later choice. Participant enrollment still requires two contacts and a practitioner assignment; phone plus address is supported without email. This mode creates no agreement, performs no signing request and grants no release eligibility. The saved receipt/replay/reset protections remain. Digital remains the default; paper upload remains blocked. Reapply the updated atomic Intake migration on test before pulling this frontend. SQL/controller suites exercise 18 added deferred cases alongside the 24 existing enrollments.

## Single Intake entry

Unified Intake now replaces the duplicate legacy page in the native application registry and every menu. Seventeen unused active-Intake write/helper/upload actions are removed. Canonical duplicate feedback works for reviewers without Participant capacity, and the signing action is explicitly Manual. Completion audit is emitted only by the enrollment transaction. See docs/INTAKE_PARITY.md for supported parity, intentional rule changes and remaining runtime/paper gates.

## PostgreSQL 16 evidence

The full application suite and four lock-observed contention cases pass on PostgreSQL 16.13 in CI run 39194685976 at code checkpoint aca3d48 with canonical backend d85fecb. Commit/replay, rollback/retry and owner/payload conflicts each preserve one enrollment/receipt/completion audit; the disposable database is removed. This is fresh-engine evidence, separate from the installed database and protected production restore. Current source/phase/rollout details are maintained in SignatureGate/releases/v1.2.0/STATUS.md and UNIFIED_INTAKE_VALIDATION.md.
