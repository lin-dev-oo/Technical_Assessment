# Assessment verification

Latest application checks: **19 November 2026**, implementation commit **39d71dc**. The subsequent documentation audit changes prose and comments only; these results describe the tested application, not a new test run for documentation edits.

## Current results

| Check | Result |
| --- | --- |
| Parser suite | 4 passed |
| Public API/PostgreSQL/WebSocket suite | 27 passed |
| Chromium browser suite | 38 passed |
| TypeScript and production Vite build | Passed |
| Compose configuration validation and app image build | Passed |
| Recreated Compose app health | ok |
| Retired POST /api/uploads | 404; no dataset mutation |
| Accepted data before/after app recreation | 501 records; complete first-page snapshot preserved |

The API and browser suites ran sequentially against the dedicated comments_test database. Deliberate database constraint failures exercised rollback and passed their assertions. Application data was not used as test fixtures.

## Verified behavior

- /api/imports is the sole upload protocol. Conflicting files stage every row, and Apply checks the complete snapshot and reviewed revisions before one atomic transaction. Dismissal rejects the whole staged file.
- Stored alternatives from earlier versions remain reviewable/resolvable. Tests seed this historical data directly rather than recreate the retired upload route.
- Concurrency, retries, identity reuse, stale edits/reviews, rollback, upload review navigation, missed notifications and presence lifecycle are covered through parser/public API/browser seams.
- Staged imports survive a fresh server and database connection and remain safe to apply or reject. A browser regression drops a successful commit response, retries the same request and verifies original-outcome replay without duplicate writes or overwriting a later edit.
- Import transfer, retry identity, staged choices, navigation/recovery and dialogs now belong to useImportWorkflow. App composes that workflow with browsing/editing; no layout or interaction change was intended.
- Rebuilt/recreated only the Compose app; PostgreSQL and its volume were retained. Inspected fresh desktop atomic-review and narrow long-alternative screenshots after the extraction.

## Follow-up: tunneled collaboration

A reported two-computer session stopped displaying presence and conflict updates while still showing connected. Fresh sessions passed the presence check on both the local Compose URL and the same development tunnel. The user confirmed that saving drafts and reloading both browsers restored collaboration. The previous browser state was no longer available, so an outdated bundle versus unhealthy connection state was not isolated; no production sync-code fix was applied on that evidence.

Added a two-browser check with both upload comparisons open: one applies, the other receives the accepted values within three seconds, and active-cell presence still appears/clears afterward. The focused test passed twice, then all 38 Chromium tests and the production TypeScript/Vite build passed. Rebuild/reload guidance is in the README and setup guide. These checks saved test data only in comments_test; production browser checks focused/canceled editors without saving data.

## Limits and historical evidence

This latest pass did not repeat a clean-volume/full database-container lifecycle. Earlier clean-build, database persistence and measured two-session demo evidence is retained in [historical verification](verification-history.md). Older test counts there describe their original runs and are not current suite totals.

Actual transient transfer/processing notifications, native OS window switching and a formal accessibility audit were not independently inspected in the latest pass. Browser coverage is Chromium with desktop/narrow layouts; see [submission review](submission-review.md) for remaining test gaps and scope limits.

Reproduce the application with [setup.md](setup.md) and the [two-session walkthrough](demo/README.md).
