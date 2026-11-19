# Stale edit recovery UI

Researched 19 November 2026. Scope: simplify recovery after another session updates a record while this session has an unsaved draft. This is separate from resolving persistent upload alternatives.

## Established product patterns

| Product | First-party evidence | Applicable pattern |
| --- | --- | --- |
| VS Code | A save against a file changed on disk is blocked. A notification offers Compare, which opens disk and editor contents side by side. The user explicitly accepts their changes or reverts; the file remains dirty until a choice. [VS Code: Preventing dirty writes](https://code.visualstudio.com/docs/editing/getting-started/tips-and-tricks#_preventing-dirty-writes) | Preserve local work, prevent silent overwrite, and defer detailed comparison until the user asks. Use recognizable values and actions rather than version terminology. |
| Excel | The merge-conflict pane lists unmerged changes and offers Merge My Changes or Open My Unmerged Copy; Excel retains an unmerged copy. Its coauthoring guidance distinguishes refresh with no unsaved edits from preserving needed edits through a copy. [Excel: Merge conflicts](https://support.microsoft.com/en-us/excel/how-to-manage-merge-conflicts-in-excel-cloud-files), [Excel: Coauthoring](https://support.microsoft.com/en-us/excel/get-started/collaborate-on-excel-workbooks-at-the-same-time-with-co-authoring) | Refresh is safe only when local edits are accounted for. Make preserving versus replacing the draft a deliberate choice. Do not copy Excel's automatic merge or extra-copy workflow into this small application. |
| GitHub | The conflict editor requires a decision, then Mark as resolved, then Commit merge. The 2025 web-editor update adds concise Accept incoming changes and Accept current changes actions. [GitHub Docs: Resolve merge conflicts](https://docs.github.com/en/pull-requests/how-tos/merge-and-close-pull-requests/resolving-a-merge-conflict-on-github), [GitHub Changelog: Conflict actions](https://github.blog/changelog/2025-10-02-one-click-merge-conflict-resolution-now-in-the-web-interface/) | Choosing the intended contents and committing them can be separate steps. Keep the user's final save explicit. Do not introduce line or field merge controls. |

These sources establish behavior, not proof that one particular layout is optimal. The smaller flow below is a design inference tailored to this application's explicit Save/Cancel contract and the user's preference for minimal UI and Sonner event feedback.

## Recommended flow

1. **Keep the row editor intact.** On a remote update, retain every draft value and its original expected version. Replace repeated warning banners, the long baseline button, and the always-visible current-data preview with one row-local status: **Updated in another session** and **Review changes**. Keep Cancel available. Save must not bypass review. Do not open a dialog while the user is typing.
2. **Notify once per meaningful event.** A rejected save can produce one Sonner message: **Not saved. This record was updated in another session.** with **Review changes**. Background refetches must not repeat it. The persistent row status remains discoverable after the toast disappears. A toast communicates the event; the row communicates the unresolved state.
3. **Review in one compact dialog.** Title: **Review changes**. Compare **Your draft** with **Current version**, using the existing schema labels (`postId`, `name`, `email`, `body`). Initially show only fields whose values differ between those two versions; offer **Show all fields** for context. Align values per field; stack the two values on narrow screens and preserve multiline text. Add one short sentence: **Choose which values to continue editing. Nothing is saved yet.** No tutorial steps, nested warnings, version numbers, or baseline language.
4. **Offer two whole-record choices.** **Keep my changes** preserves the entire draft and changes only its expected-version basis to the exact current version reviewed. Close the dialog, restore focus to the row, and leave the draft unsaved for the normal **Save** action. **Use current values** deliberately replaces the entire draft with the reviewed current values and adopts that version; close the dialog and continue editing. Explain that consequence beside the latter action: **Replaces your unsaved values.** Do not make dismissal discard anything. If draft and current values already match, say so and offer **Continue editing** rather than two equivalent choices.
5. **Retain concurrency checks.** Reconciliation does not submit data or retry automatically. The subsequent Save still sends the reviewed expected version; a later update is rejected again without changing the draft. If new current values arrive while comparison is open, refresh the comparison and require review again rather than silently acknowledging unseen values. If pending upload conflicts exist, retain the draft and route to the existing conflict-review flow; neither draft choice unlocks saving through those conflicts.

## Why this is smaller

The default table has one status and one useful action. Competing values appear only during review. The comparison has two clear labels and whole-record actions, with the existing Save button providing the final commitment. This retains draft preservation, explicit reconciliation, and stale-write protection without adding field-level merging or changing the backend contract.

## Implementation acceptance notes

- Cancel/close/Escape in comparison preserves the draft and unresolved row status.
- Repeated notifications/refetches do not repeat the stale event toast or replace draft values/focus.
- Keep my changes performs no mutation and acknowledges only the reviewed current version.
- Use current values replaces all editable values intentionally; it never changes the persisted record by itself.
- A successful later save clears the stale state; a rejected later save preserves the draft again.
- Compare only actual differences, support full long text, and keep dialog focus/keyboard behavior consistent with shadcn/ui.

No application code was changed for this research.
