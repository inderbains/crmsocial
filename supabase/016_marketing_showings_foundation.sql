-- RealVolt marketing foundation — run AFTER schema.sql, 002_workspace_properties.sql and 003_crm.sql.
-- DDF/Meta provider approval is not required for this migration.
-- Public access is limited to validated RPCs; no direct anonymous reads of personal details.
begin;

create table if not exists public.property_showing_requests (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 property_id uuid not null references public.property_pages(id) on delete cascade,
 contact_id uuid references public.crm_contacts(id) on delete set null,
 visitor_name text not null check (length(visitor_name) between 2 and 150),
 visitor_email text not null default '',
 visitor_phone text not null default '',
 requested_at timestamptz not null,
 message text not null default '',
 source text not null default 'Property website',
 status text not null default 'Pending' check(status in ('Pending','Confirmed','Reschedule requested','Declined','Completed')),
 agent_notes text not null default '',
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 constraint showing_contact_required check(visitor_email <> '' or visitor_phone <> '')
);
create index if not exists idx_showing_owner_time on public.property_showing_requests(user_id,requested_at desc);
create index if not exists idx_showing_property on public.property_showing_requests(property_id,created_at desc);
alter table public.property_showing_requests enable row level security;
drop policy if exists showing_owner_read on public.property_showing_requests;
create policy showing_owner_read on public.property_showing_requests for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists showing_owner_update on public.property_showing_requests;
create policy showing_owner_update on public.property_showing_requests for update to authenticated
 using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
revoke all on public.property_showing_requests from public, anon;
grant select,update on public.property_showing_requests to authenticated;

-- A validated public form writes to the assigned listing agent. It never lets the visitor pick another user_id.
create or replace function public.submit_property_showing(
 p_property_id uuid, p_name text, p_email text, p_phone text,
 p_requested_at timestamptz, p_message text default '', p_website text default ''
) returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
declare v_page public.property_pages%rowtype; v_email text; v_phone text; v_name text; v_contact_id uuid;
begin
 -- Honeypot and parameter checks. Respond to the UI generically, without leaking contact information.
 if nullif(trim(coalesce(p_website,'')),'') is not null then return true; end if;
 v_name := trim(coalesce(p_name,''));
 v_email := lower(trim(coalesce(p_email,'')));
 v_phone := trim(coalesce(p_phone,''));
 if length(v_name) not between 2 and 150 or length(v_email)>240 or length(v_phone)>40 or
    length(coalesce(p_message,''))>2000 or (v_email='' and v_phone='') or
    (v_email<>'' and v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$') or
    p_requested_at is null or p_requested_at < now() or p_requested_at>now()+interval '180 days' then
   raise exception 'Invalid showing request details';
 end if;
 select * into v_page from public.property_pages where id=p_property_id and published=true;
 if not found then raise exception 'Property unavailable'; end if;
 -- Basic duplicate throttle for an email / property / requested time. This does not replace edge-level abuse protection.
 if exists (select 1 from public.property_showing_requests s where s.property_id=p_property_id
   and lower(s.visitor_email)=v_email and s.visitor_phone=v_phone and s.requested_at=p_requested_at
   and s.created_at > now()-interval '10 minutes') then return true; end if;
 if v_email<>'' then
   select id into v_contact_id from public.crm_contacts
   where user_id=v_page.user_id and lower(email)=v_email limit 1;
 end if;
 if v_contact_id is null then
   insert into public.crm_contacts(user_id,full_name,email,phone,contact_type,stage,source,communication_consent)
   values(v_page.user_id,v_name,v_email,v_phone,'Buyer','New','Property showing request','Unknown')
   returning id into v_contact_id;
 end if;
 insert into public.property_showing_requests(user_id,property_id,contact_id,visitor_name,visitor_email,visitor_phone,requested_at,message)
 values(v_page.user_id,p_property_id,v_contact_id,v_name,v_email,v_phone,p_requested_at,coalesce(p_message,''));
 insert into public.crm_tasks(user_id,contact_id,title,due_date,priority)
 values(v_page.user_id,v_contact_id,'Follow up: showing request — '||left(coalesce(v_page.payload->>'address','Property'),120),current_date,'High');
 return true;
end $$;
revoke all on function public.submit_property_showing(uuid,text,text,text,timestamptz,text,text) from public;
grant execute on function public.submit_property_showing(uuid,text,text,text,timestamptz,text,text) to anon,authenticated;

create table if not exists public.property_engagement (
 id bigint generated always as identity primary key,
 owner_user_id uuid not null references auth.users(id) on delete cascade,
 property_id uuid not null references public.property_pages(id) on delete cascade,
 event_type text not null check(event_type in ('Page view','Contact click')),
 source text not null default 'direct' check (length(source)<=64),
 created_at timestamptz not null default now()
);
create index if not exists idx_engagement_owner_created on public.property_engagement(owner_user_id,created_at desc);
alter table public.property_engagement enable row level security;
drop policy if exists engagement_owner_read on public.property_engagement;
create policy engagement_owner_read on public.property_engagement for select to authenticated using(owner_user_id=(select auth.uid()));
revoke all on public.property_engagement from public, anon;
grant select on public.property_engagement to authenticated;
create or replace function public.track_property_engagement(p_property_id uuid,p_event_type text,p_source text default 'direct')
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare v_owner uuid;
begin
 if p_event_type not in ('Page view','Contact click') then return false; end if;
 select user_id into v_owner from public.property_pages where id=p_property_id and published=true;
 if v_owner is null then return false; end if;
 insert into public.property_engagement(owner_user_id,property_id,event_type,source)
 values(v_owner,p_property_id,p_event_type,left(regexp_replace(coalesce(p_source,'direct'),'[^a-zA-Z0-9_\-]','','g'),64));
 return true;
end $$;
revoke all on function public.track_property_engagement(uuid,text,text) from public;
grant execute on function public.track_property_engagement(uuid,text,text) to anon,authenticated;

create table if not exists public.buyer_saved_searches (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 contact_id uuid not null references public.crm_contacts(id) on delete cascade,
 area text not null default '',
 max_price numeric(15,2),
 min_bedrooms integer not null default 0,
 enabled boolean not null default true,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(user_id,contact_id), check(max_price is null or max_price>=0),check(min_bedrooms between 0 and 20)
);
create index if not exists buyer_search_owner on public.buyer_saved_searches(user_id);
alter table public.buyer_saved_searches enable row level security;
drop policy if exists buyer_search_owner_policy on public.buyer_saved_searches;
create policy buyer_search_owner_policy on public.buyer_saved_searches for all to authenticated
 using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()) and exists(select 1 from public.crm_contacts c where c.id=contact_id and c.user_id=(select auth.uid())));
revoke all on public.buyer_saved_searches from public,anon;
grant select,insert,update,delete on public.buyer_saved_searches to authenticated;

create table if not exists public.meta_ad_plans (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 property_id uuid references public.property_pages(id) on delete set null,
 campaign_name text not null check(length(campaign_name) between 1 and 140),
 campaign_type text not null check(campaign_type in ('Just listed','Just sold','Open house','Buyer leads','Seller leads','Price reduction')),
 headline text not null default '', description text not null default '',
 area text not null default '', daily_budget numeric(12,2) not null default 20 check(daily_budget>0),
 planned_start date, planned_end date,
 status text not null default 'Draft' check(status in ('Draft','Ready for review','Archived')),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 constraint ad_end_after_start check(planned_end is null or planned_start is null or planned_end>=planned_start)
);
create index if not exists idx_ad_plans_owner on public.meta_ad_plans(user_id,created_at desc);
alter table public.meta_ad_plans enable row level security;
drop policy if exists meta_plan_owner_policy on public.meta_ad_plans;
create policy meta_plan_owner_policy on public.meta_ad_plans for all to authenticated
 using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()) and (property_id is null or exists(select 1 from public.property_pages p where p.id=property_id and p.user_id=(select auth.uid()))));
revoke all on public.meta_ad_plans from public,anon;
grant select,insert,update,delete on public.meta_ad_plans to authenticated;

-- Generate a social-media DRAFT automatically for a newly published or newly sold manual listing.
-- Actual Meta publishing requires a separate authorized backend worker and Meta connection.
create table if not exists public.property_social_events (
 property_id uuid not null references public.property_pages(id) on delete cascade,
 event_kind text not null check(event_kind in ('just_listed','just_sold')),
 created_at timestamptz not null default now(),primary key(property_id,event_kind)
);
alter table public.property_social_events enable row level security;
revoke all on public.property_social_events from public,anon,authenticated;
create or replace function public.generate_property_social_draft() returns trigger
 language plpgsql security definer set search_path=public,pg_temp as $$
declare v_kind text; v_caption text; v_photo text; v_headline text; v_template int;
begin
 if new.published is not true then return new; end if;
 if lower(coalesce(new.payload->>'status','active')) = 'sold' then
    if tg_op='INSERT' or lower(coalesce(old.payload->>'status','active')) <> 'sold' then
      v_kind:='just_sold'; v_headline:='JUST SOLD'; v_template:=2;
    end if;
 elsif lower(coalesce(new.payload->>'status','active'))='active' then
    if tg_op='INSERT' or old.published=false then
      v_kind:='just_listed'; v_headline:='JUST LISTED'; v_template:=0;
    end if;
 end if;
 if v_kind is null then return new; end if;
 insert into public.property_social_events(property_id,event_kind) values(new.id,v_kind)
 on conflict do nothing;
 if not found then return new; end if;
 v_photo:=coalesce(new.payload->'photos'->>0,'');
 v_caption:=v_headline||' — '||coalesce(new.payload->>'address','')||', '||coalesce(new.payload->>'city','')||'. Learn more: '||coalesce(new.payload->>'title','');
 insert into public.social_drafts(user_id,payload) values(new.user_id,jsonb_build_object(
   'template',v_template,'title',v_headline||' • '||left(coalesce(new.payload->>'address','Property'),60),
   'caption',v_caption,'platform','Instagram','date','','photo',v_photo));
 return new;
end $$;
drop trigger if exists property_marketing_draft on public.property_pages;
create trigger property_marketing_draft after insert or update of published,payload on public.property_pages
 for each row execute function public.generate_property_social_draft();

commit;
