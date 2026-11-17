# RealVolt v1.5.9 — Agent Website navigation integration (based on your latest ZIP)

This is a focused patch, NOT a replacement for your whole RealVolt application.

## Fix the current TypeScript error first
In GitHub `inderbains/crmsocial` on branch `main`, DELETE ONLY the **repository-root** file:
- `AgentSiteStudioGate.tsx` (wrongly uploaded at the top level)

Do **not** delete:
- `components/rv-agent-site/AgentSiteStudioGate.tsx`
- `components/rv-agent-site/AgentSiteStudio.tsx`
- `app/agent-site-studio/page.tsx`

There are other copied website source files at the repository root. They are not used by your app. Once you have a working deployment, tidy these duplicates cautiously. Do NOT delete `proxy.ts`, `next-env.d.ts`, `package.json`, or your main `app`/`components`/`lib` folders.

## Add the Agent Website card + sidebar button
Replace ONLY the two existing files with the ones in this patch:
- `app/page.tsx` (main dashboard; add sidebar action)
- `app/workspace-home.tsx` (add Agent Website application card)

GitHub web workflow: visit the actual file in each folder, click Edit (pencil), replace its contents with the matching contents from this patch, then commit.
Do not drag the files directly into the repository root.

## Deploy and test
1. Commit the deletion and both file replacements to `main`.
2. Redeploy on Hostinger.
3. Sign in on the main RealVolt homepage, then open `My workspace`.
4. `Agent Website` should appear next to `Open Houses`, `CRM`, and `Transactions` in your applications and workspace navigation.
5. It opens `/agent-site-studio` and does not modify your CRM/Open House code.

Website publishing, Supabase migrations 024 & 025, public website routing, and custom DNS must still be tested separately in the deployed environment. This patch only fixes nav integration and the specific stray-file build error.
