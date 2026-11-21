# RealVolt — Temporary Gmail agent invitation sender

This patch changes **agent invitations only**, in the existing Supabase Edge Function `agent-office`. It keeps existing authentication, brokerage-admin authorization and Stripe billing actions. No database SQL or Hostinger environment settings are required for this patch. It does **not** connect Gmail inboxes or make SignVolt / closing-packet emails work; those currently still use Resend.

## Prepare Gmail
1. Sign in to the Google account that will temporarily send invitations.
2. Turn on **2-Step Verification** at https://myaccount.google.com/security .
3. Open https://myaccount.google.com/apppasswords and create an app password named `RealVolt testing` if Google offers App Passwords for your account. Copy the **app password**, *not* your normal Google password. If App Passwords are unavailable, do not disable account security; use a dedicated email provider or a Gmail OAuth implementation instead.
4. Do not put the app password in a source file, GitHub, screenshots, email, or this chat.

## Back up and apply code
1. Back up the current `supabase/functions/agent-office/index.ts` and `deno.json` from your latest GitHub repository.
2. **Merge** the two supplied files into exactly `supabase/functions/agent-office/` in the repo. These are based on your saved RealVolt project snapshot; if you made newer `agent-office` changes, manually merge and preserve them (especially permission and Stripe paths).
3. Commit changes. **Important:** A Hostinger redeploy does not deploy a Supabase Edge Function.
4. Deploy the `agent-office` Edge Function from the Supabase dashboard (or CLI): `supabase functions deploy agent-office --project-ref YOUR_PROJECT_REF`. Do not share the project service-role key.

## Supabase Edge Function Secrets
In your existing Supabase project, go to **Edge Functions → Secrets** and configure:

```dotenv
INVITATION_EMAIL_PROVIDER=gmail
GMAIL_SMTP_USER=your-email@gmail.com
GMAIL_APP_PASSWORD=your-google-app-password
APP_URL=https://your-actual-realvolt-site
```

The `APP_URL` must already match an authorized Redirect URL in **Authentication → URL Configuration** (include your site's actual URL and necessary callback path). Never add `NEXT_PUBLIC_` to secrets. `GMAIL_APP_PASSWORD` is a Google app password, not the regular Gmail password.

## Test one invitation
1. Use a test agent email you control and which is not already enrolled.
2. Open RealVolt → **Back Office → Agents & Profiles** and select **Send / resend invitation** on the test agent.
3. Confirm the invitation arrives from the chosen Gmail address, optionally in Spam/Promotions. Click the link and finish onboarding; verify the agent sees only the permitted brokerage data.
4. Check `agent-office` Edge Function logs if it fails; do not copy emails containing magic links or any secrets into chat.
5. When you're done testing, remove the temporary App Password from your Google account or rotate it. Later, use a dedicated transactional sender on `realvolt.ca`.

## Troubleshooting
- `Configure GMAIL_SMTP_USER ...`: required secrets not present or function not redeployed.
- `Gmail could not send ...`: check 2-Step Verification, App Password availability, and Google security restrictions. Supabase Edge Functions disallow ports **25 and 587**; this patch uses Gmail TLS port **465**. Still, live availability must be confirmed in your hosted project.
- `Redirect URL not allowed`: add the authorized callback in Supabase Auth URL Configuration.
- No mailbox connection is created. This is outgoing invitations only; a future Gmail OAuth integration can support each agent's inbox and two-way communication.
- **Rollback:** change only `INVITATION_EMAIL_PROVIDER=resend` and restore your previous Resend secrets, or restore the original function. Verify Resend before switching to it.
- **Production warning:** Gmail is for controlled testing, not bulk SaaS invitations. Gmail has sending limits and anti-abuse checks. Never grant normal Gmail password access to the server.

## Test status
Static code/syntax checks can be run locally without credentials. Live email delivery cannot be tested here because no Gmail credentials or Supabase project access were supplied. The user must deploy the function and send one test invite.
