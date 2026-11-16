'use client';
import {useEffect,useState} from 'react';
import {Facebook,Instagram,Megaphone,Link2,ShieldCheck,RefreshCw,AlertTriangle,CheckCircle2,Building2,UserCircle2,Unplug,ArrowUpRight} from 'lucide-react';
import {getSupabase} from '../lib/supabase';

type Connection={id:string;owner_user_id:string;connection_scope:'agent'|'brokerage';brokerage_id:string|null;meta_user_name:string;meta_user_id:string;connection_status:string;granted_scopes:string[];connected_at:string};
type Asset={id:string;connection_id:string;asset_type:'facebook_page'|'instagram_account'|'ad_account';meta_asset_id:string;asset_name:string;status:string;is_default:boolean;extra:Record<string,string>};
const assetLabels={facebook_page:'Facebook Page',instagram_account:'Instagram professional',ad_account:'Meta Ad Account'};
const requiredScopes={facebook_page:'pages_manage_posts',instagram_account:'instagram_content_publish',ad_account:'ads_management'};
export default function MetaConnections({userId,notify,onOpenAds,initialScope='agent'}:{userId:string;notify:(s:string)=>void;onOpenAds:()=>void;initialScope?:'agent'|'brokerage'}){
 const db=getSupabase();
 const [connections,setConnections]=useState<Connection[]>([]);
 const [assets,setAssets]=useState<Asset[]>([]);
 const [officeId,setOfficeId]=useState<string|null>(null);
 const [officeName,setOfficeName]=useState('Brokerage');
 const scope=initialScope;
 const [busy,setBusy]=useState('');
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState('');
 async function refresh(){if(!db)return;setLoading(true);setError('');setOfficeId(null);
  const [a,b]=await Promise.all([
   db.from('rv_meta_connections').select('id,owner_user_id,connection_scope,brokerage_id,meta_user_name,meta_user_id,connection_status,granted_scopes,connected_at').order('connected_at',{ascending:false}),
   db.from('brokerage_members').select('brokerage_id,role,brokerages(name)').eq('user_id',userId).maybeSingle(),
  ]);
  if(a.error)setError(`Meta connection database is not ready. Run migration 018. (${a.error.message})`);
  else {
   setConnections((a.data||[]) as Connection[]);
   const ids=(a.data||[]).map(c=>c.id);
   if(ids.length){const result=await db.from('rv_meta_assets').select('id,connection_id,asset_type,meta_asset_id,asset_name,status,is_default,extra').in('connection_id',ids).order('asset_name');
    if(result.error)setError(result.error.message);else setAssets((result.data||[]) as Asset[]);
   }else setAssets([]);
  }
  if(!b.error&&b.data?.role==='admin'&&b.data.brokerage_id){const permission=await db.rpc('is_brokerage_admin',{b:b.data.brokerage_id});if(!permission.error&&permission.data===true){setOfficeId(b.data.brokerage_id);const raw=b.data.brokerages as unknown as {name?:string}|{name?:string}[]|null;
    setOfficeName((Array.isArray(raw)?raw[0]?.name:raw?.name)||'Brokerage');}}
  if(b.error||!b.data||b.data.role!=='admin')setOfficeId(null);
  setLoading(false);
 }
 useEffect(()=>{void refresh()},[userId]);
 async function run(action:'start'|'disconnect'|'default',values:Record<string,string>){if(!db)return;setBusy(action+(values.connection_id||''));
  try{const {data,error}=await db.functions.invoke('meta-connect',{body:{action,...values}});
   if(error)throw error;
   if(data?.error)throw Error(data.error);
   if(action==='start'){
    if(typeof data?.authorization_url!=='string'||!data.authorization_url.startsWith('https://www.facebook.com/'))throw Error('Invalid Meta authorization link');
    window.location.assign(data.authorization_url);return;
   }
   notify(action==='disconnect'?'Meta connection removed':'Default account saved');await refresh();
  }catch(e){const raw=(e as Error).message||'Unknown error';setError(raw.includes('Failed to send a request')?'Meta integration is not deployed yet. We can authorize accounts during the final setup and test.':raw)}finally{setBusy('')}
 }
 async function disconnect(c:Connection){if(!confirm(`Disconnect ${c.meta_user_name||'Meta account'}? This will remove access for connected Pages and ad accounts.`))return;
  await run('disconnect',{connection_id:c.id});}
 const filtered=connections.filter(c=>scope==='agent'?c.connection_scope==='agent'&&c.owner_user_id===userId:c.connection_scope==='brokerage'&&c.brokerage_id===officeId);
 const accountAssets=filtered.flatMap(c=>assets.filter(a=>a.connection_id===c.id&&a.status==='available'));
 if(scope==='brokerage'&&!loading&&!officeId)return <section className="panel"><h2>Brokerage administrator access required</h2><p>This area is available only through Back Office to an authorized brokerage administrator.</p></section>;
 return <>
  <div className="headrow"><div><h1>Meta Social & Ads Connections</h1><p>One secure connection for Facebook publishing, Instagram publishing, and Meta paid advertising.</p></div><button className="btn" onClick={()=>void refresh()} disabled={loading}><RefreshCw size={16}/> Refresh</button></div>
  <section className="panel" style={{marginBottom:16}}>
   <div className="rv-inline" style={{alignItems:'center',justifyContent:'space-between'}}><div><h2>Connection owner</h2><p className="muted">An agent's personal channels and the brokerage's office channels stay separate.</p></div><span className="badge">{scope==='agent'?<><UserCircle2 size={16}/> My Accounts</>:<><Building2 size={16}/> {officeName} — Office Accounts</>}</span></div>
   <div className="rv-inline" style={{gap:14,marginTop:14,flexWrap:'wrap'}}><span className="badge"><Facebook size={14}/> Facebook Pages</span><span className="badge"><Instagram size={14}/> Instagram Professional</span><span className="badge"><Megaphone size={14}/> Meta Ads Accounts</span></div>
   <div className="notice" style={{marginTop:16}}><ShieldCheck size={19}/><div><b>Official Meta authorization—no passwords shared.</b><p>RealVolt only discovers assets that Meta grants to this user. Access tokens stay server-side. Publishing and paid campaigns remain disabled until provider setup, permissions, and review are complete.</p></div></div>
   {error&&<p role="alert" className="notice"><AlertTriangle size={16}/> {error}</p>}
   <button className="btn primary" disabled={!!busy||!!error||loading||(scope==='brokerage'&&!officeId)} onClick={()=>void run('start',{scope,...(scope==='brokerage'&&officeId?{brokerage_id:officeId}:{})})} style={{marginTop:14}}><Link2 size={17}/>{busy==='start'?'Opening Meta…':`Authorize ${scope==='agent'?'my':'brokerage'} Meta accounts`}</button>
   <p className="hint">The authorization button becomes operational after deploying the Meta connector and configuring your Meta developer application. We won't spend any advertising money during connection.</p>
  </section>
  <div className="rv-metric-grid" style={{marginBottom:16}}>{([
   ['Facebook Pages',accountAssets.filter(a=>a.asset_type==='facebook_page').length],
   ['Instagram Accounts',accountAssets.filter(a=>a.asset_type==='instagram_account').length],
   ['Advertising Accounts',accountAssets.filter(a=>a.asset_type==='ad_account').length],
  ] as [string,number][]).map(([label,count])=><div className="panel" key={label}><strong>{count}</strong><p>{label}</p></div>)}</div>
  <section className="panel"><div className="sectionhead"><div><h2>Authorized Meta accounts</h2><p className="muted">Facebook Page, Instagram and Ad Account permissions are independent.</p></div><button className="btn" onClick={onOpenAds}><Megaphone size={15}/> Open Ads Manager <ArrowUpRight size={14}/></button></div>
  {loading?<p>Loading connections…</p>:filtered.length===0?<div className="empty"><h3>No {scope==='agent'?'personal':'brokerage'} Meta connection yet</h3><p>Connect once to review your available Pages, Instagram accounts and advertising accounts. A Facebook login alone does not guarantee access to paid ads.</p></div>:filtered.map(c=><div key={c.id} className="panel" style={{marginBottom:12}}>
   <div className="rv-inline" style={{alignItems:'center',justifyContent:'space-between'}}><div><h3>{c.meta_user_name||'Meta Business account'}</h3><p className="muted">{c.connection_scope==='brokerage'?'Office connection':'Agent connection'} · {c.connection_status==='connected'?'Authorized':'Reauthorization required'} · {new Date(c.connected_at).toLocaleDateString()}</p></div><button className="btn smallbtn" disabled={!!busy} onClick={()=>void disconnect(c)}><Unplug size={14}/> Disconnect</button></div>
   <div className="rv-template-grid" style={{marginTop:15}}>{(['facebook_page','instagram_account','ad_account'] as const).map(type=>{
    const rows=assets.filter(a=>a.connection_id===c.id&&a.asset_type===type);
    return <div className="rv-template-card" key={type}><b>{assetLabels[type]}</b><p>{rows.length?'Select a default for future campaigns':'Not authorized or not found'}</p>{rows.map(a=><div key={a.id} style={{marginTop:9,borderTop:'1px solid var(--line,#e0e6db)',paddingTop:9}}>
      <div className="rv-inline" style={{alignItems:'center',justifyContent:'space-between'}}><div><b style={{fontSize:13}}>{a.asset_name}</b><p className="hint">{a.meta_asset_id} · {a.status}</p></div>{a.is_default&&<CheckCircle2 size={16} color="#277052"/>}</div>
      {!a.is_default&&a.status==='available'&&<button className="btn smallbtn" disabled={!!busy} onClick={()=>void run('default',{connection_id:c.id,asset_id:a.id})}>Set default</button>}
     </div>)}
     {rows.length>0&&!c.granted_scopes.includes(requiredScopes[type])&&<p className="hint">Publishing permission may still need Meta approval or reauthorization.</p>}
    </div>})}</div>
  </div>)}</section>
  <section className="panel" style={{marginTop:16}}><h2>What this connection enables after approval</h2><div className="rv-template-grid">
   <div className="rv-template-card"><b>Organic posting</b><p>Auto-created Just Listed / Just Sold content, and scheduled agent posts using approved Facebook Pages and Instagram professional accounts.</p></div>
   <div className="rv-template-card"><b>Meta Ads Manager</b><p>Choose a verified Ad Account, assign a Page and Instagram identity, select Housing category, plan budget and review campaigns before launch.</p></div>
   <div className="rv-template-card"><b>Lead generation</b><p>Meta Lead Ads and landing-page leads can be attributed to the correct agent and imported into the CRM when lead retrieval is enabled.</p></div>
  </div></section>
 </>;
}
