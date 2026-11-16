-- RealVolt consolidated marketing package: office marketing summary and seller follow-up workflow.
-- Run AFTER 016, 017, 018 and 019. Additive, leaves DDF/Meta publishing/email sending disabled.
begin;

-- Data isolation: plans are visible only to the owning agent, not the general public.
create table if not exists public.rv_post_sale_followup_plans (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 property_id uuid not null references public.property_pages(id) on delete cascade,
 contact_id uuid not null references public.crm_contacts(id) on delete cascade,
 created_at timestamptz not null default now(),
 unique(user_id,property_id,contact_id)
);
create index if not exists rv_post_sale_owner_created on public.rv_post_sale_followup_plans(user_id,created_at desc);
alter table public.rv_post_sale_followup_plans enable row level security;
drop policy if exists rv_post_sale_owner_select on public.rv_post_sale_followup_plans;
create policy rv_post_sale_owner_select on public.rv_post_sale_followup_plans for select to authenticated
 using(user_id=(select auth.uid()));
revoke all on public.rv_post_sale_followup_plans from public,anon,authenticated;
grant select on public.rv_post_sale_followup_plans to authenticated;

-- Authenticated RPC: create seller follow-up tasks once, transactionally. It never sends email.
create or replace function public.rv_create_post_sale_followups(p_property_id uuid,p_contact_id uuid)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare v_owner uuid;v_address text;v_contact uuid;v_plan uuid;
begin
 if auth.uid() is null then raise exception 'Authentication required' using errcode='42501';end if;
 select p.user_id,coalesce(p.payload->>'address','Property') into v_owner,v_address
 from public.property_pages p where p.id=p_property_id and p.user_id=auth.uid()
  and lower(coalesce(p.payload->>'status','')) in ('sold','closed');
 if v_owner is null then raise exception 'Use one of your sold properties' using errcode='42501';end if;
 select id into v_contact from public.crm_contacts
  where id=p_contact_id and user_id=auth.uid() and contact_type in ('Seller','Buyer & seller');
 if v_contact is null then raise exception 'Select a seller contact in your CRM' using errcode='42501';end if;
 insert into public.rv_post_sale_followup_plans(user_id,property_id,contact_id)
  values(auth.uid(),p_property_id,p_contact_id)
  on conflict(user_id,property_id,contact_id) do nothing returning id into v_plan;
 if v_plan is null then return false;end if;
 insert into public.crm_tasks(user_id,contact_id,title,due_date,priority) values
  (auth.uid(),p_contact_id,'Send seller thank-you — '||left(v_address,100),current_date+2,'Normal'),
  (auth.uid(),p_contact_id,'Request seller testimonial — '||left(v_address,100),current_date+7,'Normal'),
  (auth.uid(),p_contact_id,'Seller referral follow-up — '||left(v_address,100),current_date+30,'Normal');
 return true;
end $$;
revoke all on function public.rv_create_post_sale_followups(uuid,uuid) from public,anon;
grant execute on function public.rv_create_post_sale_followups(uuid,uuid) to authenticated;

-- Read-only office reporting. Validate brokerage admin membership BEFORE aggregating agent-owned rows.
-- No contact names/emails, private notes, OAuth tokens or per-buyer identifiers are returned.
create or replace function public.rv_office_marketing_summary(p_brokerage_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare result jsonb;
begin
 if auth.uid() is null or p_brokerage_id is null or not public.is_brokerage_admin(p_brokerage_id) then
  raise exception 'Brokerage administrator access required' using errcode='42501';
 end if;
 with office_members as (
  select m.user_id from public.brokerage_members m where m.brokerage_id=p_brokerage_id
 ), metrics as (
  select jsonb_build_object(
   'agents',(select count(*) from office_members),
   'contacts',(select count(*) from public.crm_contacts where user_id in(select user_id from office_members)),
   'qualified_contacts',(select count(*) from public.crm_contacts where user_id in(select user_id from office_members) and stage in ('Qualified','Active','Under contract','Closed')),
   'showings',(select count(*) from public.property_showing_requests where user_id in(select user_id from office_members)),
   'property_pages',(select count(*) from public.property_pages where user_id in(select user_id from office_members) and published=true),
   'ad_plans',(select count(*) from public.meta_ad_plans where user_id in(select user_id from office_members)),
   'social_plans',(select count(*) from public.social_drafts where user_id in(select user_id from office_members) and nullif(payload->>'date','') is not null)
  ) as totals
 ), by_agent as (
  select coalesce(jsonb_agg(jsonb_build_object(
   'agent_id',m.user_id,
   'agent_name',coalesce((select a.full_name from public.office_agents a where a.brokerage_id=p_brokerage_id and a.user_id=m.user_id limit 1),'Office member'),
   'contacts',(select count(*) from public.crm_contacts c where c.user_id=m.user_id),
   'showings',(select count(*) from public.property_showing_requests s where s.user_id=m.user_id),
   'property_pages',(select count(*) from public.property_pages p where p.user_id=m.user_id and p.published=true),
   'ad_plans',(select count(*) from public.meta_ad_plans ap where ap.user_id=m.user_id)
  ) order by m.user_id),'[]'::jsonb) as rows from office_members m
 )
 select jsonb_build_object('totals',(select totals from metrics),'agents',(select rows from by_agent)) into result;
 return result;
end $$;
revoke all on function public.rv_office_marketing_summary(uuid) from public,anon;
grant execute on function public.rv_office_marketing_summary(uuid) to authenticated;
commit;
