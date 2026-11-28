'use client';
import {useEffect,useState} from 'react';
import {getSupabase} from '../lib/supabase';
import {brokerageDay} from '../lib/listing-status';
type Deal={id:string;deposit_amount:number;deposit_holder:string;rv_stage:string|null;review_status:string;rv105_received_on?:string|null;rv105_receipt_status?:string|null;rv105_receipt_ledger_id?:string|null;updated_at?:string};
const labels:Record<string,string>={posted:'Receipt posted to Trust.',bank_setup_required:'Receipt recorded. Back Office must configure the default Trust account.',existing_entries:'Receipt recorded, but existing Trust entries require allocation review. No duplicate was posted.',accounting_period_review:'Receipt recorded. Back Office must resolve the bank opening date or locked period.',pending:'Receipt recorded; ledger posting pending.'};
export default function TransactionTrustReceipt({deal,office,notify,onSaved}:{deal:Deal;office:boolean;notify:(s:string)=>void;onSaved:()=>Promise<void>}){
 const db=getSupabase();const [date,setDate]=useState(''),[busy,setBusy]=useState(false),[existing,setExisting]=useState<boolean|null>(null),[error,setError]=useState('');
 useEffect(()=>{let live=true;setExisting(null);setError('');if(!db)return;void db.rpc('rv103_transaction_trust_summary',{p_deal:deal.id}).then(r=>{if(!live)return;if(r.error){setError('Unable to check existing Trust entries. Refresh the file.');return;}setExisting(Boolean(r.data?.length));});return()=>{live=false}},[db,deal.id,deal.updated_at,deal.rv105_receipt_status]);
 if(deal.deposit_holder!=='our_brokerage'||deal.rv_stage!=='Sold'||!['Submitted','Approved','Changes requested'].includes(deal.review_status)||!(Number(deal.deposit_amount)>0))return null;
 const received=!!deal.rv105_received_on,posted=!!deal.rv105_receipt_ledger_id;
 if(posted||(!received&&existing===true))return null; // Summary already shows the actual ledger entries.
 async function save(){if(!db||busy||existing===null||existing||(!received&&(office||!date||date>brokerageDay())))return;setBusy(true);setError('');try{const r=received?await db.rpc('rv105_retry_saved_receipt',{p_deal:deal.id}):await db.rpc('rv105_record_received_deposit',{p_deal:deal.id,p_received_on:date});if(r.error)throw r.error;notify(labels[String(r.data)]||'Receipt recorded.');await onSaved();}catch(e){setError((e as Error).message||'Unable to record receipt.');}finally{setBusy(false)}}
 return <section className="panel" style={{marginTop:12}} aria-label="Trust deposit receipt status">
 <h3>Client deposit receipt</h3>
 {received?<><p>{labels[deal.rv105_receipt_status||'pending']||'Receipt recorded; ledger posting pending.'} Received on {deal.rv105_received_on}.</p>{office&&existing===false&&<button className="btn" type="button" disabled={busy} onClick={()=>void save()}>{busy?'Posting…':'Retry recorded receipt posting'}</button>}<p className="hint">No additional receipt confirmation is required. Do not record the same amount again.</p></>:office?<p className="hint">Awaiting the agent's actual receipt date. The contract amount alone does not create a Trust ledger entry.</p>:<><p>For funds already received into brokerage Trust, record the actual date once. RealVolt uses the brokerage's default Trust account and the attached receipt document.</p><label className="field">Actual receipt date<input type="date" max={brokerageDay()} value={date} onChange={e=>setDate(e.target.value)} disabled={busy}/></label><button type="button" className="btn primary" disabled={busy||existing!==false||!date||date>brokerageDay()} onClick={()=>void save()}>{busy?'Recording…':'Record received deposit'}</button></>}
 {error&&<p className="notice" role="alert">{error}</p>}
 </section>;
}
