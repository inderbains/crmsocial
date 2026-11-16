# RealVolt v1.2.2 — Social Media Design Studio Editor

## This update builds on RealVolt v1.2.1

Install **on top of** your existing RealVolt v1.2.1 (Design Studio + Role Security + Mobile Navigation) repository. It modifies only four source files; do **not** replace the full application. Back up your current GitHub commit first.

### GitHub upload paths (upload the **extracted files**, not the ZIP)

| File in patch | Destination in `inderbains/crmsocial` |
| --- | --- |
| `app/page.tsx` | `app/page.tsx` |
| `app/design-canvas.tsx` | `app/design-canvas.tsx` |
| `app/globals.css` | `app/globals.css` |
| `lib/designs.ts` | `lib/designs.ts` |

The `tests/` file is optional for deployment and can be kept in the repository for future regression tests. This update requires **no new Supabase SQL migration**; drafts use the existing `social_drafts.payload` JSON schema.

### What's included

- 22 templates retained, keeping their existing numeric indexes so previous drafts still open.
- Real preview and **1080×1080 square**, **1080×1350 portrait**, and **1080×1920 Story/Reel-cover** PNG downloads.
- Editable headline, CTA button, property address, price, specifications, contact information, agent branding and per-design accent colour.
- Choose among available photos on *your own* saved property pages, or upload a JPG, PNG or WebP (up to 5 MB) directly.
- Optional agent headshot and brokerage logo uploads; artwork is resized before saving in the existing draft JSON. These are **per draft**, not yet auto-synced from agent profile.
- Show/hide price and agent contact strip. Just Sold templates suppress price by default (agent can deliberately enable it if allowed).
- Copy caption, save draft, set a planning date and download PNG. Saved planning dates **do not** schedule actual publishing.
- Sample stock photos are for template previews only. Exports require an approved property-page photo or an uploaded local image to avoid accidentally advertising with sample photos.
- Responsive editor for mobile devices, preserving role-based brokerage admin navigation from v1.2.1.

### Test after Hostinger deployment

1. Verify the Hostinger build completed successfully and version `v1.2.2` appears near the RealVolt logo.
2. In RealVolt open **Social Studio → Design Studio** and select **The Modern Listing**.
3. Change output size to **Portrait** then **Story / Reel cover** and confirm the preview adapts.
4. Upload an actual listing photo you have rights to use (or load a photo from your own saved property page).
5. Fill in property details, optional agent headshot and brokerage logo; adjust colour and CTA.
6. Click **Download PNG**, then **Copy caption**, then **Save draft**. Return to **Drafts** and reopen the design.
7. Open a **Just Sold** template and confirm the listing price starts hidden.
8. Log in as an agent and confirm **Back Office** is absent; agent Social Studio must not reveal brokerage Meta account controls. On a narrow phone-width screen, test the menu and editor layout.

### Deferred integrations (intentionally not activated)

This patch does not turn on DDF data synchronization, automatic Just Listed/Just Sold posting, paid Meta ads, inbound lead forms, email delivery, or background scheduling. Those still need explicit provider authorization and secure backend functions. It does not change existing Meta connection/authorization logic.

### Notes

- Don't upload photos that you don't have the right to use in advertising.
- Only client-side canvas conversion occurs. Uploaded assets saved in drafts are encoded in JSON; for large-scale production we should eventually move image assets to private Supabase Storage with signed references, ownership controls and quotas.
- Existing Brand Kit still stores name, website, and colour. Permanent agent headshot and brokerage-logo inheritance from profile records should be connected in a later phase; this patch allows independent customization now.
- This patch's changed TypeScript/TSX files passed syntax/transpilation checks and the included six focused functional/static tests. A full production Next.js build was **not** run in this environment and must be confirmed in Hostinger.
