'use client';
import {useCallback,useEffect,useMemo,useState,type FormEvent} from 'react';
import {Megaphone,RefreshCw,Plus,Copy,ShieldCheck} from 'lucide-react';
import {getSupabase} from '../lib/supabase';
import {adTypes,suggestAdCopy,type AdType,type MatchingProperty} from '../lib/marketing';
import {estimatedBudget,readinessIssues,validHttpsDestination,type CampaignGoal,type PlannedChannel,type PlannedCta,ctaLabels} from '../lib/meta-ad-planner';
import {type Draft,templates} from '../lib/designs';

type Status='Draft'|'Ready for review'|'Archived';
type Plan={
 id?:string;campaign_name:string;campaign_type:AdType;property_id:string|null;headline:string;description:string;
 area:string;daily_budget:number;planned_start:string|null;planned_end:string|null;status:Status;
 campaign_goal:CampaignGoal;destination_url:string;creative_draft_id:string|null;call_to_action:PlannedCta;
 placements:PlannedChannel[];lead_form_name:string;plan_notes:string;
 meta_connection_id:string|null;meta_ad_account_id:string|null;meta_page_id:string|null;meta_instagram_id:string|null;
 special_ad_category:'HOUSING';
};
type MetaConnection={id:string;connection_scope:'agent'|'brokerage';owner_user_id:string;brokerage_id:string|null;meta_user_name:string;connection_status:string};
type MetaAsset={id:string;connection_id:string;asset_type:'ad_account'|'facebook_page'|'instagram_account';asset_name:string;status:string};
const blank=():Plan=>({campaign_name:'',campaign_type:'Just listed',property_id:null,headline:'',description:'',area:'',daily_budget:20,planned_start:null,planned_end:null,status:'Draft',campaign_goal:'website_visits',destination_url:'',creative_draft_id:null,call_to_action:'LEARN_MORE',placements:['Facebook','Instagram'],lead_form_name:'',plan_notes:'',meta_connection_id:null,meta_ad_account_id:null,meta_page_id:null,meta_instagram_id:null,special_ad_category:'HOUSING'});
const money=(value:number)=>new Intl.NumberFormat('en-CA',{style:'currency',currency:'CAD'}).format(value);
const fields='id,campaign_name,campaign_type,property_id,headline,description,area,daily_budget,planned_start,planned_end,status,campaign_goal,destination_url,creative_draft_id,call_to_action,placements,lead_form_name,plan_notes,meta_connection_id,meta_ad_account_id,meta_page_id,meta_instagram_id,special_ad_category';
export default function MetaAds({userId,notify,onDesign}:{userId:string;notify:(s:string)=>void;onDesign:(name:AdType)=>void}){
 const [plans,setPlans]=useState<Plan[]>([]),[homes,setHomes]=useState<MatchingProperty[]>([]),[drafts,setDrafts]=useState<Draft[]>([]);
 const [connections,setConnections]=useState<MetaConnection[]>([]),[assets,setAssets]=useState<MetaAsset[]>([]),[editing,setEditing]=useState<Plan|null>(null);
 const [loading,setLoading]=useState(true),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const db=getSupabase();
 const load=useCallback(async()=>{const client=getSupabase();if(!client)return;setLoading(true);setError('');
  const [a,p,d,c]=await Promise.all([
   client.from('meta_ad_plans').select(fields).eq('user_id',userId).order('created_at',{ascending:false}),
   client.from('property_pages').select('id,published,payload').eq('user_id',userId),
   client.from('social_drafts').select('id,payload').eq('user_id',userId).order('created_at',{ascending:false}).limit(250),
   client.from('rv_meta_connections').select('id,connection_scope,owner_user_id,brokerage_id,meta_user_name,connection_status').eq('connection_status','connected'),
  ]);
  const problem=a.error||p.error||d.error||c.error;
  if(problem){setError('Database setup is incomplete. Run migrations 016–019 in order. '+problem.message);setLoading(false);return;}
  setPlans((a.data||[]) as unknown as Plan[]);setHomes((p.data||[]) as MatchingProperty[]);
  setDrafts((d.data||[]).map(row=>({...row.payload,_id:row.id} as Draft)));
  const available=(c.data||[]).filter(conn=>conn.connection_scope==='agent'?conn.owner_user_id===userId:true) as MetaConnection[];
  setConnections(available);
  const ids=available.map(conn=>conn.id);
  if(ids.length){const x=await client.from('rv_meta_assets').select('id,connection_id,asset_type,asset_name,status').in('connection_id',ids);if(x.error)setError(x.error.message);else setAssets((x.data||[]) as MetaAsset[]);}else setAssets([]);
  setLoading(false);
 },[userId]);
 useEffect(()=>{void load()},[load]);
 const activeAssets=useMemo(()=>assets.filter(a=>a.status==='available'&&a.connection_id===editing?.meta_connection_id),[assets,editing?.meta_connection_id]);
 const creative=drafts.find(d=>d._id===editing?.creative_draft_id);
 const issues=editing?readinessIssues({campaign_name:editing.campaign_name,headline:editing.headline,description:editing.description,campaign_goal:editing.campaign_goal,destination_url:editing.destination_url,planned_start:editing.planned_start,planned_end:editing.planned_end,daily_budget:editing.daily_budget,placements:editing.placements},creative):[];
 const canReview=!!editing&&issues.length===0&&!!editing.meta_connection_id&&!!editing.meta_ad_account_id&&!!editing.meta_page_id;
 const total=editing?estimatedBudget(editing.daily_budget,editing.planned_start,editing.planned_end):null;
 function newPlan(type:AdType){const text=suggestAdCopy(type);setEditing({...blank(),campaign_name:type+' campaign',campaign_type:type,headline:text.headline,description:text.description});}
 function chooseProperty(id:string){if(!editing)return;const home=homes.find(h=>h.id===id);setEditing({...editing,property_id:id||null,...suggestAdCopy(editing.campaign_type,home)});}
 async function save(e:FormEvent){e.preventDefault();if(!db||!editing)return;setBusy(true);
  try{if(editing.status==='Ready for review'&&!canReview){notify('Complete the campaign checklist and select an authorized Ad Account and Facebook Page before marking ready.');return;}
   if(!Number.isFinite(editing.daily_budget)||editing.daily_budget<=0)throw Error('Daily budget must be positive.');
   if(editing.destination_url&&!validHttpsDestination(editing.destination_url))throw Error('Use a valid HTTPS website link.');
   const {id,...value}=editing;const result=id?await db.from('meta_ad_plans').update(value).eq('id',id).eq('user_id',userId):await db.from('meta_ad_plans').insert({...value,user_id:userId});
   if(result.error)throw result.error;notify('Meta campaign plan saved. No ad was launched or charged.');setEditing(null);await load();
  }catch(err){notify('Could not save campaign: '+(err as Error).message)}finally{setBusy(false)}
 }
 async function copy(p:Plan){try{await navigator.clipboard.writeText(`${p.headline}\n\n${p.description}\n\n${p.destination_url}`);notify('Ad copy copied.')}catch{notify('Clipboard unavailable.')}}
 return <><div className="headrow"><div><h1>Meta Ads Manager</h1><p>Build paid-ad plans with property photos, your designs, budgets and approved Meta identities.</p></div><button className="btn primary" disabled={!!error} onClick={()=>newPlan('Just listed')}><Plus size={16}/> New campaign</button></div>
 <div className="notice"><ShieldCheck size={19}/><div><b>Planning mode only — no publishing or advertising charges.</b><p>Meta advertising requires an approved application, an authorized Ad Account and backend publishing. All residential real-estate ads must use the Housing Special Ad Category. The "area" field is for campaign notes, not restricted targeting.</p></div></div>
 {error&&<div className="notice" role="alert">{error}</div>}
 <div className="rv-metric-grid"><div className="panel"><strong>{plans.length}</strong><p>Campaign plans</p></div><div className="panel"><strong>{plans.filter(p=>p.status==='Ready for review').length}</strong><p>Ready for review</p></div><div className="panel"><strong>{connections.length}</strong><p>Authorized connections visible</p></div></div>
 <section className="panel"><div className="sectionhead"><div><h2>Campaign templates</h2><p className="muted">Use a template to draft an ad or open Design Studio for its artwork.</p></div></div><div className="rv-template-grid">{adTypes.map(type=><div key={type} className="rv-template-card"><b>{type}</b><p>{type.includes('leads')?'Lead generation':'Property marketing'} · Housing category</p><div className="actions"><button className="btn smallbtn" onClick={()=>newPlan(type)}>Plan ad</button><button className="btn smallbtn" onClick={()=>onDesign(type)}>Create graphic</button></div></div>)}</div></section>
 <section className="panel"><div className="sectionhead"><h2>Saved ad campaigns</h2><button className="btn" disabled={loading} onClick={()=>void load()}><RefreshCw size={15}/> Refresh</button></div>{loading?<p>Loading…</p>:!plans.length?<p className="muted">No campaigns planned yet.</p>:plans.map(p=><div className="draftrow" key={p.id}><div><b>{p.campaign_name}</b><p>{p.campaign_type} · {money(Number(p.daily_budget))}/day · {p.status} · {p.planned_start||'No dates set'}</p></div><div className="actions"><button className="btn smallbtn" onClick={()=>void copy(p)}><Copy size={14}/> Copy</button><button className="btn smallbtn" onClick={()=>setEditing({...blank(),...p})}>Edit</button></div></div>)}</section>
 {editing&&<div className="modalback"><section className="modal" role="dialog" aria-modal="true" aria-labelledby="campaign-title" style={{maxWidth:880}}><div className="modalhead"><h2 id="campaign-title">Prepare Meta advertising campaign</h2><button type="button" className="btn" onClick={()=>setEditing(null)}>Close</button></div><form onSubmit={save} className="rv-ad-editor">
 <div className="rv-editor-control-grid"><div className="field"><label htmlFor="rv-ad-name">Campaign name</label><input id="rv-ad-name" required maxLength={140} value={editing.campaign_name} onChange={e=>setEditing({...editing,campaign_name:e.target.value})}/></div><div className="field"><label htmlFor="rv-ad-template">Campaign template</label><select id="rv-ad-template" value={editing.campaign_type} onChange={e=>{const campaign_type=e.target.value as AdType;setEditing({...editing,campaign_type,...suggestAdCopy(campaign_type,homes.find(h=>h.id===editing.property_id))});}}>{adTypes.map(type=><option key={type}>{type}</option>)}</select></div></div>
 <div className="rv-editor-control-grid"><div className="field"><label htmlFor="rv-ad-goal">Goal</label><select id="rv-ad-goal" value={editing.campaign_goal} onChange={e=>setEditing({...editing,campaign_goal:e.target.value as CampaignGoal})}><option value="website_visits">Property website visits</option><option value="instant_leads">Meta Instant Lead Form (future integration)</option></select></div><div className="field"><label htmlFor="rv-ad-property">Property</label><select id="rv-ad-property" value={editing.property_id||''} onChange={e=>chooseProperty(e.target.value)}><option value="">General buyer/seller campaign</option>{homes.map(h=><option key={h.id} value={h.id}>{h.payload.address||h.payload.title||'Property'}</option>)}</select></div></div>
 <div className="field"><label htmlFor="rv-ad-design">Authorized Design Studio creative</label><select id="rv-ad-design" value={editing.creative_draft_id||''} onChange={e=>setEditing({...editing,creative_draft_id:e.target.value||null})}><option value="">Choose a saved design</option>{drafts.map(d=><option key={d._id} value={d._id}>{d.title} · {templates[d.template]?.name||'Design'}{d.photoSource==='sample'?' (sample preview only)':''}</option>)}</select>{creative?.photo&&<div className="rv-ad-preview"><img src={creative.photo} alt="Selected draft creative"/><div><b>{creative.title}</b><p>{creative.photoSource==='sample'?'Sample photo — cannot be marked ready for review':'Selected from agent-authorized photos'}</p></div></div>}</div>
 <div className="rv-editor-control-grid"><div className="field"><label htmlFor="rv-ad-headline">Headline</label><input id="rv-ad-headline" maxLength={255} value={editing.headline} onChange={e=>setEditing({...editing,headline:e.target.value})}/></div><div className="field"><label htmlFor="rv-ad-url">Website link (HTTPS)</label><input id="rv-ad-url" type="url" maxLength={1500} value={editing.destination_url} onChange={e=>setEditing({...editing,destination_url:e.target.value})} placeholder="https://..."/></div></div>
 <div className="field"><label htmlFor="rv-ad-caption">Primary ad text</label><textarea id="rv-ad-caption" rows={3} maxLength={4000} value={editing.description} onChange={e=>setEditing({...editing,description:e.target.value})}/></div>
 <div className="rv-editor-control-grid"><div className="field"><label htmlFor="rv-ad-cta">Call to action</label><select id="rv-ad-cta" value={editing.call_to_action} onChange={e=>setEditing({...editing,call_to_action:e.target.value as PlannedCta})}>{(Object.keys(ctaLabels) as PlannedCta[]).map(key=><option key={key} value={key}>{ctaLabels[key]}</option>)}</select></div><div className="field"><label htmlFor="rv-ad-area">Market label (not Meta targeting)</label><input id="rv-ad-area" maxLength={100} value={editing.area} onChange={e=>setEditing({...editing,area:e.target.value})} placeholder="Surrey, Langley"/></div></div>
 <fieldset className="rv-calendar-channels"><legend>Planned placements</legend>{(['Facebook','Instagram'] as PlannedChannel[]).map(ch=><label key={ch}><input type="checkbox" checked={editing.placements.includes(ch)} onChange={e=>{const placements=e.target.checked?[...editing.placements,ch]:editing.placements.filter(x=>x!==ch);setEditing({...editing,placements})}}/>{ch}</label>)}</fieldset>
 <div className="rv-editor-control-grid"><div className="field"><label htmlFor="rv-ad-start">Start date</label><input id="rv-ad-start" type="date" value={editing.planned_start||''} onChange={e=>setEditing({...editing,planned_start:e.target.value||null})}/></div><div className="field"><label htmlFor="rv-ad-end">End date</label><input id="rv-ad-end" type="date" value={editing.planned_end||''} onChange={e=>setEditing({...editing,planned_end:e.target.value||null})}/></div></div>
 <div className="rv-editor-control-grid"><div className="field"><label htmlFor="rv-ad-budget">Daily budget (CAD)</label><input id="rv-ad-budget" type="number" min="1" step="0.01" value={editing.daily_budget} onChange={e=>setEditing({...editing,daily_budget:Number(e.target.value)})}/></div><div className="field"><label>Total planned budget</label><div className="rv-budget-estimate">{total!==null?money(total):'Choose valid start and end dates'}</div><p className="hint">Estimate only. Meta may apply different billing rules when connected.</p></div></div>
 <div className="field"><label htmlFor="rv-meta-conn">Meta connection</label><select id="rv-meta-conn" value={editing.meta_connection_id||''} onChange={e=>setEditing({...editing,meta_connection_id:e.target.value||null,meta_ad_account_id:null,meta_page_id:null,meta_instagram_id:null})}><option value="">Not connected — save as draft</option>{connections.map(conn=><option value={conn.id} key={conn.id}>{conn.meta_user_name||'Meta account'} · {conn.connection_scope}</option>)}</select></div>
 <div className="rv-editor-control-grid"><div className="field"><label htmlFor="rv-ad-account">Advertising account</label><select id="rv-ad-account" value={editing.meta_ad_account_id||''} onChange={e=>setEditing({...editing,meta_ad_account_id:e.target.value||null})}><option value="">Choose Ad Account</option>{activeAssets.filter(a=>a.asset_type==='ad_account').map(a=><option key={a.id} value={a.id}>{a.asset_name}</option>)}</select></div><div className="field"><label htmlFor="rv-ad-page">Facebook Page</label><select id="rv-ad-page" value={editing.meta_page_id||''} onChange={e=>setEditing({...editing,meta_page_id:e.target.value||null})}><option value="">Choose Page</option>{activeAssets.filter(a=>a.asset_type==='facebook_page').map(a=><option key={a.id} value={a.id}>{a.asset_name}</option>)}</select></div></div>
 <div className="field"><label htmlFor="rv-ad-ig">Instagram account (optional)</label><select id="rv-ad-ig" value={editing.meta_instagram_id||''} onChange={e=>setEditing({...editing,meta_instagram_id:e.target.value||null})}><option value="">Not selected</option>{activeAssets.filter(a=>a.asset_type==='instagram_account').map(a=><option key={a.id} value={a.id}>{a.asset_name}</option>)}</select></div>
 {editing.campaign_goal==='instant_leads'&&<div className="field"><label htmlFor="rv-ad-form">Planned Meta Lead Form name</label><input id="rv-ad-form" maxLength={160} value={editing.lead_form_name} onChange={e=>setEditing({...editing,lead_form_name:e.target.value})}/></div>}
 <div className="field"><label htmlFor="rv-ad-notes">Private campaign notes</label><textarea id="rv-ad-notes" maxLength={3000} value={editing.plan_notes} onChange={e=>setEditing({...editing,plan_notes:e.target.value})}/></div>
 <section className="rv-checklist"><b>Campaign review checklist</b>{issues.map(issue=><p key={issue}>• {issue}</p>)}{!editing.meta_ad_account_id&&<p>• Select an authorized advertising account</p>}{!editing.meta_page_id&&<p>• Select a connected Facebook Page</p>}{canReview&&<p>All draft checks complete. Meta publishing still requires backend authorization.</p>}</section>
 <div className="field"><label htmlFor="rv-ad-status">Internal status</label><select id="rv-ad-status" value={editing.status} onChange={e=>setEditing({...editing,status:e.target.value as Status})}><option>Draft</option><option disabled={!canReview}>Ready for review</option><option>Archived</option></select></div>
 <button className="btn primary" disabled={busy}>{busy?'Saving…':'Save campaign (no spending)'}</button>
 </form></section></div>}
 </>;
}
