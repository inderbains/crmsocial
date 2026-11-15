'use client';
import {useEffect,useState} from 'react';
import {RefreshCw,TrendingUp} from 'lucide-react';
import {getSupabase} from '../lib/supabase';

type Contact={id:string;full_name:string;stage:string;source:string};
type Showing={id:string;visitor_name:string;status:string;property_id:string;created_at:string};
type Visit={id:number;property_id:string;event_type:string;source:string};
type Property={id:string;payload:{address?:string;title?:string}};
export default function LeadFunnel({userId}:{userId:string}){
 const [contacts,setContacts]=useState<Contact[]>([]),[requests,setRequests]=useState<Showing[]>([]),[events,setEvents]=useState<Visit[]>([]),[homes,setHomes]=useState<Property[]>([]),[error,setError]=useState(''),[loading,setLoading]=useState(true);
 async function load(){const db=getSupabase();if(!db)return;setLoading(true);const [c,s,v,p]=await Promise.all([
  db.from('crm_contacts').select('id,full_name,stage,source').eq('user_id',userId).limit(5000),
  db.from('property_showing_requests').select('id,visitor_name,status,property_id,created_at').eq('user_id',userId).limit(5000),
  db.from('property_engagement').select('id,property_id,event_type,source').eq('owner_user_id',userId).order('created_at',{ascending:false}).limit(5000),
  db.from('property_pages').select('id,payload').eq('user_id',userId)
 ]);if(c.error||s.error||v.error||p.error)setError('Run migration 016 for funnel analytics. '+(c.error||s.error||v.error||p.error)!.message);else{setContacts(c.data||[]);setRequests(s.data||[]);setEvents(v.data||[]);setHomes((p.data||[]) as Property[])}setLoading(false)}
 useEffect(()=>{void load()},[userId]);
 const views=events.filter(x=>x.event_type==='Page view').length;
 const clicks=events.filter(x=>x.event_type==='Contact click').length;
 const confirmed=requests.filter(x=>x.status==='Confirmed'||x.status==='Completed').length;
 const sourceCounts=Object.entries(events.reduce<Record<string,number>>((acc,v)=>{acc[v.source]=(acc[v.source]||0)+1;return acc},{})).sort((a,b)=>b[1]-a[1]).slice(0,6);
 return <><div className="headrow"><div><h1>Lead Funnel</h1><p>Real activity from property websites, showing requests and your existing CRM.</p></div><button className="btn" onClick={()=>void load()} disabled={loading}><RefreshCw size={16}/> Refresh</button></div>
 <div className="notice"><TrendingUp size={19}/><div><b>Website activity is aggregate, not individual buyer tracking.</b><p>Page views are estimates, may include bots and exclude repeat visits in the same browser session. Meta impressions, ad clicks and spending will appear only after the official Meta integration is connected. No fabricated metrics are shown.</p></div></div>
 {error&&<div className="notice" role="alert">{error}</div>}
 <div className="rv-metric-grid rv-metrics-four"><div className="panel"><strong>{views}</strong><p>Property page views*</p></div><div className="panel"><strong>{clicks}</strong><p>Agent contact clicks*</p></div><div className="panel"><strong>{requests.length}</strong><p>Showing requests</p></div><div className="panel"><strong>{confirmed}</strong><p>Confirmed/completed requests</p></div></div>
 <div className="rv-metric-grid"><div className="panel"><strong>{contacts.length}</strong><p>CRM contacts (up to 5,000)</p></div><div className="panel"><strong>{contacts.filter(c=>/meta|facebook|instagram/i.test(c.source||'')).length}</strong><p>Contacts tagged with Meta as source</p></div><div className="panel"><strong>{contacts.filter(c=>c.stage==='Closed').length}</strong><p>CRM contacts at Closed stage</p></div></div>
 <div className="rv-dashboard-grid"><section className="panel"><h2>Recent showing requests</h2>{loading?<p>Loading…</p>:!requests.length?<p className="muted">No property showing requests received.</p>:requests.slice(0,10).map(x=><div className="draftrow" key={x.id}><div><b>{x.visitor_name}</b><p>{homes.find(p=>p.id===x.property_id)?.payload.address||'Property'} · {new Date(x.created_at).toLocaleDateString('en-CA')}</p></div><span className="badge">{x.status}</span></div>)}</section><section className="panel"><h2>Property traffic sources</h2>{!sourceCounts.length?<p className="muted">Share a published property link to start measuring page activity.</p>:sourceCounts.map(([src,n])=><div className="draftrow" key={src}><b>{src}</b><span className="badge">{n} events</span></div>)}<p className="hint">*Sampled from the most recent 5,000 recorded events. Traffic source is based on a URL label such as ?src=facebook, and is not verified ad attribution.</p></section></div>
 </>;
}
