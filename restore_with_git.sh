#!/usr/bin/env bash
set -euo pipefail
# Use only from a clean, up-to-date checkout of github.com/inderbains/crmsocial.
if [[ ! -d .git ]]; then echo 'Run from the crmsocial Git repository root.' >&2; exit 1; fi
if [[ -n "$(git status --porcelain)" ]]; then echo 'Commit or stash existing changes before running.' >&2; exit 1; fi
git switch main
git pull --ff-only
git restore --source=5db0bef -- app/page.tsx lib/supabase.ts
git rm AgentSiteStudio.tsx lib/validation.ts
git add app/page.tsx lib/supabase.ts
git commit -m 'Restore RealVolt homepage and shared Supabase client; remove misplaced website files'
echo 'Recovery committed locally. Review and run: git push origin main'
