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
- Table: keep identifiers, pending-conflict status, edit actions, search, and pagination readable. Handle long names, emails, and multiline bodies without breaking alignment or hiding access to the full content.
- Editing: make Save/Cancel and unsaved state clear. Preserve drafts and focus during background refreshes; explain stale-save errors without repeated interruptions.
- Conflict review: give the accepted version and alternatives clear labels, align comparable fields, highlight actual differences, and make the selected whole version unambiguous. Support several alternatives and long text without making comparison unusable.
- Presence: use subtle cell indicators with session labels. Presence styling must remain distinguishable from conflict warnings, keyboard focus, and selection, and must not obstruct editing.
- Empty, loading, error, disconnected, stale-review, and successful states must receive the same design attention as the populated happy path.

## Verification

Inspect the running UI with the supplied sample and challenging long content. Check a wide desktop viewport and a narrow viewport; keep actions reachable and use deliberate table scrolling where needed. Verify keyboard navigation, visible focus, form labels, overlay focus behavior, and readable contrast.

For each UI slice, check the relevant states against this document. The final demo verification includes visual inspection of upload, populated table, edit rejection, conflict review, and two-session presence. Report any states or viewports that could not be inspected rather than claiming visual verification from code alone.
