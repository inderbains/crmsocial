RealVolt Agent Website Studio - Configuration Fix (Nov 16, 2026)

Checked against public GitHub main (commit 91382ea build reported):
- `tsconfig.json` lacks `@/*` paths alias, even though the Agent Website Studio uses `@/lib/...` and `@/components/...` imports.
- `next.config.mjs` uses `output: 'export'`, incompatible with server-side routes, cookies, dynamic pages and API endpoints in the Website Studio.
- `package.json` omits `@supabase/ssr`, imported by `lib/rv-agent-site/supabase.ts`.

IMPORTANT: This patch changes the project from static export to a running Next.js app. You must host it on a Next.js server environment (Node.js) with a .next deployment, not upload static HTML from out/.

Steps:
1. Make backup / commit current project state.
2. Extract this ZIP on your computer.
3. Upload the 3 files (tsconfig.json, next.config.mjs, package.json) to the ROOT of GitHub repository inderbains/crmsocial on branch main, overwriting EXACT matching filenames only. Do not upload the zip as a blob or put files in a subfolder.
4. Keep the existing lib/rv-agent-site and components/rv-agent-site folders; they already appear in the public repo.
5. Commit and redeploy in Hostinger as Next.js application with build `npm run build` and output `.next`.
6. Recommended for consistency: run `npm install` locally to update package-lock.json and commit the lockfile, then run `npm run build` locally.
7. Confirm NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY (or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) are present. Keep SUPABASE_SERVICE_ROLE_KEY secret; do not expose with NEXT_PUBLIC_.
8. This fixes known configuration blockers, not a guarantee of full build success. Share the NEW build log if other errors follow.

The patch has not been merged into your live GitHub repository or compiled against the full repo. It was prepared from publicly accessible versions of the three configuration files.
