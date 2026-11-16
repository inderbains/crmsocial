-- RealVolt v1.5 — Open House QR Check-In
-- Requires 002_workspace_properties.sql and 003_crm.sql (plus the rest of your previously installed migrations).
-- Store ONLY public, redistributable marketing PDFs and listing photography in this PUBLIC bucket.
-- Never upload private contracts, client documents, Form B, or personal information.
BEGIN;

CREATE TABLE IF NOT EXISTS public.open_house_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 property_id uuid REFERENCES public.property_pages(id) ON DELETE SET NULL,
 title text NOT NULL CHECK(length(btrim(title)) BETWEEN 2 AND 150),
 address text NOT NULL CHECK(length(btrim(address)) BETWEEN 2 AND 200),
 city text NOT NULL DEFAULT '' CHECK(length(city)<=100),
 starts_at timestamptz NOT NULL,
 ends_at timestamptz NOT NULL,
 timezone text NOT NULL DEFAULT 'America/Vancouver' CHECK(length(timezone) BETWEEN 3 AND 90),
 status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','published','closed')),
 sheet_path text CHECK(length(sheet_path)<=500),
 cover_path text CHECK(length(cover_path)<=500),
 agent_name text NOT NULL DEFAULT '' CHECK(length(agent_name)<=150),
 agent_email text NOT NULL DEFAULT '' CHECK(length(agent_email)<=240),
 agent_phone text NOT NULL DEFAULT '' CHECK(length(agent_phone)<=40),
 brokerage_name text NOT NULL DEFAULT '' CHECK(length(brokerage_name)<=150),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT open_house_time_order CHECK(ends_at>starts_at),
 CONSTRAINT open_house_publish_requires_sheet CHECK(status<>'published' OR sheet_path IS NOT NULL),
 CONSTRAINT open_house_sheet_owned CHECK(sheet_path IS NULL OR starts_with(sheet_path,user_id::text||'/')),
 CONSTRAINT open_house_photo_owned CHECK(cover_path IS NULL OR starts_with(cover_path,user_id::text||'/'))
);
CREATE INDEX IF NOT EXISTS open_house_events_owner ON public.open_house_events(user_id,starts_at DESC);
ALTER TABLE public.open_house_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS open_house_owner ON public.open_house_events;
CREATE POLICY open_house_owner ON public.open_house_events FOR ALL TO authenticated
 USING(user_id=(SELECT auth.uid()))
 WITH CHECK(user_id=(SELECT auth.uid()) AND (property_id IS NULL OR EXISTS(
   SELECT 1 FROM public.property_pages p WHERE p.id=property_id AND p.user_id=(SELECT auth.uid())
 )));
REVOKE ALL ON public.open_house_events FROM public,anon;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.open_house_events TO authenticated;

CREATE TABLE IF NOT EXISTS public.open_house_checkins (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 event_id uuid NOT NULL REFERENCES public.open_house_events(id) ON DELETE CASCADE,
 owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 contact_id uuid REFERENCES public.crm_contacts(id) ON DELETE SET NULL,
 visitor_name text NOT NULL CHECK(length(visitor_name) BETWEEN 2 AND 150),
 visitor_email text NOT NULL CHECK(length(visitor_email) BETWEEN 3 AND 240),
 visitor_phone text NOT NULL CHECK(length(visitor_phone) BETWEEN 5 AND 40),
 marketing_consent boolean NOT NULL DEFAULT false,
 source text NOT NULL DEFAULT 'QR poster' CHECK(length(source)<=80),
 access_token uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
 sheet_opens integer NOT NULL DEFAULT 0 CHECK(sheet_opens>=0),
 created_at timestamptz NOT NULL DEFAULT now(),
 last_seen_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(event_id,visitor_email)
);
CREATE INDEX IF NOT EXISTS open_house_checkins_owner ON public.open_house_checkins(owner_user_id,created_at DESC);
CREATE INDEX IF NOT EXISTS open_house_checkins_event ON public.open_house_checkins(event_id,created_at DESC);
ALTER TABLE public.open_house_checkins ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS open_house_checkins_owner_read ON public.open_house_checkins;
CREATE POLICY open_house_checkins_owner_read ON public.open_house_checkins FOR SELECT TO authenticated
 USING(owner_user_id=(SELECT auth.uid()));
REVOKE ALL ON public.open_house_checkins FROM public,anon,authenticated;
GRANT SELECT ON public.open_house_checkins TO authenticated;

CREATE OR REPLACE FUNCTION public.open_house_event_touch() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN NEW.updated_at=now(); RETURN NEW; END $$;
DROP TRIGGER IF EXISTS open_house_event_touch_trigger ON public.open_house_events;
CREATE TRIGGER open_house_event_touch_trigger BEFORE UPDATE ON public.open_house_events
 FOR EACH ROW EXECUTE FUNCTION public.open_house_event_touch();

-- The bucket is intentionally public: visitors may re-open or share the marketing sheet once obtained.
-- Contact details and CRM entries are NOT stored in this bucket.
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 VALUES('realvolt-openhouse-public','realvolt-openhouse-public',true,10000000,
        ARRAY['application/pdf','image/jpeg','image/png','image/webp'])
 ON CONFLICT(id) DO UPDATE SET public=true,file_size_limit=EXCLUDED.file_size_limit,
 allowed_mime_types=EXCLUDED.allowed_mime_types;
DROP POLICY IF EXISTS open_house_media_upload ON storage.objects;
CREATE POLICY open_house_media_upload ON storage.objects FOR INSERT TO authenticated
 WITH CHECK(bucket_id='realvolt-openhouse-public' AND (storage.foldername(name))[1]=(SELECT auth.uid())::text
 AND lower(storage.extension(name)) IN ('pdf','jpg','jpeg','png','webp'));
DROP POLICY IF EXISTS open_house_media_delete ON storage.objects;
CREATE POLICY open_house_media_delete ON storage.objects FOR DELETE TO authenticated
 USING(bucket_id='realvolt-openhouse-public' AND (storage.foldername(name))[1]=(SELECT auth.uid())::text);
-- No authenticated update policy: each upload receives a new, random storage key.

-- Minimal public event metadata only, never visitor identities or document paths.
CREATE OR REPLACE FUNCTION public.get_public_open_house(p_event_id uuid)
 RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT jsonb_build_object('title',title,'address',address,'city',city,
 'starts_at',starts_at,'ends_at',ends_at,'timezone',timezone,
 'agent_name',agent_name,'agent_email',agent_email,'agent_phone',agent_phone,
 'brokerage_name',brokerage_name,'cover_path',cover_path)
 FROM public.open_house_events WHERE id=p_event_id AND status='published' LIMIT 1;
 $$;
REVOKE ALL ON FUNCTION public.get_public_open_house(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.get_public_open_house(uuid) TO anon,authenticated;

CREATE OR REPLACE FUNCTION public.register_open_house_visitor(
 p_event_id uuid,p_name text,p_email text,p_phone text,
 p_marketing_consent boolean DEFAULT false,p_source text DEFAULT 'QR poster',p_website text DEFAULT ''
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE
 v_event public.open_house_events%ROWTYPE;
 v_name text:=btrim(coalesce(p_name,''));
 v_email text:=lower(btrim(coalesce(p_email,'')));
 v_phone text:=btrim(coalesce(p_phone,''));
 v_source text:=left(regexp_replace(coalesce(p_source,'QR poster'),'[^[:alnum:] _-]','','g'),80);
 v_contact_id uuid;
 v_pass uuid;
 v_new_id uuid;
 v_tag text;
BEGIN
 IF btrim(coalesce(p_website,''))<>'' THEN RETURN jsonb_build_object('ok',true); END IF;
 IF length(v_name) NOT BETWEEN 2 AND 150 OR length(v_email) NOT BETWEEN 3 AND 240
 OR v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
 OR length(v_phone) NOT BETWEEN 5 AND 40 OR length(v_source)<1 THEN
  RAISE EXCEPTION 'Enter a valid name, email and phone number';
 END IF;
 SELECT * INTO v_event FROM public.open_house_events WHERE id=p_event_id AND status='published';
 IF NOT FOUND THEN RAISE EXCEPTION 'This open house is not accepting visitors'; END IF;
 IF EXISTS(SELECT 1 FROM public.open_house_checkins WHERE event_id=p_event_id AND visitor_email=v_email) THEN
  SELECT access_token INTO v_pass FROM public.open_house_checkins WHERE event_id=p_event_id AND visitor_email=v_email;
  UPDATE public.open_house_checkins SET last_seen_at=now() WHERE event_id=p_event_id AND visitor_email=v_email;
  RETURN jsonb_build_object('ok',true,'pass',v_pass);
 END IF;
 -- Match the agent's OWN CRM contact, not a record from another brokerage or user.
 SELECT id INTO v_contact_id FROM public.crm_contacts WHERE user_id=v_event.user_id AND lower(email)=v_email LIMIT 1;
 IF v_contact_id IS NULL THEN
  INSERT INTO public.crm_contacts(user_id,full_name,email,phone,contact_type,stage,source,tags,communication_consent)
  VALUES(v_event.user_id,v_name,v_email,v_phone,'Buyer','New',
   left('Open House - '||v_event.address,150),ARRAY['Open House'],
   CASE WHEN p_marketing_consent THEN 'Opted in' ELSE 'Unknown' END)
  ON CONFLICT DO NOTHING RETURNING id INTO v_contact_id;
  IF v_contact_id IS NULL THEN
   SELECT id INTO v_contact_id FROM public.crm_contacts WHERE user_id=v_event.user_id AND lower(email)=v_email LIMIT 1;
  END IF;
 END IF;
 IF v_contact_id IS NULL THEN RAISE EXCEPTION 'Check-in could not be completed'; END IF;
 UPDATE public.crm_contacts SET tags=(SELECT array_agg(DISTINCT tag) FROM unnest(tags||ARRAY['Open House']) tag)
 WHERE id=v_contact_id AND user_id=v_event.user_id;
 IF coalesce(p_marketing_consent,false) THEN
   UPDATE public.crm_contacts SET communication_consent='Opted in'
   WHERE id=v_contact_id AND user_id=v_event.user_id AND communication_consent='Unknown';
 END IF;
 INSERT INTO public.open_house_checkins(event_id,owner_user_id,contact_id,visitor_name,visitor_email,visitor_phone,marketing_consent,source)
 VALUES(v_event.id,v_event.user_id,v_contact_id,v_name,v_email,v_phone,coalesce(p_marketing_consent,false),v_source)
 ON CONFLICT (event_id,visitor_email) DO NOTHING RETURNING id,access_token INTO v_new_id,v_pass;
 IF v_new_id IS NULL THEN
  SELECT access_token INTO v_pass FROM public.open_house_checkins WHERE event_id=p_event_id AND visitor_email=v_email;
 ELSE
  INSERT INTO public.crm_notes(user_id,contact_id,body,activity_type) VALUES(
    v_event.user_id,v_contact_id,
    'Open House QR check-in at '||v_event.address||' ('||to_char(v_event.starts_at AT TIME ZONE v_event.timezone,'YYYY-MM-DD HH24:MI')||')'||
    '. Source: '||v_source||'. Marketing email consent: '||CASE WHEN p_marketing_consent THEN 'Yes' ELSE 'No' END||'.','Note');
  INSERT INTO public.crm_tasks(user_id,contact_id,title,due_date,priority) VALUES(
   v_event.user_id,v_contact_id,'Follow up: Open House - '||left(v_event.address,125),current_date,'High');
 END IF;
 RETURN jsonb_build_object('ok',true,'pass',v_pass);
END $$;
REVOKE ALL ON FUNCTION public.register_open_house_visitor(uuid,text,text,text,boolean,text,text) FROM public;
GRANT EXECUTE ON FUNCTION public.register_open_house_visitor(uuid,text,text,text,boolean,text,text) TO anon,authenticated;

-- Access token is only provided after registration, allowing the app to count document opens.
-- Public marketing bucket URLs can be forwarded: this is NOT access control for confidential files.
CREATE OR REPLACE FUNCTION public.open_house_sheet_for_pass(p_pass uuid)
 RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_path text;
BEGIN
 UPDATE public.open_house_checkins c SET sheet_opens=sheet_opens+1
 FROM public.open_house_events e
 WHERE c.access_token=p_pass AND e.id=c.event_id AND e.sheet_path IS NOT NULL
 RETURNING e.sheet_path INTO v_path;
 RETURN v_path;
END $$;
REVOKE ALL ON FUNCTION public.open_house_sheet_for_pass(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.open_house_sheet_for_pass(uuid) TO anon,authenticated;
COMMIT;
