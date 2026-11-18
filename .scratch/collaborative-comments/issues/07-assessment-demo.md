# 07: Deliver a reproducible assessment demo

**What to build:** Run and explain the complete submission from a clean checkout using Docker Compose, the supplied CSV, and a repeatable two-session demonstration.

**Blocked by:** 02: Search and paginate accepted comments; 06: Show active-cell presence.

**Status:** ready-for-agent

- [ ] Follow the project's UI direction for this slice: use shadcn/ui and purple accents, create an original workflow-driven interface, and visually inspect the relevant states. The reference image is a craftsmanship reference only, not a layout template.

- [ ] Verify documented Compose startup with the database and app, persistent data across restart, and clear prerequisites, configuration, test commands, and troubleshooting notes.
- [ ] Retain the supplied sample CSV and original assessment wording; provide small derived examples with explicit expected outcomes for the demo.
- [ ] Document the two-session sequence: initial import, search/pagination, simultaneous conflicting uploads, grouped resolution, stale edit with draft preservation, and active-cell presence.
- [ ] Include the concurrent absent-ID example and explain why the second committed upload creates an alternative rather than overwriting the first.
- [ ] Explain merge semantics, retained omitted IDs, whole-file rejection, short transactional locking, both revision checks, request retry protection, and notification-after-commit behavior.
- [ ] Run the assembled unit, API/PostgreSQL, and focused browser suites; investigate failures and report actual results rather than treating this ticket as the first testing phase.
- [ ] Verify updates within three seconds in the demo and that pending conflicts survive restart.
- [ ] Document boundaries: single fixed-schema dataset, single backend, no authentication, no auto-save/schema editing/replacement, and only in-memory unsaved drafts.
- [ ] Keep final delivery focused on the confirmed spec and publish no external issue or other artifact as part of this local ticket.


