# RealVolt Fix 045A — Minimal visual revision

This is a styling/interaction revision to Fix 045, not a new database migration.

## Change only two files

- `app/personal-dates.tsx`
- `app/SmartInbox037.module.css`

Do **not** replace `app/workspace-home.tsx` or `app/SmartInbox037.tsx` if Fix 045 is already deployed; both are unchanged in this revision. Do **not** re-run SQL 045 if it has already succeeded.

## Behavior

- Quote is shown with no heading and no edit icon. Click directly on the text to edit **in the same position**; Save or Cancel underneath. Escape cancels and Ctrl/Cmd+Enter saves.
- The monthly sales goal uses **Change goal** (text link) instead of a pencil icon.
- Agent home and brokerage home both use the refined interaction.
- Back Office dashboard is unchanged.

To install, copy the two files to their matching paths in GitHub after comparing them with the latest repository source. Push and verify `npm run build`.
