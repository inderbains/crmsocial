'use client';
import {useCallback,useEffect,useState} from 'react';
import {getSupabase} from '../lib/supabase';
import {brokerageDay} from '../lib/listing-status';
import {cad,cents} from '../lib/agent-reports';
import DealAdmin from './deal-admin';
import OfficeCheques from './office-cheques';

type Deal={id:string;brokerage_id:string|null;rv_funds_verified:boolean;rv_stage:string|null;review_status:string;rv_completion_letter:string|null;address:string;representation:'listing'|'selling';listing_commission:number;selling_commission:number;gst_rate:number;deposit_holder?:'our_brokerage'|'other_brokerage'};
type Doc={id:string;name:string};
type Props={deal:Deal;agentName:string;docs:Doc[];notify:(value:string)=>void;onChanged:()=>Promise<void>};

export default function TransactionCommissionPayout({deal,agentName,docs,notify,onChanged}:Props){
 const db=getSupabase()!;
 const [payouts,setPayouts]=useState<any[]>([]);
 const [accounts,setAccounts]=useState<any[]>([]);
 const [receiptLedger,setReceiptLedger]=useState<any[]>([]);
 const [commission,setCommission]=useState<any>(null);
 const [receiptReference,setReceiptReference]=useState('');
 const expectedReceipt=Math.round(Number(deal.representation==='listing'?deal.listing_commission:deal.selling_commission)*(1+Number(deal.gst_rate??5)/100)*100)/100;
 const [receiptAmount,setReceiptAmount]=useState(expectedReceipt>0?expectedReceipt.toFixed(2):'');
 const [receiptAccount,setReceiptAccount]=useState('');
 const [receiptDate,setReceiptDate]=useState(brokerageDay());
 const [month,setMonth]=useState(brokerageDay());
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const load=useCallback(async()=>{
  const [p,a,c,l]=await Promise.all([
   db.from('agent_payouts').select('*').eq('deal_id',deal.id).order('created_at',{ascending:false}),
   db.from('office_bank_accounts').select('*').eq('brokerage_id',deal.brokerage_id||''),
   db.from('agent_commission_allocations').select('*').eq('deal_id',deal.id).maybeSingle(),
   db.from('office_ledger').select('id,account_id,deal_id,amount,entry_date,reference,description').eq('deal_id',deal.id)
  ]);
  const failed=[p,a,c,l].find(r=>r.error);
  if(failed?.error){setError(failed.error.message);return}
  setPayouts(p.data||[]);setAccounts(a.data||[]);setCommission(c.data||null);setReceiptLedger(l.data||[]);setError('');
  const operating=(a.data||[]).filter((item:any)=>item.kind==='Operating'&&item.active!==false);
  if(operating.length===1)setReceiptAccount(previous=>previous||operating[0].id);
 },[db,deal.id,deal.brokerage_id]);
 useEffect(()=>{void load()},[load]);
 async function execute(name:string,args:Record<string,unknown>,message:string){
  setBusy(true);
  try{
   const r=await db.rpc(name,args);if(r.error)throw r.error;
   await load();await onChanged();notify(message);
  }catch(e){notify((e as Error).message)}finally{setBusy(false)}
 }
 const latest=payouts[0];
 const externalDeposit=deal.deposit_holder==='other_brokerage';
 const internalDeposit=deal.deposit_holder==='our_brokerage';
 const hasOperatingReceipt=receiptLedger.some(e=>Math.abs(Number(e.amount)-expectedReceipt)<0.01&&Number(e.amount)>0&&accounts.some(a=>a.id===e.account_id&&a.kind==='Operating'));
 const eligible=deal.rv_stage==='Completed'&&deal.review_status==='Approved'&&deal.rv_funds_verified&&!!deal.rv_completion_letter&&(!externalDeposit||hasOperatingReceipt);
 const commissionBase=Number(commission?.commission_before_gst||0);
 const actualGst=Number(commission?.commission_gst||0);
 const simulatedGst=Math.round(commissionBase*5)/100;
 return <section className="panel" aria-label="Commission payout on this transaction" style={{marginTop:18}}>
  <h2>5. Commission & agent payout</h2>
  <p className="hint">Realtor: {agentName||'Agent profile unavailable'} · {deal.address}</p>
  <p>Review the commission and deductions here, then authorize and issue payment without leaving the transaction. Payments and cheque releases use the existing Back Office audit and ledger functions.</p>
  {error&&<p role="alert" className="notice">{error}</p>}
  {externalDeposit&&(!deal.rv_funds_verified||!hasOperatingReceipt)&&<div className="notice" role="region" aria-label="Record commission bank receipt">
   <b>{deal.rv_funds_verified?'Finish linking verified commission to the operating bank ledger':'1. Confirm commission received and post to operating bank ledger'}</b>
   <p>{deal.rv_funds_verified?'This transaction was previously marked received, but no matching operating-account receipt was posted. Confirm the actual bank receipt below once; RealVolt will link it without marking the receipt twice.':'Enter the actual bank receipt once. RealVolt records the operating-account deposit and marks commission received together in one database transaction.'}</p>
   <p>Expected brokerage commission: <b>{cad(cents(Number(deal.representation==='listing'?deal.listing_commission:deal.selling_commission)))}</b> + GST <b>{cad(cents(expectedReceipt-Number(deal.representation==='listing'?deal.listing_commission:deal.selling_commission)))}</b> = <b>{cad(cents(expectedReceipt))}</b>.</p>
   <div className="crm-form-grid">
    <label>Receiving operating bank account<select required value={receiptAccount} onChange={e=>setReceiptAccount(e.target.value)}><option value="">Select operating account</option>{accounts.filter(a=>a.kind==='Operating'&&a.active!==false).map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
    <label>Actual amount received (CAD)<input type="number" step=".01" min="0.01" required value={receiptAmount} onChange={e=>setReceiptAmount(e.target.value)}/></label>
    <label>Actual bank deposit date<input type="date" required value={receiptDate} max={brokerageDay()} onChange={e=>setReceiptDate(e.target.value)}/></label>
    <label>Cheque/EFT bank reference<input value={receiptReference} onChange={e=>setReceiptReference(e.target.value)} required placeholder="Actual bank transaction reference"/></label>
   </div>
   <button type="button" className="btn primary" disabled={busy||!!error||!receiptAccount||expectedReceipt<=0||Math.abs(Number(receiptAmount)-expectedReceipt)>0.009||receiptReference.trim().length<4||!receiptDate} onClick={()=>{if(confirm(`Confirm ${cad(cents(Number(receiptAmount)))} was ACTUALLY deposited into the selected operating account? RealVolt will post ONE receipt to accounting (or link an exact existing one). This will not transfer or reconcile money at the bank.`))void execute('rv072_receive_commission_funds',{p_deal:deal.id,p_account:receiptAccount,p_amount:Number(receiptAmount),p_day:receiptDate,p_reference:receiptReference.trim()},'Commission receipt recorded/linked to operating-account ledger. Match it in Bank Reconciliation.')}}>{busy?'Recording…':deal.rv_funds_verified?'Link verified receipt to accounting':'Confirm receipt & automatically post to accounting'}</button>
   {Math.abs(Number(receiptAmount)-expectedReceipt)>0.009&&<p className="hint">The deposit must match the expected {cad(cents(expectedReceipt))} for this represented side. Review commission and GST before posting a different amount.</p>}
   <p className="hint">Do not record a second deposit if the money already appears in the operating ledger. The server checks for duplicates. Posting a RealVolt ledger entry does not initiate a bank transfer or confirm bank-statement reconciliation.</p>
  </div>}
  {internalDeposit&&!deal.rv_funds_verified&&<div className="notice">
   <b>1. Confirm authorized trust commission transfer</b>
   <p>Deposit held in our brokerage: record the actual trust receipt and authorized trust-to-operating transfer in Trust & Bank first. Do not post a second operating receipt for the same money.</p>
   <label>Verified trust / commission-transfer reference<input value={receiptReference} onChange={e=>setReceiptReference(e.target.value)} placeholder="Trust ledger transfer and authorization reference"/></label>
   <button type="button" className="btn primary" disabled={busy||receiptReference.trim().length<6} onClick={()=>{if(confirm('Have you verified the actual trust receipt and authorized commission disbursement in Trust & Bank?'))void execute('rv_tx_action',{p_deal:deal.id,p_action:'funds',p_note:receiptReference.trim()},'Trust commission release confirmed. Verify recorded trust and operating ledger movements in Bank Reconciliation.')}}>Confirm authorized commission receipt</button>
  </div>}
  {!externalDeposit&&!internalDeposit&&<p className="notice" role="alert">Deposit holder is missing. Save whether our brokerage or another brokerage holds the deposit before verifying commission funds.</p>}
  {deal.rv_funds_verified&&externalDeposit&&hasOperatingReceipt&&<p className="notice">Commission receipt verified and operating-account deposit linked to this transaction. The bank-statement reconciliation is a separate matching step.</p>}
  <div style={{marginTop:16}}>
   <DealAdmin kind="Sale" agentName={agentName} dealId={deal.id} status={deal.review_status} backOffice={true} docs={docs} canAllocate={!!deal.rv_funds_verified} defaultCommission={Number(deal.representation==='listing'?deal.listing_commission:deal.selling_commission)} defaultGST={0} notify={notify} commissionOnly onFinancialChanged={()=>void load()}/>
  </div>
  {commissionBase>0&&<div className="notice" style={{margin:'14px 0'}}>
   <b>GST testing preview — 5%</b>
   <p>Agent commission: {cad(cents(commissionBase))} · GST test calculation: {cad(cents(simulatedGst))} · Saved agent GST: {cad(cents(actualGst))}.</p>
   <p className="hint">The 5% figure is a calculation preview only. An actual payout uses recorded GST based on the agent's verified registration. This preview never posts GST to the ledger.</p>
  </div>}
  <div style={{marginTop:16,borderTop:'1px solid #d2dfd3',paddingTop:16}}>
   <h3>6. Authorize payment</h3>
   {latest?<p>Agent payout: <b>{latest.status}</b> · Authorized net amount: <b>{cad(cents(latest.net))}</b> (commission {cad(cents(latest.gross))} + GST {cad(cents(latest.gst))} − deductions {cad(cents(latest.deductions))})</p>:<p className="hint">First verify actual funds, calculate agent commission and review all fees, then authorize this payment.</p>}
   <label>Apply outstanding fees through <input type="date" value={month} onChange={e=>setMonth(e.target.value)}/></label>
   {!latest&&<div className="actions">
    <button type="button" className="btn" disabled={busy||!eligible} onClick={()=>void execute('apply_agent_split',{deal:deal.id},'Commission split calculated from agent profile')}>Calculate agent split</button>
    <button type="button" className="btn primary" disabled={busy||!eligible||!commission} onClick={()=>{if(confirm('Authorize agent payout using the SAVED commission, GST and office deductions?'))void execute('authorize_agent_payout',{deal:deal.id,through_month:month},'Agent payout authorized. Prepare and issue the cheque below.')}}>Authorize payout with deductions</button>
   </div>}
   {!eligible&&<p className="hint">Authorization requires an approved completed sale, lawyer completion letter and confirmed actual commission receipt{externalDeposit?', including a linked operating-account ledger receipt':''}.</p>}
   {latest?.status==='Paid'&&<p className="notice">Agent payment has been recorded. The cheque/ledger entry can now be matched against the bank statement under Bank Reconciliation.</p>}
  </div>
  {!!latest&&<details open={latest.status==='Authorized'} style={{marginTop:18,borderTop:'1px solid #d2dfd3',paddingTop:16}}>
   <summary style={{cursor:'pointer',fontWeight:700,fontSize:18}}>7. Prepare / issue commission cheque</summary>
   <OfficeCheques brokerage={{id:deal.brokerage_id}} accounts={accounts.filter(a=>a.kind==='Operating')} deals={[deal]} payouts={payouts} notify={notify} onChanged={load} initialDealId={deal.id} onIssued={()=>{void load();void onChanged()}}/>
   <p className="hint">Preparing or downloading a cheque is not payment. Record Issue only after signing and releasing it. The server checks the required document release approval.</p>
  </details>}
 </section>;
}
