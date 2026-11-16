-- RealVolt v1.1 / Phase 4: Meta connections for organic posting AND paid advertising.
-- Apply after 016 + 017. Does NOT publish posts or launch ads.
-- Tokens are NEVER exposed to a browser or granted to authenticated clients.
begin;

create table if not exists public.rv_meta_connections (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  connection_scope text not null check(connection_scope in ('agent','brokerage')),
  brokerage_id uuid references public.brokerages(id) on delete cascade,
  meta_user_id text not null check(length(meta_user_id) between 1 and 100),
  meta_user_name text not null default '',
  granted_scopes text[] not null default '{}',
  connection_status text not null default 'connected' check(connection_status in ('connected','needs_reauthorization','disconnected')),
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint rv_meta_scope_brokerage check(
    (connection_scope='agent' and brokerage_id is null) or
    (connection_scope='brokerage' and brokerage_id is not null)
  ),
  unique(owner_user_id,connection_scope,meta_user_id,brokerage_id)
);
create unique index if not exists rv_meta_agent_identity on public.rv_meta_connections(owner_user_id,meta_user_id) where connection_scope='agent';
create index if not exists rv_meta_office_id on public.rv_meta_connections(brokerage_id) where connection_scope='brokerage';
alter table public.rv_meta_connections enable row level security;
drop policy if exists rv_meta_connections_read on public.rv_meta_connections;
create policy rv_meta_connections_read on public.rv_meta_connections for select to authenticated
  using((connection_scope='agent' and owner_user_id=(select auth.uid())) or
        (connection_scope='brokerage' and public.is_brokerage_admin(brokerage_id)));
revoke all on public.rv_meta_connections from public,anon,authenticated;
grant select on public.rv_meta_connections to authenticated;

create table if not exists public.rv_meta_assets (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references public.rv_meta_connections(id) on delete cascade,
  asset_type text not null check(asset_type in ('facebook_page','instagram_account','ad_account')),
  meta_asset_id text not null check(length(meta_asset_id) between 1 and 140),
  asset_name text not null default '' check(length(asset_name)<=220),
  status text not null default 'available' check(status in ('available','restricted','inactive')),
  is_default boolean not null default false,
  extra jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  unique(connection_id,asset_type,meta_asset_id)
);
create index if not exists rv_meta_assets_conn_type on public.rv_meta_assets(connection_id,asset_type);
alter table public.rv_meta_assets enable row level security;
drop policy if exists rv_meta_assets_read on public.rv_meta_assets;
create policy rv_meta_assets_read on public.rv_meta_assets for select to authenticated using(
  exists(select 1 from public.rv_meta_connections c where c.id=connection_id and
    ((c.connection_scope='agent' and c.owner_user_id=(select auth.uid())) or
     (c.connection_scope='brokerage' and public.is_brokerage_admin(c.brokerage_id))))
);
revoke all on public.rv_meta_assets from public,anon,authenticated;
grant select on public.rv_meta_assets to authenticated;

-- OAuth states and secret access tokens are ONLY accessible to the service role.
-- Can be migrated to Supabase Vault later; never copy access tokens into public metadata / social_drafts.
create table if not exists public.rv_meta_oauth_states (
  state_hash text primary key,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  connection_scope text not null check(connection_scope in ('agent','brokerage')),
  brokerage_id uuid references public.brokerages(id),
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists rv_meta_oauth_expiry on public.rv_meta_oauth_states(expires_at);
alter table public.rv_meta_oauth_states enable row level security;
revoke all on public.rv_meta_oauth_states from public,anon,authenticated;

create table if not exists public.rv_meta_secret_tokens (
  connection_id uuid primary key references public.rv_meta_connections(id) on delete cascade,
  user_access_token text not null,
  expires_at timestamptz,
  updated_at timestamptz not null default now()
);
alter table public.rv_meta_secret_tokens enable row level security;
revoke all on public.rv_meta_secret_tokens from public,anon,authenticated;

create table if not exists public.rv_meta_page_tokens (
  asset_id uuid primary key references public.rv_meta_assets(id) on delete cascade,
  page_access_token text not null,
  updated_at timestamptz not null default now()
);
alter table public.rv_meta_page_tokens enable row level security;
revoke all on public.rv_meta_page_tokens from public,anon,authenticated;

-- Plans can be linked to a verified ad account; independent from Facebook/Instagram posting permissions.
alter table public.meta_ad_plans
  add column if not exists meta_connection_id uuid references public.rv_meta_connections(id) on delete set null,
  add column if not exists meta_ad_account_id uuid references public.rv_meta_assets(id) on delete set null,
  add column if not exists meta_page_id uuid references public.rv_meta_assets(id) on delete set null,
  add column if not exists meta_instagram_id uuid references public.rv_meta_assets(id) on delete set null,
  add column if not exists special_ad_category text not null default 'HOUSING' check(special_ad_category='HOUSING');

-- Prevent linking one's drafts to someone else's Meta assets (including cross-brokerage references).
create or replace function public.rv_validate_meta_ad_assets() returns trigger language plpgsql security definer
 set search_path=public,pg_temp as $$
declare c public.rv_meta_connections%rowtype; a public.rv_meta_assets%rowtype;
begin
 if new.meta_connection_id is null then
   -- A disconnected connection cascades to its drafts; clear now-invalid asset links.
   if tg_op='UPDATE' and old.meta_connection_id is not null then
     new.meta_ad_account_id:=null;new.meta_page_id:=null;new.meta_instagram_id:=null;
     return new;
   end if;
   if new.meta_ad_account_id is not null or new.meta_page_id is not null or new.meta_instagram_id is not null then
     raise exception 'Select a Meta connection first';
   end if;
   return new;
 end if;
 select * into c from public.rv_meta_connections where id=new.meta_connection_id and connection_status='connected';
 if not found then raise exception 'Meta connection is not active';end if;
 if not ((c.connection_scope='agent' and c.owner_user_id=new.user_id) or
       (c.connection_scope='brokerage' and exists(
          select 1 from public.brokerage_members bm where bm.user_id=new.user_id
          and bm.brokerage_id=c.brokerage_id and bm.role='admin'
       ))) then raise exception 'Meta connection is not available to campaign owner';end if;
 if new.meta_ad_account_id is not null then
   select * into a from public.rv_meta_assets where id=new.meta_ad_account_id
       and connection_id=c.id and asset_type='ad_account' and status='available';
   if not found then raise exception 'Ad account is not available in this connection';end if;
 end if;
 if new.meta_page_id is not null then
   select * into a from public.rv_meta_assets where id=new.meta_page_id
       and connection_id=c.id and asset_type='facebook_page' and status='available';
   if not found then raise exception 'Facebook Page is not available in this connection';end if;
 end if;
 if new.meta_instagram_id is not null then
   select * into a from public.rv_meta_assets where id=new.meta_instagram_id
       and connection_id=c.id and asset_type='instagram_account' and status='available';
   if not found then raise exception 'Instagram account is not available in this connection';end if;
 end if;
 return new;
end $$;
drop trigger if exists rv_validate_meta_ad_assets_trigger on public.meta_ad_plans;
create trigger rv_validate_meta_ad_assets_trigger before insert or update on public.meta_ad_plans
 for each row execute function public.rv_validate_meta_ad_assets();
revoke execute on function public.rv_validate_meta_ad_assets() from public,anon,authenticated;

commit;
