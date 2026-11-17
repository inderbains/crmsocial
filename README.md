# RealVolt — Security Phase 1 (static audit + live-database checks)

**Source basis:** `crmsocial-main (1).zip` uploaded in this conversation and the later v1.6.2 public inquiry integration package. The uploaded archive may differ from current GitHub `main` or from SQL actually run in Supabase. No live production database or Hostinger secrets were accessed.

## What multi-brokerage isolation means
- CRM contact/note/task data remains private to the authenticated owner (unless explicit collaboration permissions are added later).
- Brokerage administrators can access records specifically authorized for their own brokerage only; no cross-brokerage reads, updates or financial links.
- Public websites can disclose only intentionally public site/profile/listing data; public contact forms write to the site owner's CRM through a carefully constrained server function.
- Private SignVolt documents and deal files require explicit owner or authorized brokerage privileges.
- Do not rely on hiding buttons: database RLS + table grants + server authorization must enforce this.

## Findings from available source (not a penetration test)
1. **Foundational controls exist:** `crm_contacts`, `crm_notes`, and `crm_tasks` have owner RLS policies in `supabase/003_crm.sql`. Brokerage membership and admin helpers are in `005_lawyers_closing.sql` and `011_card_billing.sql`. Finance tables have admin-scoped RLS. **These still need testing against the deployed database.**
2. **Review recommended:** `sign_envelopes` INSERT policy in `012_signvolt.sql` checks the acting user but does not directly require a valid brokerage_id / deal_id association. `sql/03_optional_signvolt_tenant_guard.sql` demonstrates a *narrow* mitigation. Review on staging before production, especially if you have envelopes linked to historical brokerages.
3. **Public inquiry route:** v1.6.2 is designed to resolve `owner_user_id` from the published site slug and invoke a service-role-only RPC; this protects against client-supplied agent IDs *if* the migration and server configuration are live. The user reported an inquiry service error, so that part is not yet confirmed working.
4. **Subscription gates do not exist yet:** a feature being hidden in the UI is insufficient. Until server and database feature/seat checks exist, new plans ($49.99 / $69.99 per agent) are not technically enforced.
5. **High-risk areas to validate manually:** storage bucket policies, all security-definer RPC execute grants, inactive/removed brokerage agent access, admin role changes, cross-brokerage references in finance, and unauthorized document URL access.

## Do this now (safe order)
1. Take a fresh **Supabase backup** and work in a staging copy, not production.
2. In the staging Supabase SQL Editor, run **`sql/01_readonly_security_inventory.sql`**. It makes no modifications. Review any RLS-disabled tables with `anon` or `authenticated` grants, public EXECUTE on SECURITY DEFINER functions, and public storage buckets.
3. Run **`sql/02_readonly_tenant_link_checks.sql`** after the relevant core schema migrations are present. These SELECTs return mismatch *counts* only, not private records. A nonzero count needs human review; older historical records can explain some mismatches.
4. Create **two test brokerages with two test agents each**, plus one individual-agent test account. Use `tests/TENANT_ISOLATION_TESTS.md` and verify the Access Denied cases, ideally against staging via separate browsers/sessions.
5. Only after confirming schema and the intended SignVolt linking behavior, consider the **optional** guard migration. It is NOT part of the read-only checks, and is NOT automatically applied.
6. Repeat the entire suite after deploying to production and whenever a new module/table/API is added.

**Do not paste keys or customer data into this chat.** The `SUPABASE_SERVICE_ROLE_KEY` must be server-only, never part of `NEXT_PUBLIC_*` and never checked into GitHub. No SQL in this ZIP will restore your deleted Hostinger key.

## Outcome / limits
This deliverable is an actual source-based security review starter, with usable diagnostic SQL and a narrowly scoped draft hardening migration. It does **not** mean security has been certified, that customer records have been checked, or that the current production system has passed isolation testing.
