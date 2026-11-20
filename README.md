# Manual acceptance scenarios

1. `crm_contacts` insert through new route is visible in existing `app/crm.tsx`.
2. CRM profile upsert with auth A succeeds; other auth B can't select or upsert it.
3. CRM link references only an owned contact and an owned deal; forging another deal id is denied by RLS.
4. AI endpoint rejects missing token, invalid contact, disabled AI, and opted-out contacts.
5. Draft creation returns `sent:false`; **no** email or SMS provider is contacted.
6. Preview client in another brokerage has no cross-tenant access; admin has no automatic access to personal CRM records.
7. New draft deal is still subject to existing Transactions submission/reviewer approval rules.
8. Existing Back Office and legacy CRM workflows remain unchanged after migration.
