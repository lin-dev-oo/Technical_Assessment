# 04: Edit comments with explicit Save/Cancel

**What to build:** Edit accepted comments deliberately while preserving drafts when another session changes the record or introduces a pending conflict.

**Blocked by:** 03: Review and resolve conflicting uploads.

**Status:** completed

- [x] Follow the project's UI direction for this slice: use shadcn/ui and purple accents, create an original workflow-driven interface, and visually inspect the relevant states. The reference image is a craftsmanship reference only, not a layout template.

- [x] Allow inline editing of postId, name, email, and body with explicit Save/Cancel. Keep id immutable and validate edited values consistently with uploads.
- [x] Include the expected accepted-record version in save requests; check it under the same transactional mutation lock.
- [x] Disable starting edits on comments with pending conflicts, and enforce this restriction on the server.
- [x] Reject stale saves and saves made after a pending conflict arrives, without silently rebasing, creating a proposal, or overwriting accepted values.
- [x] Preserve an in-memory draft begun before a conflict arrived or a save failed. Display current accepted data and explain what must be reviewed before a deliberate retry.
- [x] Resolve pending conflicts before permitting a preserved draft to be saved; refreshing a baseline must require a deliberate user action rather than automatic stale retry.
- [x] Cancel explicitly discards the draft. Do not introduce auto-save, durable browser draft recovery, or automatic submission of drafts as alternatives.
- [x] Display connection/save errors and allow a deliberate retry while preserving draft text.
- [x] Test two saves from one version, pending-conflict arrival before saving, validation rejection, and immutable IDs through API/PostgreSQL. Verify browser Save/Cancel and draft preservation.



## Verification

Passed 4 parser tests, 13 HTTP/PostgreSQL tests, 11 Chromium browser tests, and the TypeScript/Vite production build. Tests cover controlled simultaneous saves, immutable IDs, validation rejection, conflict arrival, explicit Save/Cancel, draft preservation across search and refresh, transport failure, and deliberate reconciliation after resolution even when accepted values stay unchanged.

Editing happens directly in table cells, following the user's clarified requirement. Visually inspected desktop and 390px edit/stale states with multiline and long draft text; mobile scrolling reaches Body and Save/Cancel, while rejection feedback remains readable at both scroll positions. Existing suite also checks the supplied sample and long conflict alternatives. Standards review found one mobile feedback issue, fixed and visually verified; spec review found no issues. Real-time notifications and presence remain tickets 05 and 06.

