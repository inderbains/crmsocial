'use client';

import {useEffect,useState,type ChangeEvent} from 'react';
import {getSupabase} from '../lib/supabase';
import {brokerageDay} from '../lib/listing-status';

type DocumentRef={id:string;name:string};
type ActionName='firm'|'extend_subject'|'collapse'|'terminate'|'extend_listing'|'extend_completion'|'complete'|'funds'|'archive'|'missing';
type ActionOption={id:ActionName;label:string};
const MAX_PDF_BYTES=20*1024*1024;
const labels:Partial<Record<ActionName,string>>={
 firm:'Signed subject removal / unconditional contract',
 extend_subject:'Signed subject extension',
 collapse:'Signed collapse / release document',
 extend_completion:'Signed completion amendment',
 complete:'Lawyer completion letter',
 terminate:'Signed listing termination',
 extend_listing:'Signed listing extension'
};

export default function TransactionActions({deal,docs,office,linked,notify,reload,onConvert,onEdit}:{
 deal:{id:string;kind:string;rv_stage:string|null;review_status:string;rv_completed_date:string|null;rv_funds_verified:boolean;updated_at:string};
 docs:DocumentRef[];office:boolean;linked:boolean;notify:(s:string)=>void;
 reload:()=>Promise<void>;onConvert:()=>void;onEdit:()=>void;
}){
 const db=getSupabase()!;
 const [action,setAction]=useState<ActionName|''>('');
 const [date,setDate]=useState(brokerageDay());
 const [document,setDocument]=useState('');
 const [newDocs,setNewDocs]=useState<DocumentRef[]>([]);
 const [note,setNote]=useState('');
 const [busy,setBusy]=useState(false);
 useEffect(()=>{setAction('');setDocument('');setNewDocs([]);setNote('');setDate(brokerageDay())},[deal.id]);
 useEffect(()=>{if(office&&deal.review_status==='Submitted')void db.rpc('rv_tx_action',{p_deal:deal.id,p_action:'seen'})},[office,deal.id,deal.review_status,deal.updated_at,db]);
 const approved=deal.review_status==='Approved';
 const sale=deal.kind==='Sale';
 const conditional=sale&&(!deal.rv_stage||deal.rv_stage==='Accepted offer');
 const firm=deal.rv_stage==='Sold',complete=deal.rv_stage==='Completed';
 const options:ActionOption[]=[];
 if(!office&&approved&&!sale&&!linked){options.push({id:'terminate',label:'Terminate listing'},{id:'extend_listing',label:'Extend listing'})}
 if(!office&&conditional){
  if(['Approved','Draft','Changes requested'].includes(deal.review_status))options.push({id:'firm',label:'Subjects removed / firm sold'});
  if(approved)options.push({id:'extend_subject',label:'Subject extension'},{id:'collapse',label:'Sale collapsed / close file'});
 }
 if(!office&&firm&&approved)options.push({id:'extend_completion',label:'Extend completion'});
 if(office&&firm&&approved)options.push({id:'complete',label:'Confirm legal completion'});
 if(office&&complete){if(!deal.rv_funds_verified)options.push({id:'funds',label:'Verify commission receipt'});options.push({id:'archive',label:'Close / archive file'})}
 if(office&&deal.rv_stage!=='Collapsed'&&['Submitted','Approved'].includes(deal.review_status))options.push({id:'missing',label:'Request missing documents'});
 const needsPDF=['firm','extend_subject','collapse','terminate','extend_listing','extend_completion','complete'].includes(action);
 const needsDate=needsPDF&&action!=='collapse';
 const needsNote=['terminate','funds','missing'].includes(action);
 const availableDocs=[...docs,...newDocs.filter(n=>!docs.some(d=>d.id===n.id))];

 async function uploadSignedPDF(e:ChangeEvent<HTMLInputElement>){
  const file=e.target.files?.[0];e.target.value='';if(!file)return;
  if(!/\.pdf$/i.test(file.name)||file.type&&file.type!=='application/pdf')return notify('Please upload a signed PDF document.');
  if(file.size<1||file.size>MAX_PDF_BYTES)return notify('The signed PDF must be between 1 byte and 20 MB.');
  setBusy(true);
  try{
   const session=await db.auth.getUser();
   if(session.error||!session.data.user)throw new Error('Sign in again before attaching a PDF.');
   const path=`${session.data.user.id}/${deal.id}/action/${crypto.randomUUID()}-${file.name.replace(/[^A-Za-z0-9._-]/g,'_')}`;
   const stored=await db.storage.from('transaction-files').upload(path,file,{upsert:false,contentType:'application/pdf'});
   if(stored.error)throw stored.error;
   const registered=await db.from('deal_documents').insert({deal_id:deal.id,path,name:file.name}).select('id,name').single();
   if(registered.error){await db.storage.from('transaction-files').remove([path]);throw registered.error}
   const added={id:registered.data.id,name:registered.data.name};
   setNewDocs(current=>[...current,added]);setDocument(added.id);
   notify('Signed PDF attached. Confirm the selected transaction action to record it.');
  }catch(err){notify('PDF upload failed: '+(err as Error).message)}
  finally{setBusy(false)}
 }
 async function submit(){
  if(!action||needsPDF&&!document){notify('Attach or select the signed PDF for this action.');return}
  if(action==='collapse'&&!window.confirm('Mark this offer COLLAPSED and close the sale file? You will not be able to change the deal after this.'))return;
  setBusy(true);
  try{
   const r=action==='archive'
    ?await db.rpc('rv_close_compliant_file',{p_deal:deal.id})
    :await db.rpc('rv_tx_action',{p_deal:deal.id,p_action:action,p_date:needsDate?date:null,p_document:needsPDF?document:null,p_note:note});
   if(r.error)throw r.error;
   setAction('');setDocument('');setNote('');
   await reload();
   notify(action==='collapse'?'Sale marked collapsed and closed.':action==='firm'?'Firm sale recorded. Complete the lawyer and commission information next.':'Transaction updated.');
  }catch(err){notify((err as Error).message)}finally{setBusy(false)}
 }
 async function reopen(){
  setBusy(true);
  try{const r=await db.rpc('rv_tx_action',{p_deal:deal.id,p_action:'reopen'});if(r.error)throw r.error;await reload();onEdit()}
  catch(err){notify((err as Error).message)}finally{setBusy(false)}
 }
 return <section aria-label="Transaction actions" style={{margin:'20px 0'}}>
  <h3 style={{fontSize:17,margin:'0 0 10px'}}>Transaction actions</h3>
  {conditional&&!office&&<p className="hint">Choose what happened to the accepted offer. Attach the corresponding signed PDF. Commission and lawyer details are entered after subjects are removed.</p>}
  {deal.rv_stage==='Collapsed'&&<div className="notice">This sale is collapsed and closed. Documents remain available for audit; no additional transaction or commission actions are permitted.</div>}
  <div className="actions">
   {!office&&approved&&!sale&&!linked&&<button type="button" className="btn primary" disabled={busy} onClick={onConvert}>Accepted offer / create sale</button>}
   {!office&&approved&&conditional&&<button type="button" className="btn" disabled={busy} onClick={()=>void reopen()}>Update accepted-offer details</button>}
   {options.length>0&&<label style={{display:'inline-flex',alignItems:'center',gap:8,fontSize:13,fontWeight:700}}>File action
    <select aria-label="Select transaction action" value={action} disabled={busy} onChange={e=>{setAction(e.target.value as ActionName|'');setDocument('');setNote('');setDate(brokerageDay())}} style={{minWidth:240,maxWidth:'100%',padding:'9px 12px',borderRadius:8,border:'1px solid #cbd9cc',background:'#fff'}}>
     <option value="">Choose action…</option>{options.map(o=><option key={o.id} value={o.id}>{o.label}</option>)}
    </select>
   </label>}
  </div>
  {complete&&<p>Legal completion: {deal.rv_completed_date} · {deal.rv_funds_verified?'Commission receipt verified':'Awaiting verified commission receipt'}. Back Office → Agent Payments handles the payout authorization.</p>}
  {action&&<form className="panel" style={{marginTop:12}} onSubmit={e=>{e.preventDefault();void submit()}}>
   <h3>{options.find(o=>o.id===action)?.label}</h3>
   {needsDate&&<div className="field"><label htmlFor="rv-action-date">{action==='firm'?'Actual date subjects were removed':action==='extend_subject'?'New subject removal date':action==='complete'?'Actual legal completion date':'Effective / revised date'}</label><input id="rv-action-date" type="date" required value={date} onChange={e=>setDate(e.target.value)}/></div>}
   {needsPDF&&<div className="field">
    <label htmlFor="rv-action-signed-pdf">{labels[action as ActionName]||'Signed supporting PDF'} (required)</label>
    <input id="rv-action-signed-pdf" aria-label={'Upload '+(labels[action as ActionName]||'signed PDF')} type="file" accept=".pdf,application/pdf" disabled={busy} onChange={e=>void uploadSignedPDF(e)}/>
    <p className="hint">Upload the signed PDF here, or select one already attached to this transaction. Maximum 20 MB.</p>
    <select aria-label="Signed PDF for transaction action" required value={document} disabled={busy} onChange={e=>setDocument(e.target.value)}><option value="">Select signed PDF</option>{availableDocs.filter(d=>/\.pdf$/i.test(d.name)).map(d=><option key={d.id} value={d.id}>{d.name}</option>)}</select>
   </div>}
   {needsNote&&<div className="field"><label htmlFor="rv-action-note">{action==='funds'?'Verified bank / receipt reference':action==='missing'?'Missing documents and instructions':'Termination reason'}</label><textarea id="rv-action-note" required value={note} onChange={e=>setNote(e.target.value)}/></div>}
   {action==='collapse'&&<p className="hint">A collapsed sale is closed for transaction work and does not count as a firm sale or earn commission. Back Office can still review its retained documents.</p>}
   {action==='firm'&&<p className="hint">After you mark the sale firm, enter the lawyer contacts, commission and deposit information in the new section on this page.</p>}
   {action==='funds'&&<p className="hint">Only confirm after the full commission has actually cleared. This action does not move money.</p>}
   <div className="actions"><button className="btn primary" disabled={busy||needsPDF&&!document}>{busy?'Working…':action==='collapse'?'Confirm collapsed / close file':'Confirm '+options.find(o=>o.id===action)?.label.toLowerCase()}</button><button className="btn" type="button" disabled={busy} onClick={()=>setAction('')}>Cancel</button></div>
  </form>}
 </section>;
}
