begin;
create table public.office_agents(
 id uuid primary key default gen_random_uuid(),brokerage_id uuid not null references public.brokerages(id),user_id uuid unique references auth.users(id),full_name text not null check(length(trim(full_name))>0),email text not null check(email=lower(trim(email))),phone text not null default '',mailing_address text not null default '',gst_number text not null default '',payee_name text not null default '',license_number text not null default '',start_date date not null default current_date,end_date date,status text not null default 'Invited' check(status in ('Invited','Active','Inactive')),agent_split numeric(5,2) not null default 80 check(agent_split between 0 and 100),monthly_office_fee numeric(12,2) not null default 100 check(monthly_office_fee>=0),monthly_software_fee numeric(12,2) not null default 49 check(monthly_software_fee>=0),monthly_board_fee numeric(12,2) not null default 0 check(monthly_board_fee>=0),fee_gst_rate numeric(5,2) not null default 5 check(fee_gst_rate between 0 and 100),commission_gst_rate numeric(5,2) not null default 5 check(commission_gst_rate between 0 and 100),billing_method text not null default 'Credit card' check(billing_method in ('Cheque deduction','Credit card')),reviewer_id uuid not null references auth.users(id),notes text not null default '',invitation_sent_at timestamptz,invitation_expires_at timestamptz not null default now()+interval '14 days',accepted_at timestamptz,created_at timestamptz not null default now(),unique(brokerage_id,email));
alter table public.office_agents add constraint valid_agent_end_date check(end_date is null or end_date>=start_date);
alter table public.office_agents add constraint active_agent_has_account check(status<>'Active' or user_id is not null);
alter table public.office_agents enable row level security;
create policy office_agent_read on public.office_agents for select to authenticated using(public.is_brokerage_admin(brokerage_id) or user_id=auth.uid() or (status='Invited' and email=lower(auth.jwt()->>'email')));
create policy office_agent_insert on public.office_agents for insert to authenticated with check(public.is_brokerage_admin(brokerage_id) and user_id is null);
create policy office_agent_update on public.office_agents for update to authenticated using(public.is_brokerage_admin(brokerage_id)) with check(public.is_brokerage_admin(brokerage_id));
grant select,insert,update on public.office_agents to authenticated;
create table public.office_audit_events(id bigint generated always as identity primary key,brokerage_id uuid not null references public.brokerages(id),actor_id uuid,action text not null,record_id text,old_values jsonb,new_values jsonb,created_at timestamptz not null default now());
alter table public.office_audit_events enable row level security;
create policy office_audit_read on public.office_audit_events for select to authenticated using(public.is_brokerage_admin(brokerage_id));grant select on public.office_audit_events to authenticated;
create function public.audit_office_change() returns trigger language plpgsql security definer set search_path='' as $$ begin insert into public.office_audit_events(brokerage_id,actor_id,action,record_id,old_values,new_values) values(new.brokerage_id,auth.uid(),TG_TABLE_NAME||':'||TG_OP,new.id::text,case when TG_OP='UPDATE' then to_jsonb(old) else null end,to_jsonb(new));return new;end $$;
create function public.guard_office_agent() returns trigger language plpgsql set search_path='' as $$ begin
 if not exists(select 1 from public.brokerage_members where user_id=new.reviewer_id and brokerage_id=new.brokerage_id and role='admin') then raise exception 'Reviewer must be an admin in this brokerage';end if;
 if TG_OP='UPDATE' and new.brokerage_id<>old.brokerage_id then raise exception 'Brokerage cannot change';end if;
 if TG_OP='UPDATE' and auth.uid() is not null and (new.user_id is distinct from old.user_id or new.accepted_at is distinct from old.accepted_at) then raise exception 'Use invitation acceptance to link the account';end if;
 return new;end $$;
create trigger guard_office_agent before insert or update on public.office_agents for each row execute function public.guard_office_agent();
create trigger audit_office_agent after insert or update on public.office_agents for each row execute function public.audit_office_change();
create function public.accept_office_invitation(profile_id uuid,agent_name text,agent_phone text,agent_license text) returns void language plpgsql security definer set search_path='' as $$ declare p public.office_agents;u auth.users;begin
 select * into u from auth.users where id=auth.uid();if not found or u.email_confirmed_at is null then raise exception 'Verify your email before accepting';end if;
 select * into p from public.office_agents where id=profile_id for update;if not found or p.email<>lower(u.email) or p.status<>'Invited' or p.invitation_expires_at<now() then raise exception 'Invitation unavailable or expired';end if;
 if exists(select 1 from public.brokerage_members where user_id=u.id and brokerage_id<>p.brokerage_id) then raise exception 'Account already belongs to another brokerage';end if;
 if length(trim(agent_name))=0 then raise exception 'Enter your name';end if;
 insert into public.brokerage_members(user_id,brokerage_id,role) values(u.id,p.brokerage_id,'agent') on conflict(user_id) do nothing;
 -- Linking is performed only after verified-email and brokerage checks.
 update public.office_agents set user_id=u.id,full_name=trim(agent_name),phone=agent_phone,license_number=agent_license,status='Active',accepted_at=now() where id=p.id;
 insert into public.transaction_reviewers(agent_id,admin_id) values(u.id,p.reviewer_id) on conflict(agent_id) do update set admin_id=excluded.admin_id;
 insert into public.agent_workspace_profiles(user_id,full_name) values(u.id,trim(agent_name)) on conflict(user_id) do update set full_name=excluded.full_name;
 end $$;
-- Guard distinguishes SECURITY DEFINER invocation by checking the effective DB role.
create or replace function public.guard_office_agent() returns trigger language plpgsql set search_path='' as $$ begin
 if not exists(select 1 from public.brokerage_members where user_id=new.reviewer_id and brokerage_id=new.brokerage_id and role='admin') then raise exception 'Reviewer must be an admin in this brokerage';end if;
 if TG_OP='UPDATE' and new.brokerage_id<>old.brokerage_id then raise exception 'Brokerage cannot change';end if;
 if TG_OP='UPDATE' and current_user in ('authenticated','anon') and (new.user_id is distinct from old.user_id or new.accepted_at is distinct from old.accepted_at) then raise exception 'Use invitation acceptance to link the account';end if;return new;end $$;
grant execute on function public.accept_office_invitation(uuid,text,text,text) to authenticated;
revoke all on function public.accept_office_invitation(uuid,text,text,text) from public,anon;
create table public.agent_monthly_bills(id uuid primary key default gen_random_uuid(),brokerage_id uuid not null references public.brokerages(id),profile_id uuid not null references public.office_agents(id),billing_month date not null,category text not null check(category in ('Office fee','Software fee','Board fee')),amount numeric(12,2) not null check(amount>=0),gst numeric(12,2) not null check(gst>=0),collection_method text not null check(collection_method in ('Cheque deduction','Credit card')),status text not null default 'Outstanding' check(status in ('Outstanding','Card paid','Cheque deducted','Voided')),provider_invoice text,payout_id uuid,created_at timestamptz not null default now(),unique(profile_id,billing_month,category));
alter table public.agent_monthly_bills enable row level security;
create policy monthly_bill_read on public.agent_monthly_bills for select to authenticated using(public.is_brokerage_admin(brokerage_id) or exists(select 1 from public.office_agents p where p.id=profile_id and p.user_id=auth.uid()));grant select on public.agent_monthly_bills to authenticated;
create trigger audit_monthly_bill after insert or update on public.agent_monthly_bills for each row execute function public.audit_office_change();
create function public.accrue_agent_month(profile_id uuid,month_date date) returns void language plpgsql security definer set search_path='' as $$ declare p public.office_agents;m date;begin
 select * into p from public.office_agents where id=profile_id for update;if not found or not public.is_brokerage_admin(p.brokerage_id) then raise exception 'Admin access required';end if;
 m=date_trunc('month',month_date)::date;if m>date_trunc('month',(now() at time zone 'America/Vancouver'))::date or m<date_trunc('month',p.start_date)::date or (p.end_date is not null and m>date_trunc('month',p.end_date)::date) or p.status='Invited' or (p.status='Inactive' and p.end_date is null) then raise exception 'Month outside active service period';end if;
 insert into public.agent_monthly_bills(brokerage_id,profile_id,billing_month,category,amount,gst,collection_method) select p.brokerage_id,p.id,m,v.category,v.amount,round(v.amount*p.fee_gst_rate/100,2),p.billing_method from (values('Office fee',p.monthly_office_fee),('Software fee',p.monthly_software_fee),('Board fee',p.monthly_board_fee))v(category,amount) where v.amount>0 on conflict on constraint agent_monthly_bills_profile_id_billing_month_category_key do nothing;end $$;
grant execute on function public.accrue_agent_month(uuid,date) to authenticated;revoke all on function public.accrue_agent_month(uuid,date) from public,anon;
-- Card mappings are server-only; subscription IDs are never client-writable.
create table public.agent_card_accounts(profile_id uuid primary key references public.office_agents(id),customer_id text unique not null,subscription_id text unique,checkout_session text,billing_started_month date,last_invoice text);
create table public.billing_webhook_events(id text primary key,processed_at timestamptz not null default now());
alter table public.agent_card_accounts enable row level security;alter table public.billing_webhook_events enable row level security;
commit;
