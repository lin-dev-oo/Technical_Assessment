# Assessment design

## Agreed scope

A focused collaborative CSV application: one shared comments dataset, one table, one upload flow, and one conflict-review panel. Active-cell presence is the distinguishing feature. This design supersedes the earlier generic CSV editor scope.

- React and TypeScript frontend; Node.js and TypeScript backend; PostgreSQL; Docker Compose.
- Fixed columns: postId, id, name, email, body. The id column uniquely identifies comments and cannot be edited.
- No multiple datasets, dataset deletion/replacement, arbitrary schemas, identifier selection, or column editing.
- Use ordinary PostgreSQL columns, not dynamic column definitions or JSONB record storage.
- No auto-save or persistent browser draft recovery. Use explicit Save/Cancel and preserve rejected drafts in memory.

## Uploads and validation

- Validate the whole file before dataset changes. Invalid input creates no comments or proposals; show all safely discoverable errors with actionable locations.
- Match headers case-insensitively in any order; retain canonical display names. Reject missing, unexpected, duplicate, empty, and whitespace-padded headers.
- Restore the agreed sample-specific validation: positive integer id and postId, nonblank name/email/body, basic email syntax, and no repeated IDs within a file. Preserve text rather than silently trimming content.
- Limit uploads to 5 MB and 10,000 records; reject empty and header-only files.
- Show transfer progress separately from processing, then inserted, unchanged, and pending-conflict counts.
- Insert new IDs, count identical accepted records as unchanged, and create persistent proposals for differing existing records. Keep omitted IDs and current accepted values untouched.
- Keep distinct pending alternatives with basic upload/session labels. Compare parsed, validated record values directly to avoid identical alternatives; no elaborate provenance or hashing system.
- Protect against repeated processing of retried upload requests with request identity and stored outcomes. Do not rely solely on record equality.

## Editing and conflict review

- Edit non-identifier fields using explicit Save/Cancel and expected record versions.
- Disable editing records with pending conflicts. Preserve any draft begun before a conflict arrived; do not silently submit it as a proposal or discard it.
- On stale saves, preserve the draft, show the current data, and require deliberate retry/review. Show connection/error status and permit retry without losing the draft.
- Review the accepted record and all distinct pending alternatives together. Choose one whole version, accepting it and rejecting the reviewed alternatives; no field-by-field merge.
- Resolution checks both accepted-record version and proposal-set revision. If either changed, refresh the comparison and require another decision.
- The first valid committed resolution wins. Stale requests cannot reverse it. Later uploads may create new conflicts.
- Pending proposals survive refreshes and application restarts.

## Interface and collaboration

- Use shadcn/ui with purple accents and follow the UI direction document. The supplied image is a quality reference only, not a layout or feature template.
- Search accepted comments across name/email/body using case-insensitive text matching, plus exact numeric matches for id/postId. Search the whole dataset, debounce input, and reset to page one when the search changes.
- Default page size 25 with 10/25/50 choices. Incoming updates preserve search/page where valid and preserve in-memory drafts.
- HTTP for uploads and saves. WebSockets for committed-change notifications and active-cell presence.
- Both connected browsers reflect committed changes within three seconds. Refetch authoritative state on reconnect.
- Presence shows a temporary session label and color on the active cell. It is advisory and never locks a cell or replaces version checks.
- Presence follows focus, clears when leaving/disconnecting, and expires after a short timeout. Unsaved drafts do not imply activity. No mouse-pointer tracking or shared keystrokes.
- No accounts; session labels identify browser sessions, not authenticated people.

## Concurrency

- Use database transactions, a unique/primary-key constraint on id, and short dataset-level write locks shared by all mutation paths.
- Never hold locks while uploading/parsing files or awaiting user input. Classify against current database state inside the write transaction.
- If two uploads introduce different values for the same absent ID, the first inserts it and the second creates a proposal rather than overwriting it.
- Publish change notifications only after commits. Presence is temporary and separate from persisted data.

## Verification and delivery

- Unit/integration coverage for validation, merge classification, rollback, retry protection, stale saves, and stale resolutions.
- Focused two-browser scenarios: simultaneous conflicting uploads including the same absent ID, competing resolutions, inline-edit races, and committed updates within three seconds. Include a lightweight presence check, not exhaustive UI permutations.
- Submit the supplied sample CSV, tests, Docker Compose, Git repository, and setup/run/demo instructions.

## Status

The user confirmed the focused scope and authorized implementation, retaining active-cell presence. No application code has been written. A formal specification now captures the agreed scope and confirmed test boundaries.
