# RealVolt — Live Lead Funnel (Existing CRM)

This is a **targeted replacement of the existing Lead Funnel page**, not a new funnel or a new SaaS project. The change does not touch other dashboard, CRM, website-builder, transaction, automation, or AI modules.

## Installation

1. Back up your GitHub repository (branch `main`) before uploading anything.
2. In `github.com/inderbains/crmsocial`, merge these files into the matching **existing folders**:
   - `app/lead-funnel.tsx` (replace the existing page component, preserving any customizations newer than the supplied snapshot)
   - `app/lead-funnel.module.css` (new)
   - `lib/lead-funnel-analytics.mjs` (new)
   - `lib/lead-funnel-analytics.d.mts` (new TypeScript declarations)
   - `tests/lead-funnel-analytics.test.mjs` (new)
3. **Do not** upload the ZIP itself as a GitHub file. **Do not** put the TSX/CSS files at the root. Do not delete any of your existing modules.
4. Commit the changes and let Hostinger deploy with the existing `npm run build` command.
5. Log in to RealVolt and open **CRM → Lead Funnel**. Verify the totals correspond to your actual CRM pipeline. Refresh and switch between **All time / Last 30 days / Last 90 days**.
6. In Brokerage Settings, change your theme and return to the funnel: colours should follow the existing `--green` / `--theme-soft` variables automatically.

## How the numbers work

The data comes **directly from the current signed-in agent's existing Supabase tables** with row-level security and `count:'exact', head:true`. No new SQL, secrets, paid API, or OpenAI key is required.

- CRM leads: `crm_contacts` owned by signed-in user and contact types Buyer, Seller, Buyer & seller, Other (not agent or service-provider contacts).
- Stage figures: the `crm_contacts.stage` values New, Contacted, Qualified, Active, Under contract, Closed, Lost.
- Funnel top row is *all captured CRM leads, including Lost*. Lower funnel rows are contact counts whose **current stage is at or beyond** the named stage, excluding Lost.
- `At stage` in the breakdown is the exclusive count at that current stage. `At or beyond` is a snapshot based on stage order, **not audited historical transitions**.
- Property page views and contact clicks: `property_engagement.event_type` events; they can include bots and repeats and are **not matched to unique clients**.
- Showing requests: `property_showing_requests`; confirmed/completed count is status Confirmed or Completed.
- Closed: contacts **marked Closed in CRM**, not automatically certified closings from your transactions ledger.
- The filter's date range applies to `created_at` for each data source; CRM stages describe the **current** stage of leads created in that range. This is not a historical close-rate cohort audit.
- No fake offer numbers, Meta impressions, or invented website-to-client conversion percentages appear.
- Data refreshes when the page loads, you change date range, or click **Refresh**. It does not live-stream between refreshes.
- The visual taper indicates stage order, not relative band area. **Numbers are the data.**

## Testing

Run `node --test tests/lead-funnel-analytics.test.mjs` (four passing calculations tests in our prepared patch).

The new TypeScript/TSX files passed syntax parsing. A complete Next.js production build and live Supabase/Hostinger integration **were not verified here** because package installation timed out; test in staging first. Keep the original `app/lead-funnel.tsx` so you can roll back if your branch has newer changes.

## Tenant / brokerage notes

The existing page accepts `userId` from the logged-in workspace, and queries with the browser's publishable Supabase client under existing RLS. Therefore counts are **for the signed-in agent only**, not an unauthorized global brokerage aggregate. A future brokerage-wide funnel requires a separately permission-checked aggregation. Brokerage theme CSS variables (`--green`, `--theme-soft`, `--primary-ink`) already change through `app/office-theme.tsx`.

This patch does not migrate or delete any Supabase data.
