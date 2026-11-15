-- RealVolt v1.0 marketing suite — additive to migrations 002, 003, 009, 016.
-- No real Meta Ads, DDF or email provider activity is enabled by this migration.
-- NEVER save OAuth tokens or passwords to these browser-readable tables.
begin;

create table if not exists public.marketing_sender_preferences (
 user_id uuid primary key references auth.users(id) on delete cascade,
 sender_type text not null default 'agent' check(sender_type in ('realvolt','workspace','agent')),
 display_name text not null default '' check(length(display_name)<=140),
 sender_email text not null default '' check(length(sender_email)<=240),
 reply_to text not null default '' check(length(reply_to)<=240),
 updated_at timestamptz not null default now()
);
alter table public.marketing_sender_preferences enable row level security;
drop policy if exists marketing_sender_owner on public.marketing_sender_preferences;
create policy marketing_sender_owner on public.marketing_sender_preferences for all to authenticated
 using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
revoke all on public.marketing_sender_preferences from public,anon;
grant select,insert,update,delete on public.marketing_sender_preferences to authenticated;

create table if not exists public.marketing_email_campaigns (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 property_id uuid references public.property_pages(id) on delete set null,
 name text not null check(length(name) between 1 and 140),
 subject text not null check(length(subject) between 1 and 250),
 body text not null check(length(body) between 1 and 10000),
 status text not null default 'Draft' check(status in ('Draft','Ready for review')),
 planned_at text,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index if not exists marketing_email_owner_idx on public.marketing_email_campaigns(user_id,created_at desc);
alter table public.marketing_email_campaigns enable row level security;
drop policy if exists marketing_email_owner on public.marketing_email_campaigns;
create policy marketing_email_owner on public.marketing_email_campaigns for all to authenticated
 using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()) and
  (property_id is null or exists(select 1 from public.property_pages p where p.id=property_id and p.user_id=(select auth.uid()))));
revoke all on public.marketing_email_campaigns from public,anon;
grant select,insert,update,delete on public.marketing_email_campaigns to authenticated;

create table if not exists public.marketing_automation_preferences (
 user_id uuid primary key references auth.users(id) on delete cascade,
 new_listing_drafts boolean not null default true,
 sold_drafts boolean not null default true,
 future_meta_autopost boolean not null default false check(future_meta_autopost=false),
 future_email_alerts boolean not null default false check(future_email_alerts=false),
 updated_at timestamptz not null default now()
);
alter table public.marketing_automation_preferences enable row level security;
drop policy if exists marketing_automation_owner on public.marketing_automation_preferences;
create policy marketing_automation_owner on public.marketing_automation_preferences for all to authenticated
 using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
revoke all on public.marketing_automation_preferences from public,anon;
grant select,insert,update,delete on public.marketing_automation_preferences to authenticated;

-- The property_social_events table was private to the trigger in migration 016.
-- Allow each agent to see ONLY events for their own property pages.
drop policy if exists property_social_events_owner_read on public.property_social_events;
create policy property_social_events_owner_read on public.property_social_events for select to authenticated
 using(exists(select 1 from public.property_pages p where p.id=property_id and p.user_id=(select auth.uid())));
grant select on public.property_social_events to authenticated;

-- Optional office lead-routing rules. Rules do NOT transfer CRM ownership.
create table if not exists public.office_lead_rules (
 id uuid primary key default gen_random_uuid(),
 brokerage_id uuid not null references public.brokerages(id) on delete cascade,
 agent_user_id uuid not null references auth.users(id),
 area text not null default '' check(length(area)<=250),
 min_price numeric(15,2) check(min_price is null or min_price>=0),
 max_price numeric(15,2) check(max_price is null or max_price>=0),
 max_open_leads integer not null default 25 check(max_open_leads between 1 and 10000),
 enabled boolean not null default true,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(brokerage_id,agent_user_id),
 constraint office_lead_range check(min_price is null or max_price is null or max_price>=min_price)
);
create index if not exists office_lead_rules_brokerage_idx on public.office_lead_rules(brokerage_id);
alter table public.office_lead_rules enable row level security;
drop policy if exists office_lead_rules_admin on public.office_lead_rules;
create policy office_lead_rules_admin on public.office_lead_rules for all to authenticated
 using(public.is_brokerage_admin(brokerage_id))
 with check(public.is_brokerage_admin(brokerage_id) and exists(
  select 1 from public.brokerage_members m where m.user_id=agent_user_id and m.brokerage_id=office_lead_rules.brokerage_id and m.role='agent'
 ));
revoke all on public.office_lead_rules from public,anon;
grant select,insert,update,delete on public.office_lead_rules to authenticated;

-- Change the existing 016 trigger to respect per-agent draft preferences.
-- The generated draft is a record for human review; it never posts externally.
create or replace function public.generate_property_social_draft() returns trigger
 language plpgsql security definer set search_path=public,pg_temp as $$
declare v_kind text; v_caption text; v_photo text; v_headline text; v_template int; v_allowed boolean;
begin
 if new.published is not true then return new; end if;
 if lower(coalesce(new.payload->>'status','active'))='sold' then
  if tg_op='INSERT' then
    v_kind:='just_sold';v_headline:='JUST SOLD';v_template:=12;
  elsif lower(coalesce(old.payload->>'status','active'))<>'sold' or old.published=false then
    v_kind:='just_sold';v_headline:='JUST SOLD';v_template:=12;
  end if;
 elsif lower(coalesce(new.payload->>'status','active'))='active' then
  if tg_op='INSERT' then
    v_kind:='just_listed';v_headline:='JUST LISTED';v_template:=11;
  elsif old.published=false then
    v_kind:='just_listed';v_headline:='JUST LISTED';v_template:=11;
  end if;
 end if;
 if v_kind is null then return new;end if;
 select case when v_kind='just_listed' then new_listing_drafts else sold_drafts end
  into v_allowed from public.marketing_automation_preferences where user_id=new.user_id;
 if v_allowed is false then return new;end if;
 insert into public.property_social_events(property_id,event_kind) values(new.id,v_kind)
 on conflict do nothing;
 if not found then return new;end if;
 v_photo:=coalesce(new.payload->'photos'->>0,'');
 v_caption:=v_headline||' — '||coalesce(new.payload->>'address','')||', '||coalesce(new.payload->>'city','')||'. Contact the listing agent for details.';
 insert into public.social_drafts(user_id,payload) values(new.user_id,jsonb_build_object(
  'template',v_template,'title',v_headline||' • '||left(coalesce(new.payload->>'address','Property'),60),
  'caption',v_caption,'platform','Instagram','date','','photo',v_photo));
 return new;
end $$;

commit;
