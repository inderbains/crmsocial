-- RealVolt v1.5.8 — Public marketing profile connection.
-- Run AFTER 022_agent_marketing_profile_open_house_templates.sql and
-- 024_rv_agent_website_studio.sql. Additive; no Open House changes.
-- SECURITY: only public marketing fields are copied. Never copy office_agents or billing data.

BEGIN;
ALTER TABLE public.rv_agent_sites
  ADD COLUMN IF NOT EXISTS use_profile_identity boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS professional_title text NOT NULL DEFAULT 'REALTOR®',
  ADD COLUMN IF NOT EXISTS license_number text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS headshot_path text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS logo_path text NOT NULL DEFAULT '';

-- Backfill previously created websites using the public profile identity.
UPDATE public.rv_agent_sites s
SET display_name = COALESCE(NULLIF(p.full_name,''),s.display_name),
    professional_title = COALESCE(p.professional_title,'REALTOR®'),
    biography = COALESCE(p.biography,''),
    public_email = COALESCE(p.public_email,''),
    public_phone = COALESCE(p.public_phone,''),
    license_number = COALESCE(p.license_number,''),
    headshot_path = COALESCE(p.headshot_path,''),
    logo_path = COALESCE(p.logo_path,''),
    updated_at = now()
FROM public.agent_workspace_profiles p
WHERE s.owner_user_id = p.user_id AND s.use_profile_identity = true;

CREATE OR REPLACE FUNCTION public.rv_sync_site_public_marketing_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.rv_agent_sites AS s
  SET display_name = COALESCE(NULLIF(NEW.full_name,''),s.display_name),
      professional_title = COALESCE(NEW.professional_title,'REALTOR®'),
      biography = COALESCE(NEW.biography,''),
      public_email = COALESCE(NEW.public_email,''),
      public_phone = COALESCE(NEW.public_phone,''),
      license_number = COALESCE(NEW.license_number,''),
      headshot_path = COALESCE(NEW.headshot_path,''),
      logo_path = COALESCE(NEW.logo_path,''),
      updated_at = now()
  WHERE s.owner_user_id = NEW.user_id AND s.use_profile_identity = true;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS rv_agent_site_public_profile_sync ON public.agent_workspace_profiles;
CREATE TRIGGER rv_agent_site_public_profile_sync
AFTER INSERT OR UPDATE OF full_name,professional_title,biography,public_email,public_phone,
  license_number,headshot_path,logo_path
ON public.agent_workspace_profiles
FOR EACH ROW EXECUTE FUNCTION public.rv_sync_site_public_marketing_profile();

REVOKE ALL ON FUNCTION public.rv_sync_site_public_marketing_profile() FROM PUBLIC;
-- The trigger executes as the function owner; the function is not exposed via RPC.
COMMIT;
