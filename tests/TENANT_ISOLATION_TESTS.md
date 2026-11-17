# RealVolt Tenant Isolation QA — staging only

Use five dedicated **test** logins: Brokerage A admin (AA), Brokerage A agents (A1 and A2), Brokerage B admin (BA), Brokerage B agent (B1), and optionally an independent agent (I1). Each signs in with their own browser session. Use fabricated CRM contacts and deals.

| # | Attempt | Expected result |
|---|---|---|
| 1 | A1 reads A1's CRM contacts | Allowed |
| 2 | A1 attempts to fetch A2's CRM contact by guessed UUID using Supabase Data API | No row / denied |
| 3 | A1 tries creating a CRM note with `user_id=A1` but `contact_id` belonging to A2 | Denied by RLS |
| 4 | A1 tries updating a B1 CRM contact by guessed UUID | Zero rows updated / denied |
| 5 | AA reads authorized Brokerage A transaction but not Brokerage B transaction | A allowed; B denied |
| 6 | BA attempts to read A1 trust ledger or bank account via UUID | No row / denied |
| 7 | A1 or BA tries downloading B1 private SignVolt document path | Denied; no signed URL |
| 8 | A1 creates a SignVolt draft linking B1's deal or Brokerage B ID | Denied (after optional guard and under existing RLS as applicable) |
| 9 | Visitor submits published A1 website inquiry with fabricated identity; check that it appears only in A1's CRM | Assigned to A1 only |
| 10 | Remove A1's brokerage membership / deactivate A1; reattempt brokerage transactions and admin-only endpoints using an existing session | Denied after session refresh or by server authorization |
| 11 | In the browser, manually call a direct API route without login or with B1's token | 401/403; no sensitive response |
| 12 | Try spoofing agent ID / brokerage ID in the request body to create a different owner's contact or deal | Denied / ignored on server |
| 13 | Compare feature access for an unpaid account and a paid account once billing is implemented | Unpaid access denied at server and database layers |

**Do not run these tests on real customer records.** A UI hiding the button does not count as success; test the API and data layer. Capture HTTP status, test user, expected/actual outcome, and date. Never capture secret keys, tokens or live client data.

## Release gate
Do not market RealVolt as fully isolated or secure until these tests pass in staging and production verification demonstrates the same RLS/grants/policies are deployed.
