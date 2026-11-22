# After deployment — run with TEST records only

1. **Build:** `npm run build` passes TypeScript. `reference-only`, `edge-editor` and any old `realvolt-fix*-backup-*` folder are excluded. No Deno dependency errors in Next.js.
2. **Agent dashboard:** compact green panel, no tab opened initially; counts for Reminders, Upcoming, Activity, Clients; click item opens the correct transaction or CRM record.
3. **Office dashboard:** only one Office Updates panel. Submit a new listing as Agent A; admin sees it in New files. Click opens the exact file.
4. **Firm sale:** create accepted offer with subject date. It does not count toward leaderboard. Upload signed subject removal PDF and mark firm sold; red border and dashboard date changes to completion.
5. **Extension:** upload signed subject extension; old date remains in audit history and reminder changes.
6. **Termination/expiry:** upload termination PDF and verify review/archive behavior; test expired listing status/retention without deleting documents.
7. **Documents:** remove the wrong PDF using 035 controls, upload a replacement, verify audit trail and file security.
8. **Completion:** upload lawyer completion letter, confirm actual legal completion, and verify `rv_completed_date` is separate from `rv_firm_date`.
9. **Accounting:** distinguish trust deposit held by this office versus another brokerage; verify the ledger against actual statements. Do not release money from a dashboard summary.
10. **Commission:** verify brokerage gross commission/GST in CIR and that the external PDF does not include agent splits or office deductions. Ensure already paid fees are not deducted again.
11. **Payout:** no authorization without completion and verified commission receipt; confirm cheque/EFT approval and statements are restricted to authorized staff.
12. **Reporting:** export firm sales CSV and confirm sale appears in firm month only once. Verify accounting reconciliation exceptions and payment status counts.
13. **Compliance:** report missing required documents to agent; verify audit entries; confirm brokerage B sees nothing from brokerage A.
14. **CIR:** deployment of `closing-packet` is a separate step; preview only with test lawyer and sample documents before enabling any external sending.
15. **Load:** simulate multiple signed-in users and uploads before selling 1,000 seats; run independent security testing.
