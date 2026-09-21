# Programme document size safety

The current storage format remains inline: sessions are not moved to separate
documents. No live data migration or deployment is performed by this change.

`backend/utils/programDocumentSize.cjs` is shared with the browser build. It
estimates UTF-8 strings, field names, maps, numeric arrays, timestamps, references
and binary values. A 900 KiB application threshold leaves headroom under the
Firestore 1 MiB document limit; this is an estimate, not a server quota override.

Checks cover Builder creation and updates, programme views, player progression,
duplication, assignment, cycle draft writes, backend auto generation, subscription
cycles, premium delivery and template-to-client synchronization. Transactional
updates check the latest complete document, not just the patch. Failure leaves the
previous document untouched. Bulk synchronization can still have committed earlier
groups when a later group fails; it is not globally atomic.

Canonical `sessions` is preserved. Redundant legacy `seances` is removed on saves
containing sessions and on synchronization; legacy reads remain supported. No
exercise, set or historical result is truncated to meet the threshold.

Oversized documents are rejected with a client error translated into seven
languages. This does not yet support arbitrary large programmes: separate session
documents, immutable shared exercise versions, lazy loading, migration and matching
security rules would be a separate storage-format change. Existing data, admin
scripts and external/old application writers are not automatically migrated or
covered by these application-level checks; Firestore still enforces its own limit.

Run `node scripts/testProgramDocumentSize.mjs` for threshold, UTF-8, numeric-array,
merge/update, no-write-on-error and translation checks.
