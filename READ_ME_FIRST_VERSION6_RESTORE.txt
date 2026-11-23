REALVOLT — RESTORE VERSION 6 TRANSACTION WORKFLOW
================================================
This ZIP contains ONLY 8 files, copied exactly from your uploaded crmsocial-main (6)(1).zip.
It restores Version 6 transaction and Back Office components while leaving the newer reminder popup and cheque work untouched.
It does NOT include the entire repository and does NOT contain SQL.

STEP 1: REPLACE 8 FILES IN GITHUB
Go to github.com/inderbains/crmsocial and OPEN THE app FOLDER first.
Choose Add file -> Upload files. From this ZIP's app folder upload the eight .tsx files listed below.
Upload into GitHub app/ (NOT the repository main/root directory). Commit changes.

 - app/back-office.tsx
 - app/compliance-closing-panel.tsx
 - app/deal-admin.tsx
 - app/post-firm-details.tsx
 - app/realvolt-workspace.tsx
 - app/staged-document-upload.tsx
 - app/transaction-actions.tsx
 - app/transactions.tsx

STEP 2: REMOVE THREE ACCIDENTAL EXTRA FILES IN THE REPOSITORY ROOT
From GitHub's MAIN page (outside app/) delete, if present:
 - transactions.tsx
 - office-cheques.tsx
 - personal-dates.tsx
These are root-level copies accidentally added in Version 8 and are responsible for the missing-module errors. DO NOT DELETE their app/ copies.
Commit the deletions.

STEP 3: LET HOSTINGER REBUILD
Check TypeScript results. Do not run old or new SQL just for this source rollback.

IMPORTANT DETAILS
 - This is Version 6 transaction layout and original submit/review/admin-approval UI.
 - It intentionally leaves app/personal-dates.tsx and app/SmartInbox037.module.css as they were in Version 8, to KEEP your reminder popup.
 - It intentionally leaves app/office-cheques.tsx from Version 8, to retain the cheque approval improvements. If cheque release is blocked, do not issue payments outside normal safeguards.
 - Any previous Supabase database migrations (052/053/055) are NOT reversed by changing GitHub code. They can enforce different document rules or approval gates. Back up database and test a sample transaction before using it for client files. Do NOT delete or manually reverse SQL objects without review.
 - This ZIP is a SOURCE rollback only. It has NOT been deployed or tested on Hostinger.
 - Do NOT upload this ZIP file itself to GitHub; extract first.
