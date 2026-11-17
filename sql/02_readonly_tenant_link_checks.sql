-- REALVOLT PHASE 1 — CROSS-BROKERAGE LINK CHECKS (READ ONLY)
-- Requires the core deal/office/signing migrations (005,009,010,012) to be installed.
-- Runs only SELECTs; returns aggregate counts and no names, emails, IDs, or customer data.
-- Nonzero counts are FLAGS FOR REVIEW, not automatically proven data breaches:
-- users may have changed brokerages and historical records can legitimately exist.

select 'office_ledger.account_mismatch' as check_name, count(*)::bigint as records_to_review
  from public.office_ledger l join public.office_bank_accounts a on a.id=l.account_id
  where l.brokerage_id is distinct from a.brokerage_id
union all
select 'office_bank_lines.account_mismatch', count(*)::bigint
  from public.office_bank_lines l join public.office_bank_accounts a on a.id=l.account_id
  where l.brokerage_id is distinct from a.brokerage_id
union all
select 'office_bank_matches.line_mismatch', count(*)::bigint
  from public.office_bank_matches m join public.office_bank_lines l on l.id=m.bank_line_id
  where m.brokerage_id is distinct from l.brokerage_id
union all
select 'office_bank_matches.ledger_mismatch', count(*)::bigint
  from public.office_bank_matches m join public.office_ledger l on l.id=m.ledger_id
  where m.brokerage_id is distinct from l.brokerage_id
union all
select 'agent_payouts.agent_profile_mismatch', count(*)::bigint
  from public.agent_payouts p join public.office_agents a on a.id=p.profile_id
  where p.brokerage_id is distinct from a.brokerage_id
union all
select 'agent_payouts.deal_mismatch', count(*)::bigint
  from public.agent_payouts p join public.deal_files d on d.id=p.deal_id
  where p.brokerage_id is distinct from d.brokerage_id
union all
select 'sign_envelopes.owner_brokerage_mismatch', count(*)::bigint
  from public.sign_envelopes e
  left join public.brokerage_members m on m.user_id=e.user_id
  where e.brokerage_id is not null and (m.brokerage_id is null or e.brokerage_id is distinct from m.brokerage_id)
union all
select 'sign_envelopes.linked_deal_owner_mismatch', count(*)::bigint
  from public.sign_envelopes e join public.deal_files d on d.id=e.deal_id
  where e.user_id is distinct from d.user_id
order by check_name;
