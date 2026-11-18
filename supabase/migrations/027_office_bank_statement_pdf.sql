-- Run after 025_bank_reconciliation_v2.sql. Private statement evidence, brokerage scoped.
begin;
create table if not exists public.office_bank_statements (
 id uuid primary key default gen_random_uuid(),
 brokerage_id uuid not null references public.brokerages(id),
 account_id uuid not null references public.office_bank_accounts(id),
 period_end date not null,
 storage_path text not null unique,
 filename text not null,
 statement_balance numeric(15,2),
 status text not null default 'Needs review' check (status in ('Needs review','Reviewed')),
 extracted_count integer not null default 0,
 uncertain_count integer not null default 0,
 uploaded_by uuid not null default auth.uid() references auth.users(id),
 created_at timestamptz not null default now(),
 constraint statement_filename_length check (length(filename)<=255),
 constraint statement_path_scoped check (split_part(storage_path,'/',1)=brokerage_id::text and split_part(storage_path,'/',2)=account_id::text)
);
create index if not exists office_bank_statements_account_period_idx on public.office_bank_statements(account_id,period_end desc);
alter table public.office_bank_statements enable row level security;
create policy office_statement_read on public.office_bank_statements for select to authenticated using (public.is_brokerage_admin(brokerage_id));
create policy office_statement_insert on public.office_bank_statements for insert to authenticated with check (
 public.is_brokerage_admin(brokerage_id) and uploaded_by=auth.uid() and
 exists(select 1 from public.office_bank_accounts a where a.id=account_id and a.brokerage_id=office_bank_statements.brokerage_id)
);
grant select,insert on public.office_bank_statements to authenticated;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('office-bank-statements','office-bank-statements',false,12582912,array['application/pdf'])
on conflict(id) do update set public=false,file_size_limit=12582912,allowed_mime_types=array['application/pdf'];
create policy office_statement_pdf_select on storage.objects for select to authenticated using (
 bucket_id='office-bank-statements' and
 exists(select 1 from public.office_bank_accounts a where a.id::text=split_part(name,'/',2)
 and a.brokerage_id::text=split_part(name,'/',1) and public.is_brokerage_admin(a.brokerage_id))
);
create policy office_statement_pdf_insert on storage.objects for insert to authenticated with check (
 bucket_id='office-bank-statements' and storage.extension(name)='pdf' and
 exists(select 1 from public.office_bank_accounts a where a.id::text=split_part(name,'/',2)
 and a.brokerage_id::text=split_part(name,'/',1) and public.is_brokerage_admin(a.brokerage_id))
);
-- No storage UPDATE or DELETE policy: evidence files are immutable in the UI.
commit;
