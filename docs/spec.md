## Latest confirmed upload and recovery behavior (19 November 2026)

This section supersedes the earlier partial-import/persistent-proposal browser workflow below. A browser upload containing any conflicting record is held in its entirety outside the accepted table. New IDs and conflict choices remain unsaved until every conflict has a confirmed choice and the user applies the upload. Closing, Escape, outside dismissal, or Reject upload rejects that entire staged file. The server applies all accepted choices and new rows in one transaction, checks the complete accepted snapshot and each reviewed version, and preserves original outcomes for retries. Other sessions may continue editing while a file is staged; later changes require renewed review. Files with no conflicts still import immediately. The sole upload endpoint is /api/imports. The older /api/uploads endpoint is retired and returns 404. Persistent alternatives already stored by earlier versions remain reviewable/resolvable; no new upload uses that legacy merge flow. Stored historical request outcomes remain untouched.

Use a single clear control inside Search, themed Sonner notifications for transient feedback, and First/Previous/direct-page/Next/Last pagination. Review changes remains available before saving a stale draft. Saving a stale draft immediately opens a required comparison of Current version and Your version: Use my version saves against the version shown; Use current version discards the local draft. Neither Escape nor outside dismissal bypasses this decision. A further concurrent change refreshes the comparison instead of overwriting it.

Live updates recover missed change and presence messages through acknowledged heartbeat snapshots, refresh on return to the app, and fall back to HTTP refresh when the socket is unresponsive. Open upload comparisons refresh their current values and invalidate choices tied to older revisions. If another session removes all conflicts, applying the remaining upload still requires explicit confirmation.

## Module responsibilities (19 November 2026)

The user approved retiring the unused legacy upload API and simplifying the frontend controller. Keep one atomic import implementation. The import-workflow module owns transfer, request retry identity, staged choices, review navigation, refresh/rejection/application and review dialogs. App composes browsing, table editing and this workflow through a small interface. Preserve observable UI, concurrency guarantees and existing-data recovery. Tests upload through /api/imports; historical conflicts are explicit database fixtures, not a second upload path.

## Problem Statement

Users need to import, inspect, search, and edit a shared collection of comments from CSV files while another browser session is working on the same data. Concurrent uploads and edits must not silently overwrite accepted values. Users need an understandable comparison of competing versions and confidence that decisions propagate to both sessions within three seconds.

The assessment requires the supplied sample CSV, upload feedback, database persistence, pagination, responsive search, validation, real-time differences, tests, Docker Compose, and an explainable simultaneous-upload demonstration. The confirmed scope is a focused fixed-schema application with active-cell presence as its distinguishing feature.

## Solution

Provide one shared comments table, one upload flow, and one conflict-review panel. An upload inserts new comments, counts unchanged duplicates, and preserves changed existing comments as pending alternatives. Omitted comments remain untouched. Users edit non-conflicted comments with explicit Save/Cancel and resolve conflicts by choosing one complete version.

Keep accepted data visible until a resolution commits. Preserve in-memory drafts when saves fail or become stale. Show temporary session labels at active cells without locking them. Keep conflict decisions persistent and broadcast only committed changes.

## User Stories

1. As a user, I want to upload the supplied comments CSV, so that I can populate the shared dataset.
2. As a user, I want actual upload progress followed by processing status, so that I understand whether data is still transferring or being validated.
3. As a user, I want a summary of inserted comments, unchanged duplicates, and pending conflicts, so that I understand the result.
4. As a user, I want invalid files rejected before any dataset changes, so that errors cannot leave a partially imported file.
5. As a user, I want actionable record and field errors, so that I can fix all safely discoverable problems together.
6. As a user, I want missing and unexpected headers listed, so that I can correct an incompatible file.
7. As a user, I want reordered and differently capitalized headers accepted, so that harmless export differences do not block me.
8. As a user, I want malformed CSV, duplicate headers, and duplicate comment IDs rejected, so that the import has an unambiguous meaning.
9. As a user, I want clear empty-file and upload-limit errors, so that unsupported uploads are easy to correct.
10. As a user, I want valid quoted commas and line breaks preserved, so that comment text is not corrupted.
11. As a user, I want new IDs inserted, so that uploads can extend the dataset.
12. As a user, I want omitted IDs retained, so that a partial file does not delete unrelated comments.
13. As a user, I want unchanged duplicates counted without additional conflicts, so that repeated data creates no unnecessary work.
14. As a user, I want changed existing comments staged as pending alternatives, so that uploads cannot silently overwrite accepted data.
15. As a user, I want an upload retry to return its original outcome, so that a lost response does not process my file twice.
16. As a user, I want accepted comments displayed in a paginated table, so that I can browse the dataset.
17. As a user, I want page sizes of 10, 25, and 50 with 25 as the default, so that I can control table density.
18. As a user, I want search across the whole accepted dataset, so that results are not limited to the visible page.
19. As a user, I want responsive debounced search, so that typing remains smooth.
20. As a user, I want live refreshes to preserve my search and valid page, so that collaboration does not reset my work.
21. As a user, I want explicit Save/Cancel for non-identifier fields, so that I control when an edit is submitted.
22. As a user, I want immutable comment IDs, so that record identity remains stable.
23. As a user, I want stale saves rejected without losing my draft, so that another session's changes are not overwritten.
24. As a user, I want current accepted data shown alongside my rejected draft, so that I can deliberately reconcile and retry.
25. As a user, I want editing disabled while a comment has pending conflicts, so that edits do not bypass its review.
26. As a user, I want a draft started before a conflict arrived preserved, so that incoming collaboration does not erase my work.
27. As a user, I want the accepted version and all distinct pending alternatives shown together, so that I can make one informed choice.
28. As a user, I want changed fields highlighted and basic upload/session labels shown, so that differences are understandable.
29. As a user, I want identical pending alternatives represented once, so that the review is not cluttered.
30. As a user, I want to choose one complete version, so that resolving a conflict is explicit and predictable.
31. As a user, I want choosing the accepted version to reject the reviewed alternatives, so that I can retain existing values.
32. As a user, I want outdated resolutions rejected and refreshed, so that I never reject alternatives I have not seen.
33. As a user, I want pending conflicts to survive refreshes and server restarts, so that review work is not lost.
34. As a user, I want committed changes visible in both connected sessions within three seconds, so that I can collaborate without manual refreshes.
35. As a user, I want authoritative data refetched after reconnection, so that missed notifications do not leave my screen stale.
36. As a user, I want clear connection/save errors and an intact draft, so that I can retry deliberately.
37. As a user, I want to see the cell another session is editing, so that I can avoid unnecessary collisions.
38. As a user, I want temporary session labels and colors without login, so that the two-session demo is easy to follow.
39. As a user, I want presence indicators to clear when activity stops or a connection expires, so that inactive sessions do not appear to own cells.
40. As a user, I want to remain able to edit a cell another session is editing, so that advisory presence does not block work.
41. As an evaluator, I want Docker Compose startup and clear setup/demo instructions, so that I can reproduce the application.
42. As an evaluator, I want automated evidence for concurrent inserts, stale edits, competing resolutions, and retries, so that the conflict strategy is demonstrably correct.

## Implementation Decisions

- Use shadcn/ui and restrained purple accents. Follow the UI direction document for original, workflow-driven design and visual verification. The user's reference image indicates craftsmanship only; its layout and features are not requirements.
- Build a React/TypeScript frontend and Node.js/TypeScript backend with PostgreSQL. Use Docker Compose for the application and database.
- Maintain one shared dataset with fixed columns: postId, id, name, email, body. Use ordinary PostgreSQL columns and a primary/unique constraint on id.
- Separate CSV validation, transactional comment/import operations, real-time delivery, and browser state. No existing application modules or test seams exist; the repository currently contains the brief, sample, glossary, and design notes.
- Validate the whole bounded file before starting its write transaction. Limit uploads to 5 MB and 10,000 records. Reject empty and header-only files.
- Match headers case-insensitively in any order while displaying canonical names. Reject missing, unexpected, duplicate, blank, or whitespace-padded headers.
- Require positive integer id/postId values, nonblank name/email/body, basic email syntax, and unique IDs within a file. Reject values outside supported numeric storage bounds. Preserve text and properly parsed multiline/quoted content.
- Report logical record locations and field errors where reliable; do not promise subsequent row diagnostics after an unrecoverable CSV structure error.
- Use a shared short dataset-level database write lock for every mutation, plus transactions and constraints. Do not hold locks while receiving/parsing files or awaiting user input.
- Classify uploads against current accepted records inside the transaction: new ID becomes an accepted comment; identical values count as unchanged; changed values become persistent pending alternatives. Do not delete omitted IDs or overwrite accepted values.
- Deduplicate pending alternatives by direct comparison of parsed, validated values. Store basic upload/session labels without a detailed provenance subsystem.
- Persist an upload request identity and outcome. A retry of the same request and content returns the original result; reusing an identity for different content is rejected. Concurrency must not allow two executions of one request. Equality of current records alone is insufficient retry protection.
- A save request includes the expected accepted-record version and edited non-identifier values. Reject it if the version changed or pending conflicts now exist. Do not silently rebase or create a proposal from the draft.
- A review response contains the accepted version, distinct alternatives, accepted-record version, and proposal-set revision.
- A resolution request identifies the selected accepted/pending version and carries both expected revisions. Atomically verify them, apply the selected version, and close the reviewed alternatives. Ensure competing resolutions and newly arriving proposals invalidate stale decisions, even when accepted field values have not changed.
- Persist pending alternatives and revision state across restarts. An upload arriving after a completed resolution may create another conflict.
- Use HTTP for uploads, listing/search, edits, review retrieval, and resolutions. Return structured validation failures and stale/conflicted outcomes distinguishable from transport errors.
- Use WebSockets for post-commit notifications and temporary active-cell presence. Refetch authoritative data after notifications and reconnection; preserve in-memory drafts and guard against stale asynchronous search responses.
- Presence contains a temporary session identity, label/color, comment ID, and active field. It follows the active cell, clears on leaving/disconnect, and expires after a short timeout. Rate-limit it, keep it out of persistent comment storage, and never treat it as a lock or authentication.
- Use explicit Save/Cancel, not auto-save. Disable new edits on conflicted comments; preserve pre-existing drafts if conflicts arrive mid-edit. Do not repeatedly interrupt typing or discard drafts after rejected saves.
- Search accepted name/email/body values case-insensitively with exact numeric matching for id/postId. Search the complete accepted dataset, debounce input, reset the page when the query changes, and use stable pagination.
- Committed changes must appear in both connected browsers within three seconds under the supported local Compose demo. Preserve search/page where valid, moving to the last valid page if needed.
- Treat the deployment as one backend instance for this assessment; distributed presence/event fanout is not part of this scope.

## Testing Decisions

- The user confirmed these test boundaries: use the public API against real PostgreSQL as the primary seam for imports, edits, and resolutions; focused two-browser tests for collaboration; small pure parser/validation unit tests.
- Good tests assert externally observable results, persisted outcomes, and errors rather than SQL query shape, private functions, React implementation details, or mock call counts.
- No prior application tests or testing conventions exist in this repository. Introduce the minimum infrastructure necessary for these boundaries.
- Parser tests cover canonical/reordered/case-varied headers, missing/extra/duplicate headers, malformed quoting, quoted commas/newlines, empty/header-only files, limits, invalid IDs, duplicate IDs, blank required values, email syntax, and text preservation.
- API/database tests verify all-or-nothing validation, transaction rollback, new/unchanged/conflicting classification, retained omitted IDs, alternative deduplication, and persistence across service reconnection/restart.
- Test simultaneous uploads introducing different values for the same previously absent ID: exactly one accepted insert and a pending alternative, with no silent overwrite.
- Test duplicate upload requests, concurrent retries, changed-content request identity reuse, and retries after accepted data subsequently changes.
- Test two edits based on one record version: the first valid save succeeds and the second is stale. Test conflict arrival before a save and server-side enforcement of edit restrictions.
- Test competing resolutions, a new alternative arriving after review, and unchanged accepted values with changed proposal revisions. Only a review of the current complete set may resolve it.
- Focus browser automation on two-session conflicting uploads, stale edit draft preservation, grouped resolution and notification delivery within three seconds, reconnect/refetch behavior, and a lightweight presence lifecycle check.
- Use controlled concurrency at the API boundary to prove races; do not rely on arbitrary sleeps to infer correctness.
- Provide a repeatable Compose demo using the supplied CSV and small derived conflicting samples.

## Out of Scope

- Multiple datasets, dataset selection/deletion, full replacement snapshots, or deletion of omitted comments.
- Arbitrary CSV schemas, user-selected identifiers, adding/removing/renaming columns, dynamic column IDs, and JSONB record storage.
- Auto-save, durable per-tab draft recovery, offline synchronization, or automatic retry of stale drafts.
- Inline edits becoming proposals on already-conflicted comments.
- Field-level merge decisions, detailed provenance/history systems, elaborate alternative hashing infrastructure.
- Authentication/authorization, mouse-pointer tracking, shared keystrokes, exclusive cell locks, and distributed multi-backend coordination.
- Exhaustive browser tests for every UI permutation.

## Further Notes

The user confirmed this focused scope after comparing merge imports with replacement snapshots. The fixed-schema, record-merge model supersedes earlier generic-editor discussions. Active-cell presence is the one retained differentiator.

Implementation was authorized, but no application code has been written. This specification captures the confirmed design rather than starting a new interview. The test boundaries were separately confirmed for this specification.

The assessment's three-day timeframe favors a clear, reproducible conflict strategy over additional editor functionality. Preserve the original assessment wording in the submission documentation and explain the chosen interpretation: uploads merge records, omitted records remain, and whole-record choices resolve persistent alternatives.

