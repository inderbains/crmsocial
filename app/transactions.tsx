'use client';
import {useCallback,useEffect,useState,type FormEvent} from 'react';
import {getSupabase} from '../lib/supabase';
import AgentReports from './agent-reports';
import TransactionActions from './transaction-actions';
import StagedDocumentUpload from './staged-document-upload';
import PostFirmDetails from './post-firm-details';
import {listingStatus,type ListingTerms} from '../lib/listing-status';
import DealAdmin from './deal-admin';
import DirectFileReview from './direct-file-review';
import {transactionLabel} from '../lib/agent-reports';
import type {Lawyer} from '../lib/lawyers';
import ComplianceClosingPanel from './compliance-closing-panel';
import ClosingPanel from './closing-panel';
import TransactionCommissionPayout from './transaction-commission-payout';
import {calculateClosing,money} from '../supabase/functions/_shared/calculations.mjs';
type Deal={pid:string;legal_description:string;contract_date:string|null;possession_date:string|null;adjustment_date:string|null;deposit_due_date:string|null;cooperating_brokerage:string;cooperating_agent:string;cooperating_email:string;parent_listing_id:string|null;rv_stage:string|null;rv_firm_date:string|null;rv_completed_date:string|null;rv_completion_letter:string|null;rv_funds_verified:boolean;rv_post_firm_details_confirmed?:boolean;rv_deleted_at?:string|null;updated_at:string;id:string;user_id:string;kind:string;address:string;client_name:string;mls_number:string;price:number|null;sale_price:number|null;listing_date:string|null;subject_date:string|null;completion_date:string|null;notes:string;review_status:string;review_notes:string;transaction_number:number|null;brokerage_id:string|null;buyer_name:string;seller_name:string;buyer_lawyer_id:string|null;seller_lawyer_id:string|null;buyer_lawyer:Lawyer|null;seller_lawyer:Lawyer|null;representation:'listing'|'selling';listing_commission:number;selling_commission:number;deposit_amount:number;deposit_holder:'our_brokerage'|'other_brokerage';deposit_brokerage:string;gst_rate:number};
type Doc={id:string;name:string;path:string;deal_id:string};
type DealInput=Omit<Deal,'id'|'user_id'|'review_status'|'review_notes'|'brokerage_id'|'transaction_number'|'buyer_lawyer'|'seller_lawyer'|'rv_stage'|'rv_firm_date'|'rv_completed_date'|'rv_completion_letter'|'rv_funds_verified'|'updated_at'>;
const fresh=(kind:string):DealInput=>({pid:'',legal_description:'',contract_date:null,possession_date:null,adjustment_date:null,deposit_due_date:null,cooperating_brokerage:'',cooperating_agent:'',cooperating_email:'',parent_listing_id:null,kind,address:'',client_name:'',mls_number:'',price:null,sale_price:null,listing_date:null,subject_date:null,completion_date:null,notes:'',buyer_name:'',seller_name:'',buyer_lawyer_id:null,seller_lawyer_id:null,representation:'selling',listing_commission:0,selling_commission:0,deposit_amount:0,deposit_holder:'our_brokerage',deposit_brokerage:'',gst_rate:5});

type OfferAttachment = { label:string; title:string; multiple?:boolean; required:boolean };
const requiredOfferAttachments=(side:'listing'|'selling'):OfferAttachment[]=>[
 {label:'Signed purchase and sale contract',title:'Accepted Offer / Contract of Purchase and Sale (CPS)',required:true},
 {label:'Commission disclosure',title:'Commission Disclosure',required:true},
 {label:'Disclosure of services / representation',title:'Disclosure of Services / Representation',required:true},
 {label:side==='listing'?'FINTRAC identity verification — seller(s)':'FINTRAC identity verification — buyer(s)',title:side==='listing'?'Seller ID(s)':'Buyer ID(s)',multiple:true,required:true},
 {label:'Contract addendum (if applicable)',title:'Additional addendum(s), if any',multiple:true,required:false}
];
const acceptedOfferAllowed=/\.(pdf|png|jpe?g|docx?|xlsx?|txt)$/i;
export default function Transactions({userId,backOffice,view,notify,initialDealId,initialFocus}:{userId:string;backOffice:boolean;view:string;initialDealId?:string;initialFocus?:string;notify:(s:string)=>void}){
 const [expiry,setExpiry]=useState(''); const [summaries,setSummaries]=useState<{id:string;display_status:string;parent_listing_id:string|null}[]>([]);
 const [agentFilter,setAgentFilter]=useState('');
 const [officeAgents,setOfficeAgents]=useState<{user_id:string;full_name:string}[]>([]);
 const [fileOwnerName,setFileOwnerName]=useState('');
 useEffect(()=>{if(!backOffice)return;void(async()=>{const m=await getSupabase()!.from('brokerage_members').select('brokerage_id,role').eq('user_id',userId).maybeSingle();if(m.data?.role!=='admin')return;const r=await getSupabase()!.from('office_agents').select('user_id,full_name').eq('brokerage_id',m.data.brokerage_id);if(r.data)setOfficeAgents(r.data.filter(a=>a.user_id))})();},[backOffice,userId]);
 function agentLink(owner:string){const p=officeAgents.find(a=>a.user_id===owner);return backOffice&&p?<button className="text-link no-print" onClick={()=>window.dispatchEvent(new CustomEvent('realvolt:agent-profile',{detail:owner}))}>{p.full_name}</button>:null}
 const [documentRevision,setDocumentRevision]=useState(0);
 const [linkedListingDocs,setLinkedListingDocs]=useState<Doc[]>([]);
 const [requiredReady,setRequiredReady]=useState(false);
 const [extraDocName,setExtraDocName]=useState('');
  const [offerOutcome,setOfferOutcome]=useState<'conditional'|'direct_sold'>('conditional');
  const [pendingDirectSold,setPendingDirectSold]=useState<string|null>(null);
  const [offerAttachments,setOfferAttachments]=useState<Record<string,File[]>>({});
  const [savedOfferAttachmentIds,setSavedOfferAttachmentIds]=useState<Record<string,boolean>>({});
 const [rows,setRows]=useState<Deal[]>([]),[docs,setDocs]=useState<Doc[]>([]),[selected,setSelected]=useState<string|null>(null),[editing,setEditing]=useState<(ReturnType<typeof fresh>&{id?:string})|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[loading,setLoading]=useState(true),[query,setQuery]=useState(''),[review,setReview]=useState('');
 const [listingTerms,setListingTerms]=useState<ListingTerms[]>([]),[listingFilter,setListingFilter]=useState('All statuses'),[,setTodayTick]=useState(0),[statusError,setStatusError]=useState('');
 function beginEdit(d:DealInput&{id?:string;buyer_lawyer?:Lawyer|null;seller_lawyer?:Lawyer|null}){setOfferOutcome('conditional');setOfferAttachments({});setSavedOfferAttachmentIds({});setEditing(d);setExpiry(listingTerms.find(t=>t.id===d.id)?.expiry_date||'')}
 const db=getSupabase()!;
 const loadStatuses=useCallback(async()=>{const all:ListingTerms[]=[];for(let i=0;;i+=1000){const r=await db.from('deal_listing_status').select('*').order('id').range(i,i+999);if(r.error){setStatusError('Install supabase/007_listing_status.sql to enable listing expiry and termination.');return}all.push(...r.data);if(r.data.length<1000)break}setListingTerms(all);const sr=await db.from('rv_tx_summary').select('id,display_status,parent_listing_id');if(sr.error){setStatusError(sr.error.message);return}setSummaries(sr.data||[]);setStatusError('')},[db]);
 useEffect(()=>{void loadStatuses();const tick=()=>{setTodayTick(n=>n+1);void loadStatuses()};const timer=setInterval(tick,60000);window.addEventListener('focus',tick);return()=>{clearInterval(timer);window.removeEventListener('focus',tick)}},[loadStatuses]);
 function statusFor(d:Deal){const t=listingTerms.find(t=>t.id===d.id);return summaries.find(s=>s.id===d.id)?.display_status||(d.kind==='Sale'?(d.rv_stage||'Needs confirmation'):listingStatus(d.kind,t?.expiry_date||null,t?.termination_date||null))}
 function stageColor(d:Deal){const status=statusFor(d);if(d.kind==='Sale'&&['Sold','Completed','Archived'].includes(d.rv_stage||'')||status==='Sold')return '#c93333';if(status==='Accepted offer'||d.rv_stage==='Accepted offer')return '#d47c1f';if(status==='Active')return '#2d7a52';return null;}
 function visibleStage(d:Deal){if(d.kind==='Sale'&&d.rv_stage==='Archived')return 'Completed · Archived';if(d.kind==='Sale'&&d.rv_stage==='Completed')return 'Completed';return statusFor(d);}
 const stageBorder=(d:Deal)=>{const color=stageColor(d);return color?{border:'2px solid '+color,borderRadius:11}:undefined};
 const stageBadge=(d:Deal)=>{const color=stageColor(d);return color?{border:'1px solid '+color,color,background:'transparent'}:undefined};
 const reload=useCallback(async(quiet=false)=>{if(!quiet)setLoading(true);try{let q=db.from('deal_files').select('*').is('rv_deleted_at',null).order('created_at',{ascending:false});q=initialDealId?q.eq('id',initialDealId):backOffice?q.or('review_status.neq.Draft,and(kind.eq.Sale,rv_stage.eq."Accepted offer")'):q.eq('user_id',userId);const r=await q;if(r.error)throw r.error;setRows(r.data);setError('')}catch(e){setError((e as Error).message+' — Check that supabase/004_transactions.sql has been installed.')}finally{if(!quiet)setLoading(false)}},[db,userId,backOffice,initialDealId]);
 useEffect(()=>{void reload()},[reload,view]);
  // Keep Back Office's Submitted queue in sync after an agent resubmits corrections.
  useEffect(()=>{if(!backOffice)return;const refresh=()=>void reload(true);const timer=setInterval(refresh,15000);window.addEventListener('focus',refresh);return()=>{clearInterval(timer);window.removeEventListener('focus',refresh)}},[backOffice,reload]);
 const active=rows.find(d=>d.id===selected),locked=!!active&&!['Draft','Changes requested'].includes(active.review_status);
 // Resolve the file owner from the brokerage's central agent profile, not the client or cooperating agent.
 // The current agent can also use their personal workspace profile as a fallback.
 useEffect(()=>{
  let live=true;
  if(!active?.user_id){setFileOwnerName('');return ()=>{live=false};}
  const owner=active.user_id;
  const ownerBrokerageId=active.brokerage_id;
  const listed=officeAgents.find(a=>a.user_id===owner&&a.full_name?.trim());
  if(listed){setFileOwnerName(listed.full_name.trim());return ()=>{live=false};}
  setFileOwnerName('');
  void (async()=>{
   let profileQuery=db.from('office_agents').select('full_name').eq('user_id',owner);
   if(ownerBrokerageId)profileQuery=profileQuery.eq('brokerage_id',ownerBrokerageId);
   const profile=await profileQuery.maybeSingle();
   if(!live)return;
   if(profile.data?.full_name?.trim()){setFileOwnerName(profile.data.full_name.trim());return;}
   if(owner===userId){
    const personal=await db.from('agent_workspace_profiles').select('full_name').eq('user_id',owner).maybeSingle();
    if(!live)return;
    if(personal.data?.full_name?.trim()){setFileOwnerName(personal.data.full_name.trim());return;}
    const auth=await db.auth.getUser();
    if(live)setFileOwnerName(String(auth.data.user?.user_metadata?.full_name||'').trim());
   }
  })();
  return()=>{live=false};
 },[active?.user_id,active?.brokerage_id,officeAgents,userId,db]);
 useEffect(()=>{setSelected(initialDealId||null);setEditing(null)},[view,initialDealId]);
 useEffect(()=>{if(initialFocus==='compliance'&&active?.id&&backOffice&&active.review_status==='Submitted'){const frame=requestAnimationFrame(()=>document.getElementById('rv-direct-file-review')?.scrollIntoView({behavior:'smooth',block:'start'}));return()=>cancelAnimationFrame(frame)}},[initialFocus,active?.id,active?.review_status,backOffice]);
 useEffect(()=>{setRequiredReady(false)},[selected]);
 // Preserve the original listing attachments in a closed sale's read-only folder.
 // Database and storage row-level policies still decide which attachments the viewer can access.
 useEffect(()=>{
  setLinkedListingDocs([]);
  if(active?.rv_stage!=='Archived'||!active.parent_listing_id)return;
  let live=true;
  void db.from('deal_documents').select('id,name,path,deal_id').eq('deal_id',active.parent_listing_id).order('created_at').then(result=>{
   if(live&&!result.error)setLinkedListingDocs(result.data||[]);
  });
  return()=>{live=false};
 },[db,active?.id,active?.rv_stage,active?.parent_listing_id]);
 useEffect(()=>{setDocs([]);setReview('');if(!selected)return;let live=true;db.from('deal_documents').select('*').eq('deal_id',selected).order('created_at').then(r=>{if(!live)return;if(r.error)notify(r.error.message);else setDocs(r.data)});return()=>{live=false}},[selected,db,notify]);
 async function run(fn:()=>Promise<void>){setBusy(true);try{await fn()}catch(e){notify((e as Error).message)}finally{setBusy(false)}}
  async function save(e:FormEvent){
   e.preventDefault();if(!editing)return;
   await run(async()=>{
    const {id}=editing;
    const creatingAcceptedOffer=editing.kind==='Sale'&&!id;
    const offerFields=editing.kind==='Sale'?requiredOfferAttachments(editing.representation):[];
    // The agent must select the required documents on THIS screen when making an Accepted Offer.
    // A partially saved sale can be retried with the same file and the selected browser files.
    if(creatingAcceptedOffer){
     const missing=offerFields.filter(f=>f.required&&!offerAttachments[f.label]?.length);
     if(missing.length)throw new Error('Before accepting the offer, select: '+missing.map(f=>f.title).join(', '));
    }
    for(const files of Object.values(offerAttachments))for(const file of files){
     if(!acceptedOfferAllowed.test(file.name)||file.size<1||file.size>20*1024*1024)
      throw new Error(file.name+': use PDF, image, Word, Excel or TXT (maximum 20 MB).');
    }
    // Preflight mandatory template definitions BEFORE inserting a sale, so an unconfigured
    // brokerage doesn't accumulate new Accepted Offer drafts from failed submissions.
    if(creatingAcceptedOffer){
     const templateCheck=await db.from('rv_compliance_templates').select('label,required,representation').eq('kind','Sale').eq('phase','offer').eq('active',true);
     if(templateCheck.error)throw new Error('Cannot read Accepted Offer document requirements: '+templateCheck.error.message);
     const missingTemplates=offerFields.filter(f=>f.required&&!templateCheck.data?.some(t=>t.label===f.label&&t.required&&(t.representation==='any'||t.representation===editing.representation)));
     if(missingTemplates.length)throw new Error('Accepted Offer required categories missing. Install the Accepted Offer SQL before saving this sale: '+missingTemplates.map(f=>f.title).join(', '));
    }
    const values=Object.fromEntries(Object.keys(fresh(editing.kind)).map(k=>[k,editing[k as keyof DealInput]]));
    values.address=editing.address.trim();
    values.client_name=editing.kind==='Sale'?(editing.representation==='selling'?editing.buyer_name:editing.seller_name):editing.client_name;
    if(editing.kind==='Listing')values.seller_name=editing.client_name;
    const r=id?await db.from('deal_files').update(values).eq('id',id).select().single():await db.from('deal_files').insert({...values,user_id:userId}).select().single();
    if(r.error)throw r.error;
    if(editing.kind==='Listing'){
     const t=await db.from('listing_terms').upsert({deal_id:r.data.id,expiry_date:expiry});
     if(t.error){setEditing({...editing,id:r.data.id});throw t.error}
    }
    if(editing.kind==='Sale'&&(creatingAcceptedOffer||Object.keys(offerAttachments).length>0)){
     // Persist the ID immediately so a failed upload retries the same sale instead of creating a duplicate.
     setEditing({...editing,id:r.data.id});
     const required=offerFields.filter(f=>f.required);
     const templates=await db.from('rv_compliance_templates').select('label,required,representation,active,phase')
       .eq('brokerage_id',r.data.brokerage_id).eq('kind','Sale').eq('phase','offer').eq('active',true);
     if(templates.error)throw new Error('Could not load Accepted Offer requirements: '+templates.error.message);
     const missingTemplates=required.filter(f=>!templates.data?.some(t=>t.label===f.label&&(t.representation==='any'||t.representation===editing.representation)&&t.required));
     if(missingTemplates.length)throw new Error('Accepted Offer requirements are missing in Supabase. Install Fix 063 SQL, then retry the same sale: '+missingTemplates.map(f=>f.title).join(', '));
     const uploaded={...savedOfferAttachmentIds};
     for(const field of offerFields){
      const files=offerAttachments[field.label]||[];
      for(let i=0;i<files.length;i++){
       const key=field.label+'|'+i;
       if(uploaded[key])continue;
       const file=files[i];
       const path=`${userId}/${r.data.id}/offer/${crypto.randomUUID()}-${file.name.replace(/[^A-Za-z0-9._-]/g,'_')}`;
       const stored=await db.storage.from('transaction-files').upload(path,file,{upsert:false});
       if(stored.error)throw new Error('Could not upload '+field.title+': '+stored.error.message);
       const registered=await db.from('deal_documents').insert({deal_id:r.data.id,name:file.name,path}).select('id').single();
       if(registered.error)throw new Error('Saved '+file.name+' but could not register it: '+registered.error.message);
       const linked=await db.rpc('rv_link_uploaded_compliance_doc',{
        p_deal:r.data.id,p_document:registered.data.id,p_template_label:field.label,
        p_additional:i>0
       });
       if(linked.error)throw new Error('Uploaded '+file.name+' but could not link '+field.title+': '+linked.error.message);
       uploaded[key]=true;setSavedOfferAttachmentIds({...uploaded});
      }
     }
     // Verify that required documents have actually been linked, not just selected in the browser.
     const check=await db.from('deal_requirements').select('label,document_id').eq('deal_id',r.data.id).eq('rv_phase','offer').eq('rv_required',true);
     if(check.error)throw check.error;
     const missing=required.filter(f=>!check.data?.some(x=>x.label===f.label&&x.document_id));
     if(missing.length)throw new Error('Accepted Offer is not document-complete: '+missing.map(f=>f.title).join(', '));
    }
    await reload();await loadStatuses();setSelected(r.data.id);setEditing(null);
    if(creatingAcceptedOffer&&offerOutcome==='direct_sold')setPendingDirectSold(r.data.id);
    setOfferAttachments({});setSavedOfferAttachmentIds({});
    notify(creatingAcceptedOffer?(offerOutcome==='direct_sold'?'Accepted Offer documents saved. Continue below with Direct Sold documents, commission + GST, deposit holder and lawyer contacts, then submit once to Back Office.':'Accepted Offer saved with required documents. Back Office notified; no approval needed at this stage.'):'Transaction saved');
   });
  }
 async function change(status:string){if(!active)return;await run(async()=>{
 if(backOffice&&status==='Approved'&&active.rv_stage!=='Collapsed'){
  const check=await db.from('deal_requirements').select('label,rv_required,rv_waived,verified,document_id').eq('deal_id',active.id);
  if(check.error)throw check.error;
  const missing=(check.data||[]).filter(r=>r.rv_required!==false&&!r.rv_waived&&(!r.document_id||!r.verified));
  if(missing.length)throw new Error('Verify all required documents or record a justified waiver before approving: '+missing.map(r=>r.label).slice(0,5).join(', '));
 }
 const values=backOffice?{review_status:status,review_notes:review.trim()}:{review_status:status};const r=await db.from('deal_files').update(values).eq('id',active.id).eq('review_status',active.review_status).select().single();if(r.error)throw r.error;await reload();await loadStatuses();notify(status==='Submitted'?'Submitted to your assigned back-office admin':status)})}
 async function discardDraft(){
  if(!active||backOffice||active.user_id!==userId||active.review_status!=='Draft')return;
  const answer=window.prompt('Delete this unsubmitted draft from your transaction list? Its audit history will be retained. Type DELETE to confirm.');
  if(answer!=='DELETE')return;
  const dealId=active.id;
  await run(async()=>{
   const r=await db.rpc('rv_discard_draft_transaction',{p_deal:dealId});
   if(r.error)throw r.error;
   setSelected(null);
   setDocs([]);
   window.dispatchEvent(new CustomEvent('realvolt:clear-transaction-link'));
   await reload();
   await loadStatuses();
   notify('Draft removed from your transactions. Audit records are retained.');
  });
 }
 async function upload(files:FileList|null,documentLabel=''){if(!active||!files)return;const chosen=Array.from(files);await run(async()=>{for(const f of chosen){if(f.size<1||f.size>20*1024*1024||!/\.(pdf|png|jpe?g|docx?|xlsx?|txt)$/i.test(f.name))throw new Error(f.name+': accepted formats are PDF, image, Word, Excel or TXT (20 MB maximum).');const path=`${userId}/${active.id}/${crypto.randomUUID()}-${f.name.replace(/[^a-zA-Z0-9._-]/g,'_')}`;const u=await db.storage.from('transaction-files').upload(path,f);if(u.error)throw u.error;const r=await db.from('deal_documents').insert({deal_id:active.id,name:documentLabel.trim()?`${documentLabel.trim()} — ${f.name}`:f.name,path}).select().single();if(r.error)throw r.error;setDocs(ds=>[...ds,r.data])}notify('Files attached')})}
 async function removeDocument(d:Doc){if(!active||!window.confirm('Remove '+d.name+' from the active transaction? The original will be retained for audit.'))return;const dealId=active.id;await run(async()=>{const r=await db.rpc('rv_remove_deal_document',{p_deal:dealId,p_document:d.id});if(r.error)throw r.error;setDocs(prev=>prev.filter(x=>x.id!==d.id));setDocumentRevision(n=>n+1);notify('File removed. You can attach a replacement.');})}
 async function open(d:Doc){await run(async()=>{const r=await db.storage.from('transaction-files').createSignedUrl(d.path,120);if(r.error)throw r.error;const a=document.createElement('a');a.href=r.data.signedUrl;a.target='_blank';a.rel='noopener noreferrer';a.click()})}
 const commissionSummary=(d:DealInput)=>{try{const c=calculateClosing(d);return <div className="notice"><b>Commission and deposit summary</b><p>Commission: {money(c.commission)} + GST: {money(c.gst)} = {money(c.total)}</p><p>Deposit recorded: {money(c.deposit)} · Held by us: {money(c.held)}</p><p>Proposed our-side retention: {money(c.deducted)} · Proposed balance before other authorized payments: {money(c.remittance)}</p><p>Commission still to be received: {money(c.shortfall)}</p>{c.external&&<p>Deposit held by {d.deposit_brokerage}. No deposit funds are held or remitted by our brokerage.</p>}</div>}catch(e){return <div className="notice">{(e as Error).message}</div>}};
 const refreshFile=async()=>{await reload();await loadStatuses();if(selected){const r=await db.from('deal_documents').select('*').eq('deal_id',selected).order('created_at');if(!r.error){setDocs(r.data);setDocumentRevision(n=>n+1)}}};
 const labelFor=(d:Deal)=>d.transaction_number?`${d.kind==='Listing'?'LST':'SLE'}-${String(d.transaction_number).padStart(6,'0')}`:transactionLabel(d.transaction_number);
 const linked=(d:Deal)=>summaries.some(s=>s.parent_listing_id===d.id&&s.display_status!=='Collapsed');
 const filtered=rows.filter(d=>{
  if(agentFilter&&backOffice&&d.user_id!==agentFilter)return false;
  if(!d.address.toLowerCase().includes(query.toLowerCase()))return false;
  if(view==='Closed Files'||view==='Closed files')return d.kind==='Sale'&&d.rv_stage==='Archived';
  // Agent-owned archived sales stay visible in All transactions and Sales.
  // Back Office has a separate, dedicated Closed Files view; the review queue
  // below still excludes archived files unless they need actual review.
  const linkedSaleExists=rows.some(child=>child.parent_listing_id===d.id&&!['Collapsed','Archived'].includes(child.rv_stage||''));
  if(!backOffice&&!['Listings','Archive','Expired listings','Terminated listings'].includes(view)&&d.kind==='Listing'&&linkedSaleExists)return false;
  if(backOffice){
   if(view==='Approved')return d.review_status==='Approved';
   if(view==='Changes requested')return d.review_status==='Changes requested';
   return d.review_status==='Submitted'||(d.kind==='Sale'&&d.rv_stage==='Accepted offer'&&d.review_status==='Draft');
  }
  if(view==='Listings')return d.kind==='Listing'&&(listingFilter==='All statuses'?!['Expired','Terminated','Sold'].includes(statusFor(d)):statusFor(d)===listingFilter);
  if(view==='Expired listings')return d.kind==='Listing'&&statusFor(d)==='Expired';
  if(view==='Terminated listings')return d.kind==='Listing'&&statusFor(d)==='Terminated';
  if(view==='Archive')return ['Expired','Terminated','Collapsed'].includes(statusFor(d))||(d.kind==='Listing'&&statusFor(d)==='Sold');
  if(view==='Sales')return d.kind==='Sale';
  if(view==='Submitted')return d.review_status==='Submitted';
  return !['Expired','Terminated','Collapsed'].includes(statusFor(d))&&!(d.kind==='Listing'&&statusFor(d)==='Sold');
 });
 if(['Commission earned to date','Commission report','Yearly GST report','Deductions & expenses'].includes(view))return <AgentReports userId={userId} view={view}/>;
 return <><div className="headrow"><div><h1>{view==='Closed Files'||view==='Closed files'?'Closed Files':backOffice?'Back Office':'Transactions'}</h1><p>{view==='Closed Files'||view==='Closed files'?'Read-only completed sales and their retained transaction documents.':backOffice?'Review submitted agent files and documents.':'Create a listing, convert it to a sale, or add a sale directly.'}</p></div><div className="actions"><button className="btn" disabled={busy} onClick={()=>{void reload();void loadStatuses()}}>Refresh</button>{!backOffice&&view!=='Closed Files'&&['Listing','Sale'].map(k=><button key={k} className="btn primary" disabled={busy} onClick={()=>{setSelected(null);beginEdit(fresh(k))}}>＋ Add {k.toLowerCase()}</button>)}</div></div>{error&&<div className="notice" role="alert">{error}</div>}{statusError&&<div className="notice">{statusError}</div>}
 {editing?<form className="panel" onSubmit={save}><h2>{editing.id?'Edit':'New'} {editing.kind.toLowerCase()}</h2><div className="crm-form-grid">{['address','mls_number','pid','legal_description',...(editing.kind==='Listing'?['client_name','price','listing_date']:['buyer_name','seller_name','cooperating_brokerage','cooperating_agent','cooperating_email','sale_price','contract_date','subject_date','deposit_due_date','completion_date','possession_date','adjustment_date'])].map(k=><div className="field" key={k}><label htmlFor={'deal-'+k}>{({address:'Property address',client_name:'Seller legal name(s)',pid:'PID',legal_description:'Legal description',contract_date:'Contract acceptance date',possession_date:'Possession date',adjustment_date:'Adjustment date',deposit_due_date:'Deposit due date',cooperating_brokerage:'Cooperating brokerage',cooperating_agent:'Cooperating Realtor',cooperating_email:'Cooperating Realtor email',mls_number:'MLS number',price:'List price (CAD)',sale_price:'Sale price (CAD)',listing_date:'Listing date',subject_date:'Subject removal date',completion_date:'Completion date',buyer_name:'Buyer legal name(s)',seller_name:'Seller legal name(s)'} as Record<string,string>)[k]}</label><input id={'deal-'+k} required={['address','client_name','listing_date','price','pid','legal_description','sale_price','contract_date','buyer_name','seller_name','cooperating_brokerage'].includes(k)} type={k.includes('price')?'number':k.endsWith('date')?'date':'text'} min={k.includes('price')?'0':undefined} step={k.includes('price')?'.01':undefined} maxLength={500} value={String(editing[k as keyof typeof editing]??'')} onChange={e=>setEditing({...editing,[k]:k.includes('price')?(e.target.value?Number(e.target.value):null):k.endsWith('date')?(e.target.value||null):e.target.value})}/></div>)}</div>{editing.kind==='Listing'&&<div className="field"><label>Listing expiry date</label><input required type="date" min={editing.listing_date||undefined} value={expiry} onChange={e=>setExpiry(e.target.value)}/></div>}{editing.kind==='Sale'&&<><div className="field"><label htmlFor="deal-representation">Our side of the transaction</label><select id="deal-representation" value={editing.representation} onChange={e=>setEditing({...editing,representation:e.target.value as 'listing'|'selling'})}><option value="selling">Selling / buyer side</option><option value="listing">Listing / seller side</option></select></div>{!editing.id&&<fieldset style={{gridColumn:'1 / -1',margin:'12px 0',padding:15,border:'1px solid #cedcd1',borderRadius:11}}>
  <legend style={{fontWeight:800,padding:'0 6px'}}>How is this offer proceeding?</legend>
  <label style={{display:'block',marginBottom:10}}><input type="radio" name="offer-outcome" checked={offerOutcome==='conditional'} onChange={()=>setOfferOutcome('conditional')}/> Accepted Offer — subjects outstanding (no Back Office approval yet)</label>
  <label style={{display:'block'}}><input type="radio" name="offer-outcome" checked={offerOutcome==='direct_sold'} onChange={()=>setOfferOutcome('direct_sold')}/> Direct Sold — unconditional / no subjects (continue to firm-sale approval)</label>
 </fieldset>}
 <p className="hint">{offerOutcome==='direct_sold'&&!editing.id?'After you attach the required offer documents, RealVolt will open the Direct Sold submission steps right away: firm-sale documents, commission + GST, deposit holder and lawyer contacts. Submit that complete package to Back Office for approval.':'At Accepted Offer, save the required documents and notify Back Office. There is no compliance approval until Subjects Removed.'}</p>
 {(!editing.id||Object.keys(offerAttachments).length>0)&&<fieldset style={{gridColumn:'1 / -1',border:'1px solid #d0ded3',borderRadius:12,padding:15,margin:'12px 0'}}>
  <legend style={{fontWeight:800,padding:'0 6px'}}>Accepted Offer — required documents before saving</legend>
  <p className="hint">Select these documents now. The file and its documents will be visible in Back Office; approval is not needed until Subjects Removed / Direct Sold. Client IDs remain private.</p>
  {requiredOfferAttachments(editing.representation).map(field=><div className="field" key={field.label} style={{marginBottom:12}}>
   <label htmlFor={'offer-'+field.label}>{field.title} {field.required&&<strong style={{color:'#a34422'}}>(Required)</strong>}</label>
   <input id={'offer-'+field.label} type="file" accept=".pdf,.png,.jpg,.jpeg,.doc,.docx,.xls,.xlsx,.txt" multiple={field.multiple} disabled={busy||!!savedOfferAttachmentIds[field.label+'|0']}
    onChange={e=>setOfferAttachments(prev=>({...prev,[field.label]:Array.from(e.target.files||[])}))}/>
   {!!offerAttachments[field.label]?.length&&<small>{offerAttachments[field.label].map(f=>f.name).join(' · ')} {savedOfferAttachmentIds[field.label+'|0']?'— saved':''}</small>}
  </div>)}
 </fieldset>}
 </>}<div className="field"><label htmlFor="deal-notes">Notes</label><textarea id="deal-notes" value={editing.notes} onChange={e=>setEditing({...editing,notes:e.target.value})}/></div><div className="actions"><button className="btn primary" disabled={busy}>{editing.kind==='Sale'&&(!editing.id||Object.keys(offerAttachments).length>0)?(offerOutcome==='direct_sold'?'Continue to Direct Sold →':'Save Accepted Offer + Documents'):'Save transaction'}</button><button type="button" className="btn" disabled={busy} onClick={()=>{setEditing(null);setOfferAttachments({});setSavedOfferAttachmentIds({})}}>Cancel</button></div></form>:active?<section className="panel" style={stageBorder(active)}><button className="btn" disabled={busy} onClick={()=>{setSelected(null);window.dispatchEvent(new CustomEvent('realvolt:clear-transaction-link'))}}>{view==='Closed Files'||view==='Closed files'?'← Closed Files':'← All files'}</button><div className="sectionhead"><div><h2>{labelFor(active)} — {active.address}</h2><p>{active.kind} · {active.client_name}</p><p className="hint"><b>Realtor:</b> {fileOwnerName||"Name not available in agent profile"}</p>{active.parent_listing_id&&<p className="hint">Linked listing: {rows.find(r=>r.id===active.parent_listing_id)?labelFor(rows.find(r=>r.id===active.parent_listing_id)!):active.parent_listing_id}</p>}</div><div className="actions"><span className="badge" style={stageBadge(active)}>{visibleStage(active)}</span><span className="badge">{active.kind==='Sale'&&active.rv_stage==='Accepted offer'&&active.review_status==='Draft'?'No approval required':active.review_status}</span></div></div>

 <div aria-label="Realtor identity throughout transaction" style={{position:'sticky',top:0,zIndex:12,padding:'9px 12px',margin:'12px 0',border:'1px solid #c8d8cc',borderRadius:10,background:'#f4f8f1',display:'flex',gap:12,alignItems:'center',flexWrap:'wrap',boxShadow:'0 2px 8px #183e3214'}}><strong>Realtor: {fileOwnerName||'Agent profile name unavailable'}</strong><span>{labelFor(active)} · {active.address}</span><span style={{marginLeft:'auto',color:stageColor(active)||undefined,fontWeight:700}}>{visibleStage(active)}</span></div>
 <div className="crm-form-grid">{(active.kind==='Listing'?['mls_number','pid','legal_description','price','listing_date']:['mls_number','pid','legal_description','buyer_name','seller_name','sale_price','contract_date','subject_date','completion_date','rv_firm_date','rv_completed_date']).map(k=><p key={k}><b>{k.replaceAll('_',' ')}:</b> {String(active[k as keyof Deal]??'—')}</p>)}</div>{active.kind==='Sale'&&<details style={{marginTop:8,marginBottom:10}}><summary style={{cursor:'pointer'}}>Other brokerage contact (if applicable)</summary><p><b>Cooperating brokerage:</b> {active.cooperating_brokerage||'—'}</p><p><b>Cooperating Realtor:</b> {active.cooperating_agent||'—'}</p></details>}<p style={{whiteSpace:'pre-wrap'}}>{active.notes}</p>{active.review_status==='Changes requested'&&active.review_notes&&<div className="notice">Admin feedback: {active.review_notes}</div>}{!backOffice&&active.user_id===userId&&active.review_status==='Changes requested'&&!['Completed','Archived','Collapsed'].includes(active.rv_stage||'')&&<div role="region" aria-label="Resubmit corrected transaction" style={{border:'1px solid #d6c8b1',borderRadius:10,padding:16,margin:'14px 0',background:'#fcfaf5'}}><strong>Changes requested by Back Office</strong><p className="hint">Correct the files or details above, then resubmit this same transaction. It will return to the Submitted review queue and notify your assigned admin.</p><button type="button" className="btn primary" disabled={busy||(active.kind==='Listing'&&!requiredReady)} onClick={()=>void change('Submitted')}>{busy?'Resubmitting…':'Resubmit changes to Back Office'}</button>{active.kind==='Listing'&&!requiredReady&&<p className="hint">Attach all required listing documents before resubmitting.</p>}</div>}
 {!backOffice&&active.kind==='Sale'&&active.rv_stage==='Sold'&&<PostFirmDetails key={active.id} agentName={fileOwnerName} deal={active} office={false} onSaved={refreshFile} notify={notify}/>}
 {!backOffice&&!locked&&active.rv_stage!=='Archived'&&<div className="actions"><button className="btn" disabled={busy} onClick={()=>beginEdit({...active})}>Edit details</button>{active.review_status==='Draft'&&active.user_id===userId&&!active.parent_listing_id&&!linked(active)&&(!active.rv_stage||active.rv_stage==='Accepted offer')&&<button type="button" className="btn" style={{color:'#b42318'}} disabled={busy} onClick={()=>void discardDraft()}>Delete draft</button>}</div>}{active.rv_stage==='Archived'&&<p className="notice" role="status">Closed file — read only. Transaction documents remain available for review and download; changes and payments are locked.</p>}<details id="rv-file-documents" style={{scrollMarginTop:80,marginTop:18,border:'1px solid #cedcd1',borderRadius:11,padding:12}}><summary style={{cursor:'pointer',fontWeight:700,fontSize:17}}>{active.rv_stage==='Archived'?'Closed sale documents':backOffice?'1. Submitted documents':'Documents & uploads'} ({docs.length}) — click to {backOffice?'expand / collapse':'expand'}</summary><p className="hint">{active.rv_stage==='Archived'?'Documents retained with the closed sale. Open to view; changes are disabled.':'The Realtor may add addenda or any additional documents by giving the attachment a name. Back Office still verifies required legal documents.'}</p>{!backOffice&&!locked&&active.rv_stage!=='Archived'&&<div className="actions" style={{marginTop:14,alignItems:'end'}}><label className="field" style={{flex:1}}>Add another document (name / type)<input aria-label="Custom document name" value={extraDocName} onChange={e=>setExtraDocName(e.target.value)} maxLength={100} placeholder="Addendum, disclosure, other…"/></label><label className="btn" style={{cursor:extraDocName.trim()?'pointer':'not-allowed'}}>＋ Add document<input style={{display:'none'}} type="file" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.txt" disabled={busy||!extraDocName.trim()} onChange={e=>{void upload(e.target.files,extraDocName);e.target.value='';setExtraDocName('')}}/></label></div>}{docs.map(d=><div className="draftrow" key={d.id}><span>{d.name}</span><div className="actions"><button className="btn" disabled={busy} onClick={()=>void open(d)}>Open file</button>{!['Archived','Collapsed','Expired','Terminated'].includes(statusFor(active))&&!(active.kind==='Listing'&&statusFor(active)==='Sold')&&!backOffice&&!locked&&d.path.split('/')[0]===userId&&d.id!==active.rv_completion_letter&&<button type="button" className="btn" style={{color:'#b42318'}} disabled={busy} onClick={()=>void removeDocument(d)}>Remove file</button>}</div></div>)}{!docs.length&&<p>No files attached.</p>}{active.rv_stage!=='Archived'&&<>{!backOffice&&<StagedDocumentUpload key={active.id} agentName={fileOwnerName} deal={active} docs={docs} office={false} displayStatus={statusFor(active)} notify={notify} onSaved={refreshFile} onReadyChange={setRequiredReady}/> }{!backOffice&&!locked&&active.kind==='Listing'&&active.review_status==='Draft'&&<><button className="btn primary" disabled={busy||!docs.length||!requiredReady} onClick={()=>void change('Submitted')}>Submit to back office</button><p className="hint">Submission locks this file while your assigned admin reviews it.</p></>}</>}
 
 </details>
 {active.rv_stage==='Archived'&&active.kind==='Sale'&&<p className="hint">Legal completion: {active.rv_completed_date||'—'} · Deposit held by: {active.deposit_holder==='our_brokerage'?'Our brokerage':active.deposit_brokerage||'Other brokerage'} · Financial records remain in Trust &amp; Accounting.</p>}
 {active.rv_stage==='Archived'&&active.parent_listing_id&&<details style={{marginTop:12,border:'1px solid #cedcd1',borderRadius:11,padding:12}}>
  <summary style={{cursor:'pointer',fontWeight:700,fontSize:17}}>Original listing documents ({linkedListingDocs.length}) — expand</summary>
  <p className="hint">Documents from the linked listing, subject to your brokerage access permissions. These are read-only.</p>
  {linkedListingDocs.map(doc=><div className="draftrow" key={doc.id}><span>{doc.name}</span><button type="button" className="btn" disabled={busy} onClick={()=>void open(doc)}>Open file</button></div>)}
  {!linkedListingDocs.length&&<p className="hint">No linked listing documents are available to your account.</p>}
 </details>}
 {active.kind==='Sale'&&active.rv_stage==='Accepted offer'&&<p className="notice">Accepted Offer — Back Office is notified, with no approval at this stage. Upload the required CPS, commission disclosure, representation disclosure and applicable ID documents before the firm-sale submission. All accepted-offer and firm-sale documents are verified together after subjects are removed or the offer becomes unconditional.</p>}

 {backOffice&&active.kind==='Sale'&&active.rv_stage==='Sold'&&
  <details style={{marginTop:14,border:'1px solid #cedcd1',borderRadius:11,padding:12}}>
   <summary style={{cursor:'pointer',fontWeight:700,fontSize:17}}>Lawyers, commission, GST & deposit — expand to review</summary>
   <PostFirmDetails key={active.id} agentName={fileOwnerName} deal={active} office={true} onSaved={refreshFile} notify={notify}/>
  </details>}
 {backOffice&&active.review_status==='Submitted'&&
  <div aria-label="Back Office document compliance review" style={{marginTop:18}}>
   <h3 style={{fontSize:18,marginBottom:8}}>2. Review compliance & approve</h3>
   <DirectFileReview key={active.id} dealId={active.id} stage={active.rv_stage} agentName={fileOwnerName} docs={docs} revision={documentRevision} busy={busy} review={review} onReviewChange={setReview} onApprove={()=>void change('Approved')} onRequestChanges={()=>void change('Changes requested')} onReviewUpdated={()=>setDocumentRevision(n=>n+1)}/>
  </div>}
 {!backOffice&&active.rv_stage!=='Archived'&&!statusError&&<TransactionActions key={active.id} initialDirectSold={pendingDirectSold===active.id&&active.rv_stage==='Accepted offer'} agentName={fileOwnerName} deal={active} docs={docs} office={false} linked={linked(active)||['Expired','Terminated','Termination pending'].includes(statusFor(active))} notify={notify} reload={refreshFile} onEdit={()=>beginEdit({...active})} onConvert={()=>beginEdit({...fresh('Sale'),address:active.address,mls_number:active.mls_number,pid:active.pid,legal_description:active.legal_description,seller_name:active.seller_name||active.client_name,client_name:active.client_name,representation:'listing',parent_listing_id:active.id})}/>}
 {backOffice&&active.kind==='Sale'&&active.rv_stage==='Sold'&&active.review_status==='Approved'&&
  <section aria-label="CIR and lawyer email step" style={{marginTop:18}}>
   <h3 style={{fontSize:18,margin:'0 0 8px'}}>3. CIR & lawyer email — approved file</h3>
   <p className="hint">Review the CIR and select verified conveyancing documents before sending the lawyer package when ready. You can record confirmed legal completion separately below.</p>
   <ClosingPanel agentName={fileOwnerName} key={active.id+'-'+documentRevision} dealId={active.id} docs={docs} notify={notify} onSaved={refreshFile}/>
  </section>}
 {backOffice&&active.kind==='Sale'&&active.rv_stage==='Sold'&&active.review_status==='Approved'&&
  <section aria-label="Legal completion step" className="panel" style={{marginTop:18}}>
   <h3>4. Legal completion — administrator confirmation</h3>
   <p className="hint">Confirm completion only after receiving the lawyer's confirmation. Enter the actual completion date and attach the lawyer completion letter. CIR emailing is available above but is not required to record legal completion.</p>
   {!statusError&&<TransactionActions key={active.id+'-complete'} agentName={fileOwnerName} deal={active} docs={docs} office={true} linked={linked(active)} notify={notify} reload={refreshFile} onEdit={()=>beginEdit({...active})} onConvert={()=>{}}/>}
  </section>}

 {backOffice&&active.rv_stage==='Completed'&&<TransactionCommissionPayout key={active.id} deal={active} agentName={fileOwnerName} docs={docs} notify={notify} onChanged={refreshFile}/>}
 {backOffice&&active.kind==='Sale'&&active.rv_stage==='Completed'&&<ComplianceClosingPanel agentName={fileOwnerName} key={active.id+'-'+documentRevision} deal={active} docs={docs} office={true} notify={notify} onSaved={refreshFile}/>}
 {backOffice&&active.rv_stage!=='Archived'&&['Approved','Completed'].includes(active.review_status)&&
  <details id="rv-file-compliance-review" style={{scrollMarginTop:24,marginTop:14,border:'1px solid #cedcd1',borderRadius:11,padding:12}}>
   <summary style={{cursor:'pointer',fontWeight:700,fontSize:17}}>Advanced compliance records — expand</summary>
   <DealAdmin agentName={fileOwnerName} kind={active.kind} canAllocate={false} key={active.id+'-'+active.updated_at+'-'+documentRevision} dealId={active.id} status={active.review_status} backOffice={true} docs={docs} defaultCommission={Number(active.representation==='listing'?active.listing_commission:active.selling_commission)} defaultGST={Math.round(Number(active.representation==='listing'?active.listing_commission:active.selling_commission)*Number(active.gst_rate))/100} notify={notify}/>
  </details>}
 {backOffice&&active.rv_stage==='Completed'&&<section aria-label="Closing transaction actions" className="panel" style={{marginTop:18}}>
  <h3>Final action — Close / Archive file</h3>
  <p className="hint">Complete commission receipt, authorized payout, and any final compliance checks before closing this transaction.</p>
  {!statusError&&<TransactionActions key={active.id+'-post-completion'} agentName={fileOwnerName} deal={active} docs={docs} office={true} linked={linked(active)} notify={notify} reload={refreshFile} onEdit={()=>beginEdit({...active})} onConvert={()=>{}}/>}
 </section>}
</section>:<><>{backOffice&&<label>Filter by agent<select value={agentFilter} onChange={e=>setAgentFilter(e.target.value)}><option value="">All agents</option>{officeAgents.map(a=><option key={a.user_id} value={a.user_id}>{a.full_name}</option>)}</select></label>}</><input className="search" aria-label="Search transactions" placeholder="Search property address…" value={query} onChange={e=>setQuery(e.target.value)}/>{view==='Listings'&&<select aria-label="Listing status filter" value={listingFilter} onChange={e=>setListingFilter(e.target.value)}>{['All statuses','Active','Accepted offer','Sold','Expired','Terminated'].map(s=><option key={s}>{s}</option>)}</select>}<section className="panel" style={{marginTop:20}}>{loading?<p>Loading files…</p>:filtered.length?filtered.map(d=><div className="draftrow" key={d.id} style={stageColor(d)?{...stageBorder(d),padding:12}:undefined}><div><button className="text-link" onClick={()=>setSelected(d.id)}>{labelFor(d)} — {d.address}</button>{backOffice&&d.kind==='Sale'&&d.rv_stage==='Accepted offer'&&d.review_status==='Draft'&&<span className="hint">Accepted offer · Info only (no approval) · </span>}<p>{backOffice&&<b>Realtor: </b>}{agentLink(d.user_id)} {backOffice&&!officeAgents.some(a=>a.user_id===d.user_id)?'Agent profile unavailable · ':''}{d.kind} · {d.client_name} · <span style={{color:stageColor(d)||undefined,fontWeight:stageColor(d)?700:undefined}}>{visibleStage(d)}</span> · {d.kind==='Sale'&&d.rv_stage==='Accepted offer'&&d.review_status==='Draft'?'No approval required':d.review_status}</p></div><button className="btn" onClick={()=>setSelected(d.id)}>Open</button></div>):<p>{view==='Closed Files'||view==='Closed files'?'No closed files yet. Completed and archived transactions will appear here automatically.':backOffice?'No assigned files in this review queue.':'No transactions in this view. Add a listing or sale to get started.'}</p>}</section></>}
</>;
}
