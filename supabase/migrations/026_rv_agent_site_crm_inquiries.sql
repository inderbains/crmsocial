-- RealVolt v1.6.2: published agent website Contact -> owner's CRM.
-- Run once in Supabase SQL Editor AFTER 003_crm.sql, 024 and 025.
-- No follow-ups, notifications, campaigns or marketing consent are created.
-- Only the Hostinger server's service_role can call this function.

BEGIN;

CREATE TABLE IF NOT EXISTS public.rv_agent_site_contact_limits (
  site_id uuid NOT NULL REFERENCES public.rv_agent_sites(id) ON DELETE CASCADE,
  bucket_start timestamptz NOT NULL,
  submissions integer NOT NULL DEFAULT 0 CHECK (submissions > 0),
  PRIMARY KEY (site_id, bucket_start)
);

CREATE TABLE IF NOT EXISTS public.rv_agent_site_contact_receipts (
  site_id uuid NOT NULL REFERENCES public.rv_agent_sites(id) ON DELETE CASCADE,
  request_id uuid NOT NULL,
  contact_id uuid NOT NULL REFERENCES public.crm_contacts(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (site_id, request_id)
);
CREATE INDEX IF NOT EXISTS rv_agent_site_contact_receipts_date_idx
  ON public.rv_agent_site_contact_receipts (site_id, created_at DESC);

ALTER TABLE public.rv_agent_site_contact_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rv_agent_site_contact_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.rv_agent_site_contact_limits FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.rv_agent_site_contact_receipts FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rv_agent_site_contact_limits TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rv_agent_site_contact_receipts TO service_role;

CREATE OR REPLACE FUNCTION public.rv_capture_agent_site_inquiry(
  p_slug text,
  p_request_id uuid,
  p_name text,
  p_email text,
  p_phone text,
  p_interest text,
  p_message text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_site record;
  v_contact_id uuid;
  v_count integer;
  v_bucket timestamptz;
  v_email text;
  v_name text;
  v_phone text;
  v_message text;
  v_type text;
BEGIN
  IF p_request_id IS NULL THEN
    RAISE EXCEPTION 'INVALID_INQUIRY';
  END IF;

  -- Serialize retries of the same request so one visitor action creates one note.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext(p_slug), pg_catalog.hashtext(p_request_id::text)
  );

  SELECT id, owner_user_id, display_name
    INTO v_site
  FROM public.rv_agent_sites
  WHERE slug = p_slug AND published = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'WEBSITE_NOT_AVAILABLE';
  END IF;

  SELECT r.contact_id INTO v_contact_id
  FROM public.rv_agent_site_contact_receipts r
  WHERE r.site_id = v_site.id AND r.request_id = p_request_id;
  IF FOUND THEN RETURN v_contact_id; END IF;

  v_email := pg_catalog.lower(pg_catalog.btrim(p_email));
  v_name := pg_catalog.btrim(p_name);
  v_phone := pg_catalog.btrim(COALESCE(p_phone,''));
  v_message := pg_catalog.btrim(p_message);

  IF v_name IS NULL OR pg_catalog.char_length(v_name) NOT BETWEEN 1 AND 120
     OR v_email IS NULL OR pg_catalog.char_length(v_email) NOT BETWEEN 3 AND 200
     OR v_email !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
     OR pg_catalog.char_length(v_phone) > 50
     OR v_message IS NULL OR pg_catalog.char_length(v_message) NOT BETWEEN 1 AND 4000
     OR p_interest IS NULL
     OR p_interest NOT IN ('Buying a home','Selling a home','Property valuation','General question')
  THEN
    RAISE EXCEPTION 'INVALID_INQUIRY';
  END IF;

  -- Transactional per-website cap: 30 requests every 10 minutes.
  -- This protects small agent sites from basic high-volume spam; add CAPTCHA
  -- or perimeter rate limits if you later receive serious bot traffic.
  v_bucket := pg_catalog.date_bin(
    '10 minutes'::interval, pg_catalog.clock_timestamp(),
    '2000-01-01 00:00+00'::timestamptz
  );
  INSERT INTO public.rv_agent_site_contact_limits (site_id, bucket_start, submissions)
  VALUES (v_site.id, v_bucket, 1)
  ON CONFLICT (site_id, bucket_start) DO UPDATE
    SET submissions = public.rv_agent_site_contact_limits.submissions + 1
    WHERE public.rv_agent_site_contact_limits.submissions < 30
  RETURNING submissions INTO v_count;
  IF v_count IS NULL THEN RAISE EXCEPTION 'RATE_LIMIT'; END IF;
  DELETE FROM public.rv_agent_site_contact_limits
  WHERE site_id = v_site.id AND bucket_start < pg_catalog.now() - interval '1 day';

  v_type := CASE
    WHEN p_interest = 'Buying a home' THEN 'Buyer'
    WHEN p_interest IN ('Selling a home','Property valuation') THEN 'Seller'
    ELSE 'Other'
  END;

  -- CRM has a unique index on (user_id, lower(email)) for nonempty emails.
  -- Keep an existing lead's stage/assigned agent/consent; add a new note instead.
  INSERT INTO public.crm_contacts (
    user_id, full_name, email, phone, contact_type, stage,
    source, assigned_to, tags, communication_consent
  ) VALUES (
    v_site.owner_user_id, v_name, v_email, v_phone, v_type, 'New',
    'Agent Website', COALESCE(v_site.display_name,''),
    ARRAY['Agent Website', p_slug], 'Unknown'
  )
  ON CONFLICT (user_id, (pg_catalog.lower(email))) WHERE email <> ''
  DO UPDATE SET phone = CASE
    WHEN COALESCE(public.crm_contacts.phone,'') = '' THEN EXCLUDED.phone
    ELSE public.crm_contacts.phone END
  RETURNING id INTO v_contact_id;

  INSERT INTO public.crm_notes (user_id, contact_id, body, activity_type)
  VALUES (
    v_site.owner_user_id,
    v_contact_id,
    'Website contact inquiry' || pg_catalog.chr(10) ||
    'Website: ' || p_slug || pg_catalog.chr(10) ||
    'Interest: ' || p_interest || pg_catalog.chr(10) ||
    'Message: ' || v_message,
    'Note'
  );

  INSERT INTO public.rv_agent_site_contact_receipts(site_id, request_id, contact_id)
  VALUES (v_site.id, p_request_id, v_contact_id);

  RETURN v_contact_id;
END;
$$;

-- A SECURITY DEFINER function must never be callable directly by visitors.
REVOKE ALL ON FUNCTION public.rv_capture_agent_site_inquiry(
  text, uuid, text, text, text, text, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rv_capture_agent_site_inquiry(
  text, uuid, text, text, text, text, text
) TO service_role;

COMMIT;
