'use client';

import {useEffect,useState,type ChangeEvent} from 'react';
import {getSupabase} from '../lib/supabase';
import {brokerageDay} from '../lib/listing-status';

type DocumentRef={id:string;name:string};
type ActionName='firm'|'extend_subject'|'collapse'|'terminate'|'extend_listing'|'extend_completion'|'complete'|'funds'|'archive'|'missing';
type ActionOption={id:ActionName;label:string};
type FirmKey='signed'|'title'|'pds'|'cheque'|'trade'|'saleReport'|'receipt';
type FirmFiles=Record<FirmKey,File|null>;
const EMPTY_FIRM:FirmFiles={signed:null,title:null,pds:null,cheque:null,trade:null,saleReport:null,receipt:null};
const MAX_BYTES=20*1024*1024;
const allowedExtensions=/\.(pdf|jpg|jpeg|png|doc|docx|xls|xlsx|txt)$/i;
const fields:{key:FirmKey;label:string;template:string;accept:string;pdfOnly?:boolean;representation?:'listing'|'selling'}[]=[
 {key:'signed',label:'Signed Subject Removal (PDF)',template:'Signed subject removal / unconditional contract',accept:'.pdf,application/pdf',pdfOnly:true},
 {key:'title',label:'Title Search',template:'Title search',accept:'.pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx,.txt'},
 {key:'pds',label:'Property Disclosure Statement (PDS)',template:'Property Disclosure Statement (PDS)',accept:'.pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx,.txt'},
 {key:'cheque',label:'Deposit Cheque Copy / Receipt',template:'Deposit cheque copy / deposit receipt',accept:'.pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx,.txt'},
 {key:'trade',label:'Trade Record Sheet',template:'Trade record sheet',accept:'.pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx,.txt'},
 {key:'saleReport',label:'Sale Report Form',template:'Sale report form',representation:'selling',accept:'.pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx,.txt'},
 {key:'receipt',label:'Receipt of Funds',template:'Receipt of funds',representation:'listing',accept:'.pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx,.txt'},
];
const ADDENDUM_LABEL='Subject extension or other addendum (if applicable)';
const labels:Partial<Record<ActionName,string>>={
 extend_completion:'Signed completion amendment',complete:'Lawyer completion letter',
 terminate:'Signed listing termination',extend_listing:'Signed listing extension'
};

export default function TransactionActions({deal,docs,office,linked,notify,reload,onConvert,onEdit}:{
 deal:{id:string;kind:string;representation:'listing'|'selling';rv_stage:string|null;review_status:string;rv_completed_date:string|null;rv_funds_verified:boolean;updated_at:string};
 docs:DocumentRef[];office:boolean;linked:boolean;notify:(s:string)=>void;
 reload:()=>Promise<void>;onConvert:()=>void;onEdit:()=>void;
}){
 const db=getSupabase()!;
 const [action,setAction]=useState<ActionName|''>('');
 const [date,setDate]=useState(brokerageDay());
 const [document,setDocument]=useState('');
 const [newDocs,setNewDocs]=useState<DocumentRef[]>([]);
 const [firmFiles,setFirmFiles]=useState<FirmFiles>({...EMPTY_FIRM});
 const [firmSaved,setFirmSaved]=useState<Partial<Record<FirmKey,string>>>({});
 const [addendums,setAddendums]=useState<File[]>([]);
 const [addendumsSaved,setAddendumsSaved]=useState<Record<number,string>>({});
 const [extensionFile,setExtensionFile]=useState<File|null>(null);
 const [extensionSaved,setExtensionSaved]=useState('');
 const [note,setNote]=useState('');
 const [busy,setBusy]=useState(false);
 const [savingLabel,setSavingLabel]=useState('');
 function resetAction(){
  setAction('');setDate(brokerageDay());setDocument('');setNewDocs([]);setNote('');
  setFirmFiles({...EMPTY_FIRM});setFirmSaved({});setAddendums([]);setAddendumsSaved({});
  setExtensionFile(null);setExtensionSaved('');
 }
 useEffect(()=>{
  setAction('');setDocument('');setNewDocs([]);setNote('');setDate(brokerageDay());
  setFirmFiles({...EMPTY_FIRM});setFirmSaved({});setAddendums([]);setAddendumsSaved({});
  setExtensionFile(null);setExtensionSaved('');
 },[deal.id]);
 useEffect(()=>{if(office&&deal.review_status==='Submitted')void db.rpc('rv_tx_action',{p_deal:deal.id,p_action:'seen'})},[office,deal.id,deal.review_status,deal.updated_at,db]);
 const approved=deal.review_status==='Approved';
 const sale=deal.kind==='Sale';
 const conditional=sale&&(!deal.rv_stage||deal.rv_stage==='Accepted offer');
 const firm=deal.rv_stage==='Sold',complete=deal.rv_stage==='Completed';
 const options:ActionOption[]=[];
 if(!office&&approved&&!sale&&!linked)options.push({id:'terminate',label:'Terminate listing'},{id:'extend_listing',label:'Extend listing'});
 if(!office&&conditional&&['Draft','Submitted','Changes requested','Approved'].includes(deal.review_status)){
  // These are the three possible outcomes of an accepted offer, independent of Back Office approval.
  options.push(
   {id:'firm',label:'Remove subjects / mark firm sold'},
   {id:'extend_subject',label:'Extend subjects'},
   {id:'collapse',label:'Offer collapsed'}
  );
 }
 if(!office&&firm&&approved)options.push({id:'extend_completion',label:'Extend completion'});
 if(office&&firm&&approved)options.push({id:'complete',label:'Confirm legal completion'});
 if(office&&complete){if(!deal.rv_funds_verified)options.push({id:'funds',label:'Verify commission receipt'});options.push({id:'archive',label:'Close / archive file'})}
 if(office&&deal.rv_stage!=='Collapsed'&&['Submitted','Approved'].includes(deal.review_status))options.push({id:'missing',label:'Request missing documents'});
 // Set the selected action LAST. In particular, do not call resetAction() from
 // the select's onChange: it also clears the controlled value and can be
 // confusing when a transaction view refreshes during a document upload.
 function chooseAction(next:ActionName|''){
  setDate(brokerageDay());setDocument('');setNewDocs([]);setNote('');
  setFirmFiles({...EMPTY_FIRM});setFirmSaved({});setAddendums([]);setAddendumsSaved({});
  setExtensionFile(null);setExtensionSaved('');
  setAction(next);
 }
 const firmFields=fields.filter(field=>!field.representation||field.representation===deal.representation);
 const needsPDF=['terminate','extend_listing','extend_completion','complete'].includes(action);
 const needsDate=['firm','extend_subject','terminate','extend_listing','extend_completion','complete'].includes(action);
 const needsNote=['terminate','funds','missing'].includes(action);
 const availableDocs=[...docs,...newDocs.filter(n=>!docs.some(d=>d.id===n.id))];
 const missingFirm=firmFields.some(f=>!firmFiles[f.key]&&!firmSaved[f.key]);

 async function registerFile(file:File,template?:string,additional=false){
  if(file.size<1||file.size>MAX_BYTES)throw new Error(`${file.name}: maximum 20 MB per file.`);
  if(!allowedExtensions.test(file.name))throw new Error(`${file.name}: unsupported file type.`);
  const auth=await db.auth.getUser();
  if(auth.error||!auth.data.user)throw new Error('Sign in again before uploading.');
  const path=`${auth.data.user.id}/${deal.id}/action/${crypto.randomUUID()}-${file.name.replace(/[^A-Za-z0-9._-]/g,'_')}`;
  const stored=await db.storage.from('transaction-files').upload(path,file,{upsert:false});
  if(stored.error)throw new Error('Storage upload failed: '+stored.error.message);
  const registered=await db.from('deal_documents').insert({deal_id:deal.id,path,name:file.name}).select('id,name').single();
  if(registered.error){await db.storage.from('transaction-files').remove([path]);throw new Error('Document registration failed: '+registered.error.message)}
  const id:string=registered.data.id;
  setNewDocs(v=>[...v,{id,name:registered.data.name}]);
  if(template){
   const linked=await db.rpc('rv_link_uploaded_compliance_doc',{p_deal:deal.id,p_document:id,p_template_label:template,p_additional:additional});
   if(linked.error)throw new Error('File saved but could not link to '+template+': '+linked.error.message);
  }
  return id;
 }
 async function uploadSignedPDF(e:ChangeEvent<HTMLInputElement>){
  const file=e.target.files?.[0];e.target.value='';if(!file)return;
  if(!/\.pdf$/i.test(file.name)||(file.type&&file.type!=='application/pdf')){notify('Please upload a PDF.');return}
  setBusy(true);
  try{setSavingLabel('Uploading signed PDF…');const id=await registerFile(file);setDocument(id);notify('PDF uploaded. Confirm the selected action to record it.')}
  catch(err){notify((err as Error).message)}finally{setBusy(false);setSavingLabel('')}
 }
 async function submit(){
  if(!action)return;
  if(needsPDF&&!document){notify('Upload or select the signed PDF for this action.');return}
  if(action==='firm'&&missingFirm){notify(deal.representation==='listing'?'Required: Subject Removal, Title Search, PDS, Deposit Cheque Copy, Trade Record Sheet and Receipt of Funds.':'Required: Subject Removal, Title Search, PDS, Deposit Cheque Copy, Trade Record Sheet and Sale Report Form.');return}
  if(action==='extend_subject'&&!extensionFile&&!extensionSaved){notify('Select the signed subject extension PDF.');return}
  if(action==='extend_subject'&&(!date||date.length!==10)){notify('Enter the revised subject removal date.');return}
  if(action==='collapse'&&!window.confirm('Close this offer as COLLAPSED? No document is required. The sale will be locked and excluded from firm sales.'))return;
  setBusy(true);
  try{
   let selectedDocument=document;
   if(action==='firm'){
    // Keep uploaded IDs across retries if a later file or the database action fails.
    const persisted={...firmSaved};
    for(const field of firmFields){
     if(persisted[field.key])continue;
     const file=firmFiles[field.key];if(!file)throw new Error(field.label+' is required.');
     if(field.pdfOnly&&(!/\.pdf$/i.test(file.name)||(file.type&&file.type!=='application/pdf')))throw new Error('Subject Removal must be a signed PDF.');
     setSavingLabel('Uploading '+field.label+'…');
     const id=await registerFile(file,field.template);
     persisted[field.key]=id;setFirmSaved({...persisted});
    }
    selectedDocument=persisted.signed||'';
    for(let i=0;i<addendums.length;i++){
     if(addendumsSaved[i])continue;
     const file=addendums[i];setSavingLabel('Uploading addendum '+(i+1)+'…');
     const id=await registerFile(file,ADDENDUM_LABEL,true);
     setAddendumsSaved(v=>({...v,[i]:id}));
    }
   }else if(action==='extend_subject'){
    if(!extensionSaved){
     if(!extensionFile)throw new Error('Signed subject extension PDF is required.');
     if(!/\.pdf$/i.test(extensionFile.name)||(extensionFile.type&&extensionFile.type!=='application/pdf'))throw new Error('Subject extension must be a signed PDF.');
     setSavingLabel('Uploading subject extension PDF…');
     selectedDocument=await registerFile(extensionFile);
     setExtensionSaved(selectedDocument);
    }else selectedDocument=extensionSaved;
   }
   setSavingLabel('Recording transaction action…');
   const response=action==='archive'
    ?await db.rpc('rv_close_compliant_file',{p_deal:deal.id})
    :await db.rpc('rv_tx_action',{p_deal:deal.id,p_action:action,p_date:needsDate?date:null,p_document:action==='collapse'?null:selectedDocument||null,p_note:note});
   if(response.error)throw response.error;
   resetAction();await reload();
   notify(action==='collapse'?'Sale collapsed and file closed. No document required.':action==='firm'?'Firm sale submitted with required documents. Complete lawyer and commission details next.':action==='extend_subject'?'Subject extension date and PDF submitted for review.':'Transaction updated.');
  }catch(err){notify((err as Error).message)}
  finally{setBusy(false);setSavingLabel('')}
 }
 async function reopen(){
  setBusy(true);
  try{const r=await db.rpc('rv_tx_action',{p_deal:deal.id,p_action:'reopen'});if(r.error)throw r.error;await reload();onEdit()}
  catch(err){notify((err as Error).message)}finally{setBusy(false)}
 }
 return <section aria-label="Transaction actions" style={{margin:'20px 0'}}>
  <h3 style={{fontSize:17,margin:'0 0 10px'}}>Transaction actions</h3>
  {conditional&&!office&&<p className="hint">Choose the outcome of the accepted offer. Required files are entered here only when that action is selected. Lawyer and commission details come after the sale becomes firm.</p>}
  {deal.rv_stage==='Collapsed'&&<div className="notice">This offer is collapsed and closed. Its record remains for audit, but no additional transaction or commission actions are permitted.</div>}
  <div className="actions">
   {!office&&approved&&!sale&&!linked&&<button type="button" className="btn primary" disabled={busy} onClick={onConvert}>Accepted offer / create sale</button>}
   {!office&&approved&&conditional&&<button type="button" className="btn" disabled={busy} onClick={()=>void reopen()}>Update accepted-offer details</button>}
   {options.length>0&&<label style={{display:'inline-flex',alignItems:'center',gap:8,fontSize:13,fontWeight:700}}>File action
    <select aria-label="Select transaction action" value={action} disabled={busy} onChange={e=>chooseAction(e.currentTarget.value as ActionName|'')} style={{minWidth:240,maxWidth:'100%',padding:'9px 12px',borderRadius:8,border:'1px solid #cbd9cc',background:'#fff',position:'relative',zIndex:1,cursor:'pointer',pointerEvents:'auto'}}>
     <option value="">Choose action…</option>{options.map(o=><option key={o.id} value={o.id}>{o.label}</option>)}
    </select>
   </label>}
  </div>
  {complete&&<p>Legal completion: {deal.rv_completed_date} · {deal.rv_funds_verified?'Commission receipt verified':'Awaiting verified commission receipt'}. Back Office → Agent Payments handles payout authorization.</p>}
  {action&&<form className="panel" style={{marginTop:12}} onSubmit={e=>{e.preventDefault();void submit()}}>
   <h3>{options.find(o=>o.id===action)?.label}</h3>
   {needsDate&&<div className="field"><label htmlFor="rv-action-date">{action==='firm'?'Actual date subjects were removed':action==='extend_subject'?'New subject removal / extension date':action==='complete'?'Actual legal completion date':'Effective / revised date'}</label><input id="rv-action-date" type="date" required value={date} onChange={e=>setDate(e.target.value)} disabled={busy}/></div>}
   {action==='firm'&&<div style={{display:'grid',gap:13}}>
    <p className="hint">Attach these documents when marking the sale firm. They will appear in the compliance file after submission. Each file may be up to 20 MB.</p>
    <p className="hint"><strong>{deal.representation==='listing'?'Our listing — seller-side sale':'Buyer-side sale'}</strong> · All fields below are required for this transaction side.</p>
    {firmFields.map(field=><div className="field" key={field.key}>
     <label htmlFor={'rv-firm-'+field.key}>{field.label} <strong style={{color:'#a34422'}}>(Required)</strong></label>
     <input id={'rv-firm-'+field.key} type="file" accept={field.accept} required={!firmSaved[field.key]} disabled={busy||Boolean(firmSaved[field.key])} onChange={e=>{
      const file=e.target.files?.[0]||null;setFirmFiles(v=>({...v,[field.key]:file}));setFirmSaved(v=>({...v,[field.key]:undefined}));
     }}/>
     {firmSaved[field.key]&&<small style={{color:'#345d42'}}>Attached — ready to submit</small>}
    </div>)}
    <div className="field"><label htmlFor="rv-firm-addendums">Additional Addendums (Optional — Multiple Files)</label>
     <input id="rv-firm-addendums" type="file" multiple accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx,.txt" disabled={busy} onChange={e=>{setAddendums(Array.from(e.target.files||[]));setAddendumsSaved({})}}/>
     {addendums.length>0&&<small>{addendums.length} file(s) selected. Upload supports PDF, images, Word, Excel and text.</small>}
    </div>
   </div>}
   {action==='extend_subject'&&<div className="field">
    <label htmlFor="rv-subject-extension-pdf">Signed Subject Extension (PDF) <strong style={{color:'#a34422'}}>(Required)</strong></label>
    <input id="rv-subject-extension-pdf" type="file" accept=".pdf,application/pdf" required={!extensionSaved} disabled={busy||Boolean(extensionSaved)} onChange={e=>{setExtensionFile(e.target.files?.[0]||null);setExtensionSaved('')}}/>
    <p className="hint">Only the new subject date and the signed extension PDF are needed.</p>
    {extensionSaved&&<small>PDF attached — ready to submit</small>}
   </div>}
   {needsPDF&&<div className="field">
    <label htmlFor="rv-action-signed-pdf">{labels[action as ActionName]||'Signed supporting PDF'} (required)</label>
    <input id="rv-action-signed-pdf" aria-label={'Upload '+(labels[action as ActionName]||'signed PDF')} type="file" accept=".pdf,application/pdf" disabled={busy} onChange={e=>void uploadSignedPDF(e)}/>
    <p className="hint">Upload a signed PDF, or select one already attached to this transaction. Maximum 20 MB.</p>
    <select aria-label="Signed PDF for transaction action" required value={document} disabled={busy} onChange={e=>setDocument(e.target.value)}><option value="">Select signed PDF</option>{availableDocs.filter(d=>/\.pdf$/i.test(d.name)).map(d=><option key={d.id} value={d.id}>{d.name}</option>)}</select>
   </div>}
   {needsNote&&<div className="field"><label htmlFor="rv-action-note">{action==='funds'?'Verified bank / receipt reference':action==='missing'?'Missing documents and instructions':'Termination reason'}</label><textarea id="rv-action-note" required value={note} onChange={e=>setNote(e.target.value)}/></div>}
   {action==='collapse'&&<p className="hint">No PDF, date, or other document is required. Confirming will mark the offer collapsed, close the sale file and preserve its audit history.</p>}
   {action==='firm'&&<p className="hint">After confirmation, enter the lawyer contacts, commission and deposit information in the firm-sale file. Back Office will verify the uploaded documents.</p>}
   {action==='funds'&&<p className="hint">Only confirm after the full commission has cleared. This action does not move money.</p>}
   {savingLabel&&<p role="status" className="hint">{savingLabel}</p>}
   <div className="actions"><button className="btn primary" disabled={busy||(needsPDF&&!document)||(action==='firm'&&missingFirm)||(action==='extend_subject'&&!extensionFile&&!extensionSaved)}>{busy?'Working…':action==='collapse'?'Confirm collapsed / close file':action==='firm'?'Submit firm sale & documents':action==='extend_subject'?'Confirm subject extension':'Confirm '+options.find(o=>o.id===action)?.label.toLowerCase()}</button><button className="btn" type="button" disabled={busy} onClick={resetAction}>Cancel</button></div>
  </form>}
 </section>;
}
