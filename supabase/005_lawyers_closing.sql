-- Run once after 004. Memberships are provisioned by project owner, never by agents.
begin;
create table public.brokerages(id uuid primary key default gen_random_uuid(),name text not null,address text not null default '',email text not null default '',phone text not null default '');
create table public.brokerage_members(user_id uuid primary key references auth.users(id),brokerage_id uuid not null references public.brokerages(id),role text not null check(role in ('agent','admin')));
create function public.current_brokerage() returns uuid language sql stable security definer set search_path='' as $$ select brokerage_id from public.brokerage_members where user_id=auth.uid() $$;
create function public.is_brokerage_admin(b uuid) returns boolean language sql stable security definer set search_path='' as $$ select exists(select 1 from public.brokerage_members where user_id=auth.uid() and brokerage_id=b and role='admin') $$;
alter table public.brokerages enable row level security;
alter table public.brokerage_members enable row level security;
create policy brokerage_read on public.brokerages for select to authenticated using(id=public.current_brokerage());
create policy membership_read on public.brokerage_members for select to authenticated using(brokerage_id=public.current_brokerage());
grant select on public.brokerages,public.brokerage_members to authenticated;
create table public.brokerage_lawyers(id uuid primary key default gen_random_uuid(),brokerage_id uuid not null references public.brokerages(id),name text not null check(length(trim(name))>0),firm text not null default '',email text not null check(email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),phone text not null default '',address text not null default '',created_by uuid not null default auth.uid() references auth.users(id),created_at timestamptz not null default now());
create unique index lawyer_brokerage_email on public.brokerage_lawyers(brokerage_id,lower(email));
alter table public.brokerage_lawyers enable row level security;
create policy lawyer_read on public.brokerage_lawyers for select to authenticated using(brokerage_id=public.current_brokerage());
create policy lawyer_add on public.brokerage_lawyers for insert to authenticated with check(brokerage_id=public.current_brokerage() and created_by=auth.uid());
-- Contacts remain reusable and immutable; add a new email/contact when it changes.
grant select,insert on public.brokerage_lawyers to authenticated;
alter table public.deal_files add column brokerage_id uuid references public.brokerages(id),add column buyer_name text not null default '',add column seller_name text not null default '',add column buyer_lawyer_id uuid references public.brokerage_lawyers(id),add column seller_lawyer_id uuid references public.brokerage_lawyers(id),add column buyer_lawyer jsonb,add column seller_lawyer jsonb;
create function public.set_deal_lawyers() returns trigger language plpgsql set search_path='' as $$
declare lawyer public.brokerage_lawyers;begin
 if TG_OP='INSERT' then new.brokerage_id=public.current_brokerage();
 elsif old.brokerage_id is null then new.brokerage_id=public.current_brokerage();
 elsif new.brokerage_id is distinct from old.brokerage_id then raise exception 'Brokerage cannot change';end if;
 if new.buyer_lawyer_id is not null or new.seller_lawyer_id is not null then
  if new.brokerage_id is null or new.brokerage_id is distinct from public.current_brokerage() then raise exception 'A brokerage membership is required';end if;
 end if;
 -- Freeze directory details on selection; never accept forged snapshots from clients.
 if TG_OP='INSERT' then new.buyer_lawyer=null;new.seller_lawyer=null;
 else new.buyer_lawyer=old.buyer_lawyer;new.seller_lawyer=old.seller_lawyer;end if;
 if TG_OP='INSERT' or new.buyer_lawyer_id is distinct from old.buyer_lawyer_id then
  new.buyer_lawyer=null;
  if new.buyer_lawyer_id is not null then select * into lawyer from public.brokerage_lawyers where id=new.buyer_lawyer_id and brokerage_id=new.brokerage_id;if not found then raise exception 'Buyer lawyer must belong to this brokerage';end if;new.buyer_lawyer=to_jsonb(lawyer);end if;
 end if;
 if TG_OP='INSERT' or new.seller_lawyer_id is distinct from old.seller_lawyer_id then
  new.seller_lawyer=null;
  if new.seller_lawyer_id is not null then select * into lawyer from public.brokerage_lawyers where id=new.seller_lawyer_id and brokerage_id=new.brokerage_id;if not found then raise exception 'Seller lawyer must belong to this brokerage';end if;new.seller_lawyer=to_jsonb(lawyer);end if;
 end if;
 return new;end $$;
-- Runs before guard_deal_update, so reviewer comparison includes canonical snapshots.
create trigger a_set_deal_lawyers before insert or update on public.deal_files for each row execute function public.set_deal_lawyers();
create or replace function public.can_review_deal(owner_id uuid) returns boolean language sql stable security definer set search_path='' as $$ select exists(select 1 from public.transaction_reviewers r join public.brokerage_members a on a.user_id=r.agent_id join public.brokerage_members m on m.user_id=r.admin_id where r.agent_id=owner_id and r.admin_id=auth.uid() and m.role='admin' and m.brokerage_id=a.brokerage_id) $$;
create table public.closing_deliveries(id uuid primary key default gen_random_uuid(),deal_id uuid not null references public.deal_files(id),brokerage_id uuid not null references public.brokerages(id),side text not null check(side in ('buyer','seller')),recipient_email text not null,recipient_name text not null,request_key text not null unique,payload_hash text not null,payload jsonb not null,status text not null default 'pending' check(status in ('pending','accepted','failed')),provider_id text,error text,created_by uuid not null references auth.users(id),created_at timestamptz not null default now());
alter table public.closing_deliveries enable row level security;
create policy delivery_read on public.closing_deliveries for select to authenticated using(exists(select 1 from public.deal_files d where d.id=deal_id));
grant select on public.closing_deliveries to authenticated;
-- Provision ONE brokerage and its memberships using project-owner SQL:
-- insert into public.brokerages(name,address,email,phone) values ('BROKERAGE NAME','ADDRESS','OFFICE EMAIL','PHONE') returning id;
-- insert into public.brokerage_members(user_id,brokerage_id,role) values ('AGENT_UUID','BROKERAGE_UUID','agent'),('ADMIN_UUID','BROKERAGE_UUID','admin');
-- Retain the reviewer assignment from 004 (admin must be in the SAME brokerage).
-- Backfill existing files after membership setup (requires temporarily disabling the user update guards):
-- begin;
-- alter table public.deal_files disable trigger a_set_deal_lawyers;
-- alter table public.deal_files disable trigger deal_update;
-- update public.deal_files d set brokerage_id=m.brokerage_id from public.brokerage_members m where m.user_id=d.user_id and d.brokerage_id is null;
-- alter table public.deal_files enable trigger deal_update;
-- alter table public.deal_files enable trigger a_set_deal_lawyers;
-- commit;

-- Agent-entered commission and deposit instructions, before submission.
alter table public.deal_files
 add column representation text not null default 'selling' check(representation in ('listing','selling')),
 add column listing_commission numeric(15,2) not null default 0 check(listing_commission>=0),
 add column selling_commission numeric(15,2) not null default 0 check(selling_commission>=0),
 add column deposit_amount numeric(15,2) not null default 0 check(deposit_amount>=0),
 add column deposit_holder text not null default 'our_brokerage' check(deposit_holder in ('our_brokerage','other_brokerage')),
 add column deposit_brokerage text not null default '',
 add column gst_rate numeric(6,3) not null default 5 check(gst_rate between 0 and 100),
 add constraint external_deposit_brokerage check(deposit_holder<>'other_brokerage' or length(trim(deposit_brokerage))>0),
 add constraint listing_external_deposit check(representation<>'listing' or deposit_holder='other_brokerage'),
 add constraint selling_commission_only check(representation<>'selling' or listing_commission=0);
-- For old converted listings, agents must confirm representation and deposit holder
-- before submitting; those values were not tracked in 004.

drop policy deal_read on public.deal_files;
create policy deal_read on public.deal_files for select to authenticated using((user_id=auth.uid() and (brokerage_id is null or brokerage_id=public.current_brokerage())) or (brokerage_id=public.current_brokerage() and review_status<>'Draft' and public.can_review_deal(user_id)));
drop policy deal_update on public.deal_files;
create policy deal_update on public.deal_files for update to authenticated using((user_id=auth.uid() and (brokerage_id is null or brokerage_id=public.current_brokerage())) or (brokerage_id=public.current_brokerage() and public.can_review_deal(user_id))) with check((user_id=auth.uid() and (brokerage_id is null or brokerage_id=public.current_brokerage())) or (brokerage_id=public.current_brokerage() and public.can_review_deal(user_id)));
commit;
