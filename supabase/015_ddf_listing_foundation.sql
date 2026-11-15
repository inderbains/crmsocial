-- RealVolt v0.9.0 — DDF connection registry and tenant-isolated listing inventory.
-- ADDITIVE: run AFTER 002, 005 and 009. No existing tables are dropped.
-- This does NOT call CREA, validate DDF authorization, or make a feed live.
-- No DDF API keys, passwords or bearer tokens belong in these public-schema tables.
begin;

create table if not exists public.ddf_connections (
  id uuid primary key default gen_random_uuid(),
  brokerage_id uuid not null references public.brokerages(id) on delete cascade,
  owner_user_id uuid references auth.users(id),
  scope text not null check (scope in ('office','agent')),
  destination_id text not null check (destination_id ~ '^[A-Za-z0-9_.-]{3,120}$'),
  member_id text not null default '' check (member_id = '' or member_id ~ '^[A-Za-z0-9_.-]{2,120}$'),
  status text not null default 'pending_verification' check (status in ('pending_verification','authorized','paused','revoked','error')),
  -- status is controlled by the backend after external approval; clients cannot authorize themselves.
  last_synced_at timestamptz,
  last_error text,
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ddf_connection_scope_owner check (
    (scope='office' and owner_user_id is null) or (scope='agent' and owner_user_id is not null)
  )
);
create unique index if not exists ddf_one_office_feed_per_brokerage
  on public.ddf_connections(brokerage_id) where scope='office';
create unique index if not exists ddf_one_agent_feed_per_user
  on public.ddf_connections(brokerage_id,owner_user_id) where scope='agent';
create unique index if not exists ddf_unique_member_id_per_brokerage
  on public.ddf_connections(brokerage_id,lower(member_id)) where scope='agent' and member_id<>'';
create index if not exists ddf_connections_brokerage_idx on public.ddf_connections(brokerage_id);

-- Enforce brokerage and identity on every browser write. Server-only status transitions
-- are effected by separately authorized backend code using a service key (never in the client).
create or replace function public.ddf_guard_connection()
returns trigger language plpgsql security definer set search_path='' as $$
declare b uuid;
begin
  -- Backend verification/sync uses service-role credentials stored ONLY on the server.
  if auth.role()='service_role' then return new; end if;
  if auth.uid() is null then raise exception 'Sign in required'; end if;
  select m.brokerage_id into b from public.brokerage_members m where m.user_id=auth.uid();
  if b is null then raise exception 'Join a brokerage before connecting DDF'; end if;
  if TG_OP='INSERT' then
    if new.scope='office' then
      if not public.is_brokerage_admin(b) then raise exception 'Only the brokerage admin can add an office feed'; end if;
      new.owner_user_id:=null;
    else
      new.owner_user_id:=auth.uid();
    end if;
    new.brokerage_id:=b;
    new.created_by:=auth.uid();
    new.status:='pending_verification';
    new.last_error:=null;
    new.last_synced_at:=null;
  else
    if new.id is distinct from old.id
       or new.brokerage_id is distinct from old.brokerage_id
       or new.owner_user_id is distinct from old.owner_user_id
       or new.scope is distinct from old.scope
       or new.created_by is distinct from old.created_by
       or new.created_at is distinct from old.created_at
       or new.status is distinct from old.status
       or new.last_synced_at is distinct from old.last_synced_at
       or new.last_error is distinct from old.last_error
    then raise exception 'Only the DDF destination and member ID can be edited'; end if;
    if b is distinct from old.brokerage_id then raise exception 'Brokerage mismatch'; end if;
    if old.scope='office' and not public.is_brokerage_admin(b) then raise exception 'Brokerage admin required'; end if;
    if old.scope='agent' and old.owner_user_id<>auth.uid() then raise exception 'Only the connected agent can edit this feed'; end if;
    if new.destination_id is distinct from old.destination_id or new.member_id is distinct from old.member_id then
      new.status:='pending_verification';new.last_synced_at:=null;new.last_error:=null;
    end if;
    new.updated_at:=now();
  end if;
  return new;
end $$;
drop trigger if exists ddf_guard_connection_insert_update on public.ddf_connections;
create trigger ddf_guard_connection_insert_update before insert or update on public.ddf_connections
  for each row execute function public.ddf_guard_connection();

alter table public.ddf_connections enable row level security;
create policy ddf_connection_read on public.ddf_connections for select to authenticated
  using (public.is_brokerage_admin(brokerage_id) or
   (scope='agent' and owner_user_id=auth.uid()));
create policy ddf_connection_insert on public.ddf_connections for insert to authenticated
  with check (brokerage_id=public.current_brokerage() and
    ((scope='office' and public.is_brokerage_admin(brokerage_id)) or
     (scope='agent' and owner_user_id=auth.uid())));
create policy ddf_connection_update on public.ddf_connections for update to authenticated
  using ((scope='office' and public.is_brokerage_admin(brokerage_id)) or
         (scope='agent' and owner_user_id=auth.uid()))
  with check ((scope='office' and public.is_brokerage_admin(brokerage_id)) or
              (scope='agent' and owner_user_id=auth.uid()));
-- Users cannot delete authorization audit history; a future admin-mediated revoke is required.
grant select,insert,update on public.ddf_connections to authenticated;
revoke all on public.ddf_connections from anon;

-- Inventory is written exclusively by a privileged sync service after independent
-- verification of the feed authorization. Public browsers cannot change any DDF data.
create table if not exists public.ddf_listings (
  id uuid primary key default gen_random_uuid(),
  brokerage_id uuid not null references public.brokerages(id) on delete cascade,
  mls_number text not null check (length(trim(mls_number)) between 1 and 64),
  address text not null default '',
  city text not null default '',
  price numeric(15,2) check (price>=0),
  beds numeric(5,1),baths numeric(5,1),area_sqft numeric(12,1),
  headline text not null default '',description text not null default '',
  status text not null default 'active' check (status in ('active','pending','sold','expired','terminated','withdrawn')),
  photos jsonb not null default '[]'::jsonb check (jsonb_typeof(photos)='array'),
  media jsonb not null default '[]'::jsonb check (jsonb_typeof(media)='array'),
  attribution text not null default '',
  marketing_authorized boolean not null default false,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  last_changed_at timestamptz not null default now(),
  unique(brokerage_id,mls_number),
  unique(id,brokerage_id)
);
create index if not exists ddf_listings_brokerage_status_idx on public.ddf_listings(brokerage_id,status);

-- Supports multiple co-listing agents without duplicating an MLS listing.
create unique index if not exists ddf_brokerage_member_unique on public.brokerage_members(brokerage_id,user_id);
create table if not exists public.ddf_listing_agents (
  listing_id uuid not null,
  brokerage_id uuid not null,
  user_id uuid not null,
  primary key(listing_id,user_id),
  foreign key(listing_id,brokerage_id) references public.ddf_listings(id,brokerage_id) on delete cascade,
  foreign key(brokerage_id,user_id) references public.brokerage_members(brokerage_id,user_id)
);
create index if not exists ddf_listing_agents_user_idx on public.ddf_listing_agents(user_id,brokerage_id);

alter table public.ddf_listings enable row level security;
alter table public.ddf_listing_agents enable row level security;
create policy ddf_listing_agents_read on public.ddf_listing_agents for select to authenticated
  using (user_id=auth.uid() or public.is_brokerage_admin(brokerage_id));
create policy ddf_listing_read on public.ddf_listings for select to authenticated
  using (public.is_brokerage_admin(brokerage_id) or exists (
    select 1 from public.ddf_listing_agents a where a.listing_id=id and a.user_id=auth.uid()
  ));
grant select on public.ddf_listings,public.ddf_listing_agents to authenticated;
revoke all on public.ddf_listings,public.ddf_listing_agents from anon;
-- Do not grant insert/update/delete on feed inventory to authenticated or anon.

-- Link a generated property-page draft to its DDF source, without changing the
-- existing manual property page workflow. The server must authorize its media use.
alter table public.property_pages add column if not exists ddf_listing_id uuid references public.ddf_listings(id) on delete set null;
create index if not exists property_pages_ddf_source_idx on public.property_pages(ddf_listing_id);
create unique index if not exists property_pages_ddf_owner_once on public.property_pages(user_id,ddf_listing_id)
  where ddf_listing_id is not null;
create or replace function public.ddf_guard_property_page()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.ddf_listing_id is not null then
   -- Always permit removing public access even if DDF permission was withdrawn.
   if TG_OP='UPDATE' and old.ddf_listing_id is distinct from new.ddf_listing_id then
     raise exception 'A linked DDF listing cannot be replaced';
   end if;
   if (TG_OP='INSERT' or new.published or (TG_OP='UPDATE' and new.payload is distinct from old.payload)) and not exists(
     select 1 from public.ddf_listings l
     where l.id=new.ddf_listing_id and l.marketing_authorized
       and l.status in ('active','pending')
       and (public.is_brokerage_admin(l.brokerage_id)
         or exists(select 1 from public.ddf_listing_agents a
                   where a.listing_id=l.id and a.user_id=new.user_id))
   ) then raise exception 'Listing authorization or assignment is missing'; end if;
 end if;
 return new;
end $$;
drop trigger if exists ddf_guard_property_page_insert_update on public.property_pages;
create trigger ddf_guard_property_page_insert_update before insert or update on public.property_pages
  for each row execute function public.ddf_guard_property_page();

commit;
