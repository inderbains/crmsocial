'use client';
import {useCallback,useEffect,useState,type FormEvent} from 'react';
import {CheckCircle2,RefreshCw} from 'lucide-react';
import {getSupabase} from '../lib/supabase';

type Property={id:string;payload:{address?:string;title?:string;status?:string};published:boolean};
type Seller={id:string;full_name:string;email:string;contact_type:string};
type Plan={id:string;property_id:string;contact_id:string;created_at:string};
export default function PostSaleFollowups({userId,notify}:{userId:string;notify:(s:string)=>void}){
 const [homes,setHomes]=useState<Property[]>([]),[sellers,setSellers]=useState<Seller[]>([]),[plans,setPlans]=useState<Plan[]>([]),[propertyId,setPropertyId]=useState(''),[contactId,setContactId]=useState(''),[saving,setSaving]=useState(false),[loading,setLoading]=useState(true),[error,setError]=useState('');
 const refresh=useCallback(async()=>{const db=getSupabase();if(!db)return;setLoading(true);const [p,c,plans]=await Promise.all([
  db.from('property_pages').select('id,payload,published').eq('user_id',userId),
  db.from('crm_contacts').select('id,full_name,email,contact_type').eq('user_id',userId).in('contact_type',['Seller','Buyer & seller']).order('full_name'),
  db.from('rv_post_sale_followup_plans').select('id,property_id,contact_id,created_at').eq('user_id',userId).order('created_at',{ascending:false})]);
  if(p.error||c.error||plans.error)setError('Run migration 020 first. '+(p.error||c.error||plans.error)!.message);else{setError('');setHomes((p.data||[]) as Property[]);setSellers((c.data||[]) as Seller[]);setPlans((plans.data||[]) as Plan[]);}setLoading(false);
 },[userId]);
 useEffect(()=>{void refresh()},[refresh]);
 async function create(e:FormEvent){e.preventDefault();if(!propertyId||!contactId)return;const db=getSupabase();if(!db)return;setSaving(true);
  try{const result=await db.rpc('rv_create_post_sale_followups',{p_property_id:propertyId,p_contact_id:contactId});if(result.error)throw result.error;notify(result.data?'Three seller follow-up tasks created in CRM. No emails sent.':'This property and seller already have a follow-up plan.');await refresh();}
  catch(err){notify('Could not create follow-ups: '+(err as Error).message)}finally{setSaving(false)}
 }
 const sold=homes.filter(h=>['sold','closed'].includes((h.payload.status||'').toLowerCase()));
 return <><div className="headrow"><div><h1>Post-Sale Follow-Ups</h1><p>Prepare seller appreciation, testimonial and referral tasks after a verified sale.</p></div><button className="btn" disabled={loading} onClick={()=>void refresh()}><RefreshCw size={16}/> Refresh</button></div>
 <div className="notice"><CheckCircle2 size={18}/><div><b>CRM task automation — no email is sent.</b><p>Verify the sale before marking a property sold. This action creates three dated follow-up tasks only once per property and seller: thank-you (2 days), testimonial (7 days), referral (30 days).</p></div></div>
 {error&&<div className="notice" role="alert">{error}</div>}
 <div className="rv-dashboard-grid"><section className="panel"><h2>Create seller follow-up plan</h2><form onSubmit={create}><div className="field"><label htmlFor="rv-sale-property">Sold property</label><select id="rv-sale-property" required value={propertyId} onChange={e=>setPropertyId(e.target.value)}><option value="">Select sold property</option>{sold.map(p=><option key={p.id} value={p.id}>{p.payload.address||p.payload.title||'Property'}</option>)}</select></div><div className="field"><label htmlFor="rv-sale-seller">Seller contact</label><select id="rv-sale-seller" required value={contactId} onChange={e=>setContactId(e.target.value)}><option value="">Choose seller from CRM</option>{sellers.map(s=><option value={s.id} key={s.id}>{s.full_name}</option>)}</select></div><button className="btn primary" disabled={saving||!!error||!sold.length||!sellers.length}>{saving?'Preparing tasks…':'Create follow-up tasks'}</button><p className="hint">Sold status is read from your saved property record. CRM tasks do not send automatic email or reveal seller details to other agents.</p></form></section>
 <section className="panel"><h2>Follow-up plans</h2>{loading?<p>Loading…</p>:!plans.length?<p className="muted">No plans yet. Choose a sold listing and seller.</p>:plans.map(p=><div className="draftrow" key={p.id}><div><b>{homes.find(h=>h.id===p.property_id)?.payload.address||'Property'}</b><p>{sellers.find(s=>s.id===p.contact_id)?.full_name||'Seller'} · Created {new Date(p.created_at).toLocaleDateString('en-CA')}</p></div><span className="badge">Tasks created</span></div>)}</section></div>
 </>;
}
