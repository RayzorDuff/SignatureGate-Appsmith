# Reproducible development checks

Use Node.js 22 or later and Python 3. Check out SignatureGate beside SignatureGate-Appsmith. The private package version `0.0.0` describes this test harness, not the application release or a tag.

```bash
npm ci --ignore-scripts
npm test
```

PGlite is pinned to the exercised `0.5.8` package with its integrity hash. The runner discovers source/controller tests, checks generation, collection entry, bindings, startup declarations and routes, then executes three actual-source SQL/controller suites against fresh in-memory databases. Every failed child stops the run with a nonzero result. It makes no Appsmith, operational database, Docker or integration call; signing/ERP/mailing HTTP in fixtures is stubbed. Database fixtures are synthetic and discarded.

For source checks without installed npm dependencies: `npm run test:source`. For SQL checks alone: `npm run test:sql`. Override the sibling schema explicitly with `npm test -- --schema /path/to/SignatureGate/db/schema.sql`. Record both repository commits with results. The package lock alone does not pin the separate SignatureGate schema.

The Intake suite includes 24 supported enrollment/contact/consent cases plus 32 injected request/lost-response failures around real source SQL action commits. It checks persistent recovery markers, reload/ordinary-replay blocking, account isolation, acknowledged reset and known signing agreement IDs. This does not establish server transactionality, multi-tab exclusion or a particular Appsmith storage implementation.

Table presentation tests reject expressions in literal Appsmith 2.4.2 column titles and exercise independent Created/Updated timestamp values, null/invalid/empty cases and page-title removals. Native rendering and persistence through editor sync require a focused development observation. Previously accepted navigation and backend role tests need not be repeated manually.

The embedded PostgreSQL engine supplies actual SQL semantics for the fixtures; it is not the deployed PostgreSQL 16.13 cluster, its owners/grants or a restored production upgrade. Integration principals/destinations, protected paper upload, delivery, backup recovery and final production publication/export remain release gates.
