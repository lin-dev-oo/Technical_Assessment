# Two-session assessment demo

Start with the [setup instructions](../setup.md). Run from the repository root. This sequence assumes an empty database and the exact supplied `data.csv`; do not modify that sample. Browser A and B should be separate browser contexts (for example a normal window and a private window), both at [localhost:3000](http://localhost:3000). Keep them visible side by side and wait for **Live updates connected** after importing.

For an empty collection while preserving an existing default Compose database, stop the default services and start a separate project. This uses the same ports and a different named volume:

```powershell
docker compose stop
docker compose -p assessment-demo up --build -d
Invoke-RestMethod http://localhost:3000/api/health
```

For every Compose command during this isolated run, include `-p assessment-demo`. Afterward, `docker compose -p assessment-demo down` stops it and keeps its data; `docker compose start` resumes the original project. Repeating the isolated demo with its existing volume retains prior results. Only if you intend to discard that project's demo data, use `docker compose -p assessment-demo down -v` before starting it again.

## Fixture outcomes

Counts below are `inserted / unchanged / conflicts requiring review`. Conflicting browser files are staged in full, with no accepted writes until Apply upload. The fixture table's alternatives are private staged candidates, not persistent legacy alternatives.

| File | Starting condition | Expected outcome |
| --- | --- | --- |
| [Original data.csv](../../data.csv) | Empty database | `500 / 0 / 0`, accepted IDs 1–500 |
| Original data.csv again | Immediately after first import | `0 / 500 / 0` |
| [conflicting-a.csv](conflicting-a.csv) | Sample imported, #1 unresolved | `0 / 0 / 1`; #1 body becomes a pending alternative |
| [conflicting-b.csv](conflicting-b.csv) | Sample imported, #1 unresolved | `0 / 0 / 1`; second distinct alternative, including a quoted comma and actual newline |
| [absent-a.csv](absent-a.csv) and [absent-b.csv](absent-b.csv) | #1001 absent | Across the two uploads: one `1 / 0 / 0` and one `0 / 0 / 1`, with either file winning |
| [invalid-mixed.csv](invalid-mixed.csv) | #1002 and #1003 absent | Whole file rejected; neither ID inserted. Record 3 errors: postId, email and body |

These small files are derived examples using the supplied five-column schema. They omit other records intentionally: uploads merge records, and omitted IDs remain untouched. The absent-ID fixtures use new comment #1001/post #101; the invalid fixture uses #1002/#1003. Avoid reusing those IDs for another demo before this sequence.

## Walkthrough

1. In A, choose **Upload CSV** and select `data.csv`. Selection starts transfer immediately. Observe transfer percentage, then processing, then the first fixture outcome. Small local files may finish too quickly to inspect the transient stages separately; progress is actual transferred bytes. B loads the same accepted comments without a manual refresh.

2. Check the default 25 rows; use Next page and select 10, then 50 rows. Search `500` to find a record outside the initial page, then `ELISEO@GARDNER.BIZ` to demonstrate case-insensitive email search for #1. Numeric search matches exact comment/post IDs as well as text substring matches; `1` is not an ID-only filter. Clear search. Search/page state is retained during live refresh where valid, while changing the query resets the page after the 250 ms debounce.

3. Upload `data.csv` again to obtain `0 / 500 / 0`. Select `invalid-mixed.csv`: the valid first data row must not appear. Check the record/field diagnostics, search `1002` and `1003` and expect no matches; clear search afterward.

4. Select conflicting-a.csv in A and conflicting-b.csv in B. Each uploader opens its own review immediately, showing Current version and Alternative 1. Neither file changes accepted rows while it is under review. Previous/Next navigates multi-record reviews. Confirm choice stages a decision; only Apply upload saves the whole file.

5. Reject or close A's review. Refresh A: its file must have changed no records, inserted no new IDs, and left no recoverable pending alternatives. An unsolved review is rejected rather than resumed after dismissal.

6. In B choose an alternative and Apply upload. A sees the committed result within three seconds. If another session changes accepted data before B applies, the server rejects the stale batch without partial changes and shows a fresh review. Repeat an applied upload to verify unchanged counts; restart/recreate Compose to verify accepted data persistence.

7. Repeat simultaneous selection using absent-a.csv and absent-b.csv. One transaction inserts #1001 immediately; the other sees an existing row and opens a review without overwriting it. Accepted total is 501. Rejecting the second file preserves the first result; applying its chosen alternative updates the same ID without inserting another row.

8. Clear search and locate #2 in both windows. Click **Edit** in both, change A's body to `Saved by session A`, and B's to `Unsaved draft from session B`. Before saving, focus each body field and inspect the other session's **Session … · editing** label. Both sessions can edit the same cell. Move A's focus to Search or Cancel to clear its presence without claiming ownership. Merely retaining a draft does not mark a cell active. Switching windows or tabs retains the selected edit cell; if a heartbeat disappears without a clean disconnect, presence expires within 13 seconds.

9. Save A's edit. B keeps its local draft while current data updates in the background. Click **Save** in B: **Resolve edit conflict** opens immediately with **Current version** and **Your version**. Choose **Use my version** to save B's draft against the exact current version shown, or **Use current version** to discard B's draft and keep A's data. Escape and outside clicks cannot skip this choice. Another concurrent edit refreshes the comparison and requires a fresh decision. **Review changes** is also available before Save for optional inspection. A sees any committed result within three seconds.

10. Start another draft in B and leave its body focused. Stop the app with `docker compose stop app`, then start it with `docker compose start app`. Observe disconnected/reconnecting/connected status. Search, valid page, unsaved text and focus remain; accepted rows and open reviews refetch on reconnect. An unsuccessful save is never replayed automatically. Cancel the draft to finish. Refreshing or leaving warns before discarding changed in-memory drafts.

## Explaining the conflict strategy

Every bounded file is fully received and validated before its write transaction. Invalid CSV rejects the entire file. Conflict-free browser uploads insert new IDs and count unchanged rows immediately. A conflicting file is staged in full outside accepted data until all choices are confirmed and Apply upload validates and commits the complete batch. Dismissal rejects the entire staged file. The only upload endpoint is /api/imports; /api/uploads has been retired. Existing stored conflicts remain recoverable. Imports never replace the dataset or delete omitted IDs. Ordinary search reads accepted values only.

Every mutation uses the same short transaction-level PostgreSQL advisory lock, plus normal constraints and a transaction. Parsing, file transfer and user review occur outside that lock. Concurrent absent-ID uploads therefore serialize classification against current committed data: one inserts, and the next observes it before deciding whether to count unchanged or stage its whole file. Direct value comparisons deduplicate alternatives.

A manual save carries the expected accepted-record version and is rejected if that version changed or conflicts exist. Resolution checks both the accepted-record version and the proposal-set revision atomically. Keeping accepted values still advances the proposal revision, so it invalidates an old review even though the accepted values did not change. No review can dismiss alternatives it has not seen.

An upload identity and raw-content digest persist with the original outcome. Retrying the same request and bytes returns that outcome even after later edits or resolutions; different bytes with that identity are rejected. **Retry upload** reuses the browser's retained identity after an uncertain response. Selecting a file again is a new request. Database failure rolls back both mutations and the upload outcome.

Only committed changes publish WebSocket invalidations. HTTP remains authoritative: browsers refetch after notifications, reconnects, and return to the app. Acknowledged heartbeats carry the current data revision and full presence snapshot so missed push messages recover; unresponsive sockets trigger HTTP refresh and reconnection. Open staged upload comparisons refresh too and clear outdated choices. Unchanged uploads, duplicate alternatives, retries and rolled-back/rejected operations do not publish dataset changes. Presence is separate transient activity, has rate limits and expiry, and never bypasses save/review checks.

## Verification evidence

Run all [documented test commands](../setup.md#tests). API tests force write overlap at a database barrier. Focused browser tests assert both observers under one three-second deadline measured from before the mutation or barrier release; they also check reconnect, stale drafts, grouped alternatives and presence. Manual side-by-side operation demonstrates the workflow; automated timings provide the precise bound.

Inspect populated tables, validation errors, stale drafts, comparison choices and presence at a wide desktop width and around 390px. Scroll the table horizontally on narrow screens to reach all fields/actions. Check keyboard focus, dialog dismissal/focus restoration and full long-content access. Record actual measured timings, passed suites and any uninspected states in [final verification](../verification.md), without treating historical runs or generated screenshots as current evidence.
