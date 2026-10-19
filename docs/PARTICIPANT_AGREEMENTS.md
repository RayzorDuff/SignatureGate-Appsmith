# Agreement creation after deferred Intake

Participant Functions retains its stable internal page name, Member Functions. For an authorized Document Reviewer or assigned Spiritual Practitioner, selecting an accessible Participant loads the active Agreement Types, retains a valid selection or selects the first available type, then loads that type's active templates. Agreement Type is visible beside Participant and practitioner selection. User-arranged widget positions and existing native resource identities are preserved.

Both catalog reads use the canonical participant write-scope API. A Participant's self-read permission does not grant catalog or agreement creation access, and a practitioner cannot load another practitioner's unassigned Participant through a forged target. These are frontend query repairs; no database migration or new permission grant accompanies them.

The controller passes the selected type explicitly because Appsmith widget state can lag query completion. Type changes clear the previous template choice; empty results and read failures have different feedback. A stale selection from a different type cannot pass the final template guard. Choice loading itself creates no agreement, audit or external signing request.

`npm test` includes the actual saved controller and prepared catalog SQL against a disposable canonical-schema database, with synthetic records. It covers delayed widget hydration, valid selection retention, inactive/empty catalogs, failures, canonical reviewer/assigned practitioner access and self/other-target denial. Native Appsmith pull/Deploy rendering and real signing delivery remain distinct acceptance gates.

The separate navigation repair restores copied initialize methods to On Page Load and keeps presentation helpers Manual. It retains every Appsmith-created resource ID and changes no navigation JS body or widget layout. Inspect the saved startup modes after a native Copy to Page operation; its destination copies may revert to Manual.

Paper upload is implemented through the protected n8n workflow described in SignatureGate/n8n/PAPER_AGREEMENT_UPLOAD.md. It supports a no-email Participant, a single signed PDF/PNG/JPEG up to 5 MiB, progress, pending Document Reviewer approval, owner-scoped saved-request lookup and reasoned cancellation recovery. Apply the companion backend and configure the authenticated test workflow before pulling this frontend. Intake itself continues to use Create agreement later for this two-step paper path.
