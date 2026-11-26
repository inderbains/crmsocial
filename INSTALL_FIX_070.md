# RealVolt Fix 070 — Back Office review → approval → CIR → legal completion

**Based on:** Current Version 9 code, with Fix 068 transaction conversion and Fix 069 resubmission improvements applied. Use this patch only if those updates are already part of the GitHub source (or compare before replacing). Preserve the existing Version 6-style agent screen.

## Changed application files (only two)

- `app/transactions.tsx` — ordered Back Office review screen; remove the redundant admin "Upload by document type" section; keep the submitted documents list collapsible; keep one document-compliance review/approval screen; place CIR after approval and legal completion after CIR email; preserve agent actions and firm-sale documents entry.
- `app/closing-panel.tsx` — notifies the parent transaction when the sending service confirms the CIR/letter package was accepted; does not claim the message was delivered to the recipient inbox.

## Supabase safeguard (one SQL migration)

- `supabase/070_cir_before_legal_completion.sql` — makes the database reject a Sold → Completed transition unless `closing_deliveries` already contains an `accepted` packet for the same brokerage/file. This covers direct API calls and stale UI, not just the visible button.
- `supabase/VERIFY_070_READ_ONLY.sql` — read-only status check.

**Before making changes:** Back up Supabase and GitHub. Test on staging first. The SQL is only for environments where the existing CIR function and `closing_deliveries` table are already installed. Do not blindly run old migrations again.

### How to install

1. Back up your Supabase project, then execute `070_cir_before_legal_completion.sql` on staging. Run `VERIFY_070_READ_ONLY.sql` there.
2. In GitHub open `crmsocial/app`, and upload **only** the two `.tsx` files from this ZIP's `app/` folder. Never upload them to the repository root. Commit once.
3. Deploy/build through Hostinger; verify the actual Next.js TypeScript and runtime tests.
4. Test a submitted firm-sale file: expand the Documents block → review the already linked agent uploads → verify each → Approve file directly.
5. The CIR & lawyer email section should then appear. Select only approved conveyancing attachments and send the packet. The receiving lawyer can be selected separately in the existing CIR form.
6. Once Supabase records the email provider status `accepted`, Legal Completion unlocks below the CIR. Upload the actual lawyer completion letter and enter the actual completion date; verify the status changes to Completed.
7. Continue with payment receipt/trust accounting, agent payouts, and archive. Old completed transactions aren't altered by the new trigger.

### Important distinctions

- **Accepted by email provider != delivered to lawyer inbox.** Delivery should still be followed up as appropriate.
- After approval, legal completion **does not happen automatically**. The admin must confirm actual completion with supporting legal documents.
- `DealAdmin` (advanced accounting and compliance) remains available in a collapsed section; the agent's `StagedDocumentUpload` remains unchanged. Only the duplicate admin upload-by-type form is removed.
- The SQL guards **new** Sold → Completed transitions, so if a transaction has no CIR email acceptance, it cannot be completed until an email is actually sent/accepted.
- No existing transaction records or attached documents are deleted or modified by this migration.

### Validation performed

- Both modified `.tsx` files pass TypeScript **syntax parsing**.
- Structural checks show exactly one direct-review component, one CIR component, and the order Documents → Review → CIR → Legal Completion → Post-completion.
- A full Next.js production build, browser test, and database migration dry run against your live schema **have not been performed**. Do not assume the change is deployed or fully verified.
