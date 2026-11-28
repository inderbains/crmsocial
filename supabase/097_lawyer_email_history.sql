-- Read-only compliance email summary. Existing row-level security remains in force.
BEGIN;
CREATE OR REPLACE FUNCTION public.rv_lawyer_email_history_097(p_deal uuid)
RETURNS TABLE(id uuid,recipient_email text,recipient_name text,side text,status text,created_at timestamptz,created_by uuid,provider_id text,error text,sender text,reply_to text,subject text,attachment_names jsonb)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT c.id,c.recipient_email,c.recipient_name,c.side,c.status,c.created_at,c.created_by,c.provider_id,c.error,
 c.payload->>'from',c.payload->>'reply_to',c.payload->>'subject',
 COALESCE((SELECT jsonb_agg(a.value->>'filename' ORDER BY a.ordinality) FROM jsonb_array_elements(CASE WHEN jsonb_typeof(c.payload->'attachments')='array' THEN c.payload->'attachments' ELSE '[]'::jsonb END) WITH ORDINALITY AS a(value,ordinality)),'[]'::jsonb)
 FROM public.closing_deliveries c JOIN public.deal_files d ON d.id=c.deal_id AND d.brokerage_id=c.brokerage_id
 WHERE c.deal_id=p_deal AND d.brokerage_id=public.current_brokerage() AND public.can_review_deal(d.user_id)
 ORDER BY c.created_at DESC,c.id DESC;
$$;
REVOKE ALL ON FUNCTION public.rv_lawyer_email_history_097(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.rv_lawyer_email_history_097(uuid) TO authenticated;
COMMIT;
