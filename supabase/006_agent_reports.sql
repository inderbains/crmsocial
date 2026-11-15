-- Run once after 005. Does not move money or reconcile bank accounts.
begin;
create table public.brokerage_deal_counters(brokerage_id uuid primary key references public.brokerages(id),last_number bigint not null default 0);
alter table public.brokerage_deal_counters enable row level security;
alter table public.deal_files add column transaction_number bigint;
create unique index brokerage_transaction_number on public.deal_files(brokerage_id,transaction_number) where transaction_number is not null;
-- Assign existing files in creation order, then allocate new numbers atomically.
alter table public.deal_files disable trigger a_set_deal_lawyers;
alter table public.deal_files disable trigger deal_update;
with ranked as(select id,row_number() over(partition by brokerage_id order by created_at,id) n from public.deal_files where brokerage_id is not null)
update public.deal_files d set transaction_number=r.n from ranked r where d.id=r.id;
insert into public.brokerage_deal_counters select brokerage_id,max(transaction_number) from public.deal_files where brokerage_id is not null group by brokerage_id;
alter table public.deal_files enable trigger deal_update;
alter table public.deal_files enable trigger a_set_deal_lawyers;
create function public.number_brokerage_deal() returns trigger language plpgsql security definer set search_path='' as $$ begin
 if TG_OP='UPDATE' and old.transaction_number is not null then
  if new.transaction_number is distinct from old.transaction_number then raise exception 'Transaction number cannot change';end if;
  return new;
 end if;
 if new.brokerage_id is null then new.transaction_number=null;return new;end if;
 insert into public.brokerage_deal_counters(brokerage_id,last_number) values(new.brokerage_id,1) on conflict(brokerage_id) do update set last_number=public.brokerage_deal_counters.last_number+1 returning last_number into new.transaction_number;
 return new;end $$;
create trigger b_number_brokerage_deal before insert or update on public.deal_files for each row execute function public.number_brokerage_deal();
create table public.deal_requirements(id uuid primary key default gen_random_uuid(),deal_id uuid not null references public.deal_files(id),label text not null check(length(trim(label))>0),document_id uuid references public.deal_documents(id),verified boolean not null default false,unique(deal_id,label));
alter table public.deal_requirements enable row level security;
create policy requirement_read on public.deal_requirements for select to authenticated using(exists(select 1 from public.deal_files d where d.id=deal_id));
create policy requirement_write on public.deal_requirements for all to authenticated using(exists(select 1 from public.deal_files d where d.id=deal_id and public.can_review_deal(d.user_id) and d.brokerage_id=public.current_brokerage() and d.review_status='Submitted')) with check(exists(select 1 from public.deal_files d where d.id=deal_id and public.can_review_deal(d.user_id) and d.brokerage_id=public.current_brokerage() and d.review_status='Submitted'));
grant select,insert,update on public.deal_requirements to authenticated;
create function public.check_required_document() returns trigger language plpgsql set search_path='' as $$ begin
 if new.verified and new.document_id is null then raise exception 'Link a document before verifying receipt';end if;
 if new.document_id is not null and not exists(select 1 from public.deal_documents where id=new.document_id and deal_id=new.deal_id) then raise exception 'Document must belong to this transaction';end if;return new;end $$;
create trigger required_document_check before insert or update on public.deal_requirements for each row execute function public.check_required_document();
create function public.seed_deal_requirements() returns trigger language plpgsql security definer set search_path='' as $$ begin
 insert into public.deal_requirements(deal_id,label) values(new.id,case when new.kind='Listing' then 'Signed listing contract' else 'Signed purchase and sale contract' end) on conflict do nothing;
 if TG_OP='UPDATE' and old.kind='Listing' and new.kind='Sale' then insert into public.deal_requirements(deal_id,label) values(new.id,'Signed purchase and sale contract') on conflict do nothing;end if;return new;end $$;
create trigger seed_deal_requirements after insert or update of kind on public.deal_files for each row execute function public.seed_deal_requirements();
insert into public.deal_requirements(deal_id,label) select id,case when kind='Listing' then 'Signed listing contract' else 'Signed purchase and sale contract' end from public.deal_files;
create function public.require_complete_deal() returns trigger language plpgsql set search_path='' as $$ begin
 if new.review_status='Approved' and old.review_status<>'Approved' then
  if not exists(select 1 from public.deal_requirements where deal_id=new.id) or exists(select 1 from public.deal_requirements where deal_id=new.id and (not verified or document_id is null)) then raise exception 'Verify receipt of every required document before approving';end if;
 end if;return new;end $$;
create trigger c_require_complete_deal before update on public.deal_files for each row execute function public.require_complete_deal();
-- Admin controls the agent allocation and office deductions; agent can read their own.
create table public.agent_commission_allocations(deal_id uuid primary key references public.deal_files(id),commission_before_gst numeric(15,2) not null check(commission_before_gst>=0),commission_gst numeric(15,2) not null check(commission_gst>=0),notes text not null default '',updated_at timestamptz not null default now());
create table public.agent_deal_charges(id uuid primary key default gen_random_uuid(),deal_id uuid not null references public.deal_files(id),category text not null check(category in ('Office deduction','Office fee','Other expense')),description text not null check(length(trim(description))>0),amount numeric(15,2) not null check(amount>=0),gst numeric(15,2) not null default 0 check(gst>=0),created_at timestamptz not null default now());
alter table public.agent_commission_allocations enable row level security;
alter table public.agent_deal_charges enable row level security;
create policy allocation_read on public.agent_commission_allocations for select to authenticated using(exists(select 1 from public.deal_files d where d.id=deal_id));
create policy allocation_write on public.agent_commission_allocations for all to authenticated using(exists(select 1 from public.deal_files d where d.id=deal_id and public.can_review_deal(d.user_id) and d.brokerage_id=public.current_brokerage() and d.review_status in ('Submitted','Approved'))) with check(exists(select 1 from public.deal_files d where d.id=deal_id and public.can_review_deal(d.user_id) and d.brokerage_id=public.current_brokerage() and d.review_status in ('Submitted','Approved')));
create policy charge_read on public.agent_deal_charges for select to authenticated using(exists(select 1 from public.deal_files d where d.id=deal_id));
create policy charge_write on public.agent_deal_charges for all to authenticated using(exists(select 1 from public.deal_files d where d.id=deal_id and public.can_review_deal(d.user_id) and d.brokerage_id=public.current_brokerage() and d.review_status in ('Submitted','Approved'))) with check(exists(select 1 from public.deal_files d where d.id=deal_id and public.can_review_deal(d.user_id) and d.brokerage_id=public.current_brokerage() and d.review_status in ('Submitted','Approved')));
grant select,insert,update on public.agent_commission_allocations,public.agent_deal_charges to authenticated;
-- Append-only event history. Clients cannot edit or delete events.
create table public.transaction_audit_events(id bigint generated always as identity primary key,deal_id uuid not null references public.deal_files(id),actor_id uuid,action text not null,record_id text,old_values jsonb,new_values jsonb,occurred_at timestamptz not null default now());
alter table public.transaction_audit_events enable row level security;
create policy audit_read on public.transaction_audit_events for select to authenticated using(exists(select 1 from public.deal_files d where d.id=deal_id));
grant select on public.transaction_audit_events to authenticated;
create function public.log_transaction_change() returns trigger language plpgsql security definer set search_path='' as $$ declare did uuid;begin
 if TG_TABLE_NAME='deal_files' then did=new.id;else did=new.deal_id;end if;
 insert into public.transaction_audit_events(deal_id,actor_id,action,record_id,old_values,new_values) values(did,coalesce(auth.uid(),nullif(to_jsonb(new)->>'created_by','')::uuid),TG_TABLE_NAME||':'||TG_OP,new.id::text,case when TG_OP='UPDATE' then to_jsonb(old) else null end,to_jsonb(new));return new;end $$;
-- Allocation uses deal_id rather than id.
create function public.log_allocation_change() returns trigger language plpgsql security definer set search_path='' as $$ begin
 insert into public.transaction_audit_events(deal_id,actor_id,action,record_id,old_values,new_values) values(new.deal_id,auth.uid(),'agent_commission_allocations:'||TG_OP,new.deal_id::text,case when TG_OP='UPDATE' then to_jsonb(old) else null end,to_jsonb(new));new.updated_at=now();return new;end $$;
create trigger audit_allocation before insert or update on public.agent_commission_allocations for each row execute function public.log_allocation_change();
create trigger audit_deal after insert or update on public.deal_files for each row execute function public.log_transaction_change();
create trigger audit_document after insert on public.deal_documents for each row execute function public.log_transaction_change();
create trigger audit_requirement after insert or update on public.deal_requirements for each row execute function public.log_transaction_change();
create trigger audit_charge after insert or update on public.agent_deal_charges for each row execute function public.log_transaction_change();
create trigger audit_closing_delivery after insert or update on public.closing_deliveries for each row execute function public.log_transaction_change();
commit;
