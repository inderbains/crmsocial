BEGIN;
CREATE TABLE IF NOT EXISTS public.rv109_office_expenses (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), brokerage_id uuid NOT NULL REFERENCES public.brokerages(id),
 bank_line_id uuid NOT NULL UNIQUE REFERENCES public.office_bank_lines(id), ledger_id uuid NOT NULL UNIQUE REFERENCES public.office_ledger(id),
 expense_date date NOT NULL, category text NOT NULL CHECK (length(trim(category)) BETWEEN 1 AND 100),
 vendor text NOT NULL CHECK (length(trim(vendor)) BETWEEN 1 AND 200), invoice_ref text NOT NULL DEFAULT '',
 total numeric(15,2) NOT NULL CHECK(total>0), gst numeric(15,2) NOT NULL CHECK(gst>=0 AND gst<=total),
 created_by uuid NOT NULL REFERENCES auth.users(id), created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.rv109_office_expenses ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.rv109_office_expenses FROM anon,authenticated;
GRANT SELECT ON public.rv109_office_expenses TO authenticated;
DROP POLICY IF EXISTS rv109_office_expense_read ON public.rv109_office_expenses;
CREATE POLICY rv109_office_expense_read ON public.rv109_office_expenses FOR SELECT TO authenticated USING(public.is_brokerage_admin(brokerage_id));
CREATE OR REPLACE FUNCTION public.rv109_post_expense(p_bank_line uuid,p_category text,p_vendor text,p_gst numeric,p_invoice_ref text,p_confirm boolean)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE b public.office_bank_lines; a public.office_bank_accounts; entry_id uuid; expense_id uuid;
BEGIN
 IF auth.uid() IS NULL OR p_confirm IS DISTINCT FROM true THEN RAISE EXCEPTION 'Explicit expense confirmation required'; END IF;
 SELECT * INTO b FROM public.office_bank_lines WHERE id=p_bank_line;
 IF NOT FOUND OR NOT public.is_brokerage_admin(b.brokerage_id) THEN RAISE EXCEPTION 'Brokerage admin required'; END IF;
 SELECT * INTO a FROM public.office_bank_accounts WHERE id=b.account_id FOR UPDATE;
 IF NOT FOUND OR a.brokerage_id<>b.brokerage_id OR a.kind<>'Operating' OR NOT a.active THEN RAISE EXCEPTION 'Expenses may only be recorded from an active General account'; END IF;
 SELECT * INTO b FROM public.office_bank_lines WHERE id=p_bank_line FOR UPDATE;
 IF NOT FOUND OR b.account_id<>a.id OR b.brokerage_id<>a.brokerage_id OR b.amount>=0 THEN RAISE EXCEPTION 'Select an unmatched General withdrawal'; END IF;
 IF b.entry_date>(now() AT TIME ZONE 'America/Vancouver')::date THEN RAISE EXCEPTION 'Future bank dates not allowed'; END IF;
 IF EXISTS(SELECT 1 FROM public.office_bank_matches WHERE bank_line_id=b.id) THEN RAISE EXCEPTION 'Statement line already matched'; END IF;
 IF EXISTS(SELECT 1 FROM public.office_ledger l WHERE l.account_id=a.id AND l.amount=b.amount AND NOT EXISTS(SELECT 1 FROM public.office_bank_matches m WHERE m.ledger_id=l.id)) THEN RAISE EXCEPTION 'A possible existing payment has the same amount. Match or review existing entries before posting an expense'; END IF;
 IF p_gst IS NULL OR p_gst<0 OR p_gst>abs(b.amount) OR p_gst<>round(p_gst,2) OR p_category IS NULL OR length(trim(p_category)) NOT BETWEEN 1 AND 100 OR p_vendor IS NULL OR length(trim(p_vendor)) NOT BETWEEN 1 AND 200 OR length(coalesce(p_invoice_ref,''))>300 THEN RAISE EXCEPTION 'Invalid category, vendor, GST or invoice reference'; END IF;
 -- Existing posting and matching functions enforce frozen periods and tenant isolation.
 entry_id:=public.post_office_entry(a.id,NULL,b.entry_date,'Expense: '||trim(p_category)||' — '||trim(p_vendor),b.amount,coalesce(p_invoice_ref,''),NULL);
 PERFORM public.match_office_bank(b.id,entry_id);
 INSERT INTO public.rv109_office_expenses(brokerage_id,bank_line_id,ledger_id,expense_date,category,vendor,invoice_ref,total,gst,created_by)
 VALUES(b.brokerage_id,b.id,entry_id,b.entry_date,trim(p_category),trim(p_vendor),coalesce(p_invoice_ref,''),abs(b.amount),p_gst,auth.uid()) RETURNING id INTO expense_id;
 RETURN expense_id;
END;
$$;
REVOKE ALL ON FUNCTION public.rv109_post_expense(uuid,text,text,numeric,text,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.rv109_post_expense(uuid,text,text,numeric,text,boolean) TO authenticated;
COMMIT;
