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

Counts below are `inserted / unchanged / pending conflicts`. A conflict count describes uploaded changed IDs requiring review, including an already-pending alternative; it is not the number of newly created alternatives.

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

4. Open file selectors in both windows. Select `conflicting-a.csv` in A and `conflicting-b.csv` in B at roughly the same time. Each reports `0 / 0 / 1`. Within three seconds of submission, both windows should show #1 with **2 pending**, without refreshing. The accepted sample body stays visible. Open the review in both: each has the accepted version and the two distinct alternatives, with changed fields highlighted and filename/session labels. Selecting either file again leaves two alternatives; it does not add a duplicate. This manual timing check is complemented by the controlled three-second automated assertions described below.

5. Keep #1 unresolved and test persistence now: run `docker compose restart app` (include the isolated project flag if applicable). Reconnect and reload both browsers; the accepted sample and both alternatives must remain. To verify the database volume too, run `docker compose down`, then `docker compose up -d` with the same project name. Wait for health and reopen #1's review: all three choices must remain. Restarting/reloading is safe here because no unsaved drafts have been created yet.

6. In A, select **Accepted version** and **Resolve conflict**. Both open reviews refresh within three seconds; #1 has no pending alternatives and its sample values remain. Choosing an alternative instead would accept that complete record and close all reviewed alternatives. An already-open choice cannot resolve a changed proposal set: a fresh alternative or competing resolution forces a refreshed review and a new selection. The browser/API suites exercise those races deterministically.

7. Repeat simultaneous selection using `absent-a.csv` in A and `absent-b.csv` in B. Whichever transaction commits first inserts #1001; the other sees that accepted row and stages its different values. Expected accepted total: **501**, with exactly one alternative for #1001. Search `1001`, review it in both windows and choose either whole version. Both windows converge within three seconds. Arrival order does not determine the winner in advance, and no accepted value is silently overwritten. Requests need not arrive at exactly the same instant for the semantics to hold; the automated API race places both writes at the same controlled barrier before release.

8. Clear search and locate #2 in both windows. Click **Edit** in both, change A's body to `Saved by session A`, and B's to `Unsaved draft from session B`. Before saving, focus each body field and inspect the other session's **Session … · editing** label. Both sessions can edit the same cell. Move A's focus to Search or Cancel to clear its presence without claiming ownership. Merely retaining a draft does not mark a cell active. Native window switching clears focus activity; if a heartbeat disappears without a clean disconnect, presence expires within 13 seconds.

9. Save A's edit. In B, its original draft stays intact and the current accepted values appear for comparison; Save becomes unavailable until deliberate reconciliation. Click **Use current accepted version** after comparing, then **Save** to submit the preserved B draft. This action updates the version used for the next save; it does not replace B's typed values. A sees the committed result. For two requests submitted before either browser sees the update, the server accepts one and rejects the other as stale; the API/browser tests cover that race and draft preservation.

10. Start another draft in B and leave its body focused. Stop the app with `docker compose stop app`, then start it with `docker compose start app`. Observe disconnected/reconnecting/connected status. Search, valid page, unsaved text and focus remain; accepted rows and open reviews refetch on reconnect. An unsuccessful save is never replayed automatically. Cancel the draft to finish. Refreshing or leaving the page discards in-memory drafts.

## Explaining the conflict strategy

Every bounded file is fully received and validated before its write transaction. Invalid CSV rejects the entire file. Valid uploads insert new IDs, count accepted-equal rows as unchanged, and retain changed existing rows as distinct persistent pending alternatives. They never replace the dataset or delete omitted IDs. Ordinary search reads accepted values only.

Every mutation uses the same short transaction-level PostgreSQL advisory lock, plus normal constraints and a transaction. Parsing, file transfer and user review occur outside that lock. Concurrent absent-ID uploads therefore serialize classification against current committed data: one inserts, and the next observes it before deciding whether to count unchanged or stage an alternative. Direct value comparisons deduplicate alternatives.

A manual save carries the expected accepted-record version and is rejected if that version changed or conflicts exist. Resolution checks both the accepted-record version and the proposal-set revision atomically. Keeping accepted values still advances the proposal revision, so it invalidates an old review even though the accepted values did not change. No review can dismiss alternatives it has not seen.

An upload identity and raw-content digest persist with the original outcome. Retrying the same request and bytes returns that outcome even after later edits or resolutions; different bytes with that identity are rejected. **Retry upload** reuses the browser's retained identity after an uncertain response. Selecting a file again is a new request. Database failure rolls back both mutations and the upload outcome.

Only committed changes publish WebSocket invalidations. HTTP remains authoritative: browsers refetch after notifications and every reconnect. Unchanged uploads, duplicate alternatives, retries and rolled-back/rejected operations do not publish dataset changes. Presence is separate transient activity, has rate limits and expiry, and never bypasses save/review checks.

## Verification evidence

Run all [documented test commands](../setup.md#tests). API tests force write overlap at a database barrier. Focused browser tests assert both observers under one three-second deadline measured from before the mutation or barrier release; they also check reconnect, stale drafts, grouped alternatives and presence. Manual side-by-side operation demonstrates the workflow; automated timings provide the precise bound.

Inspect populated tables, validation errors, stale drafts, comparison choices and presence at a wide desktop width and around 390px. Scroll the table horizontally on narrow screens to reach all fields/actions. Check keyboard focus, dialog dismissal/focus restoration and full long-content access. Record actual measured timings, passed suites and any uninspected states in [final verification](../verification.md), without treating historical runs or generated screenshots as current evidence.
