-- RealVolt: operating-account EFT tracking and salary cheques, 2026-11-17.
-- Requires 009, 010, 014. This does NOT connect to a bank or execute transfers.
-- EFT instructions are recorded as sent externally; the cash ledger posts only after confirmation.
begin;

create table if not exists public.office_staff (
  id uuid primary key default gen_random_uuid(),
  brokerage_id uuid not null references public.brokerages(id),
  full_name text not null check (length(trim(full_name)) between 2 and 150),
  job_title text not null default '',
  email text not null default '',
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists office_staff_brokerage_idx on public.office_staff(brokerage_id);
alter table public.office_staff enable row level security;
drop policy if exists office_staff_admin on public.office_staff;
create policy office_staff_admin on public.office_staff for all to authenticated
  using (public.is_brokerage_admin(brokerage_id))
  with check (public.is_brokerage_admin(brokerage_id));
grant select,insert,update on public.office_staff to authenticated;

-- This is a record of verified payroll figures, NOT a payroll tax calculator.
create table if not exists public.office_payroll_runs (
  id uuid primary key default gen_random_uuid(),
  brokerage_id uuid not null references public.brokerages(id),
  staff_id uuid not null references public.office_staff(id),
  period_start date not null,
  period_end date not null,
  pay_date date not null,
  gross numeric(15,2) not null check (gross > 0),
  deductions numeric(15,2) not null default 0 check (deductions >= 0 and deductions <= gross),
  employer_costs numeric(15,2) not null default 0 check (employer_costs >= 0),
  net numeric(15,2) generated always as (gross - deductions) stored,
  status text not null default 'Draft' check (status in ('Draft','Approved','Paid')),
  created_by uuid not null references auth.users(id),
  approved_by uuid references auth.users(id),
  approved_at timestamptz,
  paid_date date,
  payment_method text check (payment_method in ('Cheque','EFT')),
  payment_reference text,
  ledger_id uuid unique references public.office_ledger(id),
  created_at timestamptz not null default now(),
  constraint payroll_period_valid check (period_start <= period_end and pay_date >= period_start),
  constraint payroll_unique_period unique (staff_id,period_start,period_end)
);
create index if not exists office_payroll_brokerage_idx on public.office_payroll_runs(brokerage_id,pay_date);
alter table public.office_payroll_runs enable row level security;
drop policy if exists office_payroll_admin_read on public.office_payroll_runs;
create policy office_payroll_admin_read on public.office_payroll_runs for select to authenticated
 using (public.is_brokerage_admin(brokerage_id));
grant select on public.office_payroll_runs to authenticated;

-- No account number, transit number, password, SIN or full bank routing details are stored.
-- A verified recipient must be configured separately with the brokerage's bank/payment provider.
create table if not exists public.office_eft_instructions (
  id uuid primary key default gen_random_uuid(),
  brokerage_id uuid not null references public.brokerages(id),
  account_id uuid not null references public.office_bank_accounts(id),
  payout_id uuid references public.agent_payouts(id),
  payroll_id uuid references public.office_payroll_runs(id),
  payee text not null,
  amount numeric(15,2) not null check (amount > 0),
  destination_label text not null check (length(trim(destination_label)) between 3 and 120),
  destination_last4 text not null check (destination_last4 ~ '^[0-9]{4}$'),
  status text not null default 'Prepared' check (status in ('Prepared','Submitted','Confirmed','Cancelled')),
  external_reference text,
  payment_day date,
  ledger_id uuid unique references public.office_ledger(id),
  created_by uuid not null references auth.users(id),
  submitted_by uuid references auth.users(id),
  confirmed_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  submitted_at timestamptz,
  confirmed_at timestamptz,
  cancelled_at timestamptz,
  constraint eft_exactly_one_target check ((payout_id is not null) <> (payroll_id is not null))
);
create unique index if not exists eft_active_payout on public.office_eft_instructions(payout_id) where payout_id is not null and status <> 'Cancelled';
create unique index if not exists eft_active_payroll on public.office_eft_instructions(payroll_id) where payroll_id is not null and status <> 'Cancelled';
create unique index if not exists eft_external_ref on public.office_eft_instructions(brokerage_id,external_reference) where external_reference is not null and status <> 'Cancelled';
create index if not exists office_efts_brokerage_idx on public.office_eft_instructions(brokerage_id,created_at desc);
alter table public.office_eft_instructions enable row level security;
drop policy if exists office_efts_admin_read on public.office_eft_instructions;
create policy office_efts_admin_read on public.office_eft_instructions for select to authenticated
 using (public.is_brokerage_admin(brokerage_id));
grant select on public.office_eft_instructions to authenticated;

-- Allow the existing, customizable cheque register to hold salary cheques without a deal id.
alter table public.office_cheques alter column deal_id drop not null;
alter table public.office_cheques add column if not exists payroll_id uuid references public.office_payroll_runs(id);
create unique index if not exists office_cheque_active_payroll on public.office_cheques(payroll_id) where payroll_id is not null and status <> 'Voided';

create or replace function public.create_office_payroll_run(
  staff uuid, start_day date, end_day date, payment_day date,
  gross_amount numeric, employee_deductions numeric, employer_amount numeric
) returns uuid language plpgsql security definer set search_path='' as $$
declare s public.office_staff; rid uuid;
begin
 select * into s from public.office_staff where id=staff for update;
 if s.id is null or not s.active or not public.is_brokerage_admin(s.brokerage_id) then
   raise exception 'Active staff member and brokerage admin required';
 end if;
 if start_day is null or end_day is null or payment_day is null or start_day>end_day or payment_day<start_day
    or gross_amount is null or gross_amount<=0 or gross_amount<>round(gross_amount,2)
    or employee_deductions is null or employee_deductions<0 or employee_deductions>gross_amount or employee_deductions<>round(employee_deductions,2)
    or employer_amount is null or employer_amount<0 or employer_amount<>round(employer_amount,2) then
   raise exception 'Valid payroll dates and verified cent amounts required';
 end if;
 insert into public.office_payroll_runs(brokerage_id,staff_id,period_start,period_end,pay_date,gross,deductions,employer_costs,created_by)
 values(s.brokerage_id,s.id,start_day,end_day,payment_day,gross_amount,employee_deductions,employer_amount,auth.uid()) returning id into rid;
 return rid;
end $$;

create or replace function public.approve_office_payroll_run(payroll uuid)
returns void language plpgsql security definer set search_path='' as $$
declare p public.office_payroll_runs;
begin
 select * into p from public.office_payroll_runs where id=payroll for update;
 if p.id is null or not public.is_brokerage_admin(p.brokerage_id) or p.status<>'Draft' then
    raise exception 'Draft payroll and brokerage admin required';
 end if;
 update public.office_payroll_runs set status='Approved',approved_by=auth.uid(),approved_at=now() where id=p.id;
end $$;

-- Private helper: only called by the approved EFT and cheque RPCs.
create or replace function public.record_office_payroll_payment(payroll uuid, bank uuid, paid_day date, paid_ref text, method text)
returns uuid language plpgsql security definer set search_path='' as $$
declare p public.office_payroll_runs; a public.office_bank_accounts; s public.office_staff; entry uuid;
begin
 select * into p from public.office_payroll_runs where id=payroll for update;
 select * into a from public.office_bank_accounts where id=bank;
 select * into s from public.office_staff where id=p.staff_id;
 if p.id is null or a.id is null or a.brokerage_id<>p.brokerage_id or a.kind<>'Operating'
   or p.status<>'Approved' or not public.is_brokerage_admin(p.brokerage_id)
   or paid_day is null or length(trim(coalesce(paid_ref,'')))<3 or method not in ('EFT','Cheque') then
   raise exception 'Approved salary, operating account, date and payment reference required';
 end if;
 entry=public.post_office_entry(bank,null,paid_day,'Payroll net pay: '||s.full_name,-p.net,paid_ref);
 update public.office_payroll_runs set status='Paid',paid_date=paid_day,payment_method=method,payment_reference=paid_ref,ledger_id=entry where id=p.id;
 return entry;
end $$;

create or replace function public.prepare_office_payroll_cheque(payroll uuid, bank uuid, number_text text, memo text)
returns uuid language plpgsql security definer set search_path='' as $$
declare p public.office_payroll_runs; a public.office_bank_accounts; s public.office_staff; rid uuid;
begin
 select * into p from public.office_payroll_runs where id=payroll for update;
 select * into a from public.office_bank_accounts where id=bank;
 select * into s from public.office_staff where id=p.staff_id;
 if p.id is null or p.status<>'Approved' or not public.is_brokerage_admin(p.brokerage_id)
  or a.id is null or a.brokerage_id<>p.brokerage_id or a.kind<>'Operating' or not a.active
  or number_text is null or number_text !~ '^[0-9]{1,12}$' or number_text::numeric<=0
  or length(coalesce(memo,''))>90 or p.net<=0 then
  raise exception 'Approved payroll, active operating account and cheque number required';
 end if;
 if exists(select 1 from public.office_eft_instructions e where e.payroll_id=payroll and e.status<>'Cancelled')
  or exists(select 1 from public.office_cheques c where c.payroll_id=payroll and c.status<>'Voided') then
   raise exception 'This salary has an active payment instruction';
 end if;
 insert into public.office_cheques(brokerage_id,account_id,deal_id,payout_id,payroll_id,cheque_number,payee,payment_date,amount,memo,snapshot,created_by)
 values(p.brokerage_id,bank,null,null,p.id,number_text,s.full_name,p.pay_date,p.net,coalesce(memo,'Salary'),
 jsonb_build_object('brokerage',(select to_jsonb(b) from public.brokerages b where b.id=p.brokerage_id),
  'account_name',a.name,'account_kind','Operating','payroll',to_jsonb(p),'staff',to_jsonb(s)),auth.uid()) returning id into rid;
 return rid;
end $$;

create or replace function public.prepare_office_eft(bank uuid, agent_payout uuid, payroll uuid,
  destination text, last_four text)
returns uuid language plpgsql security definer set search_path='' as $$
declare a public.office_bank_accounts; p public.agent_payouts; pay public.office_payroll_runs;
 name text; amount_to_pay numeric; rid uuid;
begin
 select * into a from public.office_bank_accounts where id=bank;
 if a.id is null or a.kind<>'Operating' or not a.active or not public.is_brokerage_admin(a.brokerage_id) then
   raise exception 'Active brokerage operating account required';
 end if;
 if (agent_payout is not null)=(payroll is not null) or length(trim(coalesce(destination,''))) not between 3 and 120
   or coalesce(last_four,'') !~ '^[0-9]{4}$' then
   raise exception 'Select one payout and a verified recipient alias plus last four digits';
 end if;
 if agent_payout is not null then
   select * into p from public.agent_payouts where id=agent_payout for update;
   if p.id is null or p.brokerage_id<>a.brokerage_id or p.status<>'Authorized' or p.net<=0 then
     raise exception 'Authorized unpaid agent payout required';
   end if;
   if exists(select 1 from public.office_cheques c where c.payout_id=p.id and c.status<>'Voided') then
     raise exception 'An active cheque already exists for this payout';
   end if;
   name=coalesce(nullif(p.snapshot->'plan'->>'payee_name',''),p.snapshot->'plan'->>'full_name');
   amount_to_pay=p.net;
 else
   select * into pay from public.office_payroll_runs where id=payroll for update;
   if pay.id is null or pay.brokerage_id<>a.brokerage_id or pay.status<>'Approved' or pay.net<=0 then
     raise exception 'Approved unpaid salary required';
   end if;
   if exists(select 1 from public.office_cheques c where c.payroll_id=pay.id and c.status<>'Voided') then
     raise exception 'An active cheque already exists for this salary';
   end if;
   select full_name into name from public.office_staff where id=pay.staff_id;
   amount_to_pay=pay.net;
 end if;
 insert into public.office_eft_instructions(brokerage_id,account_id,payout_id,payroll_id,payee,amount,destination_label,destination_last4,created_by)
 values(a.brokerage_id,bank,agent_payout,payroll,coalesce(name,''),amount_to_pay,trim(destination),last_four,auth.uid()) returning id into rid;
 return rid;
end $$;

-- Records that a human submitted payment through an external bank. Does NOT send money.
create or replace function public.record_office_eft_submitted(eft uuid, bank_reference text)
returns void language plpgsql security definer set search_path='' as $$
declare e public.office_eft_instructions;
begin
 select * into e from public.office_eft_instructions where id=eft for update;
 if e.id is null or not public.is_brokerage_admin(e.brokerage_id) or e.status<>'Prepared'
  or length(trim(coalesce(bank_reference,''))) not between 3 and 150 then
    raise exception 'Prepared EFT and external bank reference required';
 end if;
 update public.office_eft_instructions set status='Submitted',external_reference=trim(bank_reference),submitted_by=auth.uid(),submitted_at=now() where id=e.id;
end $$;

-- Cash is posted once after external settlement is independently confirmed.
create or replace function public.confirm_office_eft(eft uuid, settled_day date)
returns void language plpgsql security definer set search_path='' as $$
declare e public.office_eft_instructions; p public.agent_payouts; pr public.office_payroll_runs; entry uuid;
begin
 select * into e from public.office_eft_instructions where id=eft for update;
 if e.id is null or not public.is_brokerage_admin(e.brokerage_id) or e.status<>'Submitted'
  or settled_day is null or e.external_reference is null then
   raise exception 'Submitted EFT, settlement date and brokerage admin required';
 end if;
 if e.payout_id is not null then
   select * into p from public.agent_payouts where id=e.payout_id for update;
   if p.id is null or p.status<>'Authorized' or p.net<>e.amount or p.brokerage_id<>e.brokerage_id
     or exists(select 1 from public.office_cheques c where c.payout_id=p.id and c.status='Issued') then
      raise exception 'Payout was changed or already paid';
   end if;
   perform public.mark_agent_payout_paid(p.id,e.account_id,settled_day,e.external_reference);
   select ledger_id into entry from public.agent_payouts where id=p.id;
 else
   select * into pr from public.office_payroll_runs where id=e.payroll_id for update;
   if pr.id is null or pr.status<>'Approved' or pr.net<>e.amount or pr.brokerage_id<>e.brokerage_id
     or exists(select 1 from public.office_cheques c where c.payroll_id=pr.id and c.status='Issued') then
      raise exception 'Salary was changed or already paid';
   end if;
   entry=public.record_office_payroll_payment(pr.id,e.account_id,settled_day,e.external_reference,'EFT');
 end if;
 update public.office_eft_instructions set status='Confirmed',payment_day=settled_day,ledger_id=entry,confirmed_by=auth.uid(),confirmed_at=now() where id=e.id;
end $$;

create or replace function public.cancel_prepared_office_eft(eft uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
 update public.office_eft_instructions set status='Cancelled',cancelled_at=now()
 where id=eft and status='Prepared' and public.is_brokerage_admin(brokerage_id);
 if not found then raise exception 'Only unsent prepared EFTs may be cancelled'; end if;
end $$;

-- Replace existing cheque issue function only to add an approved salary branch and block duplicate EFT payments.
create or replace function public.issue_office_cheque(cheque uuid)
returns void language plpgsql security definer set search_path='' as $$
declare c public.office_cheques; entry uuid;
begin
 select * into c from public.office_cheques where id=cheque for update;
 if c.id is null or not public.is_brokerage_admin(c.brokerage_id) then raise exception 'Admin access required';end if;
 if c.status='Issued' then return;end if;
 if c.status<>'Prepared' then raise exception 'Only prepared cheques can be issued';end if;
 if c.payroll_id is not null then
   if exists(select 1 from public.office_eft_instructions e where e.payroll_id=c.payroll_id and e.status<>'Cancelled') then
     raise exception 'An EFT already exists for this salary';
   end if;
   entry=public.record_office_payroll_payment(c.payroll_id,c.account_id,c.payment_date,c.cheque_number,'Cheque');
 elsif c.payout_id is not null then
   if exists(select 1 from public.office_eft_instructions e where e.payout_id=c.payout_id and e.status<>'Cancelled') then
     raise exception 'An EFT already exists for this agent payout';
   end if;
   perform public.mark_agent_payout_paid(c.payout_id,c.account_id,c.payment_date,c.cheque_number);
   select ledger_id into entry from public.agent_payouts where id=c.payout_id;
 else
   perform 1 from public.office_bank_accounts where id=c.account_id for update;
   if c.amount>(select coalesce(sum(amount),0) from public.office_ledger where account_id=c.account_id and deal_id=c.deal_id and entry_date<=c.payment_date) then
     raise exception 'Insufficient trust funds by cheque date';
   end if;
   if not exists(select 1 from public.deal_files where id=c.deal_id and review_status='Approved' and brokerage_id=c.brokerage_id) then
     raise exception 'File must remain approved';
   end if;
   entry=public.post_office_entry(c.account_id,c.deal_id,c.payment_date,'Trust cheque to '||c.payee||': '||c.memo,-c.amount,c.cheque_number);
 end if;
 update public.office_cheques set status='Issued',issued_at=now(),ledger_id=entry where id=cheque;
end $$;

-- Cross-method guard: preparing a new cheque is blocked when an active EFT exists.
create or replace function public.guard_office_cheque_against_eft()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if (new.payout_id is not null and exists(select 1 from public.office_eft_instructions e where e.payout_id=new.payout_id and e.status<>'Cancelled'))
 or (new.payroll_id is not null and exists(select 1 from public.office_eft_instructions e where e.payroll_id=new.payroll_id and e.status<>'Cancelled')) then
    raise exception 'An EFT is already prepared for this payment';
 end if;
 return new;
end $$;
drop trigger if exists cheque_eft_guard on public.office_cheques;
create trigger cheque_eft_guard before insert on public.office_cheques for each row execute function public.guard_office_cheque_against_eft();

-- Audit each status transition. No sensitive banking details are persisted.
do $$ declare t text; begin
 foreach t in array array['office_staff','office_payroll_runs','office_eft_instructions'] loop
   execute format('drop trigger if exists office_payment_audit on public.%I',t);
   execute format('create trigger office_payment_audit after insert or update on public.%I for each row execute function public.audit_office_change()',t);
 end loop;
end $$;

-- Restrict all payment actions to authenticated roles; each RPC also checks brokerage admin.
do $$ declare f text; begin
 foreach f in array array[
  'create_office_payroll_run(uuid,date,date,date,numeric,numeric,numeric)',
  'approve_office_payroll_run(uuid)',
  'prepare_office_payroll_cheque(uuid,uuid,text,text)',
  'prepare_office_eft(uuid,uuid,uuid,text,text)',
  'record_office_eft_submitted(uuid,text)',
  'confirm_office_eft(uuid,date)',
  'cancel_prepared_office_eft(uuid)',
  'issue_office_cheque(uuid)'
 ] loop
  execute 'revoke all on function public.'||f||' from public, anon';
  execute 'grant execute on function public.'||f||' to authenticated';
 end loop;
 revoke all on function public.record_office_payroll_payment(uuid,uuid,date,text,text) from public,anon,authenticated;
end $$;
commit;
