'use client';
import {useCallback,useEffect,useState} from 'react';
import {Building2,RefreshCw,ShieldCheck} from 'lucide-react';
import {getSupabase} from '../lib/supabase';

type Metrics={agents:number;contacts:number;qualified_contacts:number;showings:number;property_pages:number;ad_plans:number;social_plans:number};
type AgentMetrics={agent_id:string;agent_name:string;contacts:number;showings:number;property_pages:number;ad_plans:number};
const empty:Metrics={agents:0,contacts:0,qualified_contacts:0,showings:0,property_pages:0,ad_plans:0,social_plans:0};
export default function OfficeMarketingDashboard({userId}:{userId:string}){
 const [summary,setSummary]=useState<{totals:Metrics;agents:AgentMetrics[]}|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState('');
 const refresh=useCallback(async()=>{setLoading(true);setError('');const db=getSupabase();if(!db){setError('Supabase is not configured');setLoading(false);return;}
  const m=await db.from('brokerage_members').select('brokerage_id,role').eq('user_id',userId).maybeSingle();
  if(m.error||m.data?.role!=='admin'||!m.data.brokerage_id){setSummary(null);setError('Verified brokerage administrator access is required.');setLoading(false);return;}
  const permission=await db.rpc('is_brokerage_admin',{b:m.data.brokerage_id});
  if(permission.error||permission.data!==true){setError('Brokerage administrator access could not be verified.');setLoading(false);return;}
  const report=await db.rpc('rv_office_marketing_summary',{p_brokerage_id:m.data.brokerage_id});
  if(report.error){setError('Apply migration 020 to view the office dashboard. '+report.error.message);setSummary(null);}else setSummary(report.data as {totals:Metrics;agents:AgentMetrics[]});
  setLoading(false);
 },[userId]);
 useEffect(()=>{void refresh()},[refresh]);
 const t=summary?.totals||empty;
 return <><div className="headrow"><div><h1>Office Marketing Dashboard</h1><p>Office-wide marketing activity with brokerage-level access controls.</p></div><button className="btn" disabled={loading} onClick={()=>void refresh()}><RefreshCw size={16}/> Refresh</button></div>
 <div className="notice"><ShieldCheck size={18}/><div><b>Brokerage admin only</b><p>Counts come from members of your own brokerage. These are current CRM and campaign-plan counts, not Meta ad spend, impressions, actual deliveries or revenue.</p></div></div>
 {error&&<div className="notice" role="alert">{error}</div>}
 {loading?<section className="panel">Loading brokerage totals…</section>:summary&&<><div className="rv-metric-grid rv-office-metric-grid">{([
  ['Agents & admins',t.agents],['CRM contacts',t.contacts],['Qualified / active leads',t.qualified_contacts],['Showing requests',t.showings],['Published properties',t.property_pages],['Meta ad plans',t.ad_plans],['Scheduled social drafts',t.social_plans]
 ] as [string,number][]).map(([label,value])=><div key={label} className="panel"><strong>{value}</strong><p>{label}</p></div>)}</div>
 <section className="panel rv-table-scroll"><div className="sectionhead"><h2>Agent marketing overview</h2><Building2 size={20}/></div><table className="crm-table"><thead><tr><th>Agent</th><th>Contacts</th><th>Showing requests</th><th>Published properties</th><th>Ad plans</th></tr></thead><tbody>{summary.agents.map(a=><tr key={a.agent_id}><td><b>{a.agent_name}</b></td><td>{a.contacts}</td><td>{a.showings}</td><td>{a.property_pages}</td><td>{a.ad_plans}</td></tr>)}</tbody></table>{!summary.agents.length&&<p className="muted">No brokerage members yet.</p>}</section></>}
 </>;
}
