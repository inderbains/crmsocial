'use client';
import {useEffect,useState} from 'react';
import {getSupabase} from '../lib/supabase';
import {saveClosingPDF} from '../lib/transaction-document-save';

type Doc={id:string;name:string;path:string};
const cad=(n:number)=>new Intl.NumberFormat('en-CA',{style:'currency',currency:'CAD'}).format(n||0);
async function makePdf(title:string,lines:string[]):Promise<Uint8Array>{
 const {PDFDocument,StandardFonts,rgb}=await import('pdf-lib');
 const pdf=await PDFDocument.create();const font=await pdf.embedFont(StandardFonts.Helvetica);
 let page=pdf.addPage([612,792]),y=744;
 const write=(line:string,size=10)=>{
  const clean=line.normalize('NFKD').replace(/[^\x20-\x7e]/g,'-');
  const words=clean.split(' ');let current='';
  const rows:string[]=[];
  for(const word of words){const next=current?current+' '+word:word;if(font.widthOfTextAtSize(next,size)>508&&current){rows.push(current);current=word}else current=next}rows.push(current);
  for(const row of rows){if(y<56){page=pdf.addPage([612,792]);y=740}page.drawText(row.slice(0,190),{x:48,y,font,size,color:rgb(.08,.20,.16)});y-=size+7}
 };
 write('REALVOLT | BROKERAGE RECORD',9);y-=12;write(title,16);y-=14;
 lines.forEach(line=>write(line));
 return pdf.save();
}
export default function ComplianceClosingPanel({deal,docs,office,notify,onSaved}:{deal:any;docs:Doc[];office:boolean;notify:(s:string)=>void;onSaved:()=>Promise<void>}){
 const db=getSupabase()!;const [busy,setBusy]=useState(false),[folder,setFolder]=useState<any>(null);
 const [payout,setPayout]=useState<any>(null),[loading,setLoading]=useState(false);
 useEffect(()=>{let live=true;const read=async()=>{
  if(deal.rv_stage==='Archived'){
   const r=await db.from('rv_closed_file_folders').select('folder_prefix,document_manifest,closed_at').eq('deal_id',deal.id).maybeSingle();
   if(live)setFolder(r.data||null);
  }else if(office&&deal.rv_stage==='Completed'){
   const r=await db.from('agent_payouts').select('gross,gst,deductions,net,status,payment_reference,paid_date,profile_id').eq('deal_id',deal.id).order('created_at',{ascending:false}).limit(1);
   if(live)setPayout(r.data?.[0]||null);
  }
 };void read();return()=>{live=false}},[db,deal.id,deal.rv_stage,office]);
 async function generate(kind:'completion'|'statement'){
  setBusy(true);
  try {
   if(!office||deal.rv_stage!=='Completed')throw new Error('Confirm legal completion first');
   if(kind==='completion'){
    const name='Brokerage_Completion_Confirmation.pdf';
    if(docs.some(d=>d.name===name))throw new Error('Completion confirmation already exists. Review the saved PDF instead.');
    const bytes=await makePdf('BROKERAGE COMPLETION CONFIRMATION',[
     'Internal record - requires brokerage review',`Property: ${deal.address}`,`File ID: ${deal.transaction_number||deal.id}`,
     `Seller: ${deal.seller_name||'-'}`,`Buyer: ${deal.buyer_name||'-'}`,`Firm sale date: ${deal.rv_firm_date||'-'}`,
     `Confirmed legal completion: ${deal.rv_completed_date||'-'}`,`Commission receipt verified: ${deal.rv_funds_verified?'Yes':'No'}`,
     'Supporting lawyer completion letter is stored separately in the transaction file.',
     'This confirmation does not itself certify transfer of title or settlement of trust funds.'
    ]);
    await saveClosingPDF(deal.id,name,bytes,'Brokerage completion confirmation (PDF)');
    notify('Brokerage completion confirmation saved. Verify it in Compliance before closing.');
   } else {
    if(!payout||payout.status!=='Paid')throw new Error('An issued/recorded agent payment is required before finalizing the internal payable statement');
    const name='Internal_Commission_Payable_Statement.pdf';
    if(docs.some(d=>d.name===name))throw new Error('Internal commission statement already exists. Review the saved PDF instead.');
    const bytes=await makePdf('INTERNAL COMMISSION PAYABLE STATEMENT',[
     'CONFIDENTIAL - NOT FOR LAWYERS OR COOPERATING BROKERAGES',`Property: ${deal.address}`,
     `File ID: ${deal.transaction_number||deal.id}`,`Payout status: ${payout.status}`,
     `Agent commission before GST: ${cad(Number(payout.gross))}`,`GST on agent commission: ${cad(Number(payout.gst))}`,
     `Authorized deductions: ${cad(Number(payout.deductions))}`,`Net amount paid/recorded: ${cad(Number(payout.net))}`,
     `Payment date: ${payout.paid_date||'-'}`,`Payment reference: ${payout.payment_reference||'-'}`,
     'Figures are from the recorded, authorized agent payout. Confirm the cheque or EFT actually issued.'
    ]);
    await saveClosingPDF(deal.id,name,bytes,'Internal commission payable statement (PDF)');
    notify('Private internal commission statement saved. Verify it before closing.');
   }
   await onSaved();
  }catch(e){notify((e as Error).message)}finally{setBusy(false)}
 }
 async function open(path:string){setLoading(true);try{const r=await db.storage.from('transaction-files').createSignedUrl(path,60);if(r.error)throw r.error;window.open(r.data.signedUrl,'_blank','noopener,noreferrer')}catch(e){notify((e as Error).message)}finally{setLoading(false)}}
 if(deal.rv_stage==='Archived'){
  const entries:Array<{id:string;name:string;path:string;phase:string;label:string}>=Array.isArray(folder?.document_manifest)?folder.document_manifest:[];
  const groups=[['listing','Listing documents'],['offer','Accepted offer'],['firm','Subject removal / firm sale'],['completion','Closing, CIR and commission'],['other','Other supporting documents']];
  return <section className="panel" aria-label="Closed transaction folder" style={{marginTop:18}}>
   <h2>Closed file folder</h2><p>Read-only archive · {folder?.closed_at?new Date(folder.closed_at).toLocaleDateString('en-CA'):'Loading archive record'} · {entries.length} attached document(s)</p>
   {groups.map(([phase,title])=>{const files=entries.filter(x=>x.phase===phase);return files.length?<details key={phase} open={phase==='completion'}><summary>{title} ({files.length})</summary>{files.map(f=><div key={f.id} className="draftrow"><span>{f.name}</span><button type="button" className="btn smallbtn" disabled={loading} onClick={()=>void open(f.path)}>Open PDF / file</button></div>)}</details>:null})}
   <p className="hint">The archive manifest stores the original file paths. Documents are retained in the private transaction-files bucket, not sent to clients automatically.</p>
  </section>;
 }
 if(!office||deal.rv_stage!=='Completed')return null;
 const completionExists=docs.some(d=>d.name==='Brokerage_Completion_Confirmation.pdf');
 const statementExists=docs.some(d=>d.name==='Internal_Commission_Payable_Statement.pdf');
 return <section className="panel" style={{marginTop:20}} aria-label="Final completion documents">
  <h2>Final completion documents</h2>
  <p>Back Office adds the lawyer's letter through Transaction Actions. The generated completion and internal commission PDFs stay in this transaction's private folder.</p>
  <p>Completion confirmation: {completionExists?'Attached':'Not generated'} · Internal commission payable: {statementExists?'Attached':'Not generated'} · Agent payment: {payout?.status||'Not authorized'}</p>
  <div className="actions" style={{marginTop:12}}>
   <button type="button" className="btn" disabled={busy||completionExists} onClick={()=>void generate('completion')}>{busy?'Saving…':completionExists?'Completion PDF attached':'Generate completion confirmation'}</button>
   <button type="button" className="btn" disabled={busy||statementExists||payout?.status!=='Paid'} onClick={()=>void generate('statement')}>{busy?'Saving…':statementExists?'Internal statement attached':'Generate private commission statement'}</button>
  </div>
  {payout?.status!=='Paid'&&<p className="hint">Completion confirmation is available after legal completion. The private payable statement waits for an actual recorded payout.</p>}
  {(completionExists!==statementExists)&&<p className="notice">Only one generated PDF is present. Finish the missing document through Back Office before closing; existing PDFs cannot be silently overwritten.</p>}
  <p className="hint">These PDFs are internal records. Verify their checklist items manually. CIR is generated and saved separately from the lawyer conveyancing preview.</p>
 </section>;
}
