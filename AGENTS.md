# Project guidance

Read `docs/spec.md` for confirmed scope and `GLOSSARY.md` for domain terms. Local implementation tickets are under `.scratch/collaborative-comments/issues/`; respect their blocking dependencies.

Before building or changing frontend layout, components, styling, or interaction states, read `docs/ui-design.md`. It contains the user's UI requirements, including shadcn/ui, purple accents, and the reference image's limited role. Apply it from the first UI slice, not as a final reskin.

## Git workflow preferences

- Work directly on `main` in this checkout. Do not create worktrees, feature branches, or integration branches unless the user explicitly changes this preference. This applies even when an invoked skill suggests a different Git workflow.
- Keep history on `main` linear, with focused commits and no workflow-only merge commits. Preserve existing history unless the user requests a rewrite.
- Use the user's configured Git identity for both commit author and committer. Check `git config user.name` and `git config user.email` before committing; do not substitute a Codex identity or add Codex co-author attribution.
