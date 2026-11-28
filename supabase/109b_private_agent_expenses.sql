BEGIN;
CREATE TABLE IF NOT EXISTS public.rv109_agent_expenses (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
 expense_date date NOT NULL, category text NOT NULL CHECK(length(trim(category)) BETWEEN 1 AND 100),
 vendor text NOT NULL CHECK(length(trim(vendor)) BETWEEN 1 AND 200), invoice_ref text NOT NULL DEFAULT '',
 total numeric(15,2) NOT NULL CHECK(total>0), gst numeric(15,2) NOT NULL CHECK(gst>=0 AND gst<=total),
 created_at timestamptz NOT NULL DEFAULT now(), CHECK(length(invoice_ref)<=300)
);
ALTER TABLE public.rv109_agent_expenses ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.rv109_agent_expenses FROM anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.rv109_agent_expenses TO authenticated;
DROP POLICY IF EXISTS rv109_private_expenses ON public.rv109_agent_expenses;
CREATE POLICY rv109_private_expenses ON public.rv109_agent_expenses FOR ALL TO authenticated USING(user_id=auth.uid()) WITH CHECK(user_id=auth.uid());
COMMIT;
