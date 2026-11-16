-- RealVolt v1.5.3: agent-editable public marketing profile + five QR-poster styles.
-- REQUIRES 008_personal_workspace.sql and 021_open_house_qr_checkin.sql.
-- Additive and safe to re-run. Does not change billing, office roles, or visitors.
BEGIN;
ALTER TABLE public.agent_workspace_profiles
 ADD COLUMN IF NOT EXISTS professional_title text NOT NULL DEFAULT 'REALTOR®',
 ADD COLUMN IF NOT EXISTS biography text NOT NULL DEFAULT '',
 ADD COLUMN IF NOT EXISTS public_email text NOT NULL DEFAULT '',
 ADD COLUMN IF NOT EXISTS public_phone text NOT NULL DEFAULT '',
 ADD COLUMN IF NOT EXISTS license_number text NOT NULL DEFAULT '',
 ADD COLUMN IF NOT EXISTS website_url text NOT NULL DEFAULT '',
 ADD COLUMN IF NOT EXISTS headshot_path text NOT NULL DEFAULT '',
 ADD COLUMN IF NOT EXISTS logo_path text NOT NULL DEFAULT '';

DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='rv_agent_marketing_profile_lengths') THEN
  ALTER TABLE public.agent_workspace_profiles ADD CONSTRAINT rv_agent_marketing_profile_lengths CHECK (
    length(professional_title)<=100 AND length(biography)<=1800 AND
    length(public_email)<=240 AND length(public_phone)<=40 AND
    length(license_number)<=70 AND length(website_url)<=300 AND
    length(headshot_path)<=500 AND length(logo_path)<=500
  );
 END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='rv_agent_marketing_profile_owner_files') THEN
  ALTER TABLE public.agent_workspace_profiles ADD CONSTRAINT rv_agent_marketing_profile_owner_files CHECK (
   (headshot_path='' OR starts_with(headshot_path,user_id::text||'/')) AND
   (logo_path='' OR starts_with(logo_path,user_id::text||'/'))
  );
 END IF;
END $$;

-- The bucket stores ONLY marketing imagery intended to appear on public signs.
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 VALUES('realvolt-agent-brand-public','realvolt-agent-brand-public',true,5000000,
 ARRAY['image/jpeg','image/png','image/webp'])
 ON CONFLICT (id) DO UPDATE SET public=true,file_size_limit=EXCLUDED.file_size_limit,
 allowed_mime_types=EXCLUDED.allowed_mime_types;
DROP POLICY IF EXISTS rv_agent_media_insert ON storage.objects;
CREATE POLICY rv_agent_media_insert ON storage.objects FOR INSERT TO authenticated
 WITH CHECK(bucket_id='realvolt-agent-brand-public'
  AND (storage.foldername(name))[1]=(SELECT auth.uid())::text
  AND lower(storage.extension(name)) IN ('jpg','jpeg','png','webp'));
DROP POLICY IF EXISTS rv_agent_media_delete ON storage.objects;
CREATE POLICY rv_agent_media_delete ON storage.objects FOR DELETE TO authenticated
 USING(bucket_id='realvolt-agent-brand-public'
  AND (storage.foldername(name))[1]=(SELECT auth.uid())::text);

ALTER TABLE public.open_house_events
 ADD COLUMN IF NOT EXISTS poster_template text NOT NULL DEFAULT 'classic';
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='rv_open_house_poster_template') THEN
  ALTER TABLE public.open_house_events ADD CONSTRAINT rv_open_house_poster_template
   CHECK(poster_template IN ('classic','modern','luxury','minimal','bold'));
 END IF;
END $$;
COMMIT;
