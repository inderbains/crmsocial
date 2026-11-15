# Listing status and personal agent workspace

Upload/replace the updated source in the existing repository and redeploy Hostinger. Keep existing environment variables. After 006 is installed, run only these new migrations once, in order:

1. supabase/007_listing_status.sql
2. supabase/008_personal_workspace.sql

Do not rerun older migrations.

## Automatic listing status

Save/open a listing, then use its Listing status panel to enter the expiry date. It remains Active through that day and becomes Expired on the next Vancouver calendar date. Add a termination date and reason to schedule termination, or use Terminate today and save. Termination takes precedence over expiry. Converting a listing into a sale always displays Sold and preserves the previous listing dates. Listing lifecycle and back-office review/approval are separate.

Expired listings and Terminated listings are new navigation views. The Listings view also has a status filter. Renew a listing by recording its agreed new expiry date and clearing any termination date. Date changes are audited. Original terms should be retained in the uploaded agreement/history as required by office policy.

Effective status is computed in a secured database view on read and in the UI using America/Vancouver dates. No cron job, credentials or browser session is required for dates to take effect. An open screen refreshes its status once a minute and on browser focus. There is no artificial stored-status update at midnight; activity history records date edits, not a fabricated user change when the date rolls over. This is based on agent-entered dates, not an MLS/DDF status sync. The system does not infer that a listing has been terminated without a recorded termination date.

## Personal workspace

The Social Studio welcome banner is replaced by Dates to remember. Social Studio itself remains available among applications.

Each agent can add a title, date and notes, edit them, mark them complete/reopen, or delete. Past open dates are marked overdue and today's dates are highlighted. Records are private to the owning account, including against other agents or admins in the same brokerage. Dates are shown in the app; email/push notifications are not enabled.

Open Workspace settings, enter the agent's full name and save. The workspace heading shows that name and the name of the brokerage linked through brokerage_members. If there is no brokerage membership, it displays Independent agent. Agents cannot invent or alter brokerage affiliation through this profile. The existing workspace name remains visible as context.

## Verification

Unit tests cover expiry day boundaries, termination precedence, sold precedence, renewal and Vancouver timezone/DST. Local PostgreSQL-compatible integration tests cover both migrations, status calculations, tenant boundaries and private date/profile access. npm test, npm run typecheck and npm run build pass. Live Supabase and Hostinger deployment still need to be performed.
