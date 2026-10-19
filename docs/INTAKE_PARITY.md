# Unified Intake and legacy retirement

The duplicate Members – Intake page and its menu/native application entries are retired from development after the unified controller/SQL matrix passes. Historical people, capacities, contacts, agreements and audit records are unchanged; no data migration accompanies page removal. Existing bookmarks to the retired page should be replaced with Directory or Intake.

| Legacy purpose | Unified implementation and evidence |
| --- | --- |
| Individual Participant enrollment | Atomic Intake; canonical Document Reviewer, no Participant capacity required for the reviewer |
| Enroll without creating an agreement | Explicit Create agreement later; two contacts and practitioner assignment remain required; 18 deferred SQL/controller cases include phone plus address without email |
| Digital agreement | Atomic pending agreement followed by signing with its stable ID; existing Digital default, delivery stages and uncertain-response/no-replay checks retained |
| Name/contact/DOB collision feedback | Canonically scoped duplicate preflight plus authoritative database collision protection; existing-profile review rather than another identity |
| Optional DOB and notes | Stored on the individual identity; notes do not replace required contacts |
| Practitioner assignment | Canonical assigned person and appointment checks; enrollment does not grant practitioner or reviewer permissions |
| Mailing preferences | Independent explicit Participant and Contributor consent; queuing is not a claim of external subscription completion |
| Paper upload | Unavailable in both paths; remains a separate destination/principal/integration gate. Removing the legacy page does not claim paper acceptance |
| Reset and progress | Accepted completion/reset behavior retained; durable receipt recovery never replays signing |

The legacy one-contact-plus-notes bypass and appointment checkbox are intentionally not carried forward: current requirements enforce two contacts and independent access appointments. Create agreement later does not create a pending/signed document or grant sacrament-release eligibility. Complete the appropriate agreement later through Participant Functions. Deferred receipts retain the same owner/key/payload replay guard as Digital Intake.

Seventeen unused actions are also retired from active Intake: former separate identity/contact/capacity/agreement writes, their unused helper reads and the dormant upload action. Enrollment now has one transactional write dispatch. The browser duplicate-warning audit cannot emit intake.completed; that event belongs to the atomic database transaction.

The full application suite exercises 24 existing Digital/Contributor cases plus 18 deferred cases, 14 server rollback/retry boundaries, request/response loss, signing no-replay, scopes, menu/native page consistency and export preservation. Protected paper delivery, native pull/Deploy behavior, restored PostgreSQL 16 owners/grants and installed-environment acceptance remain separate release gates. Apply the updated backend atomic migration before pulling this development candidate. Master and the shipped SignatureGate export remain unchanged.

Fresh PostgreSQL 16.13 concurrent-session CI now passes (run 39194685976): committed replay, rollback retry, payload conflict and owner conflict are observed under real lock contention, with one surviving enrollment/receipt/audit and successful disposable cleanup. This closes the fresh-engine contention check, not production restore/ownership or native acceptance.
