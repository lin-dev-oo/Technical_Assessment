# CSV import validation research

Research date: 2026-11-17. Scope: the three-day assessment in README.md, a small comments dataset, simultaneous overlapping uploads, real-time diffs, and optional manual resolution. Recommendations below are design judgments, not claims that one policy is universally best.

## What production systems demonstrate

Both atomic rejection and partial success are legitimate policies. PostgreSQL COPY defaults to stopping; its optional `ON_ERROR ignore` skips rows with input-to-type conversion errors. This is a narrowly defined facility, not permission to ignore every malformed CSV or business-rule violation. [PostgreSQL COPY](https://www.postgresql.org/docs/current/sql-copy.html)

Snowflake explicitly offers continue, skip-file, and abort policies. It also separates validation from loading: validation mode can report errors without loading data. These options show that policy depends on the import contract and recovery workflow, rather than a universal production convention. [Snowflake COPY](https://docs.snowflake.com/en/sql-reference/sql/copy-into-table)

Snowflake's troubleshooting workflow distinguishes loaded, partially loaded, and failed jobs; it demonstrates exporting rejected records for correction. A first-error summary is insufficient when a file contains many independent errors. [Snowflake troubleshooting](https://docs.snowflake.com/en/user-guide/data-load-bulk-ts)

## Structure errors versus row errors

CSV syntax is not equivalent to splitting lines on commas. The csv-parse maintainers document unclosed quotes, incorrect field counts, and record-size errors. Crucially, their skip-on-error documentation warns that after a quoting error, a parser may not know whether a newline separates records or belongs inside a quoted field. [Parser errors](https://csv.js.org/parse/errors/), [skip_records_with_error](https://csv.js.org/parse/options/skip_records_with_error/)

Recommended classification:

| Class | Examples | Assessment policy |
|---|---|---|
| File/structure | Missing or duplicate required headers; malformed quoting; unsupported encoding; exceeded size limit | Reject the file; never guess record boundaries. Report the reliable parser location and reason. |
| Row validation | Invalid ID, missing required value, invalid email under documented rules, duplicate ID within this file | Collect all safely discoverable errors; reject dataset changes for the entire file. |
| Existing-data overlap | Same ID and same content; same ID and different content | Classify as unchanged or conflict, respectively. A valid overlap is not malformed input. |

Missing/extra column counts can be recoverable when record boundaries remain reliable, but strict rejection is simpler here. Do not promise a complete list of downstream row errors after a fatal parse error. Report logical record numbers separately from physical line numbers, since valid fields may span lines. These are application recommendations based on the parser limitations above.

Field rules are domain choices, not automatic production best practices. For this assessment, map columns by their names and allow reordered columns; require each of `postId`, `id`, `name`, `email`, and `body` exactly once. Document whether additional named columns are rejected or ignored with a warning; do not silently map them by position. Avoid an unnecessarily restrictive email expression, do not require email deliverability, and do not lowercase or trim every value indiscriminately. Preserve body text and formatting. Set ID ranges and text limits deliberately rather than inferring arbitrary restrictions from the sample. These are proposed application rules, not requirements stated in README.md.

## Proportionate assessment recommendation

Use **strict validation with an atomic dataset write**, plus a useful error report. For example, if 498 records are valid and two are invalid, show “Import rejected: 2 invalid records; no dataset changes” and list both errors. Report record number, ID if available, field, stable error code, and actionable explanation. Do not silently discard rows. This policy is easy to explain and test within three days and avoids mixing partially imported state with concurrent conflict resolution.

Validate the whole bounded upload before opening a write transaction. Persist a small import/job record and validated candidate rows if manual decisions need to survive reconnects. Distinguish `rejected`, `awaiting_resolution`, and `committed`; uploading all bytes is not the same as committing data. Persisting diagnostic/job metadata on rejection is compatible with zero changes to the comments dataset.

For valid conflicts, stage the candidate and show its diff against current data. If the chosen contract promises an all-or-nothing import, keep its nonconflicting records staged too until conflicts are resolved, then commit the whole chosen result. Alternatively, inserting new records immediately and holding only conflicts is a defensible different contract, but must be described as staged/partial application, not whole-file atomicity.

Partial success becomes attractive for large, independent records where preserving valid work matters more than a complete batch. It requires explicit accepted/rejected counts, downloadable errors, clear retry semantics, and a visible partial-success status. It is an optional future policy here, not necessary infrastructure for 500 rows.

## Concurrent uploads and stale decisions

Validation is not concurrency control. PostgreSQL Read Committed takes a new snapshot per statement, so a prior preview cannot guarantee what exists when an import commits. [Transaction isolation](https://www.postgresql.org/docs/current/transaction-iso.html)

A simple implementation choice for this scope is one short dataset-scoped transaction advisory lock around reading the current records, classifying conflicts, and applying the decision. All write paths must obey it, including manual edits and resolutions. PostgreSQL documents that advisory locks are application-enforced and that transaction-level locks release automatically; it also warns against holding transactions open while waiting for user input. [Explicit locking](https://www.postgresql.org/docs/current/explicit-locking.html)

Do not hold the lock while parsing, uploading, or displaying a dialog. Stage conflicts, release the transaction, then reacquire the same lock and compare stored expected row versions when resolving. If a version changed, return a stale-conflict response with a refreshed diff instead of overwriting the newer value. A database primary key on `id` remains necessary. `ON CONFLICT` supports database conflict handling but does not itself implement the product's manual conflict policy. [PostgreSQL INSERT](https://www.postgresql.org/docs/current/sql-insert.html)

Publish real-time change notifications only after commit. Include import ID and dataset revision so clients can refetch and reject stale UI results. Reconnect should refresh authoritative state. The three-second UI requirement should be tested with two concurrent browser sessions; database correctness does not by itself guarantee notification delivery.

## Retries

Use a client-generated import request ID and a server-side uniqueness constraint. Store a payload hash and import outcome: retrying the same ID and payload returns the existing job/result; reusing an ID with different bytes is rejected. This adapts a documented API pattern: Stripe uses idempotency keys to avoid duplicated effects on network retries and checks that repeated parameters match. [Stripe idempotent requests](https://docs.stripe.com/api/idempotent_requests)

An identical record comparison alone is not sufficient request idempotency: a delayed retry could otherwise overwrite a later edit. A file hash alone is also not the request identity, since deliberately importing the same file later can be a new action. Keep these semantics distinct.

## Focused tests

- Multiple invalid rows return useful errors and leave the dataset unchanged.
- Malformed quoting, header problems, empty files, multiline values, and within-file duplicate IDs follow documented rules.
- Identical overlaps are unchanged; changed overlaps produce accurate old/new diffs.
- Two uploads introducing the same previously absent ID cannot silently overwrite each other.
- A resolution against an outdated version refreshes the conflict.
- Retrying after a lost response returns the original import outcome without repeating writes.
- Both browsers see committed changes within the required interval, including after reconnect.
