# 03: Review and resolve conflicting uploads

**What to build:** Import overlapping CSVs without overwriting accepted comments, then compare all distinct alternatives and choose one complete version.

**Blocked by:** 01: Upload and browse validated comments.

**Status:** completed

- [x] Follow the project's UI direction for this slice: use shadcn/ui and purple accents, create an original workflow-driven interface, and visually inspect the relevant states. The reference image is a craftsmanship reference only, not a layout template.

- [x] Replace ticket 01's temporary overlap rejection with transactional classification: insert new IDs, count unchanged duplicates, and persist changed existing comments as pending alternatives.
- [x] Keep accepted values visible and omitted IDs untouched. New comments commit without waiting for unrelated pending conflicts.
- [x] Show the accepted version and every distinct pending alternative together, highlight changed fields, and show basic upload/session labels.
- [x] Deduplicate identical pending alternatives by comparing parsed validated values; no elaborate provenance or hashing subsystem is required.
- [x] Persist alternatives and revision state across refreshes and application restarts.
- [x] Allow choosing the accepted version or one complete alternative, atomically closing the reviewed alternatives; no field-level merge.
- [x] Every review carries the accepted-record version and proposal-set revision. Resolution checks both and returns a stale-review outcome with refreshed data if either changed.
- [x] Competing resolutions cannot reverse each other; keeping accepted values still invalidates the resolved proposal set. Uploads arriving after resolution may create a new conflict.
- [x] Classify against current database state inside the shared write transaction. Two concurrent uploads with different values for an absent ID produce one accepted record and an alternative, never an overwrite.
- [x] Retain request retry protection across conflict creation and later data changes; reusing an old request returns its original result without recreating proposals.
- [x] Use API/PostgreSQL tests for concurrent inserts, proposal deduplication, persistence, rollback, competing resolutions, new alternatives after review, and unchanged accepted values with changed proposal revisions. Provide a browser-verifiable comparison and selection flow.



## Verification

Passed 4 parser tests, 10 public HTTP/PostgreSQL tests, 7 Chromium browser tests, and the TypeScript/Vite production build. Coverage includes controlled simultaneous absent-ID uploads, deduplication, restart persistence, transactional rollback, original retry outcomes after resolution, stale reviews and competing resolutions. Browser checks cover complete-version selection, stale review recovery, connection failures with selection preserved, and keyboard focus restoration.

Visually inspected the supplied 500-comment sample and three pending alternatives with long names, emails and multiline/unbroken bodies at 1440px and 390px, plus basic comparison states. Mobile comparison scrolls deliberately with a visible hint and reachable selection/footer actions. Standards review: 0 findings. Spec review: 0 findings. Editing, real-time notifications and presence remain dependent-ticket work.

