# 03: Review and resolve conflicting uploads

**What to build:** Import overlapping CSVs without overwriting accepted comments, then compare all distinct alternatives and choose one complete version.

**Blocked by:** 01: Upload and browse validated comments.

**Status:** ready-for-agent

- [ ] Follow the project's UI direction for this slice: use shadcn/ui and purple accents, create an original workflow-driven interface, and visually inspect the relevant states. The reference image is a craftsmanship reference only, not a layout template.

- [ ] Replace ticket 01's temporary overlap rejection with transactional classification: insert new IDs, count unchanged duplicates, and persist changed existing comments as pending alternatives.
- [ ] Keep accepted values visible and omitted IDs untouched. New comments commit without waiting for unrelated pending conflicts.
- [ ] Show the accepted version and every distinct pending alternative together, highlight changed fields, and show basic upload/session labels.
- [ ] Deduplicate identical pending alternatives by comparing parsed validated values; no elaborate provenance or hashing subsystem is required.
- [ ] Persist alternatives and revision state across refreshes and application restarts.
- [ ] Allow choosing the accepted version or one complete alternative, atomically closing the reviewed alternatives; no field-level merge.
- [ ] Every review carries the accepted-record version and proposal-set revision. Resolution checks both and returns a stale-review outcome with refreshed data if either changed.
- [ ] Competing resolutions cannot reverse each other; keeping accepted values still invalidates the resolved proposal set. Uploads arriving after resolution may create a new conflict.
- [ ] Classify against current database state inside the shared write transaction. Two concurrent uploads with different values for an absent ID produce one accepted record and an alternative, never an overwrite.
- [ ] Retain request retry protection across conflict creation and later data changes; reusing an old request returns its original result without recreating proposals.
- [ ] Use API/PostgreSQL tests for concurrent inserts, proposal deduplication, persistence, rollback, competing resolutions, new alternatives after review, and unchanged accepted values with changed proposal revisions. Provide a browser-verifiable comparison and selection flow.


