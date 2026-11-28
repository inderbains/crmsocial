BEGIN;
ALTER TABLE public.office_bank_accounts ADD COLUMN IF NOT EXISTS rv105_default boolean NOT NULL DEFAULT false;
CREATE UNIQUE INDEX IF NOT EXISTS rv105_one_default_bank_kind ON public.office_bank_accounts(brokerage_id,kind) WHERE rv105_default;
CREATE OR REPLACE FUNCTION public.rv105_set_default_bank(p_account uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE a public.office_bank_accounts;
BEGIN
 SELECT * INTO a FROM public.office_bank_accounts WHERE id=p_account;
 IF NOT FOUND OR auth.uid() IS NULL OR a.brokerage_id IS DISTINCT FROM public.current_brokerage()
 OR public.is_brokerage_admin(a.brokerage_id) IS NOT TRUE OR a.active IS NOT TRUE THEN RAISE EXCEPTION 'Active bank account and brokerage administrator required'; END IF;
 PERFORM id FROM public.office_bank_accounts WHERE brokerage_id=a.brokerage_id AND kind=a.kind ORDER BY id FOR UPDATE;
 IF NOT EXISTS(SELECT 1 FROM public.office_bank_accounts WHERE id=p_account AND active AND brokerage_id=a.brokerage_id AND kind=a.kind) THEN RAISE EXCEPTION 'Account no longer available'; END IF;
 UPDATE public.office_bank_accounts SET rv105_default=false WHERE brokerage_id=a.brokerage_id AND kind=a.kind AND rv105_default AND id<>a.id;
 UPDATE public.office_bank_accounts SET rv105_default=true WHERE id=a.id;
END; $$;
REVOKE ALL ON FUNCTION public.rv105_set_default_bank(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.rv105_set_default_bank(uuid) TO authenticated;
-- Clients can create accounts under existing policies, but cannot set the default directly.
CREATE OR REPLACE FUNCTION public.rv105_guard_bank_default() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF current_user IN ('authenticated','anon') THEN
   IF TG_OP='INSERT' THEN
     IF NEW.rv105_default THEN RAISE EXCEPTION 'Use the default bank account action'; END IF;
   ELSIF NEW.rv105_default IS DISTINCT FROM OLD.rv105_default THEN RAISE EXCEPTION 'Use the default bank account action'; END IF;
 END IF;
 RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS rv105_guard_bank_default ON public.office_bank_accounts;
CREATE TRIGGER rv105_guard_bank_default BEFORE INSERT OR UPDATE ON public.office_bank_accounts FOR EACH ROW EXECUTE FUNCTION public.rv105_guard_bank_default();
COMMIT;
