# First SignatureGate-Appsmith release — v1.2.0 preparation

Status: unreleased; functional development remains on `chatgpt_development`, bound to `signaturegate-postgres-test`.

The coordinated release plan, acceptance ledger and authoritative combined product changelog live in SignatureGate:

- [Release plan](https://github.com/RayzorDuff/SignatureGate/blob/main/releases/v1.2.0/RELEASE_PLAN.md)
- [Phase 2 implementation and test deployment](https://github.com/RayzorDuff/SignatureGate/blob/main/releases/v1.2.0/PHASE_2_PROGRESS.md)
- [Combined changelog](https://github.com/RayzorDuff/SignatureGate/blob/main/docs/CHANGELOG.md)

Agreement Templates now includes document-reviewer Agreement Type creation, with canonical actor lookup, input/duplicate validation, active/inactive handling and selector refresh. The prerequisite backend migration is `SignatureGate/db/migrations/agreement_type_administration.sql`; deploy and verify it on test before pulling this frontend. It requires the canonical identity/role schema. Runtime Appsmith acceptance and Git synchronization verification remain open.

Run the focused source behavior tests with:

```bash
node tests/agreement-type-flows.mjs
```

Before the first release, record the exact accepted development SHA, production-bound master SHA, deployed/published Appsmith revision and database/integration prerequisites. Final release notes must cover the complete application changes against the initial master baseline and link the completed combined changelog. The SignatureGate export action must run against the pinned production-bound master SHA and commit `appsmith/Rooted Psyche Membership Ops.json` before SignatureGate is tagged. This preparation document does not identify a published release.


Directory's JS collection/action registration paths are now named `directoryFlows`, without an issue number. Existing Git synchronization IDs are retained. After pulling into the test editor, reload Directory and validate initialization plus Individual/Company Profile, Member/Contributor Functions and Sacrament Release routes for allowed/denied selections. Keep actual identity values and screenshots private.

Release documentation follow-up: SignatureGate's `appsmith/SCREENS.md` must be rewritten after navigation acceptance and before packaging. The terminology initializer is `SignatureGate/db/seeds/organization_terminology.sql`; the pending Member → Participant presentation work must update its defaults/tests and active UI surfaces together in Phase 3.
