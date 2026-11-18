-- RealVolt bank reconciliation v2. Run AFTER 010_back_office_finance.sql.
-- No existing transactions, cheques, matches or completed reconciliations are deleted.
begin;
create table if not exists public.office_reconciliation_reviews (
 id uuid primary key default gen_random_uuid(),
 brokerage_id uuid not null references public.brokerages(id),
 account_id uuid not null references public.office_bank_accounts(id),
 period_end date not null,
 statement_balance numeric(15,2) not null,
 adjusted_bank_balance numeric(15,2) not null,
 ledger_balance numeric(15,2) not null,
 deposits_in_transit numeric(15,2) not null,
 outstanding_cheques numeric(15,2) not null,
 trust_liability_total numeric(15,2),
 prepared_by uuid not null references auth.users(id),
 prepared_at timestamptz not null default now(),
 reviewed_by uuid references auth.users(id),
 reviewed_at timestamptz,
 notes text not null default '',
 status text not null default 'Prepared' check (status in ('Prepared','Approved')),
 unique(account_id,period_end)
);
alter table public.office_reconciliation_reviews enable row level security;
drop policy if exists office_reconciliation_reviews_read on public.office_reconciliation_reviews;
create policy office_reconciliation_reviews_read on public.office_reconciliation_reviews
 for select to authenticated using (public.is_brokerage_admin(brokerage_id));
grant select on public.office_reconciliation_reviews to authenticated;

-- Only database-computed figures can be stored; never trust browser-submitted totals.
create or replace function public.office_reconciliation_totals(p_account uuid,p_period date)
returns table (ledger_balance numeric, deposits_in_transit numeric, outstanding_cheques numeric, trust_liability_total numeric, unmatched_bank_count bigint, negative_file_count bigint)
language plpgsql stable security definer set search_path='' as $$
declare a public.office_bank_accounts;
begin
 select * into a from public.office_bank_accounts where id=p_account;
 if not found or not public.is_brokerage_admin(a.brokerage_id) then raise exception 'Brokerage admin permission required'; end if;
 if p_period < a.opening_date then raise exception 'Date precedes account opening';end if;
 return query
 with entered as (
  select l.id,l.deal_id,l.amount from public.office_ledger l
  where l.account_id=p_account and l.entry_date<=p_period
 ), uncleared as (
  select e.amount from entered e where not exists (
   select 1 from public.office_bank_matches m join public.office_bank_lines b on b.id=m.bank_line_id
   where m.ledger_id=e.id and b.entry_date<=p_period
  )
 ), file_balances as (
  select e.deal_id,sum(e.amount) as balance from entered e where e.deal_id is not null group by e.deal_id
 )
 select (a.opening_balance + coalesce((select sum(e.amount) from entered e),0))::numeric,
 coalesce((select sum(u.amount) from uncleared u where u.amount>0),0)::numeric,
 coalesce((select sum(-u.amount) from uncleared u where u.amount<0),0)::numeric,
 (case when a.kind='Trust' then coalesce((select sum(f.balance) from file_balances f),0) else null end)::numeric,
 (select count(*) from public.office_bank_lines b where b.account_id=p_account and b.entry_date<=p_period and not exists
   (select 1 from public.office_bank_matches m join public.office_ledger l on l.id=m.ledger_id where m.bank_line_id=b.id and l.entry_date<=p_period))::bigint,
 (select count(*) from file_balances f where f.balance<0)::bigint;
end $$;

-- A signed bank line is evidence from the statement; never post a new book entry implicitly.
create or replace function public.add_office_bank_line(p_account uuid,p_day date,p_description text,p_amount numeric,p_reference text default '')
returns uuid language plpgsql security definer set search_path='' as $$
declare a public.office_bank_accounts; rid uuid;begin
 select * into a from public.office_bank_accounts where id=p_account;
 if not found or not public.is_brokerage_admin(a.brokerage_id) then raise exception 'Brokerage admin permission required';end if;
 if p_day<a.opening_date or p_day>(now() at time zone 'America/Vancouver')::date or trim(coalesce(p_description,''))='' or round(p_amount,2)=0 or p_amount is null or abs(p_amount)>1000000000000 then raise exception 'Invalid bank statement line';end if;
 insert into public.office_bank_lines(brokerage_id,account_id,entry_date,description,amount,fingerprint)
 values(a.brokerage_id,p_account,p_day,trim(p_description)||case when trim(coalesce(p_reference,''))<>'' then ' · Ref: '||trim(p_reference) else '' end,round(p_amount,2),'manual:'||gen_random_uuid()::text)
 returning id into rid;
 return rid;
end $$;

-- An old cheque may clear AFTER a prior period has been approved and locked.
-- Protect the bank posting period, not the original cheque-issuance date.
create or replace function public.match_office_bank(bank_line uuid,ledger_entry uuid)
returns void language plpgsql security definer set search_path='' as $$
declare b public.office_bank_lines;l public.office_ledger;begin
 select * into b from public.office_bank_lines where id=bank_line for update;
 select * into l from public.office_ledger where id=ledger_entry for update;
 if b.id is null or l.id is null or not public.is_brokerage_admin(b.brokerage_id)
  or b.account_id<>l.account_id or b.brokerage_id<>l.brokerage_id or b.amount<>l.amount
  or l.entry_date>b.entry_date then raise exception 'Match requires same brokerage, account, amount and a posted ledger entry';end if;
 if exists(select 1 from public.office_reconciliations r where r.account_id=b.account_id and r.period_end>=b.entry_date)
   or exists(select 1 from public.office_periods p where p.brokerage_id=b.brokerage_id and p.locked and p.period_end>=b.entry_date)
 then raise exception 'Bank posting period is already reconciled or locked';end if;
 insert into public.office_bank_matches(brokerage_id,bank_line_id,ledger_id) values(b.brokerage_id,b.id,l.id);
end $$;

-- Replace older one-step signing with two explicit, independently auditable steps.
revoke execute on function public.sign_off_reconciliation(uuid,date,numeric) from authenticated;
create or replace function public.prepare_office_reconciliation(p_account uuid,p_period date,p_statement numeric,p_notes text default '')
returns uuid language plpgsql security definer set search_path='' as $$
declare a public.office_bank_accounts;t record; rec_id uuid; adjusted numeric;begin
 select * into a from public.office_bank_accounts where id=p_account for update;
 if not found or not public.is_brokerage_admin(a.brokerage_id) then raise exception 'Brokerage admin permission required';end if;
 if p_period> (now() at time zone 'America/Vancouver')::date or p_period<a.opening_date or p_statement is null then raise exception 'Invalid statement or period';end if;
 if exists(select 1 from public.office_reconciliations where account_id=p_account and period_end>=p_period) then raise exception 'This period or a later period is already approved';end if;
 if exists(select 1 from public.office_periods where brokerage_id=a.brokerage_id and locked and period_end>=p_period) then raise exception 'Accounting period locked';end if;
 select * into t from public.office_reconciliation_totals(p_account,p_period);
 adjusted=round(p_statement+t.deposits_in_transit-t.outstanding_cheques,2);
 if t.unmatched_bank_count<>0 then raise exception '% statement lines require matching or a corresponding posted ledger entry',t.unmatched_bank_count;end if;
 if adjusted<>t.ledger_balance then raise exception 'Adjusted statement % differs from ledger %',adjusted,t.ledger_balance;end if;
 if a.kind='Trust' and (t.trust_liability_total is distinct from t.ledger_balance or t.negative_file_count<>0) then raise exception 'Trust ledger liabilities do not equal assets, or a trust file is negative';end if;
 insert into public.office_reconciliation_reviews(brokerage_id,account_id,period_end,statement_balance,adjusted_bank_balance,ledger_balance,deposits_in_transit,outstanding_cheques,trust_liability_total,prepared_by,notes)
 values(a.brokerage_id,p_account,p_period,round(p_statement,2),adjusted,t.ledger_balance,t.deposits_in_transit,t.outstanding_cheques,t.trust_liability_total,auth.uid(),left(coalesce(p_notes,''),2000))
 on conflict(account_id,period_end) do update set statement_balance=excluded.statement_balance,adjusted_bank_balance=excluded.adjusted_bank_balance,
 ledger_balance=excluded.ledger_balance,deposits_in_transit=excluded.deposits_in_transit,outstanding_cheques=excluded.outstanding_cheques,
 trust_liability_total=excluded.trust_liability_total,prepared_by=auth.uid(),prepared_at=now(),notes=excluded.notes,status='Prepared',reviewed_by=null,reviewed_at=null
 returning id into rec_id;
 return rec_id;
end $$;
create or replace function public.approve_office_reconciliation(p_review uuid)
returns void language plpgsql security definer set search_path='' as $$
declare r public.office_reconciliation_reviews;a public.office_bank_accounts;t record;begin
 select * into r from public.office_reconciliation_reviews where id=p_review for update;
 if not found or r.status<>'Prepared' or not public.is_brokerage_admin(r.brokerage_id) then raise exception 'Prepared reconciliation and brokerage admin role required';end if;
 if r.prepared_by=auth.uid() then raise exception 'Approval requires a second authorized brokerage administrator';end if;
 select * into a from public.office_bank_accounts where id=r.account_id for update;
 if a.brokerage_id<>r.brokerage_id then raise exception 'Account brokerage mismatch';end if;
 if exists(select 1 from public.office_reconciliations where account_id=r.account_id and period_end>=r.period_end) then raise exception 'Reconciliation already approved';end if;
 select * into t from public.office_reconciliation_totals(r.account_id,r.period_end);
 if t.unmatched_bank_count<>0 or round(r.statement_balance+t.deposits_in_transit-t.outstanding_cheques,2)<>t.ledger_balance or
    t.ledger_balance<>r.ledger_balance or t.deposits_in_transit<>r.deposits_in_transit or t.outstanding_cheques<>r.outstanding_cheques or
    (a.kind='Trust' and (t.trust_liability_total is distinct from t.ledger_balance or t.negative_file_count<>0))
 then raise exception 'Underlying ledger or bank lines changed. Prepare the reconciliation again';end if;
 update public.office_reconciliation_reviews set status='Approved',reviewed_by=auth.uid(),reviewed_at=now() where id=p_review;
 insert into public.office_reconciliations(brokerage_id,account_id,period_end,statement_balance,ledger_balance,trust_file_total,signed_by)
 values(r.brokerage_id,r.account_id,r.period_end,r.statement_balance,t.ledger_balance,t.trust_liability_total,auth.uid());
end $$;

drop trigger if exists office_reconciliation_review_audit on public.office_reconciliation_reviews;
create trigger office_reconciliation_review_audit after insert or update on public.office_reconciliation_reviews
 for each row execute function public.audit_office_change();
revoke all on function public.office_reconciliation_totals(uuid,date) from public,anon;
revoke all on function public.add_office_bank_line(uuid,date,text,numeric,text) from public,anon;
revoke all on function public.prepare_office_reconciliation(uuid,date,numeric,text) from public,anon;
revoke all on function public.approve_office_reconciliation(uuid) from public,anon;
grant execute on function public.office_reconciliation_totals(uuid,date) to authenticated;
grant execute on function public.add_office_bank_line(uuid,date,text,numeric,text) to authenticated;
grant execute on function public.prepare_office_reconciliation(uuid,date,numeric,text) to authenticated;
grant execute on function public.approve_office_reconciliation(uuid) to authenticated;
commit;
