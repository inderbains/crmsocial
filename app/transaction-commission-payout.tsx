'use client';
import {useCallback,useEffect,useState} from 'react';
import {getSupabase} from '../lib/supabase';
import {brokerageDay} from '../lib/listing-status';
import {cad,cents} from '../lib/agent-reports';
import DealAdmin from './deal-admin';
import OfficeCheques from './office-cheques';
import ExternalCommissionPayout from './external-commission-payout';

type Deal={id:string;brokerage_id:string|null;rv_stage:string|null;review_status:string;rv_funds_verified:boolean;rv_completion_letter:string|null;rv_completed_date:string|null;address:string;representation:'listing'|'selling';listing_commission:number;selling_commission:number;gst_rate:number;deposit_amount?:number;deposit_holder?:'our_brokerage'|'other_brokerage';buyer_lawyer?:{name?:string;firm?:string}|null;seller_lawyer?:{name?:string;firm?:string}|null;rv105_receipt_ledger_id?:string|null;rv108_lawyer_release_id?:string|null;rv108_commission_receipt_id?:string|null;rv108_general_credit_id?:string|null;rv106_trust_transfer_id?:string|null;rv106_general_transfer_id?:string|null};
type Doc={id:string;name:string};
type Props={deal:Deal;agentName:string;docs:Doc[];notify:(value:string)=>void;onChanged:()=>Promise<void>;phase?:'before'|'after'};
const dollars=(n:unknown)=>cad(cents(Number(n||0)));
export default function TransactionCommissionPayout(props:Props){
 if(props.deal.deposit_holder!=='our_brokerage') return props.phase==='before'?null:<ExternalCommissionPayout deal={props.deal} agentName={props.agentName} docs={props.docs} notify={props.notify} onChanged={props.onChanged}/>;
 return <InternalTrustSettlement key={props.deal.id} {...props}/>;
}
function InternalTrustSettlement({deal,agentName,docs,notify,onChanged,phase='after'}:Props){
 const db=getSupabase()!;
 const [rows,setRows]=useState<any[]>([]),[accounts,setAccounts]=useState<any[]>([]),[payout,setPayout]=useState<any>(null),[allocation,setAllocation]=useState<any>(null),[gate,setGate]=useState<any>(null);
 const [loaded,setLoaded]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const [side,setSide]=useState('seller'),[day,setDay]=useState(brokerageDay()),[reference,setReference]=useState(''),[authorization,setAuthorization]=useState(''),[confirmed,setConfirmed]=useState(false);
 const [through,setThrough]=useState(brokerageDay()),[method,setMethod]=useState('EFT'),[payDay,setPayDay]=useState(brokerageDay()),[payRef,setPayRef]=useState(''),[payConfirmed,setPayConfirmed]=useState(false),[generalDay,setGeneralDay]=useState(brokerageDay()),[generalRef,setGeneralRef]=useState(''),[ownFees,setOwnFees]=useState(false),[generalConfirmed,setGeneralConfirmed]=useState(false);
 const internal=true;
 const ownGross=cents(Number(deal.representation==='listing'?deal.listing_commission:deal.selling_commission)||0),ownGst=Math.round(ownGross*Number(deal.gst_rate||0)/100),total=ownGross+ownGst,deposit=cents(Number(deal.deposit_amount||0));
 const load=useCallback(async()=>{
  setLoaded(false);
  const [l,a,p,c]=await Promise.all([db.from('office_ledger').select('id,account_id,deal_id,amount,entry_date,reference,description,reverses_id').eq('deal_id',deal.id).eq('brokerage_id',deal.brokerage_id||''),db.from('office_bank_accounts').select('*').eq('brokerage_id',deal.brokerage_id||''),db.from('agent_payouts').select('*').eq('deal_id',deal.id).eq('brokerage_id',deal.brokerage_id||'').maybeSingle(),db.from('agent_commission_allocations').select('*').eq('deal_id',deal.id).maybeSingle()]);
  const failed=[l,a,p,c].find(x=>x.error);if(failed?.error){setError(failed.error.message);return}
  setRows(l.data||[]);setAccounts(a.data||[]);setPayout(p.data);setAllocation(c.data);setGate(null);
  if(p.data?.status==='Authorized'){const g=await db.rpc('rv_release_gate_status',{p_payout:p.data.id});if(g.error){setError(g.error.message);return}setGate(g.data)}
  setError('');setLoaded(true);
 },[db,deal.id,deal.brokerage_id]);
 useEffect(()=>{void load()},[load]);
 async function run(name:string,args:Record<string,unknown>,message:string){setBusy(true);try{const res=await db.rpc(name,args);if(res.error)throw res.error;await onChanged();await load();notify(message)}catch(e){notify((e as Error).message)}finally{setBusy(false)}}
 const legacy=!!deal.rv106_trust_transfer_id||!!deal.rv106_general_transfer_id||(deal.rv_funds_verified&&!deal.rv108_commission_receipt_id);
 const trust=rows.filter(r=>accounts.some(a=>a.id===r.account_id&&a.kind==='Trust'));
 const receipt=trust.find(r=>r.id===deal.rv105_receipt_ledger_id&&Number(r.amount)>0&&!r.reverses_id&&!trust.some(x=>x.reverses_id===r.id));
 const source=accounts.find(a=>a.id===receipt?.account_id&&a.active!==false);
 const activeBanks=(kind:string)=>accounts.filter(a=>a.kind===kind&&a.active!==false);
 const defaultBank=(kind:string)=>activeBanks(kind).find(a=>a.rv105_default)||(activeBanks(kind).length===1?activeBanks(kind)[0]:null);
 const general=defaultBank('Operating');
 const balance=trust.reduce((s,r)=>s+cents(Number(r.amount)),0),release=trust.find(r=>r.id===deal.rv108_lawyer_release_id&&!r.reverses_id&&!trust.some(x=>x.reverses_id===r.id)),lawyer=side==='seller'?deal.seller_lawyer:deal.buyer_lawyer;
 const excess=deposit-total,net=payout?cents(Number(payout.net)):0,share=total-net;
 const generalCredit=rows.find(r=>r.id===deal.rv108_general_credit_id&&!r.reverses_id&&!rows.some(x=>x.reverses_id===r.id));
 const simpleReceipt=!!receipt&&!!source&&cents(Number(receipt.amount))===deposit&&rows.length===1&&balance===deposit;
 const retained=!!receipt&&!!source&&balance===total&&(excess===0&&rows.length===1||excess>0&&!!release&&rows.length===2);
 const completed=deal.rv_stage==='Completed'&&!!deal.rv_completed_date&&!!deal.rv_completion_letter&&deal.review_status==='Approved';
 const validDate=(value:string,min?:string|null)=>!!value&&value<=brokerageDay()&&(!min||value>=min);
 const ready=loaded&&!busy&&!error&&!legacy&&total>0;
 if(phase==='before'&&!internal)return null;
 return <section className="panel" style={{marginTop:18}} aria-label={phase==='before'?'Before completion lawyer balance':'Commission settlement'}>
  <h2>{phase==='before'?'Trust deposit — balance to lawyer':'5. Commission & agent payout'}</h2>
  <p className="hint">Realtor: {agentName} · {deal.address}</p>
  {error&&<p role="alert" className="notice">{error}</p>}
  {!loaded&&!error&&<p>Loading recorded accounting entries…</p>}
  {legacy&&<p role="alert" className="notice">This file has a legacy commission transfer or receipt. Do not post a second receipt or payout. Review the existing bank and Trust entries with Back Office before continuing.</p>}
  <div className="crm-form-grid">
   {internal&&<div>Original client deposit: <b>{dollars(deposit/100)}</b></div>}
   <div>Our commission: <b>{cad(ownGross)}</b> + GST <b>{cad(ownGst)}</b></div>
   <div>Commission to retain in Trust: <b>{cad(total)}</b></div>
   <div>Trust account: <b>{source?.name||'Receipt not linked'}</b></div>
   <div>Recorded Trust balance for this sale: <b>{loaded?cad(balance):'—'}</b></div>
   {internal&&<div>Proposed balance payable to lawyer: <b>{cad(Math.max(excess,0))}</b></div>}
  </div>
  {internal&&release&&<p className="notice">Lawyer disbursement recorded: {dollars(-Number(release.amount))} · {release.entry_date} · {release.reference}. Commission remains in Trust until legal completion.</p>}
  {internal&&!release&&excess===0&&<p className="hint">No excess deposit is available for this standard release.</p>}
  {internal&&excess<0&&<p role="alert">The deposit does not cover commission. Review the shortfall separately; this standard workflow cannot settle it.</p>}
  {internal&&!release&&excess>0&&!legacy&&!deal.rv_funds_verified&&<div className="notice" style={{marginTop:12}}>
   <h3>Record authorized payment to lawyer</h3>
   <p>Pay only the authorized excess, retaining {cad(total)} in Trust. Obtain written directions from both parties or their conveyancers and the receiving conveyancer’s stakeholder undertaking. If another brokerage or any other payee must be paid separately, use accounting review instead of this one-payment workflow.</p>
   <div className="crm-form-grid">
    <label>Receiving lawyer<select value={side} onChange={e=>{setSide(e.target.value);setConfirmed(false)}}><option value="seller">Seller’s lawyer{deal.seller_lawyer?.name?' — '+deal.seller_lawyer.name:''}</option><option value="buyer">Buyer’s lawyer{deal.buyer_lawyer?.name?' — '+deal.buyer_lawyer.name:''}</option></select></label>
    <label>Actual payment date<input type="date" value={day} min={receipt?.entry_date} max={phase==='after'&&deal.rv_completed_date?deal.rv_completed_date:brokerageDay()} onChange={e=>{setDay(e.target.value);setConfirmed(false)}}/></label>
    <label>Cheque / EFT bank reference<input value={reference} maxLength={200} onChange={e=>{setReference(e.target.value);setConfirmed(false)}}/></label>
    <label>Written directions and undertaking reference<input value={authorization} maxLength={500} onChange={e=>{setAuthorization(e.target.value);setConfirmed(false)}}/></label>
   </div>
   <label style={{display:'flex',alignItems:'center',gap:8,margin:'12px 0'}}><input type="checkbox" style={{width:'auto'}} checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/> I confirm cleared funds, written directions and stakeholder undertaking are on file; this lawyer received the exact authorized excess and no separate entitlement is omitted.</label>
   {loaded&&!simpleReceipt&&<p role="alert">A single full linked deposit receipt is required. Review missing, partial, reversed or prior payments; never enter a duplicate deposit.</p>}
   <button type="button" className="btn primary" disabled={!ready||!simpleReceipt||!lawyer?.name||!validDate(day,receipt?.entry_date)||(phase==='after'&&(!deal.rv_completed_date||day>deal.rv_completed_date))||reference.trim().length<4||authorization.trim().length<4||!confirmed} onClick={()=>void run('rv108_record_lawyer_release',{p_deal:deal.id,p_side:side,p_day:day,p_reference:reference.trim(),p_authorization:authorization.trim(),p_amount:excess/100},'Lawyer disbursement recorded. Commission remains in Trust.')}>Record lawyer disbursement</button>
  </div>}
  {phase==='before'?<p className="hint">No commission transfer or agent payout is permitted through this workflow before legal completion. Recording a disbursement does not move money at the bank.</p>:<>
   {!legacy&&!deal.rv_funds_verified&&<div className="notice" style={{marginTop:14}}>
    <h3>Release earned commission for settlement</h3>
    <p>Uses the existing Trust receipt and retained commission. No new deposit or transfer is created.</p>
    <button className="btn primary" type="button" disabled={!ready||!completed||!retained} onClick={()=>{if(confirm('Confirm the retained funds are cleared and the commission is earned and authorized for distribution after legal completion?'))void run('rv108_confirm_commission',{p_deal:deal.id,p_day:null,p_reference:'Earned and cleared retained Trust commission'},'Commission available for settlement in Trust.')}}>Authorize retained commission for settlement</button>
   </div>}
   {!legacy&&deal.rv_funds_verified&&!!receipt&&<>
    <p className="notice">Commission is held in Trust. The agent’s authorized net payment is paid from Trust; only the remaining earned brokerage share goes to General.</p>
    <DealAdmin kind="Sale" agentName={agentName} dealId={deal.id} status={deal.review_status} backOffice={true} docs={docs} canAllocate={!payout} defaultCommission={ownGross/100} defaultGST={0} notify={notify} commissionOnly onFinancialChanged={()=>void load()}/>
    {!payout&&<><h3>6. Calculate and authorize agent payout</h3><label>Apply outstanding fees through <input type="date" value={through} onChange={e=>setThrough(e.target.value)}/></label><div className="actions"><button type="button" className="btn" disabled={!ready||!completed||balance!==total} onClick={()=>void run('apply_agent_split',{deal:deal.id},'Agent split calculated')}>Calculate agent split</button><button type="button" className="btn primary" disabled={!ready||!completed||!allocation||balance!==total} onClick={()=>{if(confirm('Authorize the calculated net payout and saved deductions?'))void run('authorize_agent_payout',{deal:deal.id,through_month:through},'Agent payout authorized. Review documents before release.')}}>Authorize payout</button></div></>}
    {payout&&<div style={{marginTop:16}}><h3>6. Agent payment — {payout.status}</h3><p>Commission {dollars(payout.gross)} + GST {dollars(payout.gst)} − deductions {dollars(payout.deductions)} = <b>{cad(net)}</b></p>
     {payout.status==='Authorized'&&<>
      <p>Compliance review: {gate?.verified??0} / {gate?.required??0} required documents verified · {gate?.approved?'Release approved':'Release approval required'}</p>
      {!gate?.approved&&<button type="button" className="btn" disabled={!ready||!gate?.ready_for_review} onClick={()=>{if(confirm('Approve release after reviewing the required documents?'))void run('rv_approve_commission_release',{p_payout:payout.id},'Commission release approved.')}}>Approve commission release</button>}
      <details style={{marginTop:12}}><summary>Print and issue Trust commission cheque</summary><OfficeCheques brokerage={{id:deal.brokerage_id}} accounts={source?[source]:[]} deals={[deal]} payouts={[payout]} notify={notify} onChanged={async()=>{await load();await onChanged()}} initialDealId={deal.id} commissionTrust={true}/></details>
      <div className="crm-form-grid" style={{marginTop:12}}><label>Externally paid by<select value={method} onChange={e=>{setMethod(e.target.value);setPayConfirmed(false)}}><option>EFT</option><option>Cheque</option></select></label><label>Actual payment date<input type="date" value={payDay} onChange={e=>{setPayDay(e.target.value);setPayConfirmed(false)}}/></label><label>Actual bank/cheque reference<input value={payRef} maxLength={180} onChange={e=>{setPayRef(e.target.value);setPayConfirmed(false)}}/></label></div>
      <label style={{display:'flex',gap:8,alignItems:'center',margin:'12px 0'}}><input type="checkbox" style={{width:'auto'}} checked={payConfirmed} onChange={e=>setPayConfirmed(e.target.checked)}/> Actual payment from Trust made; no other active cheque or EFT instruction exists.</label>
      <button type="button" className="btn primary" disabled={!ready||!gate?.approved||!payConfirmed||!validDate(payDay,deal.rv_completed_date)||!payRef.trim()||net<=0||net>total||balance!==total} onClick={()=>void run('rv108_record_agent_payment',{p_payout:payout.id,p_day:payDay,p_reference:payRef.trim(),p_method:method},'Agent payment recorded from Trust.')}>Record external agent payment</button>
     </>}
     {payout.status==='Paid'&&<div className="notice" style={{marginTop:14}}><h3>7. Brokerage earned share to General</h3><p>Agent net paid: <b>{cad(net)}</b> · Remaining brokerage amount (including authorized own fees): <b>{cad(share)}</b></p>
      {generalCredit?<p>Recorded transfer: {dollars(generalCredit.amount)} · {generalCredit.entry_date} · {generalCredit.reference}</p>:share===0&&balance===0?<p>No brokerage transfer required.</p>:<><p>From {source?.name} to {general?.name||'Set default General account'}. Record only the amount actually transferred at the bank.</p><div className="crm-form-grid"><label>Actual transfer date<input type="date" value={generalDay} onChange={e=>{setGeneralDay(e.target.value);setGeneralConfirmed(false)}}/></label><label>Bank transfer reference<input value={generalRef} maxLength={200} onChange={e=>{setGeneralRef(e.target.value);setGeneralConfirmed(false)}}/></label></div>{Number(payout.deductions)>0&&<label><input type="checkbox" style={{width:'auto'}} checked={ownFees} onChange={e=>setOwnFees(e.target.checked)}/> All deductions are authorized brokerage-owned fees; no third-party remittances.</label>}<label style={{display:'flex',gap:8,alignItems:'center',margin:'12px 0'}}><input type="checkbox" style={{width:'auto'}} checked={generalConfirmed} onChange={e=>setGeneralConfirmed(e.target.checked)}/> Actual authorized transfer completed at bank.</label><button className="btn primary" type="button" disabled={!ready||!general||!generalConfirmed||(Number(payout.deductions)>0&&!ownFees)||!validDate(generalDay,payout.paid_date)||generalRef.trim().length<4||share<=0||balance!==share} onClick={()=>void run('rv108_record_brokerage_share',{p_deal:deal.id,p_day:generalDay,p_reference:generalRef.trim(),p_own_fees_confirmed:ownFees},'Brokerage share posted to General and debited from Trust.')}>Record brokerage transfer</button></>}
      {balance===0&&<p>Trust balance for this transaction is zero. Other transaction balances remain unchanged.</p>}</div>}
    </div>}
   </>}
  </>}
  <p className="hint">RealVolt records ledger entries only. Actual bank movement and bank reconciliation are separate.</p>
 </section>;
}
