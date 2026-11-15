-- Run once after 006. Effective status is date-based; no scheduler required.
begin;
create table public.listing_terms(deal_id uuid primary key references public.deal_files(id),expiry_date date,termination_date date,termination_reason text not null default '',updated_at timestamptz not null default now(),check(termination_date is null or length(trim(termination_reason))>0));
alter table public.listing_terms enable row level security;
create policy listing_terms_read on public.listing_terms for select to authenticated using(exists(select 1 from public.deal_files d where d.id=deal_id));
create policy listing_terms_write on public.listing_terms for all to authenticated using(exists(select 1 from public.deal_files d where d.id=deal_id and d.kind='Listing' and (d.user_id=auth.uid() or (d.brokerage_id=public.current_brokerage() and public.can_review_deal(d.user_id))))) with check(exists(select 1 from public.deal_files d where d.id=deal_id and d.kind='Listing' and (d.user_id=auth.uid() or (d.brokerage_id=public.current_brokerage() and public.can_review_deal(d.user_id)))));
grant select,insert,update on public.listing_terms to authenticated;
create function public.log_listing_terms() returns trigger language plpgsql security definer set search_path='' as $$ begin
 new.updated_at=now();insert into public.transaction_audit_events(deal_id,actor_id,action,record_id,old_values,new_values) values(new.deal_id,auth.uid(),'listing_terms:'||TG_OP,new.deal_id::text,case when TG_OP='UPDATE' then to_jsonb(old) else null end,to_jsonb(new));return new;end $$;
create trigger audit_listing_terms before insert or update on public.listing_terms for each row execute function public.log_listing_terms();
create view public.deal_listing_status with(security_invoker=true) as select d.id,d.user_id,d.kind,t.expiry_date,t.termination_date,t.termination_reason,t.updated_at as terms_updated_at,
 case when d.kind='Sale' then 'Sold' when t.termination_date<=(now() at time zone 'America/Vancouver')::date then 'Terminated' when t.expiry_date<(now() at time zone 'America/Vancouver')::date then 'Expired' else 'Active' end as listing_status
 from public.deal_files d left join public.listing_terms t on t.deal_id=d.id;
grant select on public.deal_listing_status to authenticated;
commit;
