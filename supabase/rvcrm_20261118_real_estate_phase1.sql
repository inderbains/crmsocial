-- RealVolt Real Estate CRM Phase 1. ADDITIVE. Staging first.
-- Requires existing public.crm_contacts, public.crm_notes, public.crm_tasks
-- and public.deal_files from migrations 003 and 004+.
-- Does not change the existing CRM or back office tables, permissions, or trust workflows.
begin;

create table if not exists public.rvcrm_real_estate_profiles (
  contact_id uuid primary key references public.crm_contacts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  property_type text not null default '',
  preferred_areas text[] not null default '{}',
  bedrooms_min integer check (bedrooms_min is null or bedrooms_min between 0 and 30),
  bathrooms_min numeric(4,1) check (bathrooms_min is null or bathrooms_min between 0 and 30),
  budget_min numeric(15,2) check (budget_min is null or budget_min >= 0),
  purchase_timeline text not null default '',
  financing_status text not null default '',
  motivation text not null default '',
  ai_draft_enabled boolean not null default false,
  followup_cadence_days integer not null default 7 check (followup_cadence_days between 1 and 365),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.rvcrm_contact_deals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  contact_id uuid not null references public.crm_contacts(id) on delete cascade,
  deal_id uuid not null references public.deal_files(id) on delete cascade,
  relationship text not null check (relationship in ('Buyer','Seller','Both','Referral')),
  created_at timestamptz not null default now(),
  unique (contact_id, deal_id)
);
create index if not exists rvcrm_contact_deals_owner_idx on public.rvcrm_contact_deals(user_id,contact_id);
create index if not exists rvcrm_contact_deals_deal_idx on public.rvcrm_contact_deals(deal_id);

create table if not exists public.rvcrm_ai_drafts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  contact_id uuid not null references public.crm_contacts(id) on delete cascade,
  channel text not null check (channel in ('Email','SMS')),
  purpose text not null check (length(purpose) between 1 and 160),
  content text not null check (length(content) between 1 and 5000),
  created_at timestamptz not null default now()
);
create index if not exists rvcrm_ai_drafts_owner_idx on public.rvcrm_ai_drafts(user_id,created_at desc);

-- Validate ownership of both ends on every write, including updates of foreign keys.
-- RLS uses owner-only access, matching public.crm_contacts security model. No implicit
-- brokerage-admin access to agents' contacts; any future sharing needs explicit grants.
create or replace function public.rvcrm_owns_contact(cid uuid, uid uuid)
returns boolean language sql stable security invoker set search_path = '' as $$
  select uid = (select auth.uid()) and exists (
    select 1 from public.crm_contacts c where c.id=cid and c.user_id=uid
  );
$$;
create or replace function public.rvcrm_owns_deal(did uuid, uid uuid)
returns boolean language sql stable security invoker set search_path = '' as $$
  select uid = (select auth.uid()) and exists (
    select 1 from public.deal_files d where d.id=did and d.user_id=uid
  );
$$;
revoke all on function public.rvcrm_owns_contact(uuid,uuid) from public, anon;
revoke all on function public.rvcrm_owns_deal(uuid,uuid) from public, anon;
grant execute on function public.rvcrm_owns_contact(uuid,uuid) to authenticated;
grant execute on function public.rvcrm_owns_deal(uuid,uuid) to authenticated;

alter table public.rvcrm_real_estate_profiles enable row level security;
alter table public.rvcrm_contact_deals enable row level security;
alter table public.rvcrm_ai_drafts enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='rvcrm_real_estate_profiles' and policyname='rvcrm_profile_owner') then
    create policy rvcrm_profile_owner on public.rvcrm_real_estate_profiles
      for all to authenticated
      using (user_id=(select auth.uid()) and public.rvcrm_owns_contact(contact_id,user_id))
      with check (user_id=(select auth.uid()) and public.rvcrm_owns_contact(contact_id,user_id));
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='rvcrm_contact_deals' and policyname='rvcrm_contact_deal_owner') then
    create policy rvcrm_contact_deal_owner on public.rvcrm_contact_deals
      for all to authenticated
      using (user_id=(select auth.uid()) and public.rvcrm_owns_contact(contact_id,user_id) and public.rvcrm_owns_deal(deal_id,user_id))
      with check (user_id=(select auth.uid()) and public.rvcrm_owns_contact(contact_id,user_id) and public.rvcrm_owns_deal(deal_id,user_id));
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='rvcrm_ai_drafts' and policyname='rvcrm_ai_draft_owner') then
    create policy rvcrm_ai_draft_owner on public.rvcrm_ai_drafts
      for all to authenticated
      using (user_id=(select auth.uid()) and public.rvcrm_owns_contact(contact_id,user_id))
      with check (user_id=(select auth.uid()) and public.rvcrm_owns_contact(contact_id,user_id));
  end if;
end $$;

-- Guard integrity even if a future policy accidentally becomes permissive.
create or replace function public.rvcrm_guard_owner_links() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.user_id <> auth.uid() then raise exception 'Owner mismatch'; end if;
  if not exists (select 1 from public.crm_contacts where id=new.contact_id and user_id=new.user_id) then
    raise exception 'Contact does not belong to the signed-in user';
  end if;
  if tg_table_name='rvcrm_contact_deals' and not exists (
    select 1 from public.deal_files where id=new.deal_id and user_id=new.user_id
  ) then raise exception 'Transaction does not belong to the signed-in user'; end if;
  if tg_op='UPDATE' and new.user_id <> old.user_id then raise exception 'Cannot change owner'; end if;
  return new;
end $$;

do $$ begin
  if not exists (select 1 from pg_trigger where tgname='rvcrm_profile_owner_guard') then
    create trigger rvcrm_profile_owner_guard before insert or update on public.rvcrm_real_estate_profiles
      for each row execute function public.rvcrm_guard_owner_links();
  end if;
  if not exists (select 1 from pg_trigger where tgname='rvcrm_link_owner_guard') then
    create trigger rvcrm_link_owner_guard before insert or update on public.rvcrm_contact_deals
      for each row execute function public.rvcrm_guard_owner_links();
  end if;
  if not exists (select 1 from pg_trigger where tgname='rvcrm_draft_owner_guard') then
    create trigger rvcrm_draft_owner_guard before insert or update on public.rvcrm_ai_drafts
      for each row execute function public.rvcrm_guard_owner_links();
  end if;
end $$;

create or replace function public.rvcrm_touch_profile() returns trigger
language plpgsql set search_path = '' as $$ begin new.updated_at=now();return new;end $$;
do $$ begin
  if not exists (select 1 from pg_trigger where tgname='rvcrm_touch_profile') then
    create trigger rvcrm_touch_profile before update on public.rvcrm_real_estate_profiles
      for each row execute function public.rvcrm_touch_profile();
  end if;
end $$;

revoke all on public.rvcrm_real_estate_profiles,public.rvcrm_contact_deals,public.rvcrm_ai_drafts from anon;
grant select,insert,update,delete on public.rvcrm_real_estate_profiles,public.rvcrm_contact_deals to authenticated;
grant select,insert,delete on public.rvcrm_ai_drafts to authenticated;
commit;
