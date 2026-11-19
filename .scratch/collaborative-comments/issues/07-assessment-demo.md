# 07: Deliver a reproducible assessment demo

**What to build:** Run and explain the complete submission from a clean checkout using Docker Compose, the supplied CSV, and a repeatable two-session demonstration.

**Blocked by:** 02: Search and paginate accepted comments; 06: Show active-cell presence.

**Status:** completed

- [x] Follow the project's UI direction for this slice: use shadcn/ui and purple accents, create an original workflow-driven interface, and visually inspect the relevant states. The reference image is a craftsmanship reference only, not a layout template.

- [x] Verify documented Compose startup with the database and app, persistent data across restart, and clear prerequisites, configuration, test commands, and troubleshooting notes.
- [x] Retain the supplied sample CSV and original assessment wording; provide small derived examples with explicit expected outcomes for the demo.
- [x] Document the two-session sequence: initial import, search/pagination, simultaneous conflicting uploads, grouped resolution, stale edit with draft preservation, and active-cell presence.
- [x] Include the concurrent absent-ID example and explain why the second committed upload creates an alternative rather than overwriting the first.
- [x] Explain merge semantics, retained omitted IDs, whole-file rejection, short transactional locking, both revision checks, request retry protection, and notification-after-commit behavior.
- [x] Run the assembled unit, API/PostgreSQL, and focused browser suites; investigate failures and report actual results rather than treating this ticket as the first testing phase.
- [x] Verify updates within three seconds in the demo and that pending conflicts survive restart.
- [x] Document boundaries: single fixed-schema dataset, single backend, no authentication, no auto-save/schema editing/replacement, and only in-memory unsaved drafts.
- [x] Keep final delivery focused on the confirmed spec and publish no external issue or other artifact as part of this local ticket.



## Verification

Completed the documented demo and recorded current evidence in [docs/verification.md](../../../docs/verification.md). A clean tracked-source Compose build, fresh database, app restart and full container recreation retained 501 accepted comments plus unresolved reviews. Four parser tests, 16 public HTTP/PostgreSQL/WebSocket tests and 18 Chromium tests pass; the documented container parser/API commands also pass. Two-session production Compose updates measured 148–404 ms, with draft preservation and advisory presence verified. Desktop/narrow comparison, stale-draft and presence screenshots and current long-content browser screenshots were visually inspected. Transfer/processing and native OS window switching were not separately visually inspected. Original assessment and sample remain unchanged; no external artifacts were published.

