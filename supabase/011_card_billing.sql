begin;
create table public.brokerage_payment_accounts(brokerage_id uuid primary key references public.brokerages(id),stripe_account_id text unique,tax_rate_id text not null);
create unique index one_platform_stripe_account on public.brokerage_payment_accounts((1)) where stripe_account_id is null;
alter table public.brokerage_payment_accounts enable row level security;
create function public.record_card_invoice(event_key text,profile uuid,invoice_key text,month_day date,items jsonb) returns void language plpgsql security definer set search_path='' as $$ declare p public.office_agents;v jsonb;b public.agent_monthly_bills;begin
 perform 1 from public.billing_webhook_events where id=event_key;if found then return;end if;
 select * into p from public.office_agents where id=profile for update;if not found then raise exception 'Agent profile unavailable';end if;
 for v in select value from jsonb_array_elements(items) loop
  if v->>'category' not in ('Office fee','Software fee','Board fee') then raise exception 'Unsupported invoice item';end if;
  select * into b from public.agent_monthly_bills where profile_id=p.id and billing_month=date_trunc('month',month_day)::date and category=v->>'category' for update;
  if found then if b.collection_method<>'Credit card' or b.status not in ('Outstanding','Card paid') or b.amount<>(v->>'amount')::numeric or b.gst<>(v->>'gst')::numeric or (b.provider_invoice is not null and b.provider_invoice<>invoice_key) then raise exception 'Invoice conflicts with existing bill; reconcile manually';end if;
  update public.agent_monthly_bills set status='Card paid',provider_invoice=invoice_key where id=b.id;
  else insert into public.agent_monthly_bills(brokerage_id,profile_id,billing_month,category,amount,gst,collection_method,status,provider_invoice) values(p.brokerage_id,p.id,date_trunc('month',month_day)::date,v->>'category',(v->>'amount')::numeric,(v->>'gst')::numeric,'Credit card','Card paid',invoice_key);end if;
 end loop;
 insert into public.billing_webhook_events(id) values(event_key) on conflict do nothing;
 update public.agent_card_accounts set last_invoice=invoice_key where profile_id=p.id;
end $$;
revoke all on function public.record_card_invoice(text,uuid,text,date,jsonb) from public,anon,authenticated;grant execute on function public.record_card_invoice(text,uuid,text,date,jsonb) to service_role;
create function public.guard_live_subscription() returns trigger language plpgsql security definer set search_path='' as $$ begin
 if old.user_id is not null and (new.email<>old.email or new.start_date<>old.start_date) then raise exception 'Enrolled email and start date are locked; use a reviewed account correction';end if;
 if new.billing_method<>old.billing_method and exists(select 1 from public.agent_monthly_bills where profile_id=old.id) then raise exception 'Collection method is locked once billing starts; reconcile outstanding bills before a reviewed migration';end if;

 if exists(select 1 from public.agent_card_accounts where profile_id=old.id and subscription_id is not null) and (new.billing_method<>old.billing_method or new.status<>old.status or new.monthly_office_fee<>old.monthly_office_fee or new.monthly_software_fee<>old.monthly_software_fee or new.monthly_board_fee<>old.monthly_board_fee or new.fee_gst_rate<>old.fee_gst_rate) then raise exception 'Cancel the existing card subscription before changing billing plan or status';end if;return new;end $$;
create trigger live_subscription_plan before update on public.office_agents for each row execute function public.guard_live_subscription();
create function public.accrue_agent_fees_through(profile uuid,through_month date) returns void language plpgsql security definer set search_path='' as $$ declare p public.office_agents;m date;begin
 select * into p from public.office_agents where id=profile for update;if not found or not public.is_brokerage_admin(p.brokerage_id) then raise exception 'Admin access required';end if;
 if through_month>(now() at time zone 'America/Vancouver')::date or date_trunc('month',through_month)<date_trunc('month',p.start_date) then raise exception 'Invalid accrual date';end if;
 for m in select generate_series(date_trunc('month',p.start_date),date_trunc('month',least(through_month,coalesce(p.end_date,through_month))),interval '1 month')::date loop perform public.accrue_agent_month(profile,m);end loop;end $$;
revoke all on function public.accrue_agent_fees_through(uuid,date) from public,anon;grant execute on function public.accrue_agent_fees_through(uuid,date) to authenticated;
-- Configure Stripe account mapping using project-owner SQL only:
-- insert into public.brokerage_payment_accounts(brokerage_id,stripe_account_id,tax_rate_id) values ('BROKERAGE_UUID','acct_CONNECTED_ACCOUNT','txr_GST_RATE');
-- For a single brokerage using its own platform Stripe account, stripe_account_id can be NULL.

create function public.save_brokerage_details(office_name text,office_address text,office_email text,office_phone text) returns void language plpgsql security definer set search_path='' as $$ declare b uuid:=public.current_brokerage();begin if not public.is_brokerage_admin(b) or length(trim(office_name))=0 then raise exception 'Brokerage admin and name required';end if;update public.brokerages set name=trim(office_name),address=office_address,email=office_email,phone=office_phone where id=b;end $$;
revoke all on function public.save_brokerage_details(text,text,text,text) from public,anon;grant execute on function public.save_brokerage_details(text,text,text,text) to authenticated;

create table public.office_document_templates(brokerage_id uuid primary key references public.brokerages(id),letter_intro text not null default '',letter_footer text not null default '',cir_footer text not null default '');
alter table public.office_document_templates enable row level security;
create policy template_admin on public.office_document_templates for all to authenticated using(public.is_brokerage_admin(brokerage_id)) with check(public.is_brokerage_admin(brokerage_id));
grant select,insert,update on public.office_document_templates to authenticated;
create table public.office_billing_alerts(id text primary key,brokerage_id uuid not null references public.brokerages(id),profile_id uuid not null references public.office_agents(id),message text not null,resolved boolean not null default false,created_at timestamptz not null default now());
alter table public.office_billing_alerts enable row level security;
create policy billing_alert_read on public.office_billing_alerts for select to authenticated using(public.is_brokerage_admin(brokerage_id));grant select on public.office_billing_alerts to authenticated;

create function public.create_own_brokerage(office_name text,office_email text) returns uuid language plpgsql security definer set search_path='' as $$ declare b uuid;begin
 if auth.uid() is null or length(trim(office_name))=0 or length(trim(office_email))=0 then raise exception 'Sign in and enter brokerage name and email';end if;
 perform 1 from auth.users where id=auth.uid() for update;
 if exists(select 1 from public.brokerage_members where user_id=auth.uid()) then raise exception 'Account already belongs to a brokerage';end if;
 insert into public.brokerages(name,email) values(trim(office_name),trim(office_email)) returning id into b;
 insert into public.brokerage_members(user_id,brokerage_id,role) values(auth.uid(),b,'admin');
 update public.deal_files set brokerage_id=b where user_id=auth.uid() and brokerage_id is null and review_status in ('Draft','Changes requested');
 return b;end $$;
revoke all on function public.create_own_brokerage(text,text) from public,anon;grant execute on function public.create_own_brokerage(text,text) to authenticated;
create function public.set_office_member_role(member uuid,new_role text) returns void language plpgsql security definer set search_path='' as $$ declare b uuid:=public.current_brokerage();begin
 if not public.is_brokerage_admin(b) or new_role not in ('agent','admin') then raise exception 'Brokerage admin required';end if;
 perform 1 from public.brokerages where id=b for update;
 if not exists(select 1 from public.brokerage_members where user_id=member and brokerage_id=b) then raise exception 'Member not in this brokerage';end if;
 if new_role='agent' and (select count(*) from public.brokerage_members where brokerage_id=b and role='admin')<=1 and exists(select 1 from public.brokerage_members where user_id=member and role='admin') then raise exception 'Keep at least one admin';end if;
 if new_role='agent' and exists(select 1 from public.office_agents where reviewer_id=member and brokerage_id=b) then raise exception 'Reassign this admin’s agent reviews before removing admin access';end if;
 update public.brokerage_members set role=new_role where user_id=member and brokerage_id=b;
 insert into public.office_audit_events(brokerage_id,actor_id,action,record_id,new_values) values(b,auth.uid(),'member_role',member::text,jsonb_build_object('role',new_role));end $$;
revoke all on function public.set_office_member_role(uuid,text) from public,anon;grant execute on function public.set_office_member_role(uuid,text) to authenticated;

create function public.sync_agent_reviewer() returns trigger language plpgsql security definer set search_path='' as $$ begin if new.user_id is not null and new.reviewer_id is distinct from old.reviewer_id then insert into public.transaction_reviewers(agent_id,admin_id) values(new.user_id,new.reviewer_id) on conflict(agent_id) do update set admin_id=excluded.admin_id;end if;return new;end $$;
create trigger sync_agent_reviewer after update of reviewer_id on public.office_agents for each row execute function public.sync_agent_reviewer();
create or replace function public.can_review_deal(owner_id uuid) returns boolean language sql stable security definer set search_path='' as $$ select exists(select 1 from public.brokerage_members agent join public.brokerage_members admin on admin.brokerage_id=agent.brokerage_id where agent.user_id=owner_id and admin.user_id=auth.uid() and admin.role='admin') $$;

create or replace function public.current_brokerage() returns uuid language sql stable security definer set search_path='' as $$ select m.brokerage_id from public.brokerage_members m where m.user_id=auth.uid() and not exists(select 1 from public.office_agents p where p.user_id=m.user_id and p.status='Inactive') $$;
create or replace function public.is_brokerage_admin(b uuid) returns boolean language sql stable security definer set search_path='' as $$ select exists(select 1 from public.brokerage_members m where m.user_id=auth.uid() and m.brokerage_id=b and m.role='admin' and not exists(select 1 from public.office_agents p where p.user_id=m.user_id and p.status='Inactive')) $$;
create or replace function public.can_review_deal(owner_id uuid) returns boolean language sql stable security definer set search_path='' as $$ select exists(select 1 from public.brokerage_members m where m.user_id=owner_id and public.is_brokerage_admin(m.brokerage_id)) $$;

create function public.complete_my_agent_details(agent_address text,agent_gst_number text,agent_payee text) returns void language plpgsql security definer set search_path='' as $$ begin if auth.uid() is null then raise exception 'Sign in required';end if;update public.office_agents set mailing_address=agent_address,gst_number=agent_gst_number,payee_name=agent_payee where user_id=auth.uid() and status='Active';if not found then raise exception 'Active agent profile required';end if;end $$;
revoke all on function public.complete_my_agent_details(text,text,text) from public,anon;grant execute on function public.complete_my_agent_details(text,text,text) to authenticated;
commit;
