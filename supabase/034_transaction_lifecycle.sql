-- RealVolt 034. Run after 033. No historical sales are inferred from scheduled dates.
BEGIN;
alter table public.deal_files add column if not exists pid text not null default '', add column if not exists legal_description text not null default '', add column if not exists contract_date date, add column if not exists possession_date date, add column if not exists adjustment_date date, add column if not exists deposit_due_date date, add column if not exists cooperating_brokerage text not null default '', add column if not exists cooperating_agent text not null default '', add column if not exists cooperating_email text not null default '', add column if not exists parent_listing_id uuid references public.deal_files(id), add column if not exists rv_stage text, add column if not exists rv_firm_date date, add column if not exists rv_completed_date date, add column if not exists rv_completion_letter uuid references public.deal_documents(id), add column if not exists rv_funds_verified boolean not null default false;
alter table public.deal_files drop constraint if exists listing_external_deposit;
alter table public.deal_files drop constraint if exists selling_commission_only;
create unique index if not exists rv_one_live_sale_per_listing on public.deal_files(parent_listing_id) where parent_listing_id is not null and rv_stage is distinct from 'Collapsed';
create table public.rv_transaction_notifications(id bigint generated always as identity primary key,deal_id uuid not null references public.deal_files(id),recipient_id uuid not null references auth.users(id),message text not null,created_at timestamptz not null default now(),read_at timestamptz);
alter table public.rv_transaction_notifications enable row level security;
create policy rv_notification_read on public.rv_transaction_notifications for select to authenticated using(recipient_id=auth.uid() and exists(select 1 from public.deal_files d where d.id=deal_id and d.brokerage_id=public.current_brokerage()));
create policy rv_notification_update on public.rv_transaction_notifications for update to authenticated using(recipient_id=auth.uid() and exists(select 1 from public.deal_files d where d.id=deal_id and d.brokerage_id=public.current_brokerage())) with check(recipient_id=auth.uid());
grant select,update(read_at) on public.rv_transaction_notifications to authenticated;
create index rv_notification_recipient on public.rv_transaction_notifications(recipient_id,created_at desc);
create function public.rv_tx_notice(d public.deal_files, target text, msg text) returns void language plpgsql security definer set search_path='' as $$ begin
 insert into public.rv_transaction_notifications(deal_id,recipient_id,message) select d.id,recipient,msg from (select d.user_id recipient where target='agent' union select r.admin_id from public.transaction_reviewers r join public.brokerage_members m on m.user_id=r.admin_id and m.brokerage_id=d.brokerage_id and m.role='admin' where r.agent_id=d.user_id and target='office') s;
end $$;
revoke all on function public.rv_tx_notice(public.deal_files,text,text) from public,anon,authenticated;
create function public.rv_tx_notify_trigger() returns trigger language plpgsql security definer set search_path='' as $$ begin
 if new.review_status is distinct from old.review_status then
  if new.review_status='Submitted' then perform public.rv_tx_notice(new,'office',new.kind||' submitted — '||coalesce(new.rv_stage,'Listing'));
  elsif new.review_status='Approved' then perform public.rv_tx_notice(new,'agent',new.kind||' approved');
  elsif new.review_status='Changes requested' and auth.uid()<>new.user_id then perform public.rv_tx_notice(new,'agent','Changes requested: '||new.review_notes); end if;
 end if;return new;end $$;
create trigger rv_tx_notify after update on public.deal_files for each row execute function public.rv_tx_notify_trigger();
-- Guard protected lifecycle fields. Ordinary edits continue through the old draft/review rules.
create or replace function public.guard_deal_update() returns trigger language plpgsql set search_path='' as $$ begin
 if new.user_id<>old.user_id or new.kind<>old.kind or new.parent_listing_id is distinct from old.parent_listing_id then raise exception 'Transaction identity cannot change';end if;
 if current_user not in ('authenticated','anon') and current_setting('realvolt.lifecycle_rpc',true)='yes' then new.updated_at=now();return new;end if;
 if row(new.rv_stage,new.rv_firm_date,new.rv_completed_date,new.rv_completion_letter,new.rv_funds_verified) is distinct from row(old.rv_stage,old.rv_firm_date,old.rv_completed_date,old.rv_completion_letter,old.rv_funds_verified) then raise exception 'Use transaction lifecycle actions';end if;
 if auth.uid()=old.user_id then
  if old.rv_stage in ('Completed','Archived','Collapsed') then raise exception 'Finalized transaction details are locked';end if;
  if old.review_status not in ('Draft','Changes requested') then raise exception 'Submitted files are locked pending review'; end if;
  if new.review_status not in ('Draft','Submitted','Changes requested') or new.review_notes is distinct from old.review_notes then raise exception 'Only an assigned admin can review'; end if;
  if new.review_status='Submitted' then
   if not exists(select 1 from public.transaction_reviewers where agent_id=old.user_id) then raise exception 'No back-office admin assigned';end if;
   if not exists(select 1 from public.deal_documents where deal_id=old.id) then raise exception 'Attach at least one document before submission';end if;
   if new.kind='Listing' and (new.listing_date is null or not exists(select 1 from public.listing_terms t where t.deal_id=new.id and t.expiry_date>=new.listing_date)) then raise exception 'Enter listing and expiry dates';end if;
   if new.kind='Sale' and (new.contract_date is null or new.sale_price is null or new.sale_price<=0 or btrim(new.buyer_name)='' or btrim(new.seller_name)='') then raise exception 'Enter contract date, sale price, buyer and seller names';end if;
  end if;
 else
  if not public.can_review_deal(old.user_id) or old.review_status<>'Submitted' or new.review_status not in ('Approved','Changes requested') then raise exception 'Review not permitted'; end if;
  if (to_jsonb(new)-'review_status'-'review_notes'-'updated_at') is distinct from (to_jsonb(old)-'review_status'-'review_notes'-'updated_at') then raise exception 'Reviewers cannot alter agent details'; end if;
 end if;
 new.updated_at=now();return new;end $$;
-- New sale starts conditional; legacy sales require explicit confirmation.
create function public.rv_tx_insert_guard() returns trigger language plpgsql set search_path='' as $$ begin
 new.rv_stage=case when new.kind='Sale' then 'Accepted offer' else null end;new.rv_firm_date=null;new.rv_completed_date=null;new.rv_completion_letter=null;new.rv_funds_verified=false;
 if new.parent_listing_id is not null and (new.kind<>'Sale' or not exists(select 1 from public.deal_files p where p.id=new.parent_listing_id and p.kind='Listing' and p.user_id=auth.uid() and p.brokerage_id=new.brokerage_id and p.review_status='Approved' and not exists(select 1 from public.listing_terms t where t.deal_id=p.id and (t.termination_date<=(now() at time zone 'America/Vancouver')::date or t.expiry_date<(now() at time zone 'America/Vancouver')::date)))) then raise exception 'Select an active approved listing in your brokerage';end if;return new;end $$;
create trigger z_rv_tx_insert before insert on public.deal_files for each row execute function public.rv_tx_insert_guard();
-- Allow append-only documents, including signed amendments and admin completion letters. Never overwrite an existing file.
create policy rv_tx_extra_upload on storage.objects for insert to authenticated with check(bucket_id='transaction-files' and exists(select 1 from public.deal_files d where d.brokerage_id=public.current_brokerage() and (d.user_id=auth.uid() or (public.can_review_deal(d.user_id) and d.review_status<>'Draft')) and name like auth.uid()::text||'/'||d.id::text||'/%' and d.rv_stage is distinct from 'Archived'));
create policy rv_tx_extra_doc on public.deal_documents for insert to authenticated with check(exists(select 1 from public.deal_files d where d.id=deal_id and d.brokerage_id=public.current_brokerage() and (d.user_id=auth.uid() or (public.can_review_deal(d.user_id) and d.review_status<>'Draft')) and path like auth.uid()::text||'/'||d.id::text||'/%' and d.rv_stage is distinct from 'Archived'));
-- Direct listing edits only for drafts. Approved amendments use the RPC below.
drop policy listing_terms_write on public.listing_terms;
create policy listing_terms_write on public.listing_terms for all to authenticated using(exists(select 1 from public.deal_files d where d.id=deal_id and d.kind='Listing' and d.user_id=auth.uid() and d.review_status in ('Draft','Changes requested'))) with check(termination_date is null and exists(select 1 from public.deal_files d where d.id=deal_id and d.kind='Listing' and d.user_id=auth.uid() and d.review_status in ('Draft','Changes requested')));
-- Admin can verify additional documents at completion without reopening the approved sale.
drop policy requirement_write on public.deal_requirements;
create policy requirement_write on public.deal_requirements for all to authenticated using(exists(select 1 from public.deal_files d where d.id=deal_id and public.can_review_deal(d.user_id) and d.brokerage_id=public.current_brokerage() and d.review_status in ('Submitted','Approved'))) with check(exists(select 1 from public.deal_files d where d.id=deal_id and public.can_review_deal(d.user_id) and d.brokerage_id=public.current_brokerage() and d.review_status in ('Submitted','Approved')));
create function public.rv_tx_action(p_deal uuid,p_action text,p_date date default null,p_document uuid default null,p_note text default '') returns void language plpgsql security definer set search_path='' as $$
declare d public.deal_files; doc public.deal_documents; agent boolean; office boolean; today date:=(now() at time zone 'America/Vancouver')::date; label text;
begin
 select * into d from public.deal_files where id=p_deal for update;
 if not found or d.brokerage_id is distinct from public.current_brokerage() or auth.uid() is null then raise exception 'File unavailable';end if;
 agent:=d.user_id=auth.uid();office:=public.can_review_deal(d.user_id);if not (agent or office) then raise exception 'File unavailable';end if;
 if p_document is not null then select * into doc from public.deal_documents where id=p_document and deal_id=d.id;if not found or lower(doc.name) not like '%.pdf' or not exists(select 1 from storage.objects o where o.bucket_id='transaction-files' and o.name=doc.path) then raise exception 'Select an uploaded PDF from this transaction';end if;end if;
 perform set_config('realvolt.lifecycle_rpc','yes',true);
 if p_action='seen' and office and d.review_status='Submitted' then
  if not exists(select 1 from public.rv_transaction_notifications n where n.deal_id=d.id and n.recipient_id=d.user_id and n.message='Back Office opened your file' and n.created_at>=d.updated_at) then perform public.rv_tx_notice(d,'agent','Back Office opened your file');end if;
 elsif p_action='reopen' and agent and d.kind='Sale' and d.review_status='Approved' and (d.rv_stage is null or d.rv_stage='Accepted offer') then
  update public.deal_files set review_status='Changes requested' where id=d.id;
 elsif p_action='firm' and agent and d.kind='Sale' and d.review_status in ('Draft','Changes requested','Approved') and (d.rv_stage is null or d.rv_stage='Accepted offer') then
  if p_document is null or p_date is null or p_date>today or d.contract_date is null or p_date<d.contract_date or d.completion_date is null or d.completion_date<p_date or d.sale_price is null or d.sale_price<=0 or btrim(d.buyer_name)='' or btrim(d.seller_name)='' or d.buyer_lawyer_id is null or d.seller_lawyer_id is null then raise exception 'Enter contract/completion dates, buyer and seller, price, both lawyers and signed subject removal (or unconditional contract) PDF';end if;
  if not exists(select 1 from public.transaction_reviewers r join public.brokerage_members m on m.user_id=r.admin_id and m.brokerage_id=d.brokerage_id and m.role='admin' where r.agent_id=d.user_id) then raise exception 'No assigned reviewer';end if;
  insert into public.deal_requirements(deal_id,label,document_id,verified) values(d.id,'Signed subject removal / unconditional contract',p_document,false) on conflict(deal_id,label) do update set document_id=excluded.document_id,verified=false;
  update public.deal_files set rv_stage='Sold',rv_firm_date=p_date,review_status='Submitted' where id=d.id;
  perform public.rv_tx_notice(d,'office','Firm sale submitted — verify subject removal');
 elsif p_action in ('extend_subject','extend_completion','collapse') and agent and d.kind='Sale' and d.review_status='Approved' and (d.rv_stage='Accepted offer' or (d.rv_stage='Sold' and p_action='extend_completion')) then
  if p_document is null or (p_action<>'collapse' and p_date is null) then raise exception 'Upload and select the signed amendment PDF and revised date';end if;
  if p_action='extend_subject' and (d.rv_stage<>'Accepted offer' or p_date<=coalesce(d.subject_date,d.contract_date) or (d.completion_date is not null and p_date>d.completion_date)) then raise exception 'Enter a later subject date before completion';end if;
  if p_action='extend_completion' and p_date<=coalesce(d.completion_date,d.contract_date) then raise exception 'Enter a later completion date';end if;
  label:=case p_action when 'extend_subject' then 'Subject extension' when 'extend_completion' then 'Completion extension' else 'Offer collapse' end||' — '||p_document::text;
  insert into public.deal_requirements(deal_id,label,document_id) values(d.id,label,p_document) on conflict do nothing;
  update public.deal_files set subject_date=case when p_action='extend_subject' then p_date else subject_date end,completion_date=case when p_action='extend_completion' then p_date else completion_date end,rv_stage=case when p_action='collapse' then 'Collapsed' else rv_stage end,review_status='Submitted' where id=d.id;
 elsif p_action in ('terminate','extend_listing') and agent and d.kind='Listing' and d.review_status='Approved' then
  if p_document is null or p_date is null or (p_action='terminate' and (btrim(p_note)='' or p_date>today)) then raise exception 'Select signed PDF, date and termination reason where applicable';end if;
  if exists(select 1 from public.deal_files s where s.parent_listing_id=d.id and s.rv_stage is distinct from 'Collapsed') then raise exception 'Resolve linked sale before amending listing';end if;
  if p_action='extend_listing' and (p_date<=today or exists(select 1 from public.listing_terms t where t.deal_id=d.id and (t.termination_date is not null or t.expiry_date>=p_date))) then raise exception 'Choose a later expiry date for an unterminated listing';end if;
  insert into public.deal_requirements(deal_id,label,document_id) values(d.id,(case when p_action='terminate' then 'Termination' else 'Listing extension' end)||' — '||p_document::text,p_document) on conflict do nothing;
  if p_action='terminate' then update public.listing_terms set termination_date=p_date,termination_reason=p_note where deal_id=d.id;else update public.listing_terms set expiry_date=p_date where deal_id=d.id;end if;
  update public.deal_files set review_status='Submitted' where id=d.id;
 elsif p_action='complete' and office and d.rv_stage='Sold' and d.review_status='Approved' then
  if p_document is null or p_date is null or p_date>today or p_date<d.rv_firm_date then raise exception 'Select lawyer completion letter PDF and actual completion date';end if;
  update public.deal_files set rv_stage='Completed',rv_completed_date=p_date,rv_completion_letter=p_document where id=d.id;
  perform public.rv_tx_notice(d,'agent','Legal completion confirmed');
 elsif p_action='funds' and office and d.rv_stage='Completed' then
  if btrim(p_note)='' then raise exception 'Record verified receipt / bank reference';end if;
  update public.deal_files set rv_funds_verified=true where id=d.id;
  insert into public.transaction_audit_events(deal_id,actor_id,action,new_values) values(d.id,auth.uid(),'Commission funds verified',jsonb_build_object('reference',p_note));
 elsif p_action='missing' and office and d.review_status in ('Submitted','Approved') then
  if btrim(p_note)='' then raise exception 'Enter missing documents';end if;perform public.rv_tx_notice(d,'agent','Documents required: '||p_note);
 elsif p_action='archive' and office and d.rv_stage='Completed' then
  if not exists(select 1 from public.agent_payouts where deal_id=d.id and status='Paid') or exists(select 1 from public.deal_requirements where deal_id=d.id and not verified) then raise exception 'Verify final documents and record agent payment first';end if;
  update public.deal_files set rv_stage='Archived' where id=d.id;
 else raise exception 'Action is not available for this file or role';end if;
 perform set_config('realvolt.lifecycle_rpc','no',true);
end $$;
revoke all on function public.rv_tx_action(uuid,text,date,uuid,text) from public,anon;
grant execute on function public.rv_tx_action(uuid,text,date,uuid,text) to authenticated;
-- Explicit receipt and actual completion are required for the existing payout engine, including other entry points.
create function public.rv_payout_guard() returns trigger language plpgsql set search_path='' as $$ begin
 if TG_OP='INSERT' or (new.status='Paid' and old.status is distinct from 'Paid') then
  if not exists(select 1 from public.deal_files d where d.id=new.deal_id and d.rv_stage='Completed' and d.rv_completed_date is not null and d.rv_completion_letter is not null and d.rv_funds_verified and d.review_status='Approved') then raise exception 'Confirm legal completion, lawyer letter and verified commission receipt before authorizing payment';end if;
 end if;return new;end $$;
create trigger rv_payout_guard before insert or update on public.agent_payouts for each row execute function public.rv_payout_guard();
create function public.rv_payment_notice() returns trigger language plpgsql security definer set search_path='' as $$ declare d public.deal_files;begin
 if new.status='Paid' and old.status is distinct from 'Paid' then select * into d from public.deal_files where id=new.deal_id;perform public.rv_tx_notice(d,'agent','Commission payment recorded');end if;return new;end $$;
create trigger rv_payment_notice after update on public.agent_payouts for each row execute function public.rv_payment_notice();
-- Provide status and next date without moving or deleting any physical records.
create view public.rv_tx_summary with(security_invoker=true) as select d.id,d.user_id,d.brokerage_id,d.address,d.kind,d.review_status,d.rv_stage,d.parent_listing_id,d.rv_firm_date,d.rv_completed_date,
 case when d.kind='Sale' then coalesce(d.rv_stage,'Needs confirmation') when s.id is not null then case when s.rv_stage in ('Sold','Completed','Archived') then 'Sold' else 'Accepted offer' end when t.termination_date<=(now() at time zone 'America/Vancouver')::date then case when d.review_status<>'Approved' then 'Termination pending' else 'Terminated' end when t.expiry_date<(now() at time zone 'America/Vancouver')::date then 'Expired' else 'Active' end as display_status,
 case when d.kind='Listing' and s.id is null and t.termination_date is null and t.expiry_date>=(now() at time zone 'America/Vancouver')::date then t.expiry_date when d.kind='Sale' and d.rv_stage='Accepted offer' then d.subject_date when d.kind='Sale' and d.rv_stage='Sold' then d.completion_date when d.kind='Sale' and d.rv_stage='Completed' and d.possession_date>=(now() at time zone 'America/Vancouver')::date then d.possession_date else null end as next_date
 from public.deal_files d left join public.listing_terms t on t.deal_id=d.id left join public.deal_files s on s.parent_listing_id=d.id and s.rv_stage is distinct from 'Collapsed' and s.review_status<>'Draft';
grant select on public.rv_tx_summary to authenticated;

CREATE OR REPLACE FUNCTION public.rv_brokerage_sales_leaderboard(
  p_period text DEFAULT 'month', p_sort text DEFAULT 'volume'
)
RETURNS TABLE (
  rank integer,
  agent_id uuid,
  agent_name text,
  sales_count bigint,
  sales_volume numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_brokerage uuid;
  v_today date := (now() AT TIME ZONE 'America/Vancouver')::date;
  v_period_start date;
  v_period_end date;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sign in required' USING ERRCODE = '42501';
  END IF;
  IF p_period IS NULL OR p_period NOT IN ('month','year') THEN
    RAISE EXCEPTION 'Invalid leaderboard period' USING ERRCODE = '22023';
  END IF;
  IF p_sort IS NULL OR p_sort NOT IN ('volume','sales') THEN
    RAISE EXCEPTION 'Invalid leaderboard sort' USING ERRCODE = '22023';
  END IF;

  -- Never accept brokerage_id from the client: derive tenant from signed-in user.
  SELECT m.brokerage_id INTO v_brokerage
  FROM public.brokerage_members m
  WHERE m.user_id = auth.uid();
  IF v_brokerage IS NULL THEN
    RAISE EXCEPTION 'No brokerage membership for this account' USING ERRCODE = '42501';
  END IF;

  v_period_start := date_trunc(p_period, v_today::timestamp)::date;
  v_period_end := CASE WHEN p_period = 'month'
    THEN (v_period_start + interval '1 month')::date
    ELSE (v_period_start + interval '1 year')::date END;

  RETURN QUERY
  WITH office_agents AS (
    SELECT m.user_id AS member_id,
      COALESCE(NULLIF(btrim(oa.full_name),''),
               NULLIF(btrim(ap.full_name),''), 'Agent') AS display_name
    FROM public.brokerage_members m
    LEFT JOIN public.office_agents oa
      ON oa.user_id = m.user_id AND oa.brokerage_id = m.brokerage_id
    LEFT JOIN public.agent_workspace_profiles ap ON ap.user_id = m.user_id
    WHERE m.brokerage_id = v_brokerage
      AND (m.role = 'agent' OR (oa.user_id IS NOT NULL AND oa.status = 'Active'))
  ),
  completed_sales AS (
    SELECT d.id, d.user_id, d.sale_price
    FROM public.deal_files d
    WHERE d.brokerage_id = v_brokerage
      AND d.kind = 'Sale'
      AND d.sale_price IS NOT NULL AND d.sale_price > 0
      AND d.rv_stage IN ('Sold','Completed','Archived')
      AND d.rv_firm_date >= v_period_start AND d.rv_firm_date < v_period_end
      AND d.rv_firm_date <= v_today
  ),
  totals AS (
    SELECT oa.member_id, oa.display_name,
           count(cs.id)::bigint AS num_sales,
           coalesce(sum(cs.sale_price),0)::numeric AS volume_cad
    FROM office_agents oa
    LEFT JOIN completed_sales cs ON cs.user_id = oa.member_id
    GROUP BY oa.member_id, oa.display_name
  ),
  ranked AS (
    SELECT row_number() OVER (
      ORDER BY
        CASE WHEN p_sort='sales' THEN t.num_sales END DESC NULLS LAST,
        CASE WHEN p_sort='volume' THEN t.volume_cad END DESC NULLS LAST,
        t.volume_cad DESC, t.num_sales DESC,
        lower(t.display_name), t.member_id
    )::integer AS position,
    t.member_id, t.display_name, t.num_sales, t.volume_cad
    FROM totals t
  )
  SELECT r.position, r.member_id, r.display_name, r.num_sales, r.volume_cad
  FROM ranked r
  ORDER BY r.position;
END;
$$;

-- Security-definer endpoint: authenticated brokerage members only.
REVOKE ALL ON FUNCTION public.rv_brokerage_sales_leaderboard(text,text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rv_brokerage_sales_leaderboard(text,text)
  TO authenticated;


create function public.rv_doc_notice() returns trigger language plpgsql security definer set search_path='' as $$ declare d public.deal_files;begin
 select * into d from public.deal_files where id=new.deal_id;
 if d.user_id=auth.uid() and d.review_status<>'Draft' then perform public.rv_tx_notice(d,'office','New document uploaded: '||new.name);end if;return new;end $$;
create trigger rv_doc_notice after insert on public.deal_documents for each row execute function public.rv_doc_notice();
create or replace function public.apply_agent_split(deal uuid) returns void language plpgsql security definer set search_path='' as $$ declare d public.deal_files;p public.office_agents;base numeric;agent numeric;begin
 select * into d from public.deal_files where id=deal for update;if not found or not public.is_brokerage_admin(d.brokerage_id) or d.review_status<>'Approved' or d.kind<>'Sale' or d.rv_stage is distinct from 'Completed' or not d.rv_funds_verified then raise exception 'Submitted sale and brokerage admin required';end if;
 if exists(select 1 from public.agent_payouts where deal_id=deal) then raise exception 'Payout already authorized';end if;
 select * into p from public.office_agents where user_id=d.user_id and brokerage_id=d.brokerage_id;if not found then raise exception 'Agent profile not linked';end if;
 base=case when d.representation='listing' then d.listing_commission else d.selling_commission end;agent=round(base*p.agent_split/100,2);
 insert into public.agent_commission_allocations(deal_id,commission_before_gst,commission_gst,notes) values(deal,agent,round(agent*case when btrim(p.gst_number)<>'' then p.commission_gst_rate else 0 end/100,2),'Agent share '||p.agent_split||'% of '||base||' before GST; brokerage retains remaining share.') on conflict(deal_id) do update set commission_before_gst=excluded.commission_before_gst,commission_gst=excluded.commission_gst,notes=excluded.notes;end $$;
create or replace function public.authorize_agent_payout(deal uuid,through_month date) returns uuid language plpgsql security definer set search_path='' as $$ declare d public.deal_files;p public.office_agents;a public.agent_commission_allocations;ded numeric;fees numeric;rid uuid;bill public.agent_monthly_bills;begin
 select * into d from public.deal_files where id=deal for update;if not found or not public.is_brokerage_admin(d.brokerage_id) or d.kind<>'Sale' or d.review_status<>'Approved' or d.rv_stage is distinct from 'Completed' or d.rv_completed_date is null or d.rv_completed_date>(now() at time zone 'America/Vancouver')::date or not d.rv_funds_verified or d.rv_completion_letter is null then raise exception 'Completed, approved sale required';end if;
 select * into p from public.office_agents where user_id=d.user_id and brokerage_id=d.brokerage_id for update;if not found then raise exception 'Agent profile required';end if;
 if through_month is null or date_trunc('month',through_month)::date>date_trunc('month',(now() at time zone 'America/Vancouver')::date)::date then raise exception 'Fee period cannot be in the future';end if;
 if exists(select 1 from public.agent_payouts where deal_id=deal) then raise exception 'Payout already authorized';end if;
 perform public.apply_agent_split(deal);
 select * into a from public.agent_commission_allocations where deal_id=deal;if not found then raise exception 'Apply and confirm agent split first';end if;
 perform public.accrue_agent_fees_through(p.id,through_month);
 select coalesce(sum(amount+gst),0) into ded from public.agent_deal_charges where deal_id=deal;
 perform 1 from public.agent_monthly_bills where profile_id=p.id and billing_month<=date_trunc('month',through_month)::date and status='Outstanding' and collection_method='Cheque deduction' for update;
 select coalesce(sum(amount+gst),0) into fees from public.agent_monthly_bills where profile_id=p.id and billing_month<=date_trunc('month',through_month)::date and status='Outstanding' and collection_method='Cheque deduction';
 if a.commission_before_gst+a.commission_gst<ded+fees then raise exception 'Fees exceed payout; resolve the shortfall before authorizing';end if;
 insert into public.agent_payouts(brokerage_id,profile_id,deal_id,gross,gst,deductions,net,snapshot,authorized_by) values(d.brokerage_id,p.id,deal,a.commission_before_gst,a.commission_gst,ded+fees,a.commission_before_gst+a.commission_gst-ded-fees,jsonb_build_object('allocation',to_jsonb(a),'plan',to_jsonb(p),'charges',(select coalesce(jsonb_agg(c),'[]'::jsonb) from public.agent_deal_charges c where c.deal_id=deal),'monthly_bills',(select coalesce(jsonb_agg(b),'[]'::jsonb) from public.agent_monthly_bills b where b.profile_id=p.id and b.billing_month<=date_trunc('month',through_month)::date and b.status='Outstanding' and b.collection_method='Cheque deduction')),auth.uid()) returning id into rid;
 for bill in select * from public.agent_monthly_bills where profile_id=p.id and billing_month<=date_trunc('month',through_month)::date and status='Outstanding' and collection_method='Cheque deduction' loop
 insert into public.agent_deal_charges(deal_id,category,description,amount,gst) values(deal,'Office fee',bill.category||' — '||bill.billing_month,bill.amount,bill.gst);
 update public.agent_monthly_bills set status='Cheque deducted',payout_id=rid where id=bill.id;end loop;
 return rid;end $$;

create or replace function public.guard_payout_financials() returns trigger language plpgsql set search_path='' as $$ begin
 if exists(select 1 from public.deal_files d join public.office_periods p on p.brokerage_id=d.brokerage_id and p.locked and p.period_end>=coalesce(d.rv_completed_date,d.completion_date) where d.id=new.deal_id) then raise exception 'Financial period is locked';end if;
 if current_user in ('authenticated','anon') and exists(select 1 from public.agent_payouts where deal_id=new.deal_id) then raise exception 'Payout is authorized; financial entries are locked';end if;return new;end $$;

COMMIT;
