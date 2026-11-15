# Lawyer directory, commissions and closing documents

This update extends the existing RealVolt app. Retain Hostinger's existing Supabase environment variables.

## Install

1. Upload/replace the source in your existing repository; build with Node 22 and npm run build.
2. Run supabase/005_lawyers_closing.sql once in the existing Supabase project, after 004_transactions.sql. Do not rerun previously installed migrations.
3. Provision the real brokerage row and its agent/admin memberships using the commented examples in 005. Memberships cannot be self-assigned. Each account belongs to one brokerage. The assigned reviewer from 004 must be an admin in that same brokerage. Use the commented backfill transaction in 005 for existing files, after memberships are configured.
4. Deploy the included Supabase Edge Function from this checkout:

   supabase functions deploy closing-packet

   supabase/config.toml disables gateway JWT verification for publishable-key compatibility; the function itself verifies every caller JWT with auth.getUser and requires an assigned admin in the same brokerage. Never remove those checks.
5. Set server-only Edge Function secrets RESEND_API_KEY and CLOSING_FROM_EMAIL. The latter must be a verified sender for your Resend account, e.g. RealVolt <conveyancing@your-domain.ca>. Supabase supplies SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY automatically. Do not put service-role or email API keys in NEXT_PUBLIC variables. Set the brokerage's real reply-to email, address and phone in public.brokerages using project-owner SQL.
6. Verify two same-brokerage agent accounts share lawyers; a second brokerage account cannot see or select them. Test the assigned admin separately. No live email has been sent by the package's automated tests.

## Agent workflow

- Transactions > Lawyer directory saves name, firm, email, phone and address. A contact is unique by email within a brokerage. Directory entries are reusable and cannot be deleted or edited by agents; add a new contact email when it changes. A future admin contact-edit workflow can be added without altering submitted snapshots.
- On both listing and sale forms, type a lawyer name to see matching brokerage-directory contacts. Selecting one fills the name, firm, address, email and phone. If none matches, enter the contact details directly; saving the transaction adds the new lawyer to the brokerage directory and links the transaction. Blank lawyer sections can be left for later. New contacts require name, address and email. Duplicate emails are reused when name/address match; conflicting details stop the save rather than overwrite a shared contact. No additional SQL is needed for this interface update if migration 005 is installed.
- Add a sale directly for selling/buyer representation: only selling commission is entered. Amounts are CAD dollar amounts before GST, rather than percentage formulas. Enter the agreed commission amount.
- Converting a listing into a sale selects listing representation and the other-brokerage deposit holder. Enter that brokerage's name and the total deposit it holds. Direct sales can also record an external deposit holder.
- Enter buyer/seller legal names, both lawyer selections, sale price, completion date, agreed commission, GST rate (default 5%) and deposit details. Lawyer selection copies the saved contact onto the transaction. Selecting a different contact replaces the snapshot while the transaction is editable.
- Financial summary uses integer cents. GST is calculated separately on listing and selling commission, then summed. Direct sales have only the selling component. For funds held by us: deduct the total commission including GST up to available funds; show the remaining deposit for remittance or a commission shortfall. When another brokerage holds the deposit, our available deposit, deduction and remittance are zero; the receivable is our side's commission including GST, not the other brokerage's share.
- Attach the contract and supporting documents and submit to the assigned back office. Submitted files remain locked until changes are requested.

## Back office

Open a submitted or approved sale. Select buyer or seller lawyer. Enter any additional instructions and choose supporting transaction documents. Generate and preview the CIR and letter PDFs, then send the exact preview to the displayed email. Send a separate packet to each lawyer as required. The server obtains the recipient from the saved transaction, not a free-form request.

The included generic CIR and letter are generated from saved fields; they do not reproduce a brokerage-specific precedent, collect signatures or initiate a trust transfer. Review their content in the on-screen preview before sending. Replace the text template in supabase/functions/_shared/calculations.mjs if your brokerage uses an approved precedent. A cleared-deposit verification and actual funds transfer remain separate actions.

Up to 20 supporting files, at most 10 MB total, per email. PDF generation currently supports standard Latin characters; unsupported characters stop generation rather than changing a legal name. Email history records recipient, payload, provider acceptance/failure and provider ID. It does not claim inbox delivery. Identical packet retries are deduplicated; an unresolved attempt older than 23 hours is blocked for provider-log reconciliation. No automatic send occurs on submission.

## Verification

Run npm test, npm run typecheck, npm run build. Tests cover GST cents/rounding, direct selling commission, externally held listing deposit, shortages, invalid values, recipient selection, required fields and deterministic paginated PDFs. Local PostgreSQL-compatible checks also passed for the migrations, cross-brokerage isolation, immutable lawyer snapshots, reviewer access, submission locks and returned-file edits. The email endpoint was exercised with a mocked provider, including authorization, preview integrity, recipient selection and attachment ownership. Live Supabase and email configuration need an end-to-end check after installation.
