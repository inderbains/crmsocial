'use client';

import {useCallback,useEffect,useState,type FormEvent} from 'react';
import {getSupabase} from '../lib/supabase';
import {brokerageDay} from '../lib/listing-status';
import {cad,cents} from '../lib/agent-reports';

type Row=Record<string,any>;
type Props={
  brokerageId:string;
  mode:'Payroll & salaries'|'EFT payments';
  accounts:Row[];
  payouts:Row[];
  agents:Row[];
  notify:(message:string)=>void;
  onChanged:()=>Promise<void>;
  onNavigate?:(view:string)=>void;
};
const money=(n:unknown)=>cad(cents(Number(n)));
const operating=(accounts:Row[])=>accounts.filter(a=>a.kind==='Operating'&&a.active!==false);
const thisMonth=()=>brokerageDay().slice(0,7)+'-01';

/** EFT here is an external-bank payment register, not a bank-transfer API. */
export default function OfficePayrollEFT({brokerageId,mode,accounts,payouts,agents,notify,onChanged,onNavigate}:Props){
 const db=getSupabase()!;
 const [staff,setStaff]=useState<Row[]>([]),[runs,setRuns]=useState<Row[]>([]),[efts,setEfts]=useState<Row[]>([]),[cheques,setCheques]=useState<Row[]>([]);
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 const [newStaff,setNewStaff]=useState({full_name:'',job_title:'',email:''});
 const [runDraft,setRunDraft]=useState({staff:'',start:thisMonth(),end:brokerageDay(),pay:brokerageDay(),gross:'',deductions:'0',employer:'0'});
 const [agentDraft,setAgentDraft]=useState({payout:'',bank:'',destination:'',last4:''});
 const [bankRef,setBankRef]=useState<Record<string,string>>({});
 const [settledDate,setSettledDate]=useState<Record<string,string>>({});
 const [payrollSelection,setPayrollSelection]=useState<Record<string,'Cheque'|'EFT'>>({});
 const [salaryDraft,setSalaryDraft]=useState<Record<string,{bank:string;chequeNumber:string;destination:string;last4:string}>>({});
 const [verified,setVerified]=useState<Record<string,boolean>>({});

 const load=useCallback(async()=>{
   const names=['office_staff','office_payroll_runs','office_eft_instructions','office_cheques'] as const;
   const responses=await Promise.all(names.map(table=>db.from(table).select('*').eq('brokerage_id',brokerageId).order('created_at',{ascending:false}).limit(1000)));
   const failed=responses.find(r=>r.error);
   if(failed?.error){setError('Run migration 029_office_payroll_eft.sql in Supabase. '+failed.error.message);return;}
   setStaff(responses[0].data||[]);setRuns(responses[1].data||[]);setEfts(responses[2].data||[]);setCheques(responses[3].data||[]);setError('');
 },[db,brokerageId]);
 useEffect(()=>{void load()},[load]);
 async function rpc(name:string,args:Record<string,unknown>){const r=await db.rpc(name,args);if(r.error)throw r.error;return r.data}
 async function act(work:()=>Promise<void>){setBusy(true);try{await work();await Promise.all([load(),onChanged()])}catch(e){notify((e as Error).message)}finally{setBusy(false)}}
 const hasCheque=(kind:'Agent'|'Salary',id:string)=>cheques.some(c=>c.status!=='Voided'&&(kind==='Agent'?c.payout_id===id:c.payroll_id===id));
 const hasEFT=(kind:'Agent'|'Salary',id:string)=>efts.some(e=>e.status!=='Cancelled'&&(kind==='Agent'?e.payout_id===id:e.payroll_id===id));
 const payrollName=(p:Row)=>staff.find(s=>s.id===p.staff_id)?.full_name||'Employee';
 const accountOptions=<>{operating(accounts).map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</>;

 async function addStaff(ev:FormEvent){ev.preventDefault();await act(async()=>{
   const r=await db.from('office_staff').insert({...newStaff,brokerage_id:brokerageId,full_name:newStaff.full_name.trim()});
   if(r.error)throw r.error;setNewStaff({full_name:'',job_title:'',email:''});notify('Staff member added. No banking or SIN details are stored.');
 })}
 async function createPayroll(ev:FormEvent){ev.preventDefault();await act(async()=>{
   await rpc('create_office_payroll_run',{staff:runDraft.staff,start_day:runDraft.start,end_day:runDraft.end,payment_day:runDraft.pay,
     gross_amount:Number(runDraft.gross),employee_deductions:Number(runDraft.deductions),employer_amount:Number(runDraft.employer)});
   setRunDraft(p=>({...p,gross:'',deductions:'0',employer:'0'}));notify('Payroll draft created. Review figures before approval.');
 })}
 async function prepareSalary(p:Row){
   const method=payrollSelection[p.id]||'Cheque',draft=salaryDraft[p.id]||{bank:'',chequeNumber:'',destination:'',last4:''};
   if(!draft.bank)throw new Error('Select a brokerage operating account');
   if(method==='Cheque'){
     await rpc('prepare_office_payroll_cheque',{payroll:p.id,bank:draft.bank,number_text:draft.chequeNumber,memo:'Salary '+p.period_end});
     notify('Salary cheque prepared. Open Cheque printing to download, sign and record issue.');
     onNavigate?.('Cheque printing');
   }else{
     if(!verified[p.id])throw new Error('Confirm the recipient was verified with your bank or payment provider');
     await rpc('prepare_office_eft',{bank:draft.bank,agent_payout:null,payroll:p.id,destination:draft.destination,last_four:draft.last4});
     notify('Salary EFT prepared. Record the external bank transfer under EFT payments.');
     onNavigate?.('EFT payments');
   }
 }
 function patchSalary(id:string,key:'bank'|'chequeNumber'|'destination'|'last4',value:string){setSalaryDraft(prev=>({...prev,[id]:{bank:'',chequeNumber:'',destination:'',last4:'',...prev[id],[key]:value}}))}

 return <>
 {error&&<section className="panel"><p role="alert">{error}</p></section>}
 {mode==='Payroll & salaries'&&<>
  <section className="panel">
   <h2>Payroll & Salaries</h2>
   <p>Enter payroll figures verified by your payroll provider/accountant. RealVolt records approved net salary payments and matches them to bank statements. It does <strong>not</strong> calculate CRA source deductions, CPP, EI or issue T4s.</p>
   <p className="hint">Employees, office administrators, managers and incorporated brokerage owner-employees can be added. Dividends and shareholder drawings must not be entered as salary.</p>
  </section>
  <section className="panel" style={{marginTop:16}}>
   <h2>1 · Staff directory</h2>
   <form onSubmit={addStaff} className="crm-form-grid">
    <label>Employee legal name<input required maxLength={150} value={newStaff.full_name} onChange={e=>setNewStaff({...newStaff,full_name:e.target.value})}/></label>
    <label>Role / job title<input maxLength={100} placeholder="Administrator / Managing broker" value={newStaff.job_title} onChange={e=>setNewStaff({...newStaff,job_title:e.target.value})}/></label>
    <label>Work email (optional)<input type="email" maxLength={150} value={newStaff.email} onChange={e=>setNewStaff({...newStaff,email:e.target.value})}/></label>
    <div className="actions"><button className="btn" disabled={busy||!!error}>Add staff member</button></div>
   </form>
   {staff.map(s=><div className="draftrow" key={s.id}><div><b>{s.full_name}</b><p>{s.job_title||'Staff'} · {s.active?'Active':'Inactive'}</p></div><button className="btn smallbtn" disabled={busy} onClick={()=>void act(async()=>{const r=await db.from('office_staff').update({active:!s.active}).eq('id',s.id);if(r.error)throw r.error})}>{s.active?'Deactivate':'Reactivate'}</button></div>)}
  </section>
  <section className="panel" style={{marginTop:16}}>
   <h2>2 · Prepare salary run</h2>
   <form onSubmit={createPayroll} className="crm-form-grid">
    <label>Staff<select required value={runDraft.staff} onChange={e=>setRunDraft({...runDraft,staff:e.target.value})}><option value="">Select employee</option>{staff.filter(s=>s.active).map(s=><option value={s.id} key={s.id}>{s.full_name}</option>)}</select></label>
    <label>Period start<input required type="date" value={runDraft.start} onChange={e=>setRunDraft({...runDraft,start:e.target.value})}/></label>
    <label>Period end<input required type="date" value={runDraft.end} onChange={e=>setRunDraft({...runDraft,end:e.target.value})}/></label>
    <label>Pay date<input required type="date" value={runDraft.pay} onChange={e=>setRunDraft({...runDraft,pay:e.target.value})}/></label>
    <label>Gross salary (CAD)<input required type="number" min="0.01" step=".01" value={runDraft.gross} onChange={e=>setRunDraft({...runDraft,gross:e.target.value})}/></label>
    <label>Employee deductions, verified (CAD)<input required type="number" min="0" step=".01" value={runDraft.deductions} onChange={e=>setRunDraft({...runDraft,deductions:e.target.value})}/></label>
    <label>Employer CPP/EI & other costs, verified (CAD)<input required type="number" min="0" step=".01" value={runDraft.employer} onChange={e=>setRunDraft({...runDraft,employer:e.target.value})}/></label>
    <div className="actions"><button className="btn primary" disabled={busy||!!error}>Create payroll draft</button></div>
   </form>
   <p className="hint">Net pay = gross salary minus employee deductions. Employer costs and withheld amounts are shown for reference; remittances and statutory payroll journals need a payroll provider integration.</p>
  </section>
  <section className="panel" style={{marginTop:16}}>
   <h2>3 · Approve & pay salary</h2>
   {!runs.length&&<p>No salary runs yet.</p>}
   {runs.map(p=>{
      const method=payrollSelection[p.id]||'Cheque',draft=salaryDraft[p.id]||{bank:'',chequeNumber:'',destination:'',last4:''};
      const existsCheque=hasCheque('Salary',p.id),existsEFT=hasEFT('Salary',p.id);
      return <div className="draftrow" key={p.id} style={{display:'block'}}>
        <div className="sectionhead"><div><b>{payrollName(p)}</b><p>{p.period_start} to {p.period_end} · Pay date {p.pay_date} · {p.status}</p></div><strong>{money(p.net)} net</strong></div>
        <p>Gross {money(p.gross)} · Employee deductions {money(p.deductions)} · Employer costs {money(p.employer_costs)}</p>
        {p.status==='Draft'&&<button className="btn primary" disabled={busy} onClick={()=>void act(async()=>{await rpc('approve_office_payroll_run',{payroll:p.id});notify('Salary approved; choose Cheque or EFT below.')})}>Approve verified salary</button>}
        {p.status==='Approved'&&!existsCheque&&!existsEFT&&<div className="crm-form-grid" style={{marginTop:10}}>
         <label>Pay using<select value={method} onChange={e=>setPayrollSelection(prev=>({...prev,[p.id]:e.target.value as 'Cheque'|'EFT'}))}><option>Cheque</option><option>EFT</option></select></label>
         <label>Source operating account<select required value={draft.bank} onChange={e=>patchSalary(p.id,'bank',e.target.value)}><option value="">Select operating account</option>{accountOptions}</select></label>
         {method==='Cheque'?<label>Cheque number<input required inputMode="numeric" pattern="[0-9]{1,12}" placeholder="Bank cheque number" value={draft.chequeNumber} onChange={e=>patchSalary(p.id,'chequeNumber',e.target.value)}/></label>:<>
          <label>Verified destination alias<input required maxLength={120} placeholder="Recipient saved in bank portal" value={draft.destination} onChange={e=>patchSalary(p.id,'destination',e.target.value)}/></label>
          <label>Destination account last four digits<input required inputMode="numeric" maxLength={4} pattern="[0-9]{4}" value={draft.last4} onChange={e=>patchSalary(p.id,'last4',e.target.value)}/></label>
          <label><input type="checkbox" style={{width:'auto'}} checked={!!verified[p.id]} onChange={e=>setVerified(prev=>({...prev,[p.id]:e.target.checked}))}/> Recipient verified outside RealVolt</label>
         </>}
         <div className="actions"><button className="btn primary" type="button" disabled={busy} onClick={()=>void act(()=>prepareSalary(p))}>Prepare {method} payment</button></div>
        </div>}
        {p.status==='Approved'&&(existsCheque||existsEFT)&&<p className="hint">Payment prepared by {existsCheque?'Cheque printing':'EFT payments'}. Return there to finish the payment.</p>}
        {p.status==='Paid'&&<p>Paid by {p.payment_method} on {p.paid_date} · Ref: {p.payment_reference}. Ledger entry available for bank matching.</p>}
      </div>
   })}
  </section>
 </>}
 {mode==='EFT payments'&&<>
  <section className="panel">
   <h2>EFT payments · Agent commissions and salaries</h2>
   <p>Prepare electronic payment instructions here. <strong>RealVolt does not send bank transfers yet.</strong> Submit the transfer through your business bank or payment provider, enter its reference, then confirm settlement after checking evidence. Only confirmation posts the amount to the operating ledger.</p>
   <p className="hint">Never enter banking passwords or full account/transit numbers here. Keep destination banking details in your bank's secure payee directory.</p>
  </section>
  <section className="panel" style={{marginTop:16}}>
   <h2>Prepare agent EFT</h2>
   <form className="crm-form-grid" onSubmit={e=>{e.preventDefault();if(!verified.agent) {notify('Verify payee account with your bank before proceeding.');return;}void act(async()=>{
    await rpc('prepare_office_eft',{bank:agentDraft.bank,agent_payout:agentDraft.payout,payroll:null,destination:agentDraft.destination,last_four:agentDraft.last4});
    setAgentDraft({payout:'',bank:'',destination:'',last4:''});setVerified(prev=>({...prev,agent:false}));notify('Agent EFT instruction prepared. It has not been sent to a bank.');
   })}}>
    <label>Authorized agent payout<select required value={agentDraft.payout} onChange={e=>setAgentDraft({...agentDraft,payout:e.target.value})}><option value="">Select unpaid agent</option>{payouts.filter(p=>p.status==='Authorized'&&!hasCheque('Agent',p.id)&&!hasEFT('Agent',p.id)).map(p=><option key={p.id} value={p.id}>{agents.find(a=>a.id===p.profile_id)?.full_name||'Agent'} · {money(p.net)}</option>)}</select></label>
    <label>Source operating account<select required value={agentDraft.bank} onChange={e=>setAgentDraft({...agentDraft,bank:e.target.value})}><option value="">Select account</option>{accountOptions}</select></label>
    <label>Recipient saved in bank directory<input required maxLength={120} placeholder="Verified payee alias" value={agentDraft.destination} onChange={e=>setAgentDraft({...agentDraft,destination:e.target.value})}/></label>
    <label>Recipient account last 4<input required inputMode="numeric" pattern="[0-9]{4}" maxLength={4} value={agentDraft.last4} onChange={e=>setAgentDraft({...agentDraft,last4:e.target.value})}/></label>
    <label><input type="checkbox" style={{width:'auto'}} checked={!!verified.agent} onChange={e=>setVerified(prev=>({...prev,agent:e.target.checked}))}/> I verified this payee with the bank/payment provider</label>
    <div className="actions"><button className="btn primary" disabled={busy||!!error}>Prepare EFT</button></div>
   </form>
  </section>
  <section className="panel" style={{marginTop:16}}>
   <h2>Electronic payment register</h2>
   {!efts.length&&<p>No EFT payment instructions yet.</p>}
   {efts.map(e=><div className="draftrow" style={{display:'block'}} key={e.id}>
     <div className="sectionhead"><div><b>{e.payee} · {money(e.amount)}</b><p>{e.payroll_id?'Salary':'Agent commission'} · {e.status} · Bank destination ••••{e.destination_last4}</p><p>Source: {accounts.find(a=>a.id===e.account_id)?.name} · Recipient alias: {e.destination_label}</p></div></div>
     {e.status==='Prepared'&&<div className="actions">
       <input aria-label={'Bank reference for '+e.payee} placeholder="External EFT bank reference" value={bankRef[e.id]||''} onChange={v=>setBankRef(prev=>({...prev,[e.id]:v.target.value}))}/>
       <button className="btn primary" disabled={busy} onClick={()=>{if(confirm('Have you ALREADY submitted this transfer through your actual bank? RealVolt does not send it.'))void act(async()=>{await rpc('record_office_eft_submitted',{eft:e.id,bank_reference:bankRef[e.id]||''});notify('Bank submission recorded. Await settlement confirmation.')})}}>Mark sent at bank</button>
       <button className="btn" disabled={busy} onClick={()=>void act(async()=>{await rpc('cancel_prepared_office_eft',{eft:e.id});notify('Unsent EFT instruction cancelled')})}>Cancel unsent</button>
     </div>}
     {e.status==='Submitted'&&<div className="actions">
       <p>External bank ref: {e.external_reference}</p>
       <label>Bank settlement date<input type="date" required value={settledDate[e.id]||brokerageDay()} onChange={v=>setSettledDate(prev=>({...prev,[e.id]:v.target.value}))}/></label>
       <button className="btn primary" disabled={busy} onClick={()=>{if(confirm('Confirm this EFT has settled based on external bank evidence? This will post one operating-ledger payment.'))void act(async()=>{await rpc('confirm_office_eft',{eft:e.id,settled_day:settledDate[e.id]||brokerageDay()});notify('EFT confirmed and posted to operating ledger for reconciliation.')})}}>Confirm bank settlement</button>
     </div>}
     {e.status==='Confirmed'&&<p>Settled {e.payment_day} · Reference {e.external_reference} · Ledger entry created for Bank Reconciliation.</p>}
     {e.status==='Cancelled'&&<p>Unsent instruction cancelled. No payment posted.</p>}
   </div>)}
  </section>
 </>}
 </>;
}
