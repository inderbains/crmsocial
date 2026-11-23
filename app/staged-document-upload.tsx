'use client';
import {useCallback,useEffect,useMemo,useState,type ChangeEvent} from 'react';
import {getSupabase} from '../lib/supabase';
import styles from './staged-document-upload.module.css';

type Phase='listing'|'offer'|'firm'|'completion';
type Deal={id:string;kind:string;representation?:string;rv_stage?:string|null;review_status:string;brokerage_id?:string|null;user_id:string};
type Document={id:string;name:string;path:string};
type Template={id:string;label:string;phase:Phase;required:boolean;sort_order:number;representation:string};
type Requirement={id:string;label:string;rv_phase:string;document_id:string|null;verified:boolean;rv_waived?:boolean;rv_required?:boolean};
type UploadState={key:string;progress:boolean};
const maxBytes=20*1024*1024;
const allowedExtensions=/\.(pdf|png|jpg|jpeg|doc|docx|xls|xlsx|txt)$/i;
const phases:Phase[]=['listing','offer','firm','completion'];
const headings:Record<Phase,string>={listing:'New listing documents',offer:'Accepted offer documents',firm:'Subject removal & firm sale',completion:'Completion & closing documents'};
const friendlyNames:Record<string,string>={
 'Signed listing contract':'Multiple Listing Contract (signed)',
 'MLS listing sheet / listing details':'MLS Listing Sheet / Listing Details',
 'Disclosure (listing)':'Disclosure / Representation',
 'FINTRAC identity verification':'FINTRAC ID verification',
 'Listing addendum (if applicable)':'Listing addendum',
 'Signed purchase and sale contract':'Contract of Purchase and Sale (CPS)',
 'Commission disclosure':'Commission Disclosure',
 'Disclosure of services / representation':'Disclosure of Services / Representation',
 'FINTRAC identity verification — buyer(s)':'Buyer FINTRAC ID verification',
 'Contract addendum (if applicable)':'Contract addendum',
 'Signed subject removal / unconditional contract':'Signed Subject Removal / Unconditional Contract',
 'Trade record sheet':'Trade Record Sheet',
 'Sale report form':'Sale Report Form',
 'Deposit cheque copy / deposit receipt':'Deposit Cheque Copy / Receipt',
 'Subject extension or other addendum (if applicable)':'Subject Extension / Additional Addendum',
 'Lawyer completion letter':'Lawyer Completion Confirmation',
 'Brokerage completion confirmation (PDF)':'Brokerage Completion Confirmation PDF',
 'Commission Instruction Report — CIR (PDF)':'Commission Instruction Report (CIR)',
 'Internal commission payable statement (PDF)':'Internal Commission Payable PDF',
};
const isAddendum=(label:string)=>/addendum|extension/i.test(label);

export default function StagedDocumentUpload({deal,docs,office,displayStatus,onSaved,onReadyChange,notify}:{
 deal:Deal;docs:Document[];office:boolean;displayStatus?:string;onSaved:()=>Promise<void>;onReadyChange?:(ready:boolean)=>void;notify:(message:string)=>void;
}){
 const db=getSupabase()!;
 const [templates,setTemplates]=useState<Template[]>([]);
 const [requirements,setRequirements]=useState<Requirement[]>([]);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState('');
 const [uploading,setUploading]=useState<UploadState|null>(null);
 const [refresh,setRefresh]=useState(0);
 const activePhases=useMemo<Phase[]>(()=>deal.kind==='Listing'?['listing']:office?phases.filter(p=>p!=='listing'):['offer','firm'],[deal.kind,office]);
 const load=useCallback(async()=>{
  setLoading(true);
  try{
   if(!deal.brokerage_id)throw new Error('This file must be linked to a brokerage before document checklists can load.');
   const [t,r]=await Promise.all([
    db.from('rv_compliance_templates').select('id,label,phase,required,sort_order,representation').eq('brokerage_id',deal.brokerage_id).eq('kind',deal.kind).eq('active',true).order('sort_order'),
    db.from('deal_requirements').select('id,label,rv_phase,document_id,verified,rv_waived,rv_required').eq('deal_id',deal.id)
   ]);
   if(t.error)throw new Error('Compliance templates unavailable. Install SQL 044 before Fix 046. '+t.error.message);
   if(r.error)throw new Error('Document checklist unavailable. '+r.error.message);
   setTemplates((t.data||[]).filter((v:Template)=>v.representation==='any'||v.representation===deal.representation));
   setRequirements(r.data||[]);setError('');
  }catch(e){setError((e as Error).message);setTemplates([]);setRequirements([])}
  finally{setLoading(false)}
 },[db,deal.brokerage_id,deal.id,deal.kind,deal.representation]);
 useEffect(()=>{void load()},[load,refresh,deal.rv_stage,deal.review_status]);
 const applicable=templates.filter(t=>activePhases.includes(t.phase));
 // Submission needs documents, not Back Office verification. Verification occurs only after submission.
 const initialPhase=deal.kind==='Listing'?'listing':'offer';
 const initialReq=templates.filter(t=>t.phase===initialPhase&&t.required);
 const ready=!loading&&!error&&initialReq.length>0&&initialReq.every(t=>{
  const r=requirements.find(x=>x.label===t.label);
  return !!r&&(!!r.document_id||!!r.rv_waived);
 });
 useEffect(()=>{onReadyChange?.(ready)},[ready,onReadyChange]);
 const writable=(office?deal.review_status!=='Draft':deal.review_status!=='Submitted')&&!['Archived','Collapsed'].includes(deal.rv_stage||'')&&!(deal.kind==='Listing'&&['Expired','Terminated','Sold'].includes(displayStatus||''));
 async function upload(event:ChangeEvent<HTMLInputElement>,t:Template){
  const files=Array.from(event.target.files||[]);event.target.value='';if(!files.length)return;
  if(!writable){notify('This file is locked for review. Ask Back Office to request changes.');return}
  setUploading({key:t.id,progress:true});
  try{
   const auth=await db.auth.getUser();if(auth.error||!auth.data.user)throw new Error('Your sign-in session has expired.');
   let extra=!!requirements.find(x=>x.label===t.label&&x.document_id);
   let uploadedCount=0;
   for(const file of files){
    if(!allowedExtensions.test(file.name))throw new Error('Unsupported file type: '+file.name);
    if(file.size===0||file.size>maxBytes)throw new Error(file.name+': files must be between 1 byte and 20 MB.');
    const path=`${auth.data.user.id}/${deal.id}/${t.phase}/${crypto.randomUUID()}-${file.name.replace(/[^A-Za-z0-9._-]/g,'_')}`;
    const stored=await db.storage.from('transaction-files').upload(path,file,{upsert:false});
    if(stored.error)throw new Error('Storage upload failed: '+stored.error.message);
    const saved=await db.from('deal_documents').insert({deal_id:deal.id,path,name:file.name}).select('id').single();
    if(saved.error)throw new Error('Document uploaded but registration failed: '+saved.error.message);
    const linked=await db.rpc('rv_link_uploaded_compliance_doc',{p_deal:deal.id,p_document:saved.data.id,p_template_label:t.label,p_additional:extra&&isAddendum(t.label)});
    if(linked.error)throw new Error('Document saved, but checklist linking failed: '+linked.error.message);
    uploadedCount++;
    extra=isAddendum(t.label);
   }
