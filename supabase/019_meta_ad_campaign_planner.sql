-- RealVolt v1.4 — upgraded Meta Ads campaign PLANNER, not an advertising publisher.
-- Run after 016, 017 and 018. No tokens, billing methods, live campaigns, or Meta API calls.
begin;

alter table public.meta_ad_plans
  add column if not exists campaign_goal text not null default 'website_visits',
  add column if not exists destination_url text not null default '',
  add column if not exists creative_draft_id uuid references public.social_drafts(id) on delete set null,
  add column if not exists call_to_action text not null default 'LEARN_MORE',
  add column if not exists placements text[] not null default '{Facebook,Instagram}',
  add column if not exists lead_form_name text not null default '',
  add column if not exists plan_notes text not null default '';

-- Constraints are added independently so this migration is safe to re-run.
do $$begin
 if not exists(select 1 from pg_constraint where conname='rv_ad_goal_check') then
  alter table public.meta_ad_plans add constraint rv_ad_goal_check check(campaign_goal in ('website_visits','instant_leads'));
 end if;
 if not exists(select 1 from pg_constraint where conname='rv_ad_cta_check') then
  alter table public.meta_ad_plans add constraint rv_ad_cta_check check(call_to_action in ('LEARN_MORE','CONTACT_US','BOOK_NOW','SIGN_UP'));
 end if;
 if not exists(select 1 from pg_constraint where conname='rv_ad_destination_check') then
  alter table public.meta_ad_plans add constraint rv_ad_destination_check check(destination_url='' or (length(destination_url)<=1500 and destination_url ~* '^https://[^[:space:]]+$'));
 end if;
 if not exists(select 1 from pg_constraint where conname='rv_ad_placements_check') then
  alter table public.meta_ad_plans add constraint rv_ad_placements_check check(
   cardinality(placements) between 1 and 2 and placements <@ array['Facebook','Instagram']::text[]
  );
 end if;
 if not exists(select 1 from pg_constraint where conname='rv_ad_notes_length_check') then
  alter table public.meta_ad_plans add constraint rv_ad_notes_length_check check(length(plan_notes)<=3000 and length(lead_form_name)<=160);
 end if;
end $$;

create index if not exists rv_meta_ad_plans_draft_idx on public.meta_ad_plans(creative_draft_id) where creative_draft_id is not null;

-- Even a caller who guesses another agent's creative ID cannot link it to their plan.
create or replace function public.rv_validate_meta_ad_creative()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if new.creative_draft_id is not null and not exists(
   select 1 from public.social_drafts d where d.id=new.creative_draft_id and d.user_id=new.user_id
 ) then raise exception 'Ad creative must belong to the campaign owner'; end if;
 return new;
end $$;
drop trigger if exists rv_validate_meta_ad_creative_trigger on public.meta_ad_plans;
create trigger rv_validate_meta_ad_creative_trigger before insert or update on public.meta_ad_plans
for each row execute function public.rv_validate_meta_ad_creative();
revoke execute on function public.rv_validate_meta_ad_creative() from public,anon,authenticated;

-- Existing RLS owner policies from 016 and asset validation from 018 remain in effect.
commit;
