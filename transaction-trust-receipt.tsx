'use client';
import {useCallback,useEffect,useState} from 'react';
import {getSupabase} from '../lib/supabase';
import {brokerageDay} from '../lib/listing-status';

type Deal={id:string;brokerage_id:string|null;parent_listing_id:string|null;deposit_amount:number;deposit_holder:string;rv_stage:string|null;review_status:string};
type Account={id:string;name:string;active:boolean};
type Entry={id:string;account_id:string;deal_id:string;amount:number;entry_date:string;reference:string;description:string};
const money=(n:number)=>new Intl.NumberFormat('en-CA',{style:'currency',currency:'CAD'}).format(n);
export default function TransactionTrustReceipt({deal,notify,onSaved}:{deal:Deal;notify:(s:string)=>void;onSaved:()=>Promise<void>}){
 const db=getSupabase();
 const [accounts,setAccounts]=useState<Account[]>([]),[entries,setEntries]=useState<Entry[]>([]);
 const [account,setAccount]=useState(''),[date,setDate]=useState(brokerageDay()),[ref,setRef]=useState('');
 const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const amount=Number(deal.deposit_amount);
 const load=useCallback(async()=>{
   if(!db||!deal.brokerage_id){setError('Brokerage connection unavailable');setLoading(false);return;}
   setLoading(true);
   try{
     const a=await db.from('office_bank_accounts').select('id,name,active').eq('brokerage_id',deal.brokerage_id).eq('kind','Trust');
     if(a.error)throw a.error;
     const ac=(a.data||[]) as Account[];
     const ids=ac.map(x=>x.id);
     const deals=deal.parent_listing_id?[deal.id,deal.parent_listing_id]:[deal.id];
     const l=ids.length?await db.from('office_ledger').select('id,account_id,deal_id,amount,entry_date,reference,description').eq('brokerage_id',deal.brokerage_id).in('account_id',ids).in('deal_id',deals).order('entry_date'):null;
     if(l?.error)throw l.error;
     setAccounts(ac);setEntries((l?.data||[]) as Entry[]);
     const active=ac.filter(x=>x.active);
     setAccount(old=>active.some(x=>x.id===old)?old:active.length===1?active[0].id:'');setError('');
   }catch(e){setError((e as Error).message||'Unable to read Trust ledger');}finally{setLoading(false);}
 },[db,deal.id,deal.brokerage_id,deal.parent_listing_id]);
 useEffect(()=>{void load()},[load]);
 async function post(){
   if(!db||busy||loading||entries.length||error||!account||!date||date>brokerageDay()||ref.trim().length<3||!Number.isFinite(amount)||amount<=0)return;
   if(!window.confirm(`Confirm ${money(amount)} was actually deposited into the selected Trust bank account on ${date}? This records the receipt in RealVolt, not a bank transfer.`))return;
   setBusy(true);setError('');
   try{
     const r=await db.rpc('rv102_record_trust_receipt',{p_deal:deal.id,p_account:account,p_amount:amount,p_day:date,p_reference:ref.trim()});
     if(r.error)throw r.error;
     await load();await onSaved();notify('Client deposit recorded in Trust & Bank.');
   }catch(e){const message=(e as Error).message||'Unable to record deposit';await load();setError(message);}finally{setBusy(false);}
 }
 if(deal.deposit_holder!=='our_brokerage'||deal.rv_stage!=='Sold'||!['Submitted','Approved'].includes(deal.review_status))return null;
 const saleEntries=entries.filter(x=>x.deal_id===deal.id);
 const balance=saleEntries.reduce((sum,x)=>sum+Number(x.amount),0);
 return <section className="panel" aria-label="Client deposit receipt" style={{marginTop:16}}>
   <h3>Client deposit — Trust account</h3><p>Deposit on contract: <b>{money(amount||0)}</b></p>
   <p className="hint">Record only money actually deposited into the brokerage Trust account. Bank reconciliation is a separate step.</p>
   {loading?<p>Checking Trust ledger…</p>:entries.length?<><p>Recorded Trust balance for this sale: <b>{money(balance)}</b></p>{entries.map(e=><div className="draftrow" key={e.id}><span>{e.entry_date} · {accounts.find(a=>a.id===e.account_id)?.name||'Trust'} · {e.description}{e.deal_id!==deal.id?' (linked listing)':''} · {e.reference}</span><b>{money(Number(e.amount))}</b></div>)}<p className="hint">Existing entries found. Review in Trust &amp; Bank rather than posting again. Partial deposits, transfers and corrections use the ledger workflow.</p></>:<>
   <div className="crm-form-grid"><label>Trust bank account<select value={account} onChange={e=>setAccount(e.target.value)}><option value="">Select Trust account</option>{accounts.filter(a=>a.active).map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
   <label>Actual deposit date<input type="date" max={brokerageDay()} value={date} onChange={e=>setDate(e.target.value)}/></label>
   <label>Bank / receipt reference<input autoComplete="off" maxLength={200} value={ref} onChange={e=>setRef(e.target.value)}/></label></div>
   {!accounts.some(a=>a.active)&&<p className="notice">Create an active Trust bank account in Trust &amp; Bank first.</p>}
   <button type="button" className="btn primary" disabled={busy||!!error||!account||!date||date>brokerageDay()||ref.trim().length<3||!(amount>0)} onClick={()=>void post()}>{busy?'Recording…':'Confirm deposit & post to Trust'}</button>
   </>}
   {error&&<><p role="alert" className="notice">{error}</p><button type="button" className="btn" disabled={loading||busy} onClick={()=>void load()}>Refresh ledger / retry</button></>}
 </section>
}
