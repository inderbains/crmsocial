BEGIN;
create or replace function public.rv_invitation_details(p_profile uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare p public.office_agents; u auth.users; brokerage_name text;
begin
 select * into u from auth.users where id=auth.uid();
 if not found or u.email_confirmed_at is null then raise exception 'Verify your invited email first'; end if;
 select * into p from public.office_agents where id=p_profile and email=lower(trim(u.email)) and status='Invited' and user_id is null and invitation_expires_at>=now();
 if not found or not rv_platform_private.invite_identity_ok_092(u.id,p_profile) then raise exception 'Invitation unavailable or expired. Ask your brokerage to resend it.'; end if;
 if exists(select 1 from public.brokerage_members where user_id=u.id) then raise exception 'This account already belongs to a brokerage. Contact your brokerage administrator.'; end if;
 select name into brokerage_name from public.brokerages where id=p.brokerage_id;
 return jsonb_build_object('id',p.id,'brokerage_id',p.brokerage_id,'brokerage_name',brokerage_name,'email',p.email,'full_name',p.full_name,'phone',p.phone,'license_number',p.license_number,'agent_split',p.agent_split,'monthly_office_fee',p.monthly_office_fee,'monthly_software_fee',p.monthly_software_fee,'monthly_board_fee',p.monthly_board_fee,'fee_gst_rate',p.fee_gst_rate,'billing_method',p.billing_method,'start_date',p.start_date);
end $$;
revoke all on function public.rv_invitation_details(uuid) from public,anon;
grant execute on function public.rv_invitation_details(uuid) to authenticated;


COMMIT;
