# v1.2.0 production candidate — review only

Inputs are pinned in `config/v120_promotion_baseline.json`: development
`2d2c3b2e012d2e73e7e0c6bf351ef8721e84e5f5`, production master
`48905ca281271889cf6cb778cd0249a221b87c82`. No live configuration or publication
is changed by this branch. Do not select it in the shared development editor:
it intentionally carries production SQL descriptors and ERP modes.

The per-file review of all 80 master changes since the common ancestor is in
`V120_MASTER_CHANGE_DISPOSITIONS.json`. This is an explicit reconciliation,
not an instruction to merge raw development into master.

| Area | Candidate disposition |
| --- | --- |
| Master cash layout | Retain relative desktop/mobile arrangement for 21 retained widgets; translate 16 rows below development's navigation/access header. Old title is replaced by the accepted current-page title. |
| Native identity | Preserve all 966 tracked development page/action/collection/widget identity records; reuse the exact existing master PostgreSQL descriptor. No object recreation. |
| ERP | Preserve bank selector and refresh lookup, confirm-triggered synchronization, retry, succeeded-retry guard and dynamic status. Both controller calls and API body fallback use `production`. Development remains `test`. |
| Authorization/reporting | Preserve canonical account-based access, reviewer financial restrictions, fail-closed startup, expanded contributor reports and accepted PR #8 repairs. Retired Members/Donations surfaces are superseded by the canonical pages. |
| Navigation/profiles | Retain 17 active pages, shared grouped menus, Directory → Individual/Company Profile context, deep-link guards and Back to Directory. No retired pages return. |
| Intake/paper/digital | Retain merged PR #14/#15 Intake recovery, assignment-restricted Participant Functions, Manual signing actions, NocoDB new uploads and historical Drive links. New Drive uploads stay disabled. |
| Routing | Preserve five-service private-routing inventory and master operator documentation. Git does not supply live URLs, credentials or actual database identity. |

Validation: source/controller checks, 30 JS collections, 805 unique binding/action
expressions, 201 internal navigation targets and generated navigation checks.
Production-mode tests use synthetic API stubs; no ERP, signing or storage call.
The dedicated production-candidate CI job runs these checks for PRs to master;
the already accepted complete SQL suite is not repeated for descriptor/layout changes.

Remaining runtime checks belong to the approved cutover: actual Appsmith database
and role, published revision, private service reachability from caller containers,
n8n credential/destination bindings, preserved workflow IDs/authentication and the
compatible deployed RootedOps revision. In particular, the tracked paper workflow
is test-bound: its two Postgres nodes must use reviewed existing production
credentials during coordinated promotion, never by repointing the shared test
credential. Inspect worker/webhook isolation before enabling writes.

Merge this branch into master only after review and passing CI, in the separately
approved promotion session. Generate the backend release JSON from the exact
reviewed candidate/merged SHA and the pinned descriptor SHA through SignatureGate's
shared export preparer. A disposable candidate export is not a released artifact.
