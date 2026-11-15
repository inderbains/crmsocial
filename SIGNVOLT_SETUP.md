# SignVolt v1 — direct sending and PDF signing

Release 0.8.0. SignVolt replaces the planned Sign Digi module. It uses RealVolt's own branding and a familiar three-step workflow: Documents → Signers → Place fields. There is NO separate sender preview step. Send signing links saves the current draft, validates it, freezes the document/fields and sends the eligible invitations directly.

## Install

1. Extract the NEW ZIP into a fresh folder. Replace the source in the existing GitHub repository, including app, lib, scripts, supabase, package.json and package-lock.json. Retain Hostinger's existing environment variables.
2. Use Node 22.13+ (or Node 24), build command npm run build, output directory out. The prebuild script prepares fonts, CMaps and decoders in public/vendor/pdfjs. The worker is bundled separately by Webpack into a hashed _next/static/media/pdf-worker.*.js file. Those generated assets are deliberately not included in this source ZIP. Upload next.config.mjs, scripts/prepare-pdfjs.mjs and the updated package files, not only app/page.tsx. The build log should show realvolt-social@0.8.0 and a successful prebuild asset preparation.
3. After the existing migrations through 011 are installed, run ONLY supabase/012_signvolt.sql once. Do not rerun older migrations. This adds private requests, recipients, activity records, verification helpers and the private signvolt-files bucket.
4. Deploy the server function from this checkout:

   supabase functions deploy signvolt

   The supplied config sets verify_jwt=false because the same endpoint serves external signers. Sender actions independently verify their Supabase JWT, confirmed sender email and workspace access. Public signer actions require a random invitation token; document access/signing additionally requires email verification and a short-lived session. Keep these checks intact.
5. Set server-only function secrets APP_URL (your deployed app URL without a trailing slash), RESEND_API_KEY and CLOSING_FROM_EMAIL (a verified sender). Supabase provides SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY. Reuse the configured Back Office sender if appropriate. Never put service-role or email secret keys into NEXT_PUBLIC environment variables.
6. Keep the existing browser build settings NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY. Confirm that APP_URL/sign/ is publicly reachable on the deployed static site. Clients do not need a RealVolt account.

## Prepare and send

Open SignVolt → New signing request. Give it a clear title, upload one or several PDFs together (up to 20 input PDFs, 100 pages and 10 MB combined), and optionally choose a transaction for the completed file. A fresh static signing copy is created, preserving visible page rotation/crop. Existing fillable fields are flattened. Existing signed digital-signature PDFs are rejected; use an unsigned source. Interactive source links/widgets are not retained as interactive objects in the prepared copy.

Add signer names and distinct email addresses. Reorder them using the up arrow. Choose sequential signing or invite everyone in parallel. Add a message and an expiry instant. Place at least one REQUIRED signature or initials field for each signer. The current signer's color identifies their fields.

Fields: signature, initials, date signed, full name, email, text, checkbox, sender text note and cross-out line. Choose a tool and click the PDF, or drag the tool onto the page. Drag placed fields to move them and drag the corner to resize. Arrow keys move a focused field; Shift moves it faster. Duplicate, remove, enlarge or reassign selected fields. Save draft retains an editable request. Leaving unsaved changes asks before discarding them.

Cross-out lines are visible black strokes. Resize their length and choose horizontal/diagonal up/diagonal down. A horizontal line is centered where you click. Add initials beside changes when your document workflow requires them. This is a strike-through tool, not redaction: the original text remains visible/copyable underneath. Sender notes and cross-out lines are applied before invitations are sent so every signer sees the same prepared changes.

Click Send signing links directly when ready. There is no preview confirmation page. The server validates page/field assignments, checks the saved revision to prevent a concurrent edit being sent with the wrong fields, calculates source/prepared hashes, and locks the request. Sent documents and recipients cannot be edited. Void an outstanding request and create a new one if terms must change. Voiding is not available once all signatures have been recorded.

## Client signing

Each eligible signer receives a private email link whose random token is in the URL fragment. Before viewing the PDF, they request a six-digit code sent to that same email. Codes expire in ten minutes, allow at most five incorrect attempts, and are rate-limited. Verified sessions last one hour. A forwarded invitation link alone does not reveal the PDF without verification of the assigned email.

The signer reviews the PDF and clicks the fields assigned to them. Signatures/initials can be typed or drawn. Their adopted mark can be reused by clicking additional fields of the same type. Name/email fields are populated from the signer/session; date-signed fields are generated from the server-recorded signing timestamp using Vancouver dates. Text and checkbox fields are filled by the signer. They enter their legal name and explicitly consent to electronic signing before Finish signing can record anything. A signer can also decline with a reason.

The server validates required fields, ownership and supported signature data before storing a signature. A signer cannot write another recipient's fields or silently change an already-recorded signature by submitting twice. Sequential signing releases the next invitation after the prior signature is recorded; parallel signers can finish in either order. Email verification demonstrates access to the email account, not independent government-ID verification.

## Completed documents and activity

When everyone has signed, the server renders their recorded values onto the locked prepared PDF. The completed file's SHA-256 digest is stored, and a separate signing activity certificate records the request ID, sender, verification/signing timestamps, reported network addresses, consent and document digests. The completed PDF and certificate are emailed to the signers and sender. The owner can download them from the request screen. The activity record is not a certificate-authority/PKI signature and does not produce Adobe certificate-trust validation.

If linked to a transaction, the completed PDF is copied into that transaction's private document list. This does not automatically approve the transaction or alter its financial status. Existing document review remains separate.

Request status: Draft, Sent, Completing, Completed, Declined, Voided; Expired is calculated for an overdue Sent request. Completion generation can be retried without replacing recorded signatures. The owner can retry completed-copy delivery and transaction attachment. Successful email deliveries are remembered; unresolved attempts older than 23 hours require provider-log reconciliation before automatic retry to avoid duplicate sends after provider idempotency expires. Provider acceptance is recorded; inbox delivery is not independently confirmed.

Resending outstanding invitations is limited to once a minute per signer and rotates that signer's link/session. An already-open signing tab may need to reopen and reverify from the new email. Code emails are limited to ten per hour per recipient. Provider errors appear in activity/invitation status. Fix the sender/provider setup and retry rather than assuming an invitation reached its inbox. Completed signers may reverify to retrieve their completed file for up to 90 days after completion; office access and stored history are retained.

## Initial limits and operating boundaries

- Email-code verification, consent, private storage, frozen versions, database activity records and SHA-256 checks are implemented. An independent security/compliance assessment and your intended agreement workflow still need review; do not describe this as a DocuSign-certified service.
- Typed text and generated certificates currently use standard Latin-script PDF fonts. Drawn marks are embedded as PNGs. Unsupported typed characters stop preparation/submission rather than silently changing legal names. Large or unsupported PDFs fail before signature recording where possible; a failed final render remains recoverable from recorded data through Finish PDF generation.
- No certificate-authority signing key, qualified signature, SMS identity check, biometric signature verification, automated reminder schedule, bulk template library or qualified timestamp service is included. Signing expiry and manual resend/void are included.
- The signer page is intended for modern browsers. PDF assets are self-hosted; there is no external PDF viewer service. Deployment needs the current Node patch required by the pinned PDF.js package.
- Draft source versions, voided requests and signing history are retained. No destructive signing-record deletion or automatic retention purge is added by this version.

## Verification

npm test covers field ownership, page bounds, required signatures/checkboxes, field movement, merging/normalization, typed/drawn PDF rendering, deterministic output, oversized PNG rejection, token/session gates and mandatory consent. The Edge Function passes a separate strict TypeScript check. Local PostgreSQL-compatible checks exercise request ownership, sent-request locking, revision checks, sequential invitations, OTP attempts/rate limits, verified sessions and idempotent signatures. Completed sample pages with cross-outs and both signature styles were rendered and visually inspected.

These are local and mocked-provider checks. Live Supabase storage, invitation/code email delivery, the browser signing session and transaction attachment must be exercised end to end after deploying. Test with two email addresses you control before sending business documents. Uploading the ZIP alone does not activate email sending; the function and verified email configuration are required.
