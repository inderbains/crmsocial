-- RealVolt 059 — one firm-sale submission with lawyers, commission + GST, and deposit holder.
-- Requires schema and RPC migrations through 056. Test on staging and back up first.
-- The wrapper intentionally calls the existing 050 firm action and 047 post-firm RPCs
-- within ONE PostgreSQL transaction: any error rolls back both stage changes.
BEGIN;

CREATE OR REPLACE FUNCTION public.rv059_submit_firm_with_details(
  p_deal uuid,
  p_date date,
  p_document uuid,
  p_outcome text,
  p_buyer_lawyer uuid,
  p_seller_lawyer uuid,
  p_listing_commission numeric,
  p_selling_commission numeric,
  p_gst_rate numeric,
  p_deposit_amount numeric,
  p_deposit_holder text,
  p_deposit_brokerage text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  d public.deal_files;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in required'; END IF;
  SELECT * INTO d FROM public.deal_files WHERE id=p_deal FOR UPDATE;
  IF NOT FOUND OR d.kind <> 'Sale' OR d.user_id <> auth.uid()
     OR d.brokerage_id IS DISTINCT FROM public.current_brokerage()
     OR coalesce(d.rv_stage,'Accepted offer') <> 'Accepted offer'
     OR d.review_status NOT IN ('Draft','Changes requested','Approved','Submitted')
  THEN RAISE EXCEPTION 'This accepted-offer file is not available for firm-sale submission'; END IF;

  IF p_outcome NOT IN ('subject_removed','direct_sold') OR p_outcome IS NULL THEN
    RAISE EXCEPTION 'Choose Subjects Removed or Direct Sold'; END IF;
  IF p_buyer_lawyer IS NULL OR p_seller_lawyer IS NULL THEN
    RAISE EXCEPTION 'Both buyer and seller lawyer contacts are required'; END IF;
  IF p_deposit_holder NOT IN ('our_brokerage','other_brokerage') OR p_deposit_holder IS NULL THEN
    RAISE EXCEPTION 'Select who holds the deposit'; END IF;
  IF p_deposit_holder='other_brokerage' AND btrim(coalesce(p_deposit_brokerage,''))='' THEN
    RAISE EXCEPTION 'Name the other brokerage holding the deposit'; END IF;
  IF p_gst_rate IS NULL OR p_gst_rate<0 OR p_gst_rate>100 OR
     p_listing_commission IS NULL OR p_selling_commission IS NULL OR
     p_listing_commission<0 OR p_selling_commission<0 OR p_deposit_amount IS NULL OR p_deposit_amount<0 THEN
    RAISE EXCEPTION 'Enter valid nonnegative commission, GST rate and deposit amounts'; END IF;
  -- A standalone sale has one internal Realtor. A sale of our own listing
  -- records both brokerage sides, not an automatic second agent payout.
  IF d.parent_listing_id IS NULL THEN
    IF (d.representation='selling' AND (p_listing_commission<>0 OR p_selling_commission<=0))
       OR (d.representation='listing' AND (p_selling_commission<>0 OR p_listing_commission<=0)) THEN
      RAISE EXCEPTION 'Sale-only files require only our Realtor commission on the represented side'; END IF;
  ELSE
    IF p_listing_commission+p_selling_commission<=0 THEN
      RAISE EXCEPTION 'Enter the listing and selling side commission amounts'; END IF;
  END IF;

  -- Both called functions enforce existing role, file, document and lawyer checks.
  -- Errors in either function roll back the entire submission automatically.
  PERFORM public.rv_tx_action(p_deal,'firm',p_date,p_document,
      CASE WHEN p_outcome='direct_sold' THEN 'direct_sold_no_subjects' ELSE 'subject_removed' END);
  PERFORM public.rv_save_post_firm_details(
      p_deal,p_buyer_lawyer,p_seller_lawyer,
      p_listing_commission,p_selling_commission,p_gst_rate,
      p_deposit_amount,p_deposit_holder,p_deposit_brokerage);
END $$;

REVOKE ALL ON FUNCTION public.rv059_submit_firm_with_details(uuid,date,uuid,text,uuid,uuid,numeric,numeric,numeric,numeric,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.rv059_submit_firm_with_details(uuid,date,uuid,text,uuid,uuid,numeric,numeric,numeric,numeric,text,text) TO authenticated;
COMMIT;
