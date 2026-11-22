# Complete RealVolt transaction and brokerage checklist

| Feature discussed during testing | Source / current status |
|---|---|
| Separate listing and buyer-side Add Sale forms | Prior patch 034, retained; test on live deployment |
| PID, legal description, contract date vs listing dates | Prior 034, retained |
| Listing/sale IDs and linked sale conversion | Prior 034, retained; verify distinct IDs in UI |
| Accepted offer + subjects pending / extension PDF | Prior 034, retained |
| Firm Sold on signed subject removal, red border | Prior 034, retained; verify UI |
| Leaderboard counted at firm date, not completion | Prior SQL 034 and existing leaderboard + 038 reports; tested in focused unit tests |
| Date changes from subject-removal to completion | Prior 034 `rv_tx_summary` and 038 agent/office inboxes |
| Termination PDF and expiry/archive | Prior 034, retained; automatic backend archival needs live test |
| Remove incorrect attachment while keeping audit trail | Prior SQL 035 and app/transactions.tsx, not overwritten by 038 |
| Agent notices when Back Office opens/approves/requests | Prior 034 events, 038 compact inbox |
| Office new-file/review/alerts | 038 compact Back Office inbox with exact transaction links |
| Recent CRM clients and follow-ups | 038 compact agent inbox + CRM deep-link merge |
| Lawyer directory and selected contact | Prior 034, retained; search behavior needs live check |
| Commission and deposit holder selection | Prior 034, retained |
| CIR / letter to complete / document attachments | Prior 034 `closing-packet` function included separately, not live-verified |
| Internal split and deduction hidden from lawyers | Prior closing packet output excludes agent compensation; verify PDF sample |
| Legal completion letter uploaded / status completed | Prior SQL 034, retained; 038 compliance flags missing letter |
| Commission receipt, unpaid fees, agent payouts | Existing finance modules and SQL 034; 038 summarizes separately, does not issue payments |
| Trust ledger, deposits, reconciliation and cheque/EFT | Existing Back Office modules; 038 operational oversight |
| Firm-sale, GST, commission and payment reports | 038 financial reporting and CSV exports; indicative GST only |
| Unverified document, trust, reconciliation and payout exceptions | 038 compliance queue and links to existing modules |
| Account/agent invitation collision across brokerages | **Not fixed in 038**; requires separate authorization/onboarding work |
| One Transaction Actions section, not repeated | Guard checks one markup per transaction; any live duplicate requires source-specific repair |
| Real-time notification guarantees | Polling fallback (~15 sec); true realtime depends on Supabase publication |
| Security penetration test, regulatory certification and live bank feeds | **Not included** |
