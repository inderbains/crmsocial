# RealVolt v1.5.7 — Consolidated Agent Websites

**Install:** Read `INSTALL_FIRST.txt` first. This is a complete website **module**, designed to layer onto the existing RealVolt app without replacing Open Houses, CRM, SignVolt, or transactions.

It combines the original three themes, editable primary/accent/background colours, live preview, public single-page website, and owner-only Supabase website settings. RealVolt's existing browser-based Supabase login is used rather than a missing `/login` route. Site edits require the user's validated access token and RLS checks; domain verification is a separate server operation.

**Files:** `app/agent-site-studio`, `app/site/[slug]`, `app/site-domain/[hostname]`, `app/api/agent-site`, `components/rv-agent-site`, `lib/rv-agent-site`, Supabase migration `024_rv_agent_website_studio.sql`, and a host-routing `proxy.ts` that is disabled by default until DNS/SSL is configured.

**Important limitations:** No automatic Hostinger domain provisioning or SSL automation. DDF/MLS listing display and CRM lead forwarding are not connected. No code overwrites `app/page.tsx`, `app/open-house-manager.tsx`, or existing CRM.
