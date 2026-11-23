# RealVolt Fix 057 — Display OUR Realtor in Back Office

Built as a one-file update to Fix 056, keeping the earlier Version 6 transaction design.

## Correct attribution
- The bold **Our Realtor** line on the Back Office transaction is the owner (`deal_files.user_id`), resolved through that user's agent profile (`office_agents`, with existing personal profile fallback).
- The buyer, seller, and cooperating Realtor are never used as fallback names for our Realtor.
- An external cooperating Realtor, when supplied, is still stored and available in a collapsed **Other brokerage contact** section for conveyancing; the edit form stays unchanged.
- Transaction list rows in Back Office label the file's own Realtor separately from the client.
- No transaction ownership or commission records are changed.

## Install
1. Install Fix 056 first if its `app/transactions.tsx` has not yet been deployed.
2. Back up the GitHub `app/transactions.tsx` file.
3. In GitHub open **app/**, upload the provided `transactions.tsx` into **app/** (not the root), replace the existing file, and commit.
4. Deploy on Hostinger. Open a sample Sale and verify **Our Realtor** is the file owner's account profile name. Check the collapsed Other brokerage contact panel for the cooperating Realtor.
5. If it shows **Agent profile name unavailable**, make sure the file owner has an office agent profile whose `user_id` matches `deal_files.user_id` and is in the same brokerage.

No SQL changes. Do not delete or overwrite `deal_files.user_id` or the cooperating agent data.
This file has not been tested on your live deployment.
