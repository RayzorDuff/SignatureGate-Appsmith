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
- Reports distinguish six contribution groups, restrict financial metrics independently and retain canonical staff access. Audit display uses configurable headings, escaped values and validated links without translating stored record wording.
- Four generated workflow groups use canonical current-account capabilities and preserve Directory navigation on denied pages. Static captions, workflow notifications and report labels consume shared terminology; stable SQL/page identifiers remain compatible.
- Source and empty-table checks cover guarded action modes, safe startup state, exact export preservation and retained datasource/PDF-library descriptors.

## Required environment and promotion order

1. Close the SignatureGate production schema/ordered-manifest/restored-copy gates before changing the development datasource.
2. Pin the accepted released/deployed RootedOps dependency and reviewed n8n signing, inventory, donation and mailing revisions/targets. Map Listmonk and Documenso configuration privately.
3. Verify the actual PostgreSQL datasource targets: development `signaturegate_test`, production `signaturegate`. A display name alone is not evidence. Current observed test runtime is PostgreSQL 16.13 with Appsmith Community 2.4.2 and n8n 2.16.1.
4. Reconcile current master hotfixes, review the production environment delta, publish the accepted application and validate its read-only/synthetic runtime boundaries.
5. Run SignatureGate's existing Regenerate Appsmith export action with the exact accepted production-bound SHA. Commit its JSON in SignatureGate, verify source/export identity and record the action run, checksum, packaging commit and final tags.

## Remaining release gates

Paper upload remains blocked before records/files pending destination and principal validation. Safe recovery/atomicity across independently committed Intake steps, external delivery/authorization, cold Terminology loading, mobile/keyboard/native SDK/Git synchronization and protected upgrade/recovery still need acceptance. Legacy Intake and unlisted event/queue pages remain in source; their presence is not parity or workflow acceptance.

The development ERP default and both explicit synchronization calls remain `test`; the reviewed production candidate must update all three only after backend/integration acceptance. Existing executed agreements and historical records are preserved. No v1.2.0 VERSION change, Appsmith master promotion, export packaging or release tag is performed by this draft.

## Final provenance checklist

Record the accepted Appsmith master/source SHA and tree, published revision and observed datasource proof; SignatureGate release/tag and packaging SHA; export action run and SHA-256; RootedOps released tag and deployed revision; reviewed n8n revisions; migration/recovery evidence; and final open-item dispositions. Keep operational names, contacts, values, account/configuration mappings and credentials outside Git.
