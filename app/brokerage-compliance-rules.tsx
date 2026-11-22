'use client';
import {useEffect,useState} from 'react';
import {getSupabase} from '../lib/supabase';

type Rule={id:string;kind:string;phase:string;representation:string;label:string;required:boolean;active:boolean;sort_order:number};
const phaseLabels:Record<string,string>={listing:'New listing',offer:'Accepted offer',firm:'Subjects removed / firm sale',completion:'Completion & closing'};
export default function BrokerageComplianceRules({brokerageId,notify}:{brokerageId:string;notify:(message:string)=>void}){
 const db=getSupabase()!;const [rules,setRules]=useState<Rule[]>([]),[busy,setBusy]=useState(false);
 const [draft,setDraft]=useState({kind:'Sale',phase:'completion',representation:'any',label:'',required:true});
 const load=async()=>{const r=await db.from('rv_compliance_templates').select('*').eq('brokerage_id',brokerageId).order('kind').order('phase').order('sort_order');if(r.error)notify('Compliance templates need SQL 044: '+r.error.message);else setRules(r.data||[])};
 useEffect(()=>{void load()},[brokerageId]);
 async function update(id:string,values:Partial<Rule>){setBusy(true);try{const r=await db.from('rv_compliance_templates').update(values).eq('id',id);if(r.error)throw r.error;await load()}catch(e){notify((e as Error).message)}finally{setBusy(false)}}
 async function add(){setBusy(true);try{const r=await db.from('rv_compliance_templates').insert({...draft,brokerage_id:brokerageId});if(r.error)throw r.error;setDraft(x=>({...x,label:''}));await load();notify('Requirement template saved for future files')}catch(e){notify((e as Error).message)}finally{setBusy(false)}}
 async function apply(){setBusy(true);try{const r=await db.rpc('rv_refresh_brokerage_compliance');if(r.error)throw r.error;notify('Compliance templates applied to current active files');await load()}catch(e){notify((e as Error).message)}finally{setBusy(false)}}
 return <section className="panel" style={{marginTop:18}} aria-label="Brokerage compliance form templates"><h3>Brokerage form requirements</h3>
  <p>Change the checklist for upcoming transactions. Existing signed documents are never deleted. Back Office must still review and verify each file.</p>
  <details><summary>Manage {rules.length} required and optional form templates</summary>
   {rules.map(r=><div className="draftrow" key={r.id}><div><b>{r.label}</b><p>{r.kind} · {phaseLabels[r.phase]||r.phase} · {r.representation==='any'?'Both sides':r.representation==='listing'?'Seller side':'Buyer side'}</p></div><label style={{display:'inline-flex',alignItems:'center',gap:6}}><input style={{width:'auto'}} type="checkbox" checked={r.required} disabled={busy} onChange={e=>void update(r.id,{required:e.target.checked})}/> Required</label><label style={{display:'inline-flex',alignItems:'center',gap:6}}><input style={{width:'auto'}} type="checkbox" checked={r.active} disabled={busy} onChange={e=>void update(r.id,{active:e.target.checked})}/> Active</label></div>)}
   <h4>Add a brokerage-specific form</h4>
   <div className="crm-form-grid"><div className="field"><label>File type</label><select value={draft.kind} disabled={busy} onChange={e=>setDraft({...draft,kind:e.target.value,phase:e.target.value==='Listing'?'listing':'offer'})}><option value="Listing">Listing</option><option value="Sale">Sale</option></select></div>
   <div className="field"><label>Stage</label><select value={draft.phase} disabled={busy} onChange={e=>setDraft({...draft,phase:e.target.value})}>{Object.entries(phaseLabels).filter(([key])=>draft.kind==='Listing'?key==='listing':key!=='listing').map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></div>
   <div className="field"><label>Representation</label><select value={draft.representation} disabled={busy} onChange={e=>setDraft({...draft,representation:e.target.value})}><option value="any">Both</option><option value="listing">Seller side</option><option value="selling">Buyer side</option></select></div>
   <div className="field"><label>Form name</label><input value={draft.label} maxLength={250} onChange={e=>setDraft({...draft,label:e.target.value})}/></div></div>
   <label><input type="checkbox" style={{width:'auto'}} checked={draft.required} onChange={e=>setDraft({...draft,required:e.target.checked})}/> Mandatory document</label>
   <div className="actions"><button type="button" className="btn" disabled={busy||!draft.label.trim()} onClick={()=>void add()}>Add form to templates</button><button type="button" className="btn" disabled={busy} onClick={()=>void apply()}>Apply active templates to open files</button></div>
   <p className="hint">Disabling a form affects new files; already-issued requirements remain in existing files for audit. A reviewer may mark individual inapplicable items N/A with a reason.</p>
  </details>
 </section>;
}
