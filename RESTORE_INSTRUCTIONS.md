# RealVolt recovery — build from 779fb12

The source for the failing build is commit 779fb12. It contains four distinct problems:

1. `lib/supabase.ts` was overwritten with an agent-site server module and no longer exports `getSupabase`. Almost every existing RealVolt component imports `getSupabase`.
2. A second, obsolete `AgentSiteStudio.tsx` was accidentally uploaded to the **repository root**. TypeScript includes it even though the real studio is at `components/rv-agent-site/AgentSiteStudio.tsx`.
3. A duplicate `lib/validation.ts` was uploaded to the wrong directory. Its `./types` import is broken; the correct validation module already exists at `lib/rv-agent-site/validation.ts`.
4. `app/page.tsx` was overwritten with the 7-line AgentSiteStudioGate page, displacing the original RealVolt CRM workspace homepage. The proper studio page already exists at `app/agent-site-studio/page.tsx`.

## GitHub website instructions (no terminal)

**First commit a backup branch** from `main` before editing, if possible.

1. Open `https://github.com/inderbains/crmsocial/blob/main/lib/supabase.ts`, click Edit, replace its entire content with the included `lib/supabase.ts` and commit.
2. Restore the MAIN homepage: open `https://github.com/inderbains/crmsocial/blob/5db0bef/app/page.tsx` and click **Raw** to copy that complete historical file. Then edit `https://github.com/inderbains/crmsocial/blob/main/app/page.tsx`, replace its whole content with that original, and commit. Do NOT edit `app/agent-site-studio/page.tsx`.
3. Delete ONLY `https://github.com/inderbains/crmsocial/blob/main/AgentSiteStudio.tsx` (repository root). Keep `components/rv-agent-site/AgentSiteStudio.tsx`.
4. Delete ONLY `https://github.com/inderbains/crmsocial/blob/main/lib/validation.ts`. Keep `lib/rv-agent-site/validation.ts`.
5. Redeploy on Hostinger. The build should get past the pasted TypeScript errors, but a complete build has not been run here.

## Faster method if you have a Git clone (Git Bash)

From the root of a clean, up-to-date clone:

```sh
git switch main
git pull --ff-only
git restore --source=5db0bef -- app/page.tsx lib/supabase.ts
git rm AgentSiteStudio.tsx lib/validation.ts
git add app/page.tsx lib/supabase.ts
git commit -m 'Restore RealVolt homepage and shared Supabase client; remove misplaced website files'
git push origin main
```

The Git Bash method uses the exact known-good versions from commit 5db0bef rather than the included `lib/supabase.ts` file. These approaches are alternatives. **Do not upload the entire ZIP as project root files.**

This recovery is intentionally limited to restoring the workspace and eliminating compile errors. The Agent Website menu tile has NOT been added to the main dashboard yet. The studio remains at `/agent-site-studio`.

The recurring GLIBC SWC native module warnings are not the root cause of this TypeScript failure; the build is using its WASM fallback.
