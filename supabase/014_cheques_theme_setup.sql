-- Run once after 013. Cheque preparation never moves money; Issue records the ledger payment.
begin;
create table public.office_appearance(brokerage_id uuid primary key references public.brokerages(id),primary_color text not null default '#235e49' check(primary_color ~ '^#[0-9A-Fa-f]{6}$'),accent_color text not null default '#da2c00' check(accent_color ~ '^#[0-9A-Fa-f]{6}$'),background_color text not null default '#f6f7f2' check(background_color ~ '^#[0-9A-Fa-f]{6}$'),updated_at timestamptz not null default now());
alter table public.office_appearance enable row level security;
create policy appearance_read on public.office_appearance for select to authenticated using(brokerage_id=public.current_brokerage());
create policy appearance_write on public.office_appearance for all to authenticated using(public.is_brokerage_admin(brokerage_id)) with check(public.is_brokerage_admin(brokerage_id));
grant select,insert,update on public.office_appearance to authenticated;
create table public.office_cheque_layouts(id uuid primary key default gen_random_uuid(),brokerage_id uuid not null references public.brokerages(id),name text not null check(length(trim(name)) between 1 and 100),layout jsonb not null,created_at timestamptz not null default now());
alter table public.office_cheque_layouts enable row level security;
create policy layout_admin on public.office_cheque_layouts for all to authenticated using(public.is_brokerage_admin(brokerage_id)) with check(public.is_brokerage_admin(brokerage_id));
grant select,insert,update on public.office_cheque_layouts to authenticated;
create table public.office_cheques(id uuid primary key default gen_random_uuid(),brokerage_id uuid not null references public.brokerages(id),account_id uuid not null references public.office_bank_accounts(id),deal_id uuid not null references public.deal_files(id),payout_id uuid references public.agent_payouts(id),cheque_number text not null check(cheque_number ~ '^[0-9]{1,12}$' and cheque_number::numeric>0),payee text not null check(length(trim(payee)) between 1 and 150),payment_date date not null,amount numeric(15,2) not null check(amount>0),memo text not null default '',status text not null default 'Prepared' check(status in ('Prepared','Issued','Voided')),snapshot jsonb not null,ledger_id uuid references public.office_ledger(id),print_count integer not null default 0,void_reason text,created_by uuid not null references auth.users(id),created_at timestamptz not null default now(),issued_at timestamptz,unique(account_id,cheque_number));
create unique index cheque_number_normalized on public.office_cheques(account_id,(cheque_number::numeric));
create unique index cheque_one_payout on public.office_cheques(payout_id) where status<>'Voided';
alter table public.office_cheques enable row level security;
create policy cheque_admin_read on public.office_cheques for select to authenticated using(public.is_brokerage_admin(brokerage_id));grant select on public.office_cheques to authenticated;
create function public.prepare_office_cheque(bank uuid,file_id uuid,payout uuid,number_text text,payee_text text,cheque_day date,value numeric,note text) returns uuid language plpgsql security definer set search_path='' as $$ declare a public.office_bank_accounts;d public.deal_files;p public.agent_payouts;rid uuid;recipient text;begin
 select * into a from public.office_bank_accounts where id=bank for update;
 if a.id is null or not public.is_brokerage_admin(a.brokerage_id) then raise exception 'Admin access required';end if;
 if cheque_day is null or number_text is null or length(trim(number_text)) not between 1 and 30 then raise exception 'Cheque date and number required';end if;
 if payout is not null then
 select * into p from public.agent_payouts where id=payout for update;
 if p.id is null or p.brokerage_id<>a.brokerage_id or p.status<>'Authorized' or a.kind<>'Operating' then raise exception 'Authorized payout and operating account required';end if;
 file_id=p.deal_id;value=p.net;recipient=coalesce(nullif(p.snapshot->'plan'->>'payee_name',''),p.snapshot->'plan'->>'full_name');
 else
 if a.kind<>'Trust' then raise exception 'Release cheques require a trust account';end if;recipient=trim(payee_text);
 end if;
 select * into d from public.deal_files where id=file_id and brokerage_id=a.brokerage_id;
 if d.id is null or value is null or value<=0 or value>999999999.99 or value::text in ('NaN','Infinity','-Infinity') or value<>round(value,2) or length(coalesce(recipient,'')) not between 1 and 150 or length(coalesce(note,''))>500 then raise exception 'Valid transaction, payee and positive cent amount required';end if;
 if a.kind='Trust' and (d.review_status<>'Approved' or value>(select coalesce(sum(amount),0) from public.office_ledger where account_id=bank and deal_id=file_id and entry_date<=cheque_day)) then raise exception 'Approved file and sufficient recorded trust funds required';end if;
 insert into public.office_cheques(brokerage_id,account_id,deal_id,payout_id,cheque_number,payee,payment_date,amount,memo,snapshot,created_by) values(a.brokerage_id,bank,file_id,payout,trim(number_text),recipient,cheque_day,value,coalesce(note,''),jsonb_build_object('brokerage',(select to_jsonb(b) from public.brokerages b where b.id=a.brokerage_id),'transaction',to_jsonb(d),'payout',case when p.id is null then null else to_jsonb(p) end,'account_name',a.name,'account_kind',a.kind),auth.uid()) returning id into rid;return rid;end $$;
create function public.issue_office_cheque(cheque uuid) returns void language plpgsql security definer set search_path='' as $$ declare c public.office_cheques;entry uuid;begin
 select * into c from public.office_cheques where id=cheque for update;
 if c.id is null or not public.is_brokerage_admin(c.brokerage_id) then raise exception 'Admin access required';end if;
 if c.status='Issued' then return;end if;if c.status<>'Prepared' then raise exception 'Only prepared cheques can be issued';end if;
 if c.payout_id is not null then
 perform public.mark_agent_payout_paid(c.payout_id,c.account_id,c.payment_date,c.cheque_number);select ledger_id into entry from public.agent_payouts where id=c.payout_id;
 else
 perform 1 from public.office_bank_accounts where id=c.account_id for update;
 if c.amount>(select coalesce(sum(amount),0) from public.office_ledger where account_id=c.account_id and deal_id=c.deal_id and entry_date<=c.payment_date) then raise exception 'Insufficient trust funds by cheque date';end if;
 if not exists(select 1 from public.deal_files where id=c.deal_id and review_status='Approved' and brokerage_id=c.brokerage_id) then raise exception 'File must remain approved';end if;
 entry=public.post_office_entry(c.account_id,c.deal_id,c.payment_date,'Trust cheque to '||c.payee||': '||c.memo,-c.amount,c.cheque_number);
 end if;
 update public.office_cheques set status='Issued',issued_at=now(),ledger_id=entry where id=cheque;end $$;
create function public.record_cheque_print(cheque uuid) returns void language plpgsql security definer set search_path='' as $$ begin
 update public.office_cheques c set print_count=print_count+1 where c.id=cheque and c.status<>'Voided' and public.is_brokerage_admin(c.brokerage_id) and (c.status='Issued' or c.payout_id is null or exists(select 1 from public.agent_payouts p where p.id=c.payout_id and p.status='Authorized'));if not found then raise exception 'Printable cheque and admin access required';end if;end $$;
create function public.void_prepared_cheque(cheque uuid,reason text) returns void language plpgsql security definer set search_path='' as $$ begin
 if length(trim(coalesce(reason,''))) not between 1 and 500 then raise exception 'Void reason required';end if;
 update public.office_cheques set status='Voided',void_reason=reason where id=cheque and status='Prepared' and public.is_brokerage_admin(brokerage_id);if not found then raise exception 'Only a prepared cheque can be voided here; issued cheques require a documented accounting correction';end if;end $$;
create trigger cheque_audit after insert or update on public.office_cheques for each row execute function public.audit_office_change();
create table public.office_agent_setup(profile_id uuid primary key references public.office_agents(id),brokerage_id uuid not null references public.brokerages(id),plan_reviewed boolean not null default false,licence_verified boolean not null default false,agreement_verified boolean not null default false,billing_confirmed boolean not null default false,access_reviewed boolean not null default false,notes text not null default '',updated_at timestamptz not null default now());
create table public.office_agent_documents(id uuid primary key default gen_random_uuid(),brokerage_id uuid not null references public.brokerages(id),profile_id uuid not null references public.office_agents(id),category text not null check(category in ('Licence','Agreement','Other')),name text not null,path text unique not null,created_at timestamptz not null default now());
alter table public.office_agent_setup enable row level security;alter table public.office_agent_documents enable row level security;
create policy setup_admin on public.office_agent_setup for all to authenticated using(public.is_brokerage_admin(brokerage_id)) with check(public.is_brokerage_admin(brokerage_id) and exists(select 1 from public.office_agents where id=profile_id and brokerage_id=office_agent_setup.brokerage_id));
create policy personnel_read on public.office_agent_documents for select to authenticated using(public.is_brokerage_admin(brokerage_id));
create policy personnel_insert on public.office_agent_documents for insert to authenticated with check(public.is_brokerage_admin(brokerage_id) and exists(select 1 from public.office_agents where id=profile_id and brokerage_id=office_agent_documents.brokerage_id) and path like brokerage_id::text||'/'||profile_id::text||'/%');
grant select,insert,update on public.office_agent_setup to authenticated;grant select,insert on public.office_agent_documents to authenticated;
create function public.guard_agent_setup() returns trigger language plpgsql security definer set search_path='' as $$ begin
 if new.licence_verified and not exists(select 1 from public.office_agent_documents where profile_id=new.profile_id and category='Licence' and brokerage_id=new.brokerage_id) then raise exception 'Upload licence evidence first';end if;
 if new.agreement_verified and not exists(select 1 from public.office_agent_documents where profile_id=new.profile_id and category='Agreement' and brokerage_id=new.brokerage_id) then raise exception 'Upload agreement evidence first';end if;
 if new.access_reviewed and not exists(select 1 from public.office_agents where id=new.profile_id and user_id is not null and status='Active') then raise exception 'Agent must accept invitation and be active first';end if;
 new.updated_at=now();return new;end $$;
create function public.guard_personnel_document() returns trigger language plpgsql security definer set search_path='' as $$ begin
 if not exists(select 1 from storage.objects where bucket_id='agent-personnel' and name=new.path) then raise exception 'Upload the personnel file before attaching its record';end if;return new;end $$;
create trigger personnel_guard before insert on public.office_agent_documents for each row execute function public.guard_personnel_document();
create trigger setup_guard before insert or update on public.office_agent_setup for each row execute function public.guard_agent_setup();
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('agent-personnel','agent-personnel',false,10485760,array['application/pdf','image/png','image/jpeg']) on conflict(id) do nothing;
create policy personnel_storage_insert on storage.objects for insert to authenticated with check(bucket_id='agent-personnel' and exists(select 1 from public.office_agents p where public.is_brokerage_admin(p.brokerage_id) and name like p.brokerage_id::text||'/'||p.id::text||'/%'));
create policy personnel_storage_read on storage.objects for select to authenticated using(bucket_id='agent-personnel' and exists(select 1 from public.office_agent_documents d where d.path=storage.objects.name and public.is_brokerage_admin(d.brokerage_id)));
do $$ declare f text;begin foreach f in array array['prepare_office_cheque(uuid,uuid,uuid,text,text,date,numeric,text)','issue_office_cheque(uuid)','record_cheque_print(uuid)','void_prepared_cheque(uuid,text)'] loop execute 'revoke all on function public.'||f||' from public,anon';execute 'grant execute on function public.'||f||' to authenticated';end loop;end $$;
create function public.audit_setup_change() returns trigger language plpgsql security definer set search_path='' as $$ begin
 insert into public.office_audit_events(brokerage_id,actor_id,action,record_id,old_values,new_values) values(new.brokerage_id,auth.uid(),TG_TABLE_NAME||':'||TG_OP,coalesce(to_jsonb(new)->>'id',to_jsonb(new)->>'profile_id',new.brokerage_id::text),case when TG_OP='UPDATE' then to_jsonb(old) else null end,to_jsonb(new));return new;end $$;
do $$ declare t text;begin foreach t in array array['office_agent_setup','office_agent_documents','office_appearance','office_cheque_layouts'] loop execute format('create trigger setup_audit after insert or update on public.%I for each row execute function public.audit_setup_change()',t);end loop;end $$;
commit;
