-- RealVolt 103: return ONLY the trust account labels attached to an authorized sale.
-- No bank balances, references, other transactions or general account data are exposed.
BEGIN;
CREATE OR REPLACE FUNCTION public.rv103_transaction_trust_summary(p_deal uuid)
RETURNS TABLE(record_scope text, account_label text, has_positive_balance boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE d public.deal_files;
BEGIN
 SELECT * INTO d FROM public.deal_files WHERE id=p_deal AND rv_deleted_at IS NULL;
 IF NOT FOUND OR auth.uid() IS NULL OR d.brokerage_id IS NULL
    OR d.brokerage_id IS DISTINCT FROM public.current_brokerage()
    OR d.kind IS DISTINCT FROM 'Sale'
    OR coalesce(d.rv_stage,'') NOT IN ('Sold','Completed','Archived')
    OR NOT (d.user_id=auth.uid() OR (public.is_brokerage_admin(d.brokerage_id)
       AND public.can_review_deal(d.user_id)
       AND coalesce(d.review_status,'') IN ('Submitted','Approved','Changes requested','Completed')))
 THEN RAISE EXCEPTION 'Transaction trust information unavailable' USING ERRCODE='42501'; END IF;
 RETURN QUERY
 SELECT CASE WHEN l.deal_id=d.id THEN 'sale' ELSE 'linked_listing' END,
        b.name, sum(l.amount)>0
 FROM public.office_ledger l
 JOIN public.office_bank_accounts b ON b.id=l.account_id
 JOIN public.deal_files f ON f.id=l.deal_id
 WHERE l.brokerage_id=d.brokerage_id AND b.brokerage_id=d.brokerage_id AND b.kind='Trust'
   AND f.brokerage_id=d.brokerage_id AND f.user_id=d.user_id AND f.rv_deleted_at IS NULL
   AND (f.id=d.id OR (f.id=d.parent_listing_id AND f.kind='Listing'
      AND coalesce(f.review_status,'') IN ('Submitted','Approved','Changes requested','Completed')))
 GROUP BY l.deal_id,b.id,b.name ORDER BY 1,2;
END $$;
REVOKE ALL ON FUNCTION public.rv103_transaction_trust_summary(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.rv103_transaction_trust_summary(uuid) TO authenticated;
COMMIT;
