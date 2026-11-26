'use client';

import {useCallback,useEffect,useMemo,useState} from 'react';
import {getSupabase} from '../lib/supabase';

type Requirement={id:string;label:string;document_id:string|null;verified:boolean;rv_phase?:string|null;rv_required?:boolean|null;rv_waived?:boolean|null;rv_waiver_reason?:string|null};
type Document={id:string;name:string;path:string;deal_id:string};

type Props={dealId:string;stage:string|null;agentName:string;docs:Document[];revision:number;busy:boolean;review:string;onReviewChange:(note:string)=>void;onApprove:()=>void;onRequestChanges:()=>void;onReviewUpdated:()=>void};

function mismatchedDocument(req:Requirement,doc?:Document){
 if(!doc)return false;
 const name=doc.name;
 // Flag clearly unrelated filenames, but keep the agent's category assignment immutable.
 // The reviewer must still open the actual document to confirm what it contains.
 if(/agent[_ .-]*(?:expense|gst|payout)|agentexpensesbydate|agentgstreport/i.test(name)&& !/(?:agent commission|internal commission|expense)/i.test(req.label))return true;
 if(/(?:commission[_ .-]*instruction|letter[_ .-]*to[_ .-]*complete|cheque[_ .-]*alignment)/i.test(name)){
  if(/commission[_ .-]*instruction/i.test(name)&&!/commission instruction|\bCIR\b/i.test(req.label))return true;
  if(/letter[_ .-]*to[_ .-]*complete/i.test(name)&&!/completion|lawyer letter/i.test(req.label))return true;
  if(/cheque[_ .-]*alignment/i.test(name))return true;
 }
 return false;
}

export default function DirectFileReview({dealId,stage,agentName,docs,revision,busy,review,onReviewChange,onApprove,onRequestChanges,onReviewUpdated}:Props){
 const db=getSupabase()!;
 const [requirements,setRequirements]=useState<Requirement[]>([]);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState('');
 const [savingId,setSavingId]=useState<string|null>(null);
 const load=useCallback(async()=>{
  setLoading(true);
  const r=await db.from('deal_requirements').select('id,label,document_id,verified,rv_phase,rv_required,rv_waived,rv_waiver_reason').eq('deal_id',dealId).order('rv_phase').order('label');
  if(r.error)setError(r.error.message);else {setRequirements(r.data||[]);setError('')}
  setLoading(false);
 },[db,dealId]);
 useEffect(()=>{void load()},[load,revision]);
 const mandatory=useMemo(()=>requirements.filter(r=>r.rv_required!==false),[requirements]);
 const missing=useMemo(()=>mandatory.filter(r=>!r.rv_waived&&(!r.document_id||!r.verified||mismatchedDocument(r,docs.find(d=>d.id===r.document_id)))),[mandatory,docs]);
 const ready=stage==='Collapsed'||(requirements.length>0&&missing.length===0);
 const blocked=loading||!!error||!!savingId||busy;
 const update=async(r:Requirement,fields:Pick<Requirement,'verified'>)=>{
  setSavingId(r.id);
  setError('');
  const result=await db.from('deal_requirements').update(fields).eq('id',r.id).eq('deal_id',dealId);
  if(result.error)setError(result.error.message);
  else {await load();onReviewUpdated()}
  setSavingId(null);
 };
 const openDoc=async(doc:Document)=>{
  const r=await db.storage.from('transaction-files').createSignedUrl(doc.path,120);
  if(r.error){setError(r.error.message);return}
  const link=document.createElement('a');link.href=r.data.signedUrl;link.target='_blank';link.rel='noopener noreferrer';link.click();
 };
 const goToUploads=()=>{
  const element=document.getElementById('rv-file-documents') as HTMLDetailsElement|null;
  if(element){element.open=true;element.scrollIntoView({behavior:'smooth',block:'start'})}
 };
 return <section id="rv-direct-file-review" aria-label="Review and approve submitted file" className="panel" style={{scrollMarginTop:80,margin:'18px 0',padding:20,border:'1px solid #b6cec0',background:'#f5f9f5',borderRadius:12}}>
  <div className="sectionhead" style={{alignItems:'flex-start'}}>
   <div><h3>Review submitted file</h3><p className="hint">Realtor: <b>{agentName||'Agent profile unavailable'}</b> · Review Accepted Offer and Subject Removal documents together, then approve or request changes here. No separate queue.</p></div>
   <button type="button" className="btn" onClick={goToUploads}>View submitted documents</button>
  </div>
  {error&&<div className="notice" role="alert">{error} <button type="button" className="btn smallbtn" onClick={()=>void load()}>Retry</button></div>}
  {loading?<p role="status">Loading required documents…</p>:<>
   <p className="hint">{mandatory.length-missing.length} of {mandatory.length} required documents verified or formally waived.{missing.length>0?` ${missing.length} still need attention.`:''} The Realtor assigned these files when uploading. Open each file to review it; Back Office cannot reassign or replace it. If a file is wrong, request changes.</p>
   {requirements.length===0&&stage!=='Collapsed'&&<p className="notice">No requirements were found for this file. Set up the document checklist before approving.</p>}
   <div style={{display:'grid',gap:9,margin:'12px 0 18px'}}>{requirements.map(r=>{
    const doc=docs.find(d=>d.id===r.document_id);
    const mismatch=mismatchedDocument(r,doc);
    return <div key={r.id} style={{background:'white',border:'1px solid #d7e2d8',borderRadius:8,padding:'12px 14px'}}>
     <div style={{display:'flex',gap:12,justifyContent:'space-between',flexWrap:'wrap',alignItems:'center'}}>
      <div style={{flex:'1 1 240px'}}><strong>{r.label}</strong>{r.rv_required===false&&<span className="hint"> · If applicable</span>}<p className="hint" style={{margin:'4px 0 0'}}>{r.rv_waived?'Previously marked N/A'+(r.rv_waiver_reason?`: ${r.rv_waiver_reason}`:''):mismatch?'⚠ Wrong document for this category — request changes':!doc?'Missing document — request changes':r.verified?'Approved by Back Office':'Awaiting review'}</p></div>
      {!r.rv_waived&&<div style={{display:'flex',alignItems:'center',gap:9,flexWrap:'wrap'}}>
       <span title="Linked by the submitting Realtor; cannot be changed by Back Office" style={{fontSize:13,maxWidth:290,overflowWrap:'anywhere'}}>{doc?.name||'Not submitted — request changes'}</span>
       {doc&&<button type="button" className="btn smallbtn" disabled={blocked} onClick={()=>void openDoc(doc)}>Open</button>}
       <label style={{display:'flex',alignItems:'center',gap:5,whiteSpace:'nowrap'}}><input style={{width:'auto'}} type="checkbox" checked={!!r.verified&&!mismatch} disabled={blocked||!doc||mismatch||!!r.rv_waived} onChange={e=>void update(r,{verified:e.target.checked})}/> Approve document</label>
      </div>}
     </div>
    </div>
   })}</div>
  </>}
  <label className="field"><span>Review notes / reason for requesting changes</span><textarea rows={2} value={review} onChange={e=>onReviewChange(e.target.value)} placeholder="Required if sending back for corrections"/></label>
  <div className="actions" style={{marginTop:12}}>
   <button type="button" className="btn primary" disabled={blocked||!ready} title={!ready?'Verify required documents first':undefined} onClick={onApprove}>{stage==='Collapsed'?'Acknowledge collapsed file':'Approve file'}</button>
   {stage!=='Collapsed'&&<button type="button" className="btn" disabled={blocked||!review.trim()} onClick={onRequestChanges}>Request changes</button>}
   {!ready&&!loading&&<span className="hint">Approval unlocks when required documents are verified. You can request changes now.</span>}
  </div>
 </section>
}
