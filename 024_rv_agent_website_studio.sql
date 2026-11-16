-- RealVolt Agent Website Studio v1.5.6
-- Additive migration. Does not overwrite existing 023 migration or CRM tables.
-- IMPORTANT: Agent sites here are owned by auth.users.id. To attach them to your
-- existing agent/brokerage records, validate membership in your existing model.

create table if not exists public.rv_agent_sites (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null unique references auth.users(id) on delete cascade,
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) between 3 and 45),
  display_name text not null default 'Your Name',
  brokerage_name text not null default '',
  tagline text not null default 'Find your next home',
  biography text not null default '',
  public_email text not null default '',
  public_phone text not null default '',
  headshot_url text not null default '',
  hero_image_url text not null default '',
  template text not null default 'modern' check (template in ('modern','classic','luxury')),
  primary_color text not null default '#147D64' check (primary_color ~ '^#[A-Fa-f0-9]{6}$'),
  accent_color text not null default '#F3972C' check (accent_color ~ '^#[A-Fa-f0-9]{6}$'),
  background_color text not null default '#F6FAF7' check (background_color ~ '^#[A-Fa-f0-9]{6}$'),
  published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.rv_agent_site_domains (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.rv_agent_sites(id) on delete cascade,
  hostname text not null unique check (hostname = lower(hostname) and length(hostname) <= 253),
  ownership_token uuid not null default gen_random_uuid(),
  status text not null default 'pending' check (status in ('pending', 'ownership_verified', 'active')),
  created_at timestamptz not null default now(),
  verified_at timestamptz,
  activated_at timestamptz
);

alter table public.rv_agent_sites enable row level security;
alter table public.rv_agent_site_domains enable row level security;

-- Remove policy names if reapplying the migration during development.
drop policy if exists rv_sites_read on public.rv_agent_sites;
drop policy if exists rv_sites_insert on public.rv_agent_sites;
drop policy if exists rv_sites_update on public.rv_agent_sites;
drop policy if exists rv_sites_delete on public.rv_agent_sites;

create policy rv_sites_read on public.rv_agent_sites for select
  to anon, authenticated
  using (published or owner_user_id = (select auth.uid()));
create policy rv_sites_insert on public.rv_agent_sites for insert
  to authenticated with check (owner_user_id = (select auth.uid()));
create policy rv_sites_update on public.rv_agent_sites for update
  to authenticated using (owner_user_id = (select auth.uid()))
  with check (owner_user_id = (select auth.uid()));
create policy rv_sites_delete on public.rv_agent_sites for delete
  to authenticated using (owner_user_id = (select auth.uid()));

drop policy if exists rv_domains_read on public.rv_agent_site_domains;
drop policy if exists rv_domains_insert on public.rv_agent_site_domains;
drop policy if exists rv_domains_delete on public.rv_agent_site_domains;

create policy rv_domains_read on public.rv_agent_site_domains for select
  to anon, authenticated
  using (
    exists (
      select 1 from public.rv_agent_sites s
      where s.id = site_id and (
        s.owner_user_id = (select auth.uid())
        or (s.published and status = 'active')
      )
    )
  );
create policy rv_domains_insert on public.rv_agent_site_domains for insert
  to authenticated
  with check (
    status = 'pending' and verified_at is null and activated_at is null
    and exists (
      select 1 from public.rv_agent_sites s
      where s.id = site_id and s.owner_user_id = (select auth.uid())
    )
  );
create policy rv_domains_delete on public.rv_agent_site_domains for delete
  to authenticated using (
    exists (
      select 1 from public.rv_agent_sites s
      where s.id = site_id and s.owner_user_id = (select auth.uid())
    )
  );

-- Important: only the SERVER service-role endpoint may advance domain status.
revoke all on public.rv_agent_site_domains from anon, authenticated;
grant select on public.rv_agent_site_domains to anon;
grant select, insert, delete on public.rv_agent_site_domains to authenticated;

grant select on public.rv_agent_sites to anon;
grant select, insert, update, delete on public.rv_agent_sites to authenticated;

-- Only public non-sensitive fields are stored in the site record; never add
-- CRM contacts, private customer information or integration API keys here.
