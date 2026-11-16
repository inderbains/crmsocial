# RealVolt v1.5.6 — Agent Website Studio

**New patch, reconstructed for the requested features.** This is NOT a recovered copy of the November 15 v1.5.5 ZIP: that exact ZIP was not accessible in the current conversation. It is an additive starter module and has not been merged into or tested against your GitHub project.

## Includes

- 3 built-in website templates: **Modern / Classic / Luxury**.
- Colour presets: RealVolt **green+orange** (default), navy+gold, black+champagne, terracotta+sand; or custom hex colours for primary/accent/background.
- Live website-design preview, editable agent details, headline, biography, public contact, headshot and hero photo URLs.
- Publish/unpublish, unique automatic slug, public `/site/<slug>` route, optional `<slug>.realvolt.ca` wildcard host rewrite.
- Custom domain request with DNS TXT ownership verification. **DNS, hosting attachment, and TLS/SSL require a separate provider setup.** Only hosting admin can activate after checking HTTPS works.
- Isolated Supabase tables + RLS for per-user site ownership. Public users can only fetch published sites and active custom domains.

## Install

1. Make a Git commit / backup. **Inspect existing v1.5.5 files before merging; do not overwrite the CRM/middleware.**
2. Copy the `app`, `components`, `lib` folders to the root of your existing **Next.js App Router** project. If your project uses `src/`, put them under `src/` instead. Import aliases (`@/`) must point at that location.
3. Run `supabase/migrations/024_rv_agent_website_studio.sql` once in Supabase SQL Editor after reviewing it. It uses NEW `rv_*` table names, preserving existing migration `023_agent_websites_and_domains.sql` data. It does not automatically migrate old sites.
4. Ensure packages: `npm install @supabase/supabase-js @supabase/ssr`.
5. Add environment variables in your host (see `.env.example`); never expose the service role key as `NEXT_PUBLIC_*`.
6. Merge `rewriteAgentWebsite()` into the **existing** `middleware.ts` (Next.js 15) or `proxy.ts` (Next.js 16), preserving your Supabase auth cookie logic. See example file. If testing at `/site/<slug>` only, middleware changes can wait.
7. Add a navigation item for logged-in agents pointing to `/agent-site-studio`. Update `/login` in `app/agent-site-studio/page.tsx` if your sign-in route differs.
8. Run `npm run build`. Start with a **staging environment**; check agent 1 cannot edit agent 2's site, unpublished pages are private, and domain TXT proofs work. 

## Domain setup

Subdomains such as `inder-bains.realvolt.ca` require `*.realvolt.ca` DNS pointing to the hosting provider and a provider-supported wildcard TLS certificate. Simply adding `middleware` **does not** provision either. Use the app hostnames env variable to exclude your CRM hosts from website routing. Use provider-specific documentation for correct DNS targets.

Custom domain flow (example `www.inderbains.ca`):

1. Agent saves/publishes their site, then requests `www.inderbains.ca`.
2. Agent adds DNS **TXT** ` _realvolt.www.inderbains.ca ` with value `realvolt-verification=<UUID from app>`.
3. The Verify action checks ownership; domain becomes `ownership_verified`, **not active**.
4. Hosting administrator adds the custom domain to the hosting project, configures requested `CNAME`/`A` records, waits for a valid HTTPS certificate, then verifies it routes to this RealVolt app.
5. Hosting admin activates **only after TLS/DNS work** (in Supabase SQL Editor, with administrator privileges):

```sql
update public.rv_agent_site_domains
set status = 'active', activated_at = now()
where hostname = 'www.inderbains.ca' and status = 'ownership_verified';
```

For sites not yet connected to hosting, use `https://YOUR-APP-DOMAIN/site/inder-bains` after publishing.

## Security & limitations

- The module uses `auth.users.id` to isolate one website per authenticated user. It does not read/write your existing `agents` or `brokerages` tables or require guessing their column names. **Before enabling brokerage-admin editing or allowing agents to switch brokerages, tie site ownership to your existing agent+brokerage membership model and add strict membership checks.**
- Agent public profiles contain no customer/CRM data or DDF keys. Never put secrets in site HTML. Live listings, property pages, leads, DDF and social automation are **not wired in this patch**; connect them later through authorized back-end services.
- Domain verification updates only through the server-side service role after a valid DNS TXT match. End users cannot change domain status with a direct Supabase request; custom domain status becomes active only after hosting setup.
- Rate-limit domain verification endpoints at your hosting edge in production to prevent abuse.
- Public sites have a single landing page. Additional listing, contact-form, SEO and website-navigation routes need a subsequent extension.
- External headshot/hero URLs are plain `<img>` tags in this starter. Prefer Supabase Storage and an explicit CDN policy for production.
- The host rewrite helper is a template; combine it carefully with your existing host/middleware deployment setup. A single web app must be configured to receive the domain at the infrastructure layer.
- Before deploying to production, review SQL grants and policies against your existing Supabase role grants and local schema.

## Important

This patch was authored based on your requirements and prior design notes. It has **not** been deployed, added to your live repo, connected to CREA DDF, or verified against your existing schema. Do not treat a demo front-end as a live public website until hosting and permissions have been tested.
