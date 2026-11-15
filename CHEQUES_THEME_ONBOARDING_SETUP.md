# RealVolt 0.8.0 — Cheques, brokerage themes and new agent setup

## Update

Upload the full project source, including root package files, next.config.mjs, app, scripts and supabase. Retain environment variables. If 001–013 are already installed, run ONLY `supabase/014_cheques_theme_setup.sql` once in Supabase SQL Editor. Do not rerun older migrations. If 013 was not installed, run it before 014.

Hostinger: Node 22.13+ or 24, build `npm run build`, output `out`. No new Edge Function is needed for this update. Existing agent invitation, Stripe billing and SignVolt sending still require the existing function/email/payment configuration. Deployment does not activate external payments automatically.

## Cheque printing

Back Office → Cheque printing. Add your bank's trust/operating accounts under Trust & bank first. Use bank-approved, preprinted cheque stock on US Letter (8.5 × 11 inches). This release prints variable cheque fields and two stubs; it does not produce MICR routing/account lines, a bank template approval, a signature or a bank transfer. Custom printing means adjustable field placement on your stock, not creating a new bank instrument from plain paper.

1. Choose Operating for commission cheques, then an authorized payout. The cheque amount and payee come from the frozen payout snapshot: agent share, GST and deductions already calculated. You cannot substitute another cheque amount or payee in preparation.
2. Choose Trust for deposit releases. Select an approved transaction, enter the recipient's legal name and the release amount. Recorded file funds dated on or before the cheque date must cover the release. This does not authorize release instructions on its own: admin reviews those separately.
3. Enter the number matching the physical cheque stock, date and memo; prepare the cheque. Numbers are 1–12 digits. A number remains reserved even when voided. Leading zeros do not permit reuse of the same number on the same account. Each payout can have only one non-voided cheque.
4. Choose top, middle or bottom layout, or select a saved brokerage layout. Coordinates are PDF points (72 points = 1 inch), from the top-left of the cheque band. Offsets adjust all fields. Layouts use Letter sheets divided into three 264-point bands. Field labels are optional because stock usually includes them.
5. Download an alignment SAMPLE and print on plain paper first. Hold it against the actual stock, adjust coordinates and save the named layout. Print the real PDF at **Actual size / 100%**, without scaling or browser headers/footers. Check alignment with your stock supplier/bank before live use.
6. Download the cheque PDF. Printing/downloading does NOT mark it paid. After the cheque is signed and released, click **Record Issue**. This records the ledger payment; for commissions it also marks the authorized payout paid. Do not additionally record the same release in the ledger or use the old manual payment button for the same payment.

The register tracks Prepared, Issued and Voided, PDF generation counts, dates, amounts, payees and references. Counts record PDF generation, not confirmation that a physical printer succeeded. Reprinting requires confirmation and uses the same cheque number; it must not create another payment. Issue retries are idempotent. Trust funds are checked again at issue, and locked/reconciled periods cannot be posted to. Prepared releases do not reserve trust funds; another issue can make a prepared release unavailable.

Prepared cheques can be voided with a reason and replaced with a new number. Issued-cheque cancellation, stop-payment, returned-cheque and replacement accounting are not automated in this release; retain the record and resolve with documented accounting corrections. Do not create a second live cheque for an already-paid commission. The new workflow does not remove the earlier manual payment-entry option for non-cheque payments.

Stubs show the net cheque, commission/GST and a limited deduction summary. Use the existing full payout statement for all itemized deductions. Very long payees/memos or out-of-page coordinates are rejected rather than silently clipped; adjust the layout or memo.

## Brokerage theme

Back Office → Brokerage settings → Brokerage theme. Set primary, accent and workspace background colours. Preview, restore saved, reset to defaults or save. Primary controls buttons and navigation, accent controls highlights/focus, and background controls the workspace. Button foreground text adjusts for contrast. Each brokerage has separate settings, and only its admins may change them. Members receive saved colours when opening, refreshing or returning to their app tab.

Internal workspace, CRM, Transactions, SignVolt and Back Office share this theme. Existing social artwork and uploaded/signed PDFs keep their own contents and colours. External signing pages retain the SignVolt presentation in this release; they do not load brokerage configuration without authentication. Cheques remain black on white for printing. This is colour theming, not a replacement of the RealVolt logo or a custom domain.

## New agent setup

Back Office → New agent setup. Hire an agent or select an existing profile. Search/filter Complete, Incomplete or All. The checklist links directly to the saved profile, compensation plan, invitation status and private documents.

- Record name, email, licence number, mailing address and assigned admin.
- Review the agreed commission split, GST rates and monthly office/software/board fees. The plan remains editable through the existing profile workflow, subject to active subscription controls.
- Attach the licence and signed agent agreement (PDF, PNG or JPEG, maximum 10 MB each). Admin reviews the document before checking verified. These documents are visible only to brokerage admins. Uploading an agreement does not itself prove it was signed.
- Send/resend the existing invitation. Acceptance and active status come from the agent's actual account; an admin checkbox cannot fake acceptance.
- Confirm billing setup. Credit-card setup is performed by the agent in My profile & billing using the existing Stripe flow. The admin should verify the subscription separately; the checklist does not charge a card or automatically certify a subscription.
- Review software access after acceptance and active membership. All steps and required profile information must be present to show Setup complete.

Setup completion is an administrative tracker; it does not automatically block software access or replace the existing membership/role controls. Personnel attachments, checklist changes, theme changes, layouts and cheques are recorded in the office activity history. Personal reminders and private CRM records remain private.

## Checks completed

61 automated tests and the production build passed. The new in-memory database checks cover immutable payout amount/payee, preparing/printing without payment, idempotent issue, duplicate payout/number prevention, trust shortfall rechecks, void controls, tenant isolation, theme permissions and private evidence access. Letter PDFs for all three stock positions were rendered and visually checked. Hostinger deployment, actual printer alignment, invitation delivery and live card billing must be checked with your configured services.
