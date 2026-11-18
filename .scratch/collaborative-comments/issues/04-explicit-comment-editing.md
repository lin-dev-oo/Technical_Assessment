# 04: Edit comments with explicit Save/Cancel

**What to build:** Edit accepted comments deliberately while preserving drafts when another session changes the record or introduces a pending conflict.

**Blocked by:** 03: Review and resolve conflicting uploads.

**Status:** ready-for-agent

- [ ] Follow the project's UI direction for this slice: use shadcn/ui and purple accents, create an original workflow-driven interface, and visually inspect the relevant states. The reference image is a craftsmanship reference only, not a layout template.

- [ ] Allow inline editing of postId, name, email, and body with explicit Save/Cancel. Keep id immutable and validate edited values consistently with uploads.
- [ ] Include the expected accepted-record version in save requests; check it under the same transactional mutation lock.
- [ ] Disable starting edits on comments with pending conflicts, and enforce this restriction on the server.
- [ ] Reject stale saves and saves made after a pending conflict arrives, without silently rebasing, creating a proposal, or overwriting accepted values.
- [ ] Preserve an in-memory draft begun before a conflict arrived or a save failed. Display current accepted data and explain what must be reviewed before a deliberate retry.
- [ ] Resolve pending conflicts before permitting a preserved draft to be saved; refreshing a baseline must require a deliberate user action rather than automatic stale retry.
- [ ] Cancel explicitly discards the draft. Do not introduce auto-save, durable browser draft recovery, or automatic submission of drafts as alternatives.
- [ ] Display connection/save errors and allow a deliberate retry while preserving draft text.
- [ ] Test two saves from one version, pending-conflict arrival before saving, validation rejection, and immutable IDs through API/PostgreSQL. Verify browser Save/Cancel and draft preservation.


