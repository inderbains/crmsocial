'use client';
import {useEffect,useState} from 'react';
import {CalendarCheck,RefreshCw,Mail,Phone} from 'lucide-react';
import {getSupabase} from '../lib/supabase';

type Showing={id:string;property_id:string;contact_id:string|null;visitor_name:string;visitor_email:string;visitor_phone:string;requested_at:string;message:string;status:string;agent_notes:string;created_at:string};
type Property={id:string;payload:{address?:string;city?:string;title?:string}};
const statuses=['Pending','Confirmed','Reschedule requested','Declined','Completed'];
export default function ShowingInbox({userId,notify}:{userId:string;notify:(s:string)=>void}){
 const [items,setItems]=useState<Showing[]>([]),[homes,setHomes]=useState<Record<string,string>>({}),[loading,setLoading]=useState(true),[error,setError]=useState(''),[saving,setSaving]=useState('');
 async function load(){const db=getSupabase();if(!db)return;setLoading(true);setError('');const [s,p]=await Promise.all([
  db.from('property_showing_requests').select('id,property_id,contact_id,visitor_name,visitor_email,visitor_phone,requested_at,message,status,agent_notes,created_at').eq('user_id',userId).order('created_at',{ascending:false}).limit(200),
  db.from('property_pages').select('id,payload').eq('user_id',userId)
 ]);
 if(s.error||p.error)setError('Run supabase/016_marketing_showings_foundation.sql first. '+(s.error||p.error)!.message);
 else{setItems((s.data||[]) as Showing[]);setHomes(Object.fromEntries((p.data||[] as Property[]).map((r:Property)=>[r.id,r.payload.address||r.payload.title||'Property'])))}setLoading(false);
 }
 useEffect(()=>{void load()},[userId]);
 async function update(row:Showing,patch:Partial<Pick<Showing,'status'|'agent_notes'>>){
  const db=getSupabase();if(!db)return;setSaving(row.id);
  const {data,error}=await db.from('property_showing_requests').update(patch).eq('id',row.id).eq('user_id',userId).select('id,status,agent_notes').single();
  if(error)notify(error.message);else{setItems(s=>s.map(x=>x.id===row.id?{...x,status:data.status,agent_notes:data.agent_notes}:x));notify('Showing request updated. Send a confirmation to the buyer separately.')}setSaving('');
 }
 const pending=items.filter(x=>x.status==='Pending').length;
 return <><div className="headrow"><div><h1>Showing Requests</h1><p>Requests from your published property websites flow into this CRM inbox.</p></div><button className="btn" onClick={()=>void load()} disabled={loading}><RefreshCw size={16}/> Refresh</button></div>
 {error&&<div className="notice" role="alert">{error}</div>}
 <div className="rv-metric-grid"><div className="panel"><strong>{items.length}</strong><p>Total requests</p></div><div className="panel"><strong>{pending}</strong><p>Awaiting response</p></div><div className="panel"><strong>{items.filter(x=>x.status==='Confirmed').length}</strong><p>Confirmed</p></div></div>
 {loading?<section className="panel">Loading requests…</section>:!items.length?<section className="panel empty"><CalendarCheck size={36}/><h3>No showing requests yet</h3><p>Publish a property website and share its link. Buyer requests will appear here and create CRM contacts and follow-up tasks.</p></section>:<div className="rv-stack">{items.map(x=><article key={x.id} className="panel rv-showing-card"><div className="sectionhead"><div><span className="badge">{x.status}</span><h2>{x.visitor_name}</h2><p>{homes[x.property_id]||'Property'} · Requested {new Date(x.requested_at).toLocaleString('en-CA')}</p></div><div className="actions">{x.visitor_email&&<a className="btn smallbtn" href={'mailto:'+encodeURIComponent(x.visitor_email)}><Mail size={14}/> Email</a>}{x.visitor_phone&&<a className="btn smallbtn" href={'tel:'+x.visitor_phone.replace(/[^+\d]/g,'')}><Phone size={14}/> Call</a>}</div></div>
  {x.message&&<p>{x.message}</p>}
  <div className="rv-inline"><div className="field"><label htmlFor={'status-'+x.id}>Showing status</label><select id={'status-'+x.id} disabled={saving===x.id} value={x.status} onChange={e=>void update(x,{status:e.target.value})}>{statuses.map(s=><option key={s}>{s}</option>)}</select></div><div className="field rv-grow"><label htmlFor={'notes-'+x.id}>Private agent notes</label><input id={'notes-'+x.id} maxLength={2000} defaultValue={x.agent_notes} key={x.id+x.agent_notes} onBlur={e=>{if(e.target.value!==x.agent_notes)void update(x,{agent_notes:e.target.value})}}/></div></div>
  <p className="hint">Submitted {new Date(x.created_at).toLocaleString('en-CA')}. Updating the status does not send an automatic email.</p></article>)}</div>}
 </>;
}
