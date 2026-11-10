# Reproducible development checks

Use Node.js 22 or later and Python 3. Check out SignatureGate beside SignatureGate-Appsmith. The private package version `0.0.0` describes this test harness, not the application release or a tag.

```bash
npm ci --ignore-scripts
npm test
```

PGlite is pinned to the exercised `0.5.8` package with its integrity hash. The runner discovers source/controller tests, checks generation, collection entry, bindings, startup declarations and routes, then executes four actual-source SQL/controller suites against fresh in-memory databases. Every failed child stops the run with a nonzero result. It makes no Appsmith, operational database, Docker or integration call; signing/ERP/mailing HTTP in fixtures is stubbed. Database fixtures are synthetic and discarded.

For source checks without installed npm dependencies: `npm run test:source`. For SQL checks alone: `npm run test:sql`. Override the sibling schema explicitly with `npm test -- --schema /path/to/SignatureGate/db/schema.sql`. Record both repository commits with results. The package lock alone does not pin the separate SignatureGate schema.

The Intake suite includes 24 Digital/Contributor plus 18 deferred enrollment/contact/consent cases plus eight injected atomic-request/lost-response failures and durable receipt recovery. The backend contract suite adds 14 failures at transaction stages and validates full rollback plus safe retry. It checks persistent recovery markers, reload/ordinary-replay blocking, account isolation, acknowledged reset and known signing agreement IDs. The active Intake path now uses a single database transaction and owner/key/payload idempotency. Real multi-session scheduling, the installed PostgreSQL 16 environment and Appsmith storage behavior remain separate acceptance scopes.

Table presentation tests reject expressions in literal Appsmith 2.4.2 column titles and exercise independent Created/Updated timestamp values, null/invalid/empty cases and page-title removals. Native rendering and persistence through editor sync require a focused development observation. Previously accepted navigation and backend role tests need not be repeated manually.

The embedded PostgreSQL engine supplies actual SQL semantics for the fixtures; it is not the deployed PostgreSQL 16.13 cluster, its owners/grants or a restored production upgrade. Integration principals/destinations, protected paper upload, delivery, backup recovery and final production publication/export remain release gates.

The development-checks workflow runs the full suite on development pushes/pull requests and permits manual dispatch. It checks out the canonical SignatureGate schema at an explicit commit, uses the locked dependency and prints both source SHAs. It has read-only repository permissions and makes no operational database or service calls. Update the schema pin deliberately when the coordinated backend prerequisite changes. Reporting fixtures cover Contributor attribution reconciliation and independent Participant/Contributor creation history; menu/title fixtures exercise configured labels across every saved page.

A separate CI job runs the atomic contract and four lock-observed concurrent-session cases against disposable PostgreSQL 16.13: committed replay, rollback retry, changed payload and changed owner. It uses synthetic principals, creates/removes only its unique validation database and calls no external service. This supplies real-engine contention evidence independently of PGlite; installed ownership/grants and protected restored-production rehearsal remain open.

Paper coverage now includes the actual frontend controller, canonical migration/rollback fixtures and actual n8n Code bodies with synthetic files. Header authentication/branching, content validation, no-email entry, lost-response no-replay, owner/assignment scopes, independent review, cancellation tombstones and audit atomicity are checked. Live service credentials, storage retrieval and native file-picker/modal behavior still require the focused test deployment.
