# Active-cell presence and conflict comparison

Research date: 19 November 2026. Scope: existing fixed-schema CSV application (`id`, `postId`, `name`, `email`, `body`), temporary session presence, persistent pending alternatives, and choosing one complete version. No field merge or schema changes.

## Established patterns (official primary sources)

| Product | Documented behavior | Applicable principle |
| --- | --- | --- |
| Excel | Other collaborators' selections use distinct colors; hovering a selection reveals the person's name. The collaborator avatar/initials can navigate to where that person is working. | Put activity at its actual cell and connect it to a named collaborator. A global online count alone does not locate activity. [Microsoft Support](https://support.microsoft.com/en-us/excel/get-started/collaborate-on-excel-workbooks-at-the-same-time-with-co-authoring) |
| VS Code | The merge editor separates Incoming, Current, and Result panels, with Result showing what will be saved. Its documentation warns that Current/Incoming roles depend on the operation and asks users to inspect labels/content. | Separate source identity, comparison, and committed outcome. Use domain labels instead of ambiguous developer terms. [VS Code conflict documentation](https://code.visualstudio.com/docs/sourcecontrol/merge-conflicts) |
| GitHub Desktop | Split diff places old/new content side by side; Unified shows changes linearly. Users can expand nearby context or the entire file. | Align comparable values where space permits, provide a linear reading order where it does not, and let reviewers reveal unchanged context. [GitHub Desktop diff documentation](https://docs.github.com/en/desktop/making-changes-in-a-branch/committing-and-reviewing-changes-to-your-project-in-github-desktop?platform=windows) |
| Google Sheets | Version history associates editors' names with colors and renders their historical edits in those colors. | Identity plus color supports attribution. This source documents history, not a guarantee about live cell editing. [Google Sheets collaboration documentation](https://support.google.com/docs/answer/9331169?hl=en) |

The applicable principles above are interpretations of the cited behavior. The design below is a recommendation for this app, not a claim that those products implement it.

## Recommended presence design

- Give the actively edited cell a clearly visible, inset 2px session-colored outline and a very light tint. Place a compact `Session B · editing` label immediately beside/inside its top edge with reserved space so it never covers text or controls. Keep local keyboard focus and purple selection visually distinct from remote presence; avoid warning amber/red for presence.
- Match the cell label's color to the existing session indicator. Keep the temporary session name visible without hover; expose the complete label in accessible text. This improves discoverability over Excel's hover-only identification while retaining its cell-local pattern.
- If multiple sessions edit the same cell, show one compact grouped label with all names available on focus/activation rather than overlapping badges. Keep inputs fully usable: presence is advisory and does not disable edits.
- Follow the existing lifecycle: active field changes move the marker; leaving the edit clears it; disconnect/expiry removes it. A stale indicator must not imply ownership. Do not broadcast typed draft values or add persistence for presence.
- Prefer a steady outline to animation. Keep names readable at 12px or larger and preserve the indicator during horizontal table scrolling without covering pinned row actions.

## Recommended comparison design

Use a field-aligned comparison surface, rather than a collection of independent record cards whose bodies require mental matching.

1. **Identity and consequence:** header `Compare versions · record 42`, followed by `Choose one complete version. Other reviewed alternatives will be dismissed.` Identify the accepted version and every distinct pending alternative with their available filename/session labels. Do not invent authorship or claim a particular source is newer/better.
2. **Source selection:** provide an accessible radio group listing `Accepted version` and `Alternative 1`, `Alternative 2`, etc., with source labels and selected-state text/checkmark. Selecting a source changes the preview only; it does not resolve. Source cards/radio controls select whole records, never individual fields.
3. **Comparison:** on wide screens align `Field | Accepted version | Alternative 1 | Alternative 2 …` in a deliberately scrollable region. Keep field names and the accepted column readable, avoid squeezing many alternatives into tiny columns, and keep selection/action controls outside horizontal scrolling. Display all alternatives in the review; a focused alternative may receive stronger emphasis, but other alternatives must remain discoverable.
4. **Differences and context:** default to differing fields, with `Show all 5 fields` / `Show differences` and a visible differing-field count. Compute differences against the accepted version, and explicitly label that baseline. Show `Same as accepted` where useful. Use subtle fill plus a `Changed` label, so color is supplementary. If all fields match in an unusual/refreshed state, explain it rather than showing an empty comparison.
5. **Long text and narrow screens:** preserve line breaks, wrap long email/word strings, and allow full body expansion. On narrow screens stack each field's labeled accepted/alternative values together in source order; do not stack entire records far apart or require horizontal scrolling to discover the final action. A full-content control must expose actual text, not only a tooltip.
6. **Explicit outcome:** show `Selected: Alternative 2 · filename.csv` next to a purple `Use selected version` action; when accepted is selected, use `Keep accepted version`. Keep the concise whole-record consequence visible near this action. No initial selection is preferable to silently endorsing a candidate.
7. **Safety states:** keep accepted data unchanged until success. While resolving, disable source selection, submission, and every dismissal route. If review becomes stale, refresh all alternatives, clear/revalidate the selection, and ask for a fresh decision. Preserve the persistent alternatives until a valid server resolution commits.

Use existing shadcn/ui Dialog, RadioGroup, Button, Badge and ScrollArea primitives as appropriate. Purple communicates primary action/selected version; conflict warnings and session colors remain separate. These are implementation recommendations within `docs/ui-design.md`, not additional backend scope.

## Verification targets

Inspect two live sessions editing different cells and the same cell; verify readable names, no obstruction, and cleanup on cancel/disconnect/expiry. Review accepted plus at least three alternatives with long multiline bodies at desktop and narrow widths. Verify field alignment, changed-only/all-fields context, whole-record selection, keyboard/focus behavior, reachable actions, pending dismissal blocking, and stale-review refresh. Research alone does not constitute visual verification of the app.
