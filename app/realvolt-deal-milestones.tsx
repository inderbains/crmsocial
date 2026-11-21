'use client';
import {useCallback,useEffect,useMemo,useState,type FormEvent} from 'react';
import {ArrowRight,CheckCircle2,FileText,RefreshCcw} from 'lucide-react';
import {getSupabase} from '../lib/supabase';
import s from './realvolt-enhancements.module.css';
type Link={id:string;user_id:string;contact_id:string;deal_id:string;relationship:string};
type Contact={id:string;full_name:string;stage:string};
type Deal={id:string;address:string;completion_date:string|null;review_status:string};
type Milestone={id:string;contact_id:string;deal_id:string;event_type:string;evidence_note:string;previous_stage:string;resulting_stage:string;created_at:string};
const eventKinds=['Offer submitted','Firm contract','Completion confirmed'] as const;
export default function DealMilestones({userId,notify}:{userId:string;notify:(message:string)=>void}){
 const [links,setLinks]=useState<Link[]>([]),[contacts,setContacts]=useState<Contact[]>([]),[deals,setDeals]=useState<Deal[]>([]),[events,setEvents]=useState<Milestone[]>([]);
 const [linkId,setLinkId]=useState(''),[kind,setKind]=useState<typeof eventKinds[number]>('Offer submitted'),[evidence,setEvidence]=useState(''),[loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[error,setError]=useState('');
 const load=useCallback(async()=>{
  const db=getSupabase();if(!db){setError('Supabase is not configured.');setLoading(false);return;}
  setLoading(true);
  const [l,c,d,m]=await Promise.all([
   db.from('rvcrm_contact_deals').select('id,user_id,contact_id,deal_id,relationship').eq('user_id',userId).limit(500),
   db.from('crm_contacts').select('id,full_name,stage').eq('user_id',userId).limit(500),
   db.from('deal_files').select('id,address,completion_date,review_status').eq('user_id',userId).limit(500),
   db.from('rvcrm_deal_milestones').select('id,contact_id,deal_id,event_type,evidence_note,previous_stage,resulting_stage,created_at').eq('user_id',userId).order('created_at',{ascending:false}).limit(100)
  ]);
  const failure=[l.error,c.error,d.error,m.error].find(Boolean);
  if(failure)setError(failure.message+' — Check that SQL 031 and the Real Estate CRM profile migration are installed.');
  else{setError('');setLinks(l.data||[]);setContacts(c.data||[]);setDeals(d.data||[]);setEvents(m.data||[]);setLinkId(old=>old||l.data?.[0]?.id||'');}
  setLoading(false);
 },[userId]);
 useEffect(()=>{void load()},[load]);
 const selected=links.find(x=>x.id===linkId);
 const client=contacts.find(x=>x.id===selected?.contact_id),deal=deals.find(x=>x.id===selected?.deal_id);
 const timeline=useMemo(()=>events.filter(e=>e.contact_id===selected?.contact_id && e.deal_id===selected?.deal_id),[events,selected?.contact_id,selected?.deal_id]);
 async function save(e:FormEvent){e.preventDefault();if(!selected||!deal||saving)return;
  if(evidence.trim().length<10)return notify('Add at least 10 characters explaining which document or confirmation supports this milestone.');
  if(kind==='Completion confirmed'){
   if(!deal.completion_date)return notify('Set the actual completion date in Transactions first.');
   if(!window.confirm(`Confirm legal completion for ${client?.full_name||'this client'} at ${deal.address}? This will mark their CRM stage Closed.`))return;
  }
  setSaving(true);
  const {error:saveError}=await getSupabase()!.from('rvcrm_deal_milestones').insert({user_id:userId,contact_id:selected.contact_id,deal_id:selected.deal_id,event_type:kind,evidence_note:evidence.trim()});
  if(saveError)notify('Milestone not saved: '+saveError.message);
  else{notify('Verified milestone recorded. Eligible CRM stage updated.');setEvidence('');await load();}
  setSaving(false);
 }
 return <section className={s.wrap}>
  <header className={s.head}><div><span className={s.eyebrow}>CRM / TRANSACTION SYNC</span><h1>Deal milestones</h1><p>Move the existing funnel using verified real-world events—not guesses or review status.</p></div><button className={s.secondary} type="button" onClick={()=>void load()}><RefreshCcw size={16}/> Refresh</button></header>
  <div className={s.notice}><CheckCircle2 size={19}/><span>Offers are recorded as events. A submitted offer can move an early lead to <b>Active</b>. Firm contracts move to <b>Under contract</b>, and legal completion moves to <b>Closed</b>. No payments or documents are changed.</span></div>
  {error&&<p className={s.error} role="alert">{error}</p>}
  <div className={s.gridTwo}>
   <div className={s.panel}><h2>Record a verified milestone</h2>
    <form onSubmit={save} className={s.form}>
     <label>Linked CRM contact and transaction<select value={linkId} onChange={e=>setLinkId(e.target.value)} disabled={loading} required><option value="">Choose linked transaction…</option>{links.map(l=><option key={l.id} value={l.id}>{contacts.find(c=>c.id===l.contact_id)?.full_name||'Contact'} — {deals.find(d=>d.id===l.deal_id)?.address||'Transaction'}</option>)}</select></label>
     {client&&<p className={s.muted}>Current pipeline stage: <b>{client.stage}</b> · Transaction review: {deal?.review_status||'—'}</p>}
     <label>Verified event<select value={kind} onChange={e=>setKind(e.target.value as typeof kind)}>{eventKinds.map(x=><option key={x}>{x}</option>)}</select></label>
     <label>Evidence / document reference<textarea rows={4} maxLength={2000} value={evidence} onChange={e=>setEvidence(e.target.value)} placeholder="E.g. signed offer dated..., subjects removed in writing..., completion confirmed by lawyer..." required/></label>
     {kind==='Completion confirmed'&&<p className={s.muted}>Transaction completion date: <b>{deal?.completion_date||'Not set'}</b>. RealVolt requires a recorded firm contract and a non-future completion date.</p>}
     <button className={s.primary} disabled={!linkId||evidence.trim().length<10||saving}>{saving?'Saving…':'Record milestone'} <ArrowRight size={16}/></button>
    </form>
    {!links.length&&!loading&&<p className={s.muted}>First link a contact to a transaction in Real Estate CRM. This page does not make duplicate deals.</p>}
   </div>
   <div className={s.panel}><h2>Recorded history</h2><p className={s.muted}>Agent-private audit history. Milestones cannot be edited or deleted here.</p>
    {timeline.length?timeline.map(ev=><div className={s.history} key={ev.id}><FileText size={18}/><div><b>{ev.event_type}</b><p>{ev.previous_stage} → {ev.resulting_stage} · {new Date(ev.created_at).toLocaleDateString('en-CA')}</p><p>{ev.evidence_note}</p></div></div>):<p className={s.empty}>No milestones recorded for this contact and transaction.</p>}
   </div>
  </div>
 </section>;
}
