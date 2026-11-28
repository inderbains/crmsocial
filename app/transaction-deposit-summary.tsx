'use client';
import {useEffect,useState} from 'react';
import {getSupabase} from '../lib/supabase';

type Deal={id:string;kind:string;rv_stage:string|null;review_status:string;representation?:string;brokerage_id:string|null;deposit_amount?:number|null;deposit_holder?:string|null;deposit_brokerage?:string|null;deposit_due_date?:string|null;rv_post_firm_details_confirmed?:boolean;updated_at?:string};
type TrustRow={record_scope:'sale'|'linked_listing';account_label:string;has_positive_balance:boolean};
type Result={rows:TrustRow[];loading:boolean;error:boolean};
const money=(n:number)=>new Intl.NumberFormat('en-CA',{style:'currency',currency:'CAD'}).format(n);
export default function TransactionDepositSummary({deal,revision,backOffice}:{deal:Deal;revision:number;backOffice:boolean}){
 const db=getSupabase();
 const firm=deal.kind==='Sale'&&['Sold','Completed','Archived'].includes(deal.rv_stage||'');
 const amount=Number(deal.deposit_amount??0);
 const known=deal.kind==='Sale'&&(deal.rv_post_firm_details_confirmed===true||(firm&&Number.isFinite(amount)&&amount>0));
 const own=known&&deal.deposit_holder==='our_brokerage';
 const external=known&&deal.deposit_holder==='other_brokerage';
 const eligible=firm&&Boolean(deal.brokerage_id)&&(!backOffice||['Submitted','Approved','Changes requested','Completed'].includes(deal.review_status));
 const [result,setResult]=useState<Result>({rows:[],loading:true,error:false});
 useEffect(()=>{
  let live=true;
  setResult({rows:[],loading:eligible,error:false});
  if(!eligible)return;
  const load=async()=>{
   try{
    if(!db)throw new Error('Connection unavailable');
    const r=await db.rpc('rv103_transaction_trust_summary',{p_deal:deal.id});
    if(r.error)throw r.error;
    if(live)setResult({rows:(r.data||[]) as TrustRow[],loading:false,error:false});
   }catch{if(live)setResult({rows:[],loading:false,error:true});}
  };
  void load();
  const timer=window.setInterval(()=>void load(),15000);
  return()=>{live=false;window.clearInterval(timer)};
 },[db,eligible,deal.id,deal.updated_at,revision]);
 const sale=result.rows.filter(r=>r.record_scope==='sale');
 const linked=result.rows.filter(r=>r.record_scope==='linked_listing');
 const role=deal.kind==='Listing'||deal.representation==='listing'?'Listing Agent — Seller represented':deal.representation==='selling'?'Selling Agent — Buyer represented':'Representation not recorded';
 return <section aria-label="Representation and deposit summary" style={{border:'1px solid #c8d8cc',borderRadius:11,padding:'12px 15px',margin:'12px 0',background:'#f8faf6'}}>
  <h3 style={{margin:'0 0 10px',fontSize:16}}>Representation &amp; deposit details</h3>
  <div className="crm-form-grid">
   <div><div className="hint">Our Realtor represents</div><strong>{role}</strong></div>
   {deal.kind==='Sale'&&<>
    <div><div className="hint">Contract deposit (CAD)</div><strong>{known&&Number.isFinite(amount)?money(amount):'Not recorded yet'}</strong></div>
    <div><div className="hint">Deposit holder</div><strong>{own?'Our brokerage — Trust':external?(deal.deposit_brokerage?.trim()||'Other brokerage — name not recorded'):'Not recorded yet'}</strong></div>
    <div><div className="hint">Deposit due date</div><strong>{deal.deposit_due_date||'Not recorded'}</strong></div>
    <div><div className="hint">Trust ledger account(s)</div><strong>{eligible&&result.loading?'Checking ledger…':eligible&&result.error?'Unable to verify — refresh or contact Back Office':sale.length?sale.map(r=>r.account_label).join(', '):own?(eligible?'Not posted / assigned yet':'Pending Back Office confirmation'):external?'Not held by our brokerage':'Not recorded yet'}</strong></div>
    <div><div className="hint">Receipt / ledger status</div><strong>{eligible&&result.loading?'Checking…':eligible&&result.error?'Not verified':sale.length?(external?'Trust entries exist — review holder discrepancy':sale.some(r=>r.has_positive_balance)?'Trust funds recorded — bank reconciliation separate':'Trust entries recorded — no positive balance on this sale'):linked.length?'Entries on original listing — review allocation':own?(amount===0?'No deposit amount due':'Awaiting Back Office receipt confirmation'):external?'External deposit — no internal receipt expected':'Deposit details pending'}</strong></div>
   </>}
  </div>
  {deal.kind==='Sale'&&linked.length>0&&<p className="hint" style={{marginBottom:0}}>Original listing Trust entries: {linked.map(r=>r.account_label).join(', ')}. These are not automatically allocated to this sale.</p>}
  {deal.kind==='Sale'&&<p className="hint" style={{marginBottom:0}}>Contract deposit is not proof of receipt. Only an authorized Back Office user can record actual Trust funds. This summary does not show the brokerage bank balance.</p>}
 </section>;
}
