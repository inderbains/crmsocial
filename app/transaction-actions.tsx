'use client';

import {useEffect,useState,type ChangeEvent} from 'react';
import {getSupabase} from '../lib/supabase';
import {brokerageDay} from '../lib/listing-status';
import LawyerChoice from './lawyer-choice';
import {emptyLawyer,hasLawyer,saveLawyerEntry,type Lawyer,type LawyerEntry} from '../lib/lawyers';

type DocumentRef={id:string;name:string};
type ActionName='firm'|'extend_subject'|'collapse'|'terminate'|'extend_listing'|'extend_completion'|'complete'|'funds'|'archive'|'missing';
type ActionOption={id:ActionName;label:string};
type FirmKey='signed'|'title'|'pds'|'cheque'|'trade'|'saleReport'|'receipt';
type FirmFiles=Record<FirmKey,File|null>;
const EMPTY_FIRM:FirmFiles={signed:null,title:null,pds:null,cheque:null,trade:null,saleReport:null,receipt:null};
const MAX_BYTES=20*1024*1024;
const allowedExtensions=/\.(pdf|jpg|jpeg|png|doc|docx|xls|xlsx|txt)$/i;
const fields:{key:FirmKey;label:string;template:string;accept:string;pdfOnly?:boolean;representation?:'listing'|'selling'}[]=[
 {key:'signed',label:'Signed Subject Removal / Unconditional Contract (PDF)',template:'Signed subject removal / unconditional contract',accept:'.pdf,application/pdf',pdfOnly:true},
 {key:'title',label:'Title Search',template:'Title search',accept:'.pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx,.txt'},
 {key:'pds',label:'Property Disclosure Statement (PDS)',template:'Property Disclosure Statement (PDS)',accept:'.pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx,.txt'},
 {key:'cheque',label:'Deposit Cheque Copy / Receipt',template:'Deposit cheque copy / deposit receipt',accept:'.pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx,.txt'},
 {key:'trade',label:'Trade Record Sheet',template:'Trade record sheet',accept:'.pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx,.txt'},
 {key:'saleReport',label:'Sale Report Form',template:'Sale report form',accept:'.pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx,.txt'},
 {key:'receipt',label:'Receipt of Funds',template:'Receipt of funds',accept:'.pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx,.txt'},
];
const ADDENDUM_LABEL='Subject extension or other addendum (if applicable)';
const labels:Partial<Record<ActionName,string>>={
 extend_completion:'Signed completion amendment',complete:'Lawyer completion letter',
 terminate:'Signed listing termination',extend_listing:'Signed listing extension'
};

export default function TransactionActions({deal,docs,agentName,office,linked,notify,reload,onConvert,onEdit}:{
 deal:{id:string;kind:string;representation:'listing'|'selling';parent_listing_id?:string|null;cooperating_agent?:string;rv_stage:string|null;review_status:string;rv_completed_date:string|null;rv_funds_verified:boolean;updated_at:string;listing_commission?:number;selling_commission?:number;gst_rate?:number;deposit_amount?:number;deposit_holder?:'our_brokerage'|'other_brokerage';deposit_brokerage?:string};
 docs:DocumentRef[];agentName?:string;office:boolean;linked:boolean;notify:(s:string)=>void;
 reload:()=>Promise<void>;onConvert:()=>void;onEdit:()=>void;
}){
 const db=getSupabase()!;
 const [action,setAction]=useState<ActionName|''>('');
 const [saleOutcome,setSaleOutcome]=useState<'subject_removed'|'direct_sold'>('subject_removed');
 const [firmStep,setFirmStep]=useState<1|2|3>(1);
 const [lawyers,setLawyers]=useState<Lawyer[]>([]);
 const [buyerLawyer,setBuyerLawyer]=useState<LawyerEntry>(emptyLawyer());
 const [sellerLawyer,setSellerLawyer]=useState<LawyerEntry>(emptyLawyer());
 const [financial,setFinancial]=useState({listing_commission:0,selling_commission:0,gst_rate:5,deposit_amount:0,deposit_holder:'' as ''|'our_brokerage'|'other_brokerage',deposit_brokerage:''});
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
 useEffect(()=>{void db.from('brokerage_lawyers').select('*').order('name').then(r=>{if(!r.error)setLawyers(r.data||[])})},[db]);
 const dualCommission=Boolean(deal.parent_listing_id);
 const singleListing=!dualCommission&&deal.representation==='listing';
 const validMoney=[financial.listing_commission,financial.selling_commission,financial.gst_rate,financial.deposit_amount].every(n=>Number.isFinite(n)&&n>=0)
  &&financial.gst_rate<=100&&(dualCommission?financial.listing_commission+financial.selling_commission>0:singleListing?financial.listing_commission>0:financial.selling_commission>0)
  &&Boolean(financial.deposit_holder)&&(financial.deposit_holder!=='other_brokerage'||Boolean(financial.deposit_brokerage.trim()));
 const money=(n:number)=>new Intl.NumberFormat('en-CA',{style:'currency',currency:'CAD'}).format(Number(n)||0);
 const gross=dualCommission?financial.listing_commission+financial.selling_commission:singleListing?financial.listing_commission:financial.selling_commission;
 const gst=Math.round(gross*financial.gst_rate)/100;
 const readyLawyers=hasLawyer(buyerLawyer)&&hasLawyer(sellerLawyer);
 const setAmount=(k:'listing_commission'|'selling_commission'|'gst_rate'|'deposit_amount',value:string)=>setFinancial(v=>({...v,[k]:Number(value)}));
 function resetAction(){
  setAction('');setFirmStep(1);setSaleOutcome('subject_removed');setDate(brokerageDay());setDocument('');setNewDocs([]);setNote('');
  setFirmFiles({...EMPTY_FIRM});setFirmSaved({});setAddendums([]);setAddendumsSaved({});
  setExtensionFile(null);setExtensionSaved('');
 }
 useEffect(()=>{
  setAction('');setFirmStep(1);setSaleOutcome('subject_removed');setDocument('');setNewDocs([]);setNote('');setDate(brokerageDay());
  setFinancial({listing_commission:Number(deal.listing_commission||0),selling_commission:Number(deal.selling_commission||0),gst_rate:Number(deal.gst_rate??5),deposit_amount:Number(deal.deposit_amount||0),deposit_holder:deal.deposit_holder||'',deposit_brokerage:deal.deposit_brokerage||''});setBuyerLawyer(emptyLawyer());setSellerLawyer(emptyLawyer());
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
 if(!office&&conditional&&['Draft','Changes requested','Approved'].includes(deal.review_status)){
  // These are the three possible outcomes of an accepted offer, independent of Back Office approval.
  options.push({id:'firm',label:'Remove subjects / direct sold'});
  options.push(
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
  setDate(brokerageDay());setSaleOutcome('subject_removed');setFirmStep(1);setDocument('');setNewDocs([]);setNote('');
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
  if(action==='firm'&&missingFirm){notify(deal.representation==='listing'?'Required: Signed subject removal or unconditional contract, Title Search, PDS, Deposit Cheque Copy, Trade Record Sheet, Sale Report Form and Receipt of Funds.':'Required: Signed subject removal or unconditional contract, Title Search, PDS, Deposit Cheque Copy, Trade Record Sheet, Sale Report Form and Receipt of Funds.');return}
  if(action==='firm'&&!validMoney){notify('Enter the agent-side commission(s), GST rate, deposit amount and who holds the deposit.');return}
  if(action==='firm'&&!readyLawyers){notify('Enter or select both the buyer and seller lawyer contacts.');return}
  if(action==='extend_subject'&&!extensionFile&&!extensionSaved){notify('Select the signed subject extension PDF.');return}
  if(action==='extend_subject'&&(!date||date.length!==10)){notify('Enter the revised subject removal date.');return}
  if(action==='collapse'&&!window.confirm('Close this offer as COLLAPSED? No document is required. The sale will be locked and excluded from firm sales.'))return;
  setBusy(true);
  try{
   let selectedDocument=document;
   let buyerLawyerId:string|null=null,sellerLawyerId:string|null=null;
   if(action==='firm'){
    // Validate lawyer details before uploading any transaction documents.
    const savedBuyer=await saveLawyerEntry(db,buyerLawyer);
    const savedSeller=await saveLawyerEntry(db,sellerLawyer);
    if(!savedBuyer||!savedSeller)throw new Error('Both lawyer contacts are required.');
    buyerLawyerId=savedBuyer.id;sellerLawyerId=savedSeller.id;
    // Keep uploaded IDs across retries if a later file or the database action fails.
    const persisted={...firmSaved};
    for(const field of firmFields){
     if(persisted[field.key])continue;
     const file=firmFiles[field.key];if(!file)throw new Error(field.label+' is required.');
     if(field.pdfOnly&&(!/\.pdf$/i.test(file.name)||(file.type&&file.type!=='application/pdf')))throw new Error('Upload the signed subject removal or unconditional accepted contract as a PDF.');
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
   const response=action==='firm'
    ?await db.rpc('rv059_submit_firm_with_details',{p_deal:deal.id,p_date:date,p_document:selectedDocument,p_outcome:saleOutcome,p_buyer_lawyer:buyerLawyerId,p_seller_lawyer:sellerLawyerId,p_listing_commission:dualCommission||singleListing?financial.listing_commission:0,p_selling_commission:singleListing?0:financial.selling_commission,p_gst_rate:financial.gst_rate,p_deposit_amount:financial.deposit_amount,p_deposit_holder:financial.deposit_holder,p_deposit_brokerage:financial.deposit_brokerage})
    :action==='extend_subject'||action==='collapse'
    ?await db.rpc('rv056_offer_update',{p_deal:deal.id,p_action:action,p_date:action==='extend_subject'?date:null,p_document:action==='extend_subject'?selectedDocument||null:null})
    :action==='archive'
    ?await db.rpc('rv_close_compliant_file',{p_deal:deal.id})
    :await db.rpc('rv_tx_action',{p_deal:deal.id,p_action:action,p_date:needsDate?date:null,p_document:selectedDocument||null,p_note:note});
   if(response.error)throw response.error;
   resetAction();await reload();
   notify(action==='collapse'?'Offer collapsed. The linked listing is active again. Back Office notified; no compliance review required.':action==='firm'?'Firm sale, documents, GST, commission, deposit holder and both lawyers submitted together for Back Office approval.':action==='extend_subject'?'Subject extension recorded. Back Office notified; no compliance approval needed.':'Transaction updated.');
  }catch(err){notify((err as Error).message)}
  finally{setBusy(false);setSavingLabel('')}
 }
 async function reopen(){
  setBusy(true);
  try{const r=await db.rpc('rv_tx_action',{p_deal:deal.id,p_action:'reopen'});if(r.error)throw r.error;await reload();onEdit()}
  catch(err){notify((err as Error).message)}finally{setBusy(false)}
 }
 return <section aria-label="Transaction actions" style={{margin:'20px 0'}}>
  <h3 style={{fontSize:17,margin:'0 0 10px'}}>Transaction actions</h3><p className="hint">Assigned Realtor: {agentName||'Agent profile name unavailable'}</p>
  {conditional&&!office&&<p className="hint">Choose the outcome of the accepted offer. Required files are entered here only when that action is selected. Lawyer and commission details come after the sale becomes firm.</p>}
  {deal.rv_stage==='Collapsed'&&<div className="notice">This offer is collapsed and closed. Its record remains for audit, but no additional transaction or commission actions are permitted.</div>}
  <div className="actions">
   {!office&&approved&&!sale&&!linked&&<button type="button" className="btn primary" disabled={busy} onClick={onConvert}>Accepted offer / create sale</button>}
   
   {options.length>0&&<label style={{display:'inline-flex',alignItems:'center',gap:8,fontSize:13,fontWeight:700}}>File action
    <select aria-label="Select transaction action" value={action} disabled={busy} onChange={e=>chooseAction(e.currentTarget.value as ActionName|'')} style={{minWidth:240,maxWidth:'100%',padding:'9px 12px',borderRadius:8,border:'1px solid #cbd9cc',background:'#fff',position:'relative',zIndex:1,cursor:'pointer',pointerEvents:'auto'}}>
     <option value="">Choose action…</option>{options.map(o=><option key={o.id} value={o.id}>{o.label}</option>)}
    </select>
   </label>}
  </div>
  {complete&&<p>Legal completion: {deal.rv_completed_date} · {deal.rv_funds_verified?'Commission receipt verified':'Awaiting verified commission receipt'}. Back Office → Agent Payments handles payout authorization.</p>}
  {action&&<form className="panel" style={{marginTop:12}} onSubmit={e=>{e.preventDefault();void submit()}}>
   <h3>{options.find(o=>o.id===action)?.label}</h3>
   {needsDate&&<div className="field"><label htmlFor="rv-action-date">{action==='firm'?(saleOutcome==='direct_sold'?'Date the unconditional offer became firm':'Actual date subjects were removed'):action==='extend_subject'?'New subject removal / extension date':action==='complete'?'Actual legal completion date':'Effective / revised date'}</label><input id="rv-action-date" type="date" required value={date} onChange={e=>setDate(e.target.value)} disabled={busy}/></div>}
   {action==='firm'&&firmStep===1&&<div style={{display:'grid',gap:13}}><fieldset style={{border:'1px solid #cbd9cc',padding:12,borderRadius:8}}><legend>How did this offer become firm?</legend><label style={{display:'block',marginBottom:8}}><input style={{width:'auto',marginRight:8}} type="radio" name="sale-outcome" checked={saleOutcome==='subject_removed'} onChange={()=>setSaleOutcome('subject_removed')} disabled={busy}/>Subjects removed</label><label style={{display:'block'}}><input style={{width:'auto',marginRight:8}} type="radio" name="sale-outcome" checked={saleOutcome==='direct_sold'} onChange={()=>setSaleOutcome('direct_sold')} disabled={busy}/>Direct sold — unconditional offer, no subjects</label><p className="hint">For a direct sale, attach the signed unconditional Contract of Purchase and Sale in the first document slot instead of a subject-removal notice.</p></fieldset>
    <p className="hint">Step 1 of 3 — Attach all required documents. These are uploaded with the final submission, not sent to Back Office until you confirm Step 3. Attach these documents when marking the sale firm. They will appear in the compliance file after submission. Each file may be up to 20 MB.</p>
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
    <div className="actions"><button type="button" className="btn primary" disabled={busy||missingFirm} onClick={()=>setFirmStep(2)}>Next: Commission, GST & deposit →</button></div>
   </div>}
   {action==='firm'&&firmStep===2&&<div className="panel" style={{marginTop:12}}>
    <h3>Step 2 of 3 · Realtor commission, GST & deposit</h3>
    <p className="hint"><b>Our Realtor:</b> {agentName||'Agent profile name unavailable'}. {dualCommission?'Our listing has been sold: record listing-side commission (our Realtor) and selling-side commission (cooperating Realtor). These amounts are separate brokerage-side commissions; they do not automatically authorize two agent payouts.':'Sale-only transaction: enter only the commission for our Realtor’s side. Do not calculate a second internal Realtor payout.'}</p>
    <div className="crm-form-grid">
     {(dualCommission||singleListing)&&<div className="field"><label htmlFor="rv-listing-commission">{dualCommission?'Listing Realtor side':'Our Realtor — Listing side'} — commission before GST (CAD)</label><input id="rv-listing-commission" type="number" min="0" step="0.01" required value={financial.listing_commission} onChange={e=>setAmount('listing_commission',e.target.value)}/></div>}
     {!singleListing&&<div className="field"><label htmlFor="rv-selling-commission">{dualCommission?`Selling Realtor side${deal.cooperating_agent?' · '+deal.cooperating_agent:''}`:'Our Realtor'} — commission before GST (CAD)</label><input id="rv-selling-commission" type="number" min="0" step="0.01" required value={financial.selling_commission} onChange={e=>setAmount('selling_commission',e.target.value)}/></div>}
     <div className="field"><label htmlFor="rv-commission-gst-rate">Applicable commission GST rate (%)</label><input id="rv-commission-gst-rate" type="number" min="0" max="100" step="0.01" required value={financial.gst_rate} onChange={e=>setAmount('gst_rate',e.target.value)}/></div>
     <div className="field"><label htmlFor="rv-deposit-amount">Deposit amount (CAD)</label><input id="rv-deposit-amount" type="number" min="0" step="0.01" required value={financial.deposit_amount} onChange={e=>setAmount('deposit_amount',e.target.value)}/></div>
     <div className="field"><label htmlFor="rv-deposit-held-by">Deposit held by (Required)</label><select id="rv-deposit-held-by" required value={financial.deposit_holder} onChange={e=>setFinancial(v=>({...v,deposit_holder:e.target.value as typeof v.deposit_holder}))}><option value="">Choose deposit holder</option><option value="our_brokerage">Our brokerage — trust account</option><option value="other_brokerage">Other brokerage</option></select></div>
     {financial.deposit_holder==='other_brokerage'&&<div className="field"><label htmlFor="rv-deposit-brokerage">Other brokerage holding deposit (Required)</label><input id="rv-deposit-brokerage" required value={financial.deposit_brokerage} onChange={e=>setFinancial(v=>({...v,deposit_brokerage:e.target.value}))}/></div>}
    </div>
    <div className="notice"><strong>Commission before GST:</strong> {money(gross)} · <strong>GST:</strong> {money(gst)} · <strong>Total including GST:</strong> {money(gross+gst)}{dualCommission&&<p>Listing side: {money(financial.listing_commission)} + GST {money(Math.round(financial.listing_commission*financial.gst_rate)/100)} · Selling side: {money(financial.selling_commission)} + GST {money(Math.round(financial.selling_commission*financial.gst_rate)/100)}</p>}</div>
    <p className="hint">Use the GST rate applicable to this transaction and verify tax-registration status before authorizing an agent payout. Choosing “Our brokerage” records the deposit holder but does not falsely mark bank funds received; Back Office must reconcile the actual trust deposit.</p>
    <div className="actions"><button type="button" className="btn" onClick={()=>setFirmStep(1)}>← Documents</button><button type="button" className="btn primary" disabled={!validMoney} onClick={()=>setFirmStep(3)}>Next: Lawyer contacts →</button></div>
   </div>}
   {action==='firm'&&firmStep===3&&<div className="panel" style={{marginTop:12}}>
    <h3>Step 3 of 3 · Lawyer information & final submission</h3>
    <p className="hint">Review and add the buyer and seller lawyer contacts. Your final submission sends documents, commissions plus GST and deposit-holder details together to Back Office for review.</p>
    <div className="crm-form-grid"><LawyerChoice side="buyer" value={buyerLawyer} lawyers={lawyers} onChange={setBuyerLawyer} disabled={busy}/><LawyerChoice side="seller" value={sellerLawyer} lawyers={lawyers} onChange={setSellerLawyer} disabled={busy}/></div>
    <div className="actions"><button type="button" className="btn" disabled={busy} onClick={()=>setFirmStep(2)}>← Commission & deposit</button></div>
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
   {action==='firm'&&firmStep===3&&<p className="hint">All three steps are submitted as one firm-sale action for review. Back Office will verify the actual documents, amounts and lawyer details before approving and preparing the CIR. A deposit held by our brokerage must be reconciled in Trust & Bank.</p>}
   {action==='funds'&&<p className="hint">Only confirm after the full commission has cleared. This action does not move money.</p>}
   {savingLabel&&<p role="status" className="hint">{savingLabel}</p>}
   <div className="actions">{(action!=='firm'||firmStep===3)&&<button className="btn primary" disabled={busy||(needsPDF&&!document)||(action==='firm'&&(missingFirm||!validMoney||!readyLawyers))||(action==='extend_subject'&&!extensionFile&&!extensionSaved)}>{busy?'Working…':action==='collapse'?'Confirm collapsed / close file':action==='firm'?'Submit firm sale, commission & lawyers':action==='extend_subject'?'Confirm subject extension':'Confirm '+options.find(o=>o.id===action)?.label.toLowerCase()}</button>}<button className="btn" type="button" disabled={busy} onClick={resetAction}>Cancel</button></div>
  </form>}
 </section>;
}
