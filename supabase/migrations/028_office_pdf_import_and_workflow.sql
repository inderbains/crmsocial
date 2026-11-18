-- RealVolt: reviewed PDF bank lines + workflow audit. Run AFTER 025 and 027.
-- No automatic trust transfers, approvals, emails or payouts are performed.
begin;

alter table public.office_bank_statements
 add column if not exists source_sha256 text,
 add column if not exists opening_balance numeric(15,2),
 add column if not exists extracted_preview jsonb not null default '[]'::jsonb;
create unique index if not exists office_bank_statement_unique_pdf
 on public.office_bank_statements(account_id,source_sha256) where source_sha256 is not null;

create or replace function public.import_office_statement_rows(p_statement uuid,p_rows jsonb)
returns integer language plpgsql security definer set search_path='' as $$
declare s public.office_bank_statements; a public.office_bank_accounts;
 rowitem jsonb; indexnum integer; d date; amount numeric; description text; ref text;
 fingerprint text; count_imported integer:=0; rowcount integer;
begin
 select * into s from public.office_bank_statements where id=p_statement for update;
 if not found or not public.is_brokerage_admin(s.brokerage_id) then raise exception 'Authorized brokerage statement required';end if;
 select * into a from public.office_bank_accounts where id=s.account_id;
 if a.brokerage_id is distinct from s.brokerage_id then raise exception 'Account / brokerage mismatch';end if;
 if exists(select 1 from public.office_reconciliations where account_id=s.account_id and period_end>=s.period_end)
    or exists(select 1 from public.office_periods where brokerage_id=s.brokerage_id and locked and period_end>=s.period_end)
 then raise exception 'The statement period is already reconciled or locked';end if;
 if jsonb_typeof(p_rows)<>'array' then raise exception 'Rows must be an array';end if;
 rowcount=jsonb_array_length(p_rows);
 if rowcount>2000 then raise exception 'Maximum 2000 statement rows per import';end if;
 for rowitem in select value from jsonb_array_elements(p_rows) loop
   if jsonb_typeof(rowitem)<>'object' then raise exception 'Bad bank statement row';end if;
   indexnum=(rowitem->>'source_index')::integer;
   if indexnum<0 or indexnum>=2000 then raise exception 'Invalid original statement row number';end if;
   d=(rowitem->>'date')::date;
   amount=round((rowitem->>'amount')::numeric,2);
   description=trim(coalesce(rowitem->>'description',''));
   ref=trim(coalesce(rowitem->>'reference',''));
   if d<a.opening_date or d>s.period_end or amount=0 or abs(amount)>1000000000000
      or length(description) not between 1 and 500 or length(ref)>100
   then raise exception 'Invalid statement line %',indexnum;end if;
   fingerprint='pdf:'||p_statement::text||':'||indexnum::text;
   insert into public.office_bank_lines(brokerage_id,account_id,entry_date,description,amount,fingerprint)
   values(s.brokerage_id,s.account_id,d,description||case when ref<>'' then ' · Ref: '||ref else '' end,amount,fingerprint)
   on conflict(account_id,fingerprint) do nothing;
   if found then count_imported=count_imported+1;end if;
 end loop;
 return count_imported;
end $$;
revoke all on function public.import_office_statement_rows(uuid,jsonb) from public,anon;
grant execute on function public.import_office_statement_rows(uuid,jsonb) to authenticated;

-- Immutable stage-event log, separate from the accounting ledger.
create table if not exists public.deal_workflow_events (
 id bigint generated always as identity primary key,
 brokerage_id uuid not null references public.brokerages(id),
 deal_id uuid not null references public.deal_files(id),
 event_type text not null,
 old_value text,
 new_value text,
 actor_id uuid,
 occurred_at timestamptz not null default now()
);
create index if not exists deal_workflow_events_deal_time_idx
 on public.deal_workflow_events(deal_id,occurred_at desc);
alter table public.deal_workflow_events enable row level security;
drop policy if exists deal_workflow_read on public.deal_workflow_events;
create policy deal_workflow_read on public.deal_workflow_events for select to authenticated
using (public.is_brokerage_admin(brokerage_id) or exists
(select 1 from public.deal_files d where d.id=deal_id and d.user_id=auth.uid() and d.brokerage_id=deal_workflow_events.brokerage_id));
grant select on public.deal_workflow_events to authenticated;

create or replace function public.log_deal_workflow_event()
returns trigger language plpgsql security definer set search_path='' as $$
declare file_id uuid; brokerage uuid; old_label text; new_label text; action_name text;
begin
 if TG_TABLE_NAME='deal_files' then
  if TG_OP='UPDATE' and new.review_status is not distinct from old.review_status then return new;end if;
  file_id=new.id;brokerage=new.brokerage_id;action_name='review_status';
  old_label=case when TG_OP='INSERT' then null else old.review_status end;
  new_label=new.review_status;
 elsif TG_TABLE_NAME='agent_payouts' then
  file_id=new.deal_id;brokerage=new.brokerage_id;action_name='payout_status';
  if TG_OP='UPDATE' and new.status is not distinct from old.status then return new;end if;
  old_label=case when TG_OP='INSERT' then null else old.status end;
  new_label=new.status;
 elsif TG_TABLE_NAME='closing_deliveries' then
  file_id=new.deal_id;brokerage=new.brokerage_id;action_name='lawyer_packet';
  if TG_OP='UPDATE' and new.status is not distinct from old.status then return new;end if;
  old_label=case when TG_OP='INSERT' then null else old.status end;
  new_label=new.status;
 elsif TG_TABLE_NAME='office_ledger' then
  file_id=new.deal_id;brokerage=new.brokerage_id;action_name='ledger_posted';
  old_label=null;new_label=new.entry_date::text||' '||case when new.amount>0 then 'receipt' else 'payment/release' end;
 else return new;end if;
 if file_id is not null and brokerage is not null then
 insert into public.deal_workflow_events(brokerage_id,deal_id,event_type,old_value,new_value,actor_id)
 values(brokerage,file_id,action_name,old_label,new_label,auth.uid());
 end if;
 return new;
end $$;

drop trigger if exists rv_flow_deal on public.deal_files;
create trigger rv_flow_deal after insert or update of review_status on public.deal_files
for each row execute function public.log_deal_workflow_event();
drop trigger if exists rv_flow_payout on public.agent_payouts;
create trigger rv_flow_payout after insert or update of status on public.agent_payouts
for each row execute function public.log_deal_workflow_event();
drop trigger if exists rv_flow_closing on public.closing_deliveries;
create trigger rv_flow_closing after insert or update of status on public.closing_deliveries
for each row execute function public.log_deal_workflow_event();
drop trigger if exists rv_flow_ledger on public.office_ledger;
create trigger rv_flow_ledger after insert on public.office_ledger
for each row execute function public.log_deal_workflow_event();

commit;
