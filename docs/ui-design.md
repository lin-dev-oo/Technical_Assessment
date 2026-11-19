# UI direction

## User intent

Create an original, carefully designed application rather than a generic generated dashboard. Use **shadcn/ui** as the component library and **purple as the accent color**. These are implementation requirements.

This is a technical assessment. Keep interface text limited to functional labels, instructions, constraints and feedback; omit promotional copy, taglines and decorative section labels.

When the dataset is empty, show only a centered **Upload CSV** action. Selecting a file starts its upload without a separate import/confirmation button. Show progress and actionable errors when relevant. After a successful upload, show the comments table. When persisted comments already exist, open directly to the table, with an **Upload CSV** button for subsequent uploads. Do not show schema or merge-semantics explanations in this flow.

The user supplied an image solely as an example of visual craftsmanship. It is not a template: do not copy or infer requirements from its layout, presentation, navigation, dialogs, workflow, or features. The app's structure should follow the confirmed comments workflow. No pixel matching is required.

## Design approach

- Organize the interface around importing comments, searching accepted data, editing, and reviewing conflicts. Make the next useful action easy to find in each state.
- Build a coherent visual system: deliberate typography hierarchy, consistent spacing, aligned controls, readable table density, and a restrained set of border, radius, and elevation styles. Choose exact tokens during implementation and reuse them.
- Use neutral surfaces and purple selectively for primary actions, selection, and focus. Keep semantic error, warning, success, and connection states distinguishable with text/icons as well as color.
- Use shadcn/ui primitives for applicable controls and overlays, composing and styling them to fit the workflow. Library defaults are a starting point, not the finished visual design.
- Prefer meaningful content and useful space over decorative dashboard furniture. Every summary count, panel, icon, or navigation item must support an implemented task. Avoid filler metrics, gratuitous gradients, and oversized headings that crowd the data.
- Use concise domain language: accepted version, pending alternatives, unchanged comments, and explicit Save/Cancel. Keep technical concurrency details in documentation rather than ordinary UI copy.

## Workflow-specific expectations

- Upload: clearly distinguish transferring, processing, rejection, and completion. Show actionable validation errors and honest counts; an invalid file must not look partially imported.
- Table: keep every data field in its own column, including separate Name and Email columns in both viewing and editing states. Keep identifiers, pending-conflict status, edit actions, search, and pagination readable. Handle long names, emails, and multiline bodies without breaking alignment or hiding access to the full content.
- Editing: edit values directly in the table cells, with Save/Cancel on the edited row rather than a separate editor box. Make the unsaved state clear. Preserve drafts and focus during background refreshes; explain stale-save errors without repeated interruptions.
- Conflict review: give the accepted version and alternatives clear labels, align comparable fields, highlight actual differences, and make the selected whole version unambiguous. Support several alternatives and long text without making comparison unusable.
- Presence: use subtle cell indicators with session labels. Presence styling must remain distinguishable from conflict warnings, keyboard focus, and selection, and must not obstruct editing.
- Empty, loading, error, disconnected, stale-review, and successful states must receive the same design attention as the populated happy path.

## Verification

Inspect the running UI with the supplied sample and challenging long content. Check a wide desktop viewport and a narrow viewport; keep actions reachable and use deliberate table scrolling where needed. Verify keyboard navigation, visible focus, form labels, overlay focus behavior, and readable contrast.

For each UI slice, check the relevant states against this document. The final demo verification includes visual inspection of upload, populated table, edit rejection, conflict review, and two-session presence. Report any states or viewports that could not be inspected rather than claiming visual verification from code alone.

## Latest collaboration refinements — 19 November 2026

Style Sonner notifications with the app's typography, neutral surfaces, borders and purple actions; use semantic color on icons without adding banners to the table. A stale Save opens a required, minimal diff with Current version and Your version and two actions: Use current version or Use my version. Choosing mine saves immediately with concurrency checks; choosing current exits the draft. Live updates must reach the table, active editors, open upload comparisons and cell presence. Invalidate outdated review choices without losing navigation.

## Approved usability refinements (19 November 2026)

Use Dataset for the collection and record/records for entries in interface copy. Use Search… with an accessible Search all fields label. Display the supported CSV header names exactly (id, postId, name, email, body) consistently in the table, editor and comparison; retain the fixed schema and existing import normalization.

Keep the full dataset count separate from filtered results. Distinguish searching from refreshing, mark retained results as outdated after failure, and offer Retry. Associate validation errors with fields and focus the first invalid field. Explain disabled edits, restore focus after Save/Cancel, and warn on leaving with changed unsaved values. Keep row actions pinned during horizontal scrolling and provide a narrow-screen scroll hint. Use at least 12px for table labels and secondary text.

Identify the filename in upload feedback and allow completed upload/resolution feedback to be dismissed. Explain that stale-draft recovery preserves the draft while updating its save baseline. Explain that resolving keeps one complete version and dismisses the other reviewed alternatives. Disable all review dismissal controls while resolution is pending.

## Presence and conflict review refinement (19 November 2026)

Apply the primary-source patterns recorded in [presence-conflict-ui-research.md](presence-conflict-ui-research.md). Remote editing uses a cell-colored outline and named label plus an editing-location summary outside the horizontal table scroll. Selected edit cells remain visible to collaborators across window/tab focus switches; moving to another control, ending the edit, disconnect, or expiry still clears activity. No mouse pointer or shared draft text is transmitted.

Conflict review separates whole-version radio choices from the field comparison and final confirmation. Identify sources and changed-field counts, default to differing fields, offer unchanged context, preserve long text with expandable full values, and stack comparable values per field on narrow screens. Show the chosen version and dismissal consequence beside explicit Keep accepted version / Use alternative actions. Preserve stale-review checks, all alternatives, and whole-record resolution.

## Latest refinements

Keep the existing application layout. The requested modern styling applies only to presence: a slim session-colored cell edge and an attached compact name tag, with space reserved so it never covers values or inputs.

Keep conflict review minimal: no numbered steps, tutorial sections, or repeated explanatory copy. Put whole-version choices in comparison headers on desktop and a compact source list on mobile. Upload completion opens conflicts immediately using affected IDs from the server, independently of search/pagination. Remove per-row pending badges; Review conflicts provides recovery for dismissed/persisted reviews. Add Previous/Next with a position counter, preserve choices while navigating, invalidate them when either revision changes, and return to any earlier unresolved records before completing the review queue.

Use Current version and Alternative 1, Alternative 2, etc. in interface labels. Keep current version is the current-value resolution action. Accepted version remains the internal storage/domain term.

## Whole-upload decisions and minimal feedback

Conflicting browser uploads are staged atomically. Confirm choice only records a local decision; Apply upload commits all choices and new rows together. Any unresolved-review dismissal rejects the whole file and leaves accepted rows untouched. Keep previous/next navigation and preserve decisions within the active review. Reject stale snapshots before applying anything. The older persisted-conflict recovery flow remains available for legacy API data.

Search has one accessible clear icon inside the input, without a second text button or native duplicate. Sonner handles transfer/processing progress, successful imports/saves, validation, rejection, transport failures and retry actions; do not leave routine notification banners in the main layout. Field validation and one persistent stale-row action remain local to their relevant controls.

For stale edits, follow [stale-edit-ui-research.md](stale-edit-ui-research.md): one Updated in another session / Review changes status; changed-only Current version vs Your draft comparison; Keep my changes or Use current values; no automatic save. Remove duplicate warning blocks and the always-visible current-data preview. Provide First/Previous/Go to page/Next/Last pagination with accessible labels, boundary disabling, invalid-page feedback and narrow-screen wrapping.
