-- Run once after 012. Read-only brokerage oversight; existing write/review permissions stay in place.
begin;
create policy brokerage_admin_profile_deals on public.deal_files for select to authenticated
 using(brokerage_id=public.current_brokerage() and public.is_brokerage_admin(brokerage_id));
commit;
