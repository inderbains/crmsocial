'use client';
import {useEffect,useState,type FormEvent} from 'react';
import {getSupabase} from '../lib/supabase';
import {cad,cents} from '../lib/agent-reports';

type Row=Record<string,any>;
type Props={account:Row;bankRows:Row[];ledgerRows:Row[];matches:Row[];reviews:Row[];reconciliations:Row[];period:string;setPeriod:(s:string)=>void;statementBalance:number;setStatementBalance:(n:number)=>void;busy:boolean;reload:()=>Promise<void>;notify:(s:string)=>void;importCSV:(file:File|undefined)=>Promise<void>};
const amount=(n:number)=>cad(cents(n));
export default function OfficeBankReconciliation({account,bankRows,ledgerRows,matches,reviews,reconciliations,period,setPeriod,statementBalance,setStatementBalance,busy,reload,notify,importCSV}:Props){
 const db=getSupabase()!;
 const [entry,setEntry]=useState({day:period,description:'',amount:'',reference:''});
 const [notes,setNotes]=useState('');
 const [selectedBank,setSelectedBank]=useState(''),[selectedLedger,setSelectedLedger]=useState('');
 const [totals,setTotals]=useState<Row|null>(null);
 const [error,setError]=useState('');
 const [working,setWorking]=useState(false);
 const [reviewRows,setReviewRows]=useState<Row[]>(reviews);
 const matchedBank=new Set(matches.map(m=>m.bank_line_id));
 const matchedLedger=new Set(matches.map(m=>m.ledger_id));
 const bankCandidates=bankRows.filter(b=>b.entry_date<=period&&!matchedBank.has(b.id));
 const ledgerCandidates=ledgerRows.filter(l=>l.entry_date<=period&&!matchedLedger.has(l.id));
 const pending=reviewRows.filter(r=>r.account_id===account.id&&r.status==='Prepared').sort((a,b)=>b.period_end.localeCompare(a.period_end));
 const history=reconciliations.filter(r=>r.account_id===account.id).sort((a,b)=>b.period_end.localeCompare(a.period_end));
 const adjusted=statementBalance+(Number(totals?.deposits_in_transit)||0)-(Number(totals?.outstanding_cheques)||0);
 const difference=adjusted-(Number(totals?.ledger_balance)||0);
 async function refresh(){
  const [result,revs]=await Promise.all([db.rpc('office_reconciliation_totals',{p_account:account.id,p_period:period}),db.from('office_reconciliation_reviews').select('*').eq('account_id',account.id)]);
  if(result.error)throw result.error;if(revs.error)throw revs.error;
  setTotals(Array.isArray(result.data)?result.data[0]:result.data);
  setReviewRows(revs.data||[]);
 }
 useEffect(()=>{let active=true;setTotals(null);setError('');Promise.all([db.rpc('office_reconciliation_totals',{p_account:account.id,p_period:period}),db.from('office_reconciliation_reviews').select('*').eq('account_id',account.id)]).then(([result,reviewResult])=>{if(!active)return;if(result.error)setError(result.error.message);else setTotals(Array.isArray(result.data)?result.data[0]:result.data);if(reviewResult.error)setError(reviewResult.error.message);else setReviewRows(reviewResult.data||[])});return()=>{active=false}},[account.id,period,bankRows,ledgerRows,matches]);
 async function action(fn:()=>Promise<void>){setWorking(true);setError('');try{await fn();await reload();await refresh()}catch(e){setError((e as Error).message)}finally{setWorking(false)}}
 async function postManual(e:FormEvent){e.preventDefault();await action(async()=>{const r=await db.rpc('add_office_bank_line',{p_account:account.id,p_day:entry.day,p_description:entry.description,p_amount:Number(entry.amount),p_reference:entry.reference});if(r.error)throw r.error;setEntry({...entry,description:'',amount:'',reference:''});notify('Manual bank statement line recorded')})}
 async function match(){await action(async()=>{const r=await db.rpc('match_office_bank',{bank_line:selectedBank,ledger_entry:selectedLedger});if(r.error)throw r.error;setSelectedBank('');setSelectedLedger('');notify('Statement line matched to ledger entry')})}
 async function prepare(e:FormEvent){e.preventDefault();await action(async()=>{const r=await db.rpc('prepare_office_reconciliation',{p_account:account.id,p_period:period,p_statement:statementBalance,p_notes:notes});if(r.error)throw r.error;notify('Prepared for managing broker approval')})}
 async function approve(id:string){await action(async()=>{const r=await db.rpc('approve_office_reconciliation',{p_review:id});if(r.error)throw r.error;notify('Bank reconciliation approved and signed')})}
 function downloadReport(){const text=[`REALVOLT BANK RECONCILIATION`,account.name,`Period: ${period}`,`Statement balance: ${amount(statementBalance)}`,`Deposits in transit: ${amount(Number(totals?.deposits_in_transit||0))}`,`Outstanding cheques: ${amount(Number(totals?.outstanding_cheques||0))}`,`Adjusted bank balance: ${amount(adjusted)}`,`Ledger balance: ${amount(Number(totals?.ledger_balance||0))}`,`Difference: ${amount(difference)}`,`Trust liability total: ${totals?.trust_liability_total==null?'Not applicable':amount(Number(totals.trust_liability_total))}`,`Unmatched statement lines: ${totals?.unmatched_bank_count??'unknown'}`,`Notes: ${notes}`,'','Generated worksheet, not an approved reconciliation. Approval must be recorded in RealVolt.'].join('\n');const link=document.createElement('a');const url=URL.createObjectURL(new Blob([text],{type:'text/plain'}));link.href=url;link.download=`RealVolt-reconciliation-${period}.txt`;link.click();URL.revokeObjectURL(url)}
 const disabled=busy||working;
 return <div className="office-recon-v2" style={{display:'grid',gap:16,marginTop:16}}>
  {error&&<div className="notice" role="alert">{error}</div>}
  <section className="panel"><div className="sectionhead"><div><h2>Monthly bank reconciliation</h2><p>{account.name} · {account.kind} · CAD</p></div><button className="btn" type="button" onClick={downloadReport}>Download worksheet</button></div>
   <div className="crm-form-grid"><div className="field"><label>Month-end / statement ending date</label><input type="date" value={period} onChange={e=>setPeriod(e.target.value)}/></div><div className="field"><label>Ending balance on bank statement (CAD)</label><input type="number" step=".01" value={statementBalance} onChange={e=>setStatementBalance(Number(e.target.value))}/></div></div>
   <div className="crm-stats" style={{marginTop:16}}>{[[amount(statementBalance),'Bank statement'],[amount(Number(totals?.deposits_in_transit||0)),'Deposits in transit'],[amount(Number(totals?.outstanding_cheques||0)),'Uncleared cheques'],[amount(adjusted),'Adjusted bank'],[amount(Number(totals?.ledger_balance||0)),'Book ledger'],[amount(difference),'Difference']].map(([n,l])=><div key={l} className="stat"><div><strong>{n}</strong><p>{l}</p></div></div>)}</div>
   {account.kind==='Trust'&&<div className="notice">Trust liabilities by transaction: <b>{amount(Number(totals?.trust_liability_total||0))}</b> · Negative file ledgers: <b>{totals?.negative_file_count??'—'}</b>. Approval requires the bank, trust control ledger and individual file liabilities to agree.</div>}
   <p className="hint">Unmatched ledger deposits and cheques remain in transit until they appear on the bank statement. Imported bank lines without a ledger match must be resolved. Do not enter the same transaction twice.</p>
  </section>
  <section className="panel"><h2>Add bank statement transaction manually</h2><p>Use for a line shown on the bank statement. For missing bookkeeping entries, first use Trust & bank to post the corresponding ledger entry.</p>
   <form onSubmit={postManual}><div className="crm-form-grid"><div className="field"><label>Bank posting date</label><input required type="date" value={entry.day} onChange={e=>setEntry({...entry,day:e.target.value})}/></div><div className="field"><label>Amount (deposit + / withdrawal −)</label><input required type="number" step=".01" value={entry.amount} onChange={e=>setEntry({...entry,amount:e.target.value})}/></div><div className="field"><label>Description</label><input required value={entry.description} onChange={e=>setEntry({...entry,description:e.target.value})}/></div><div className="field"><label>Bank reference / cheque number</label><input value={entry.reference} onChange={e=>setEntry({...entry,reference:e.target.value})}/></div></div><button className="btn primary" disabled={disabled}>Record statement line</button></form>
  </section>
  <section className="panel"><h2>Import bank CSV</h2><p>CSV columns: <code>date,description,amount,reference</code> (reference optional). Date YYYY-MM-DD; signed amounts. Maximum 2,000 lines per upload.</p><input type="file" aria-label="Import bank CSV" accept=".csv,text/csv" disabled={disabled} onChange={e=>{void importCSV(e.target.files?.[0]);e.target.value=''}}/></section>
  <section className="panel"><h2>Match bank statement with books</h2><p>{bankCandidates.length} unmatched bank statement lines · {ledgerCandidates.length} unmatched book entries through {period}</p>
   <div className="crm-form-grid"><div className="field"><label>Unmatched bank transaction</label><select value={selectedBank} onChange={e=>setSelectedBank(e.target.value)}><option value="">Select bank transaction</option>{bankCandidates.map(b=><option key={b.id} value={b.id}>{b.entry_date} · {b.description} · {amount(Number(b.amount))}</option>)}</select></div><div className="field"><label>Matching book transaction</label><select value={selectedLedger} onChange={e=>setSelectedLedger(e.target.value)}><option value="">Select book transaction</option>{ledgerCandidates.map(l=><option key={l.id} value={l.id}>{l.entry_date} · {l.description} · {amount(Number(l.amount))}</option>)}</select></div></div>
   <button className="btn" disabled={disabled||!selectedBank||!selectedLedger} onClick={()=>void match()}>Match selected transactions</button><p className="hint">The database verifies matching account, brokerage and amount. Historical approved periods cannot be altered.</p>
  </section>
  <section className="panel"><h2>Prepare for broker approval</h2><form onSubmit={prepare}><div className="field"><label>Reconciliation notes / explanation</label><textarea maxLength={2000} value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Uncleared cheques, bank charges, corrections, supporting statement…"/></div><button className="btn primary" disabled={disabled||!totals||Math.abs(difference)>=0.005||Number(totals?.unmatched_bank_count)!==0||Number(totals?.negative_file_count)!==0||account.kind==='Trust'&&Number(totals?.trust_liability_total)!==Number(totals?.ledger_balance)}>Prepare reconciliation</button></form><p className="hint">A second brokerage administrator must approve the reconciliation. Preparing does not release funds or mark cheques paid.</p></section>
  <section className="panel"><h2>Awaiting managing broker review</h2>{pending.length===0?<p>No pending approvals for this account.</p>:pending.map(r=><div className="draftrow" key={r.id}><div><b>{r.period_end} · {amount(Number(r.adjusted_bank_balance))}</b><p>Prepared {new Date(r.prepared_at).toLocaleString('en-CA')} · {r.notes||'No notes'}</p></div><button className="btn primary" disabled={disabled} onClick={()=>void approve(r.id)}>Review & approve</button></div>)}</section>
  <section className="panel"><h2>Approved reconciliation history</h2>{history.length===0?<p>No approved statements yet.</p>:history.map(r=><div className="draftrow" key={r.id}><div><b>{r.period_end} · Bank {amount(Number(r.statement_balance))}</b><p>Book {amount(Number(r.ledger_balance))} · Trust liabilities {r.trust_file_total==null?'N/A':amount(Number(r.trust_file_total))} · Signed {new Date(r.signed_at).toLocaleString('en-CA')}</p></div></div>)}</section>
 </div>
}
