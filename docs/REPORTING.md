# Reporting definitions and development validation

Reports is available to canonical active Document Reviewers, Donations Reviewers and Spiritual Practitioners. Directory Manager alone does not grant reporting authority. Report choices, chart series, data-row labels, navigation entries and current-page titles honor installed Participant/Contributor terminology. Stable route/API identifiers remain technical compatibility names.

| Metric | Meaning | Authority |
| --- | --- | --- |
| Participants created | Participant enrollment records created within each bucket, independent of the person's creation date. Ended enrollment retains its creation history. | Document Reviewer: all; Spiritual Practitioner: current active assignments |
| Contributors created | Individual and company Contributor capacity records created within each bucket, independent of identity or donation creation. Archived/merged records retain creation history. A person with both capacities counts once in each respective metric. | Donations Reviewer |
| Contributor-linked donations | Donations explicitly attributed through a Contributor ID, including individual and company Contributors; participation is not required. Later Contributor archive does not remove historical attribution. | Donations Reviewer |
| Individual / company Contributor donations | The two subdivisions of Contributor-linked donations. | Donations Reviewer |
| Participant-linked donations (subset) | Identified individual-Contributor donations whose person currently has active Participant capacity. This is a current relationship filter, not proof of Participant status when donated. It overlaps Contributor totals and is opt-in. | Donations Reviewer |
| Anonymous / unresolved donations | Unattributed donation categories kept separate from Contributor attribution. | Donations Reviewer |
| Donations received | All supported identified, anonymous and unresolved donations in the bucket. | Donations Reviewer |

Donation counts and dollar metrics preserve the existing included statuses: verified, imported and pending review; rejected donations are excluded. Buckets use donated-at with created-at fallback. Dollar series and counts are separate measures. Within valid canonical attribution, Contributor-linked + anonymous + unresolved reconciles to the total; individual + company reconciles to Contributor-linked. Do not add the Participant subset to either total. Capacity-creation counts use capacity created-at, not donation dates; one enrollment does not imply the other. Physical deletion and the viewer's current assignment/permission scope are not historical snapshots.

The default metric set includes both capacity-creation metrics and Contributor-linked donation totals where authorized. Participant-linked donation metrics require explicit selection. Retained development selections using old member-prefixed keys normalize to Participant keys. Raw compatibility keys are hidden in the table; visible metric labels are formatted with the same configured vocabulary as charts.

## Automated coverage

Run from a development checkout with SignatureGate as a sibling:

```bash
npm ci --ignore-scripts
npm test
```

The SQL fixtures execute the saved query itself: individual/company/dual-capacity attribution, anonymous/unresolved reconciliation, rejected exclusions, capacity creation dates, ended/archived history, retained selections, role/assignment scoping, direct unauthorized metric requests and disabled accounts. Controller/expression fixtures evaluate alternate vocabulary, defaults, chart/table choices, account switches, and menu/title bindings on all pages. Fixtures are synthetic; no operational data or external service is read. CI pins the canonical schema SHA and records that provenance.

## Focused deployed observation

After the automated suite passes, pull the accepted `chatgpt_development` candidate while retaining `signaturegate_test`. If the operational `member` terminology row still says Member, use the existing audited Participant adoption runner in SignatureGate or save Participant/Participants through Terminology Administration; the reserved event `participant` row is unrelated.

With the existing multi-role reviewer account, check once that the navigation/current-page title says Participant Functions (and the configured Contributor equivalent), then open Reports and run a period containing known test enrollments. Confirm readable Participants Created and Contributors Created choices/results and Contributor-linked count/value; the Participant-linked subset should be available separately rather than selected by default. Compare only expected synthetic counts locally; return pass/fail and development/deployed mode, not record data or values. No additional broad role/navigation matrix or database migration is required for this increment.

The source/SQL tests do not certify native Appsmith rendering, PostgreSQL 16 owner/grants, restored upgrades or external delivery. Those remain coordinated release gates.
