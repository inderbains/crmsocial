BEGIN;
-- Harden the existing acceptance RPC; keep its argument names and return type.
-- Lock the verified user, then the exact pending invitation. Do not silently ignore membership conflicts.
create or replace function public.accept_office_invitation(profile_id uuid,agent_name text,agent_phone text,agent_license text)
returns void language plpgsql security definer set search_path='' as $$
declare p public.office_agents; u auth.users;
begin
 select * into u from auth.users where id=auth.uid() for update;
 if not found or u.email_confirmed_at is null then raise exception 'Verify your email before accepting'; end if;
 if nullif(u.encrypted_password,'') is null then raise exception 'Create your password before accepting'; end if;
 select * into p from public.office_agents where id=profile_id for update;
 if not found or p.email is distinct from lower(trim(u.email)) or p.status<>'Invited' or p.user_id is not null or p.invitation_expires_at<now() or not rv_platform_private.invite_identity_ok_092(u.id,profile_id) then raise exception 'Invitation unavailable or expired'; end if;
 if exists(select 1 from public.brokerage_members where user_id=u.id) then raise exception 'Account already belongs to a brokerage'; end if;
 if nullif(trim(agent_name),'') is null or char_length(trim(agent_name))>150 then raise exception 'Enter your name'; end if;
 insert into public.brokerage_members(user_id,brokerage_id,role) values(u.id,p.brokerage_id,'agent');
 update public.office_agents set user_id=u.id,full_name=trim(agent_name),phone=coalesce(agent_phone,''),license_number=coalesce(agent_license,''),status='Active',accepted_at=now() where id=p.id;
 insert into public.transaction_reviewers(agent_id,admin_id) values(u.id,p.reviewer_id) on conflict(agent_id) do update set admin_id=excluded.admin_id;
 insert into public.agent_workspace_profiles(user_id,full_name) values(u.id,trim(agent_name)) on conflict(user_id) do update set full_name=excluded.full_name;
end $$;
revoke all on function public.accept_office_invitation(uuid,text,text,text) from public,anon;
revoke all on function public.accept_office_invitation(uuid,text,text,text) from authenticated; -- only the checked wrapper may invoke it
-- Verify the same terms under lock before accepting, avoiding concurrent admin edits.
create or replace function public.rv_accept_invitation(p_profile uuid,p_name text,p_phone text,p_licence text,p_expected jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare actual jsonb;
begin
 perform 1 from auth.users where id=auth.uid() for update;
 if not found then raise exception 'Verify your email first'; end if;
 perform 1 from public.office_agents where id=p_profile for update;
 actual:=public.rv_invitation_details(p_profile);
 if actual is distinct from p_expected then raise exception 'Invitation terms changed. Review them again before accepting.'; end if;
 perform public.accept_office_invitation(p_profile,p_name,p_phone,p_licence);
end $$;
revoke all on function public.rv_accept_invitation(uuid,text,text,text,jsonb) from public,anon;
grant execute on function public.rv_accept_invitation(uuid,text,text,text,jsonb) to authenticated;


COMMIT;
