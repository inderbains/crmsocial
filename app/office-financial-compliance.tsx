'use client';
import {useEffect,useMemo,useState} from 'react';
import {Landmark, FileSpreadsheet, ShieldCheck, WalletCards, ClipboardCheck, ArrowUpRight, AlertTriangle, Download, CircleCheck, CalendarDays} from 'lucide-react';
import {brokerageDay} from '../lib/listing-status';
import {computeOfficeInsights,firmDate,brokerageSideCommission,csvRows} from '../lib/office-insights.mjs';
import styles from './Office036.module.css';

type Props={
 brokerageName:string;deals:any[];accounts:any[];ledger:any[];reconciliations:any[];
 requirements:any[];payouts:any[];audits:any[];statements:any[];billingAlerts:any[];
 onNavigate:(view:string)=>void;
};
const currency=(v:number)=>new Intl.NumberFormat('en-CA',{style:'currency',currency:'CAD'}).format(v||0);
const today=()=>brokerageDay();
const exportCSV=(filename:string,rows:unknown[][])=>{
 const url=URL.createObjectURL(new Blob([csvRows(rows)],{type:'text/csv;charset=utf-8'}));
 const a=document.createElement('a');a.href=url;a.download=filename;a.click();
 window.setTimeout(()=>URL.revokeObjectURL(url),1500);
};
export default function OfficeFinancialCompliance({brokerageName,deals,accounts,ledger,reconciliations,requirements,payouts,audits,statements,billingAlerts,onNavigate}:Props){
 const prevMonth=(()=>{const v=new Date(today().slice(0,7)+'-01T12:00:00Z');v.setUTCDate(0);return v.toISOString().slice(0,7)})();
 const [tab,setTab]=useState<'Accounting'|'Reporting'|'Compliance'>('Accounting');
 useEffect(()=>{
  try {
   const next=window.sessionStorage.getItem('realvolt:finance-selected-tab');
   if(next==='Accounting'||next==='Reporting'||next==='Compliance')setTab(next);
   window.sessionStorage.removeItem('realvolt:finance-selected-tab');
  } catch {}
 },[]);
 const [period,setPeriod]=useState(today().slice(0,7));
 const d=useMemo(()=>computeOfficeInsights({deals,accounts,ledger,reconciliations,requirements,payouts,reconciliationMonth:prevMonth},period),[deals,accounts,ledger,reconciliations,requirements,payouts,period,prevMonth]);
 const currentBrokerageIDs=new Set(deals.map(x=>x.id));
 const missing= d.outstandingReqs.filter(r=>currentBrokerageIDs.has(r.deal_id));
 const urgentMissing = missing.filter(r=>deals.some(x=>x.id===r.deal_id && ['Sold','Completed','Archived'].includes(x.rv_stage)));
 const issues=[
  {title:'Prior-month reconciliations outstanding',value:d.unreconciled.length,go:'Bank reconciliation'},
  {title:'Unverified required documents',value:missing.length,go:'Review queue'},
  {title:'Completed sales awaiting commission receipt',value:d.awaiting.length,go:'Agent payments'},
  {title:'Unpaid authorized agent payouts',value:d.authorized.length,go:'Agent payments'},
  {title:'Unresolved billing alerts',value:billingAlerts.length,go:'Audit & controls'},
  {title:'Completed transactions missing lawyer completion letter',value:deals.filter(x=>x.kind==='Sale'&&['Completed','Archived'].includes(x.rv_stage)&&!x.rv_completion_letter).length,go:'Review queue'},
  {title:'Trust transaction ledgers below zero',value:d.bankBalances.filter(a=>a.kind==='Trust').reduce((n,a)=>n+a.negativeFiles,0),go:'Trust & bank'},
 ];
 return <section className={styles.finance} aria-label="Accounting reporting and compliance">
  <div className={styles.finHeader}><div><p className={styles.eyebrow}>BROKERAGE FINANCIAL CONTROL · {brokerageName}</p><h2>Accounting, reporting & compliance</h2><p>One oversight screen. Use the existing accounting modules for entries, reconciliation and payments.</p></div><label className={styles.period}>Reporting month <input aria-label="Reporting month" type="month" value={period} onChange={e=>setPeriod(e.target.value)}/></label></div>
  <div className={styles.financeTabs} role="tablist" aria-label="Financial views">{(['Accounting','Reporting','Compliance'] as const).map(t=><button type="button" key={t} role="tab" aria-selected={t===tab} className={t===tab?styles.selected:''} onClick={()=>setTab(t)}>{t}</button>)}</div>
  {tab==='Accounting'&&<>
   <div className={styles.stats}>
    <div><small>Commission to verify / collect</small><strong>{currency(d.commissionReceivable)}</strong><span>Completed sales not marked funds verified; before GST</span></div>
    <div><small>Authorized agent payouts</small><strong>{currency(d.pendingPayouts)}</strong><span>Approved but not yet marked paid</span></div>
    <div><small>Net agent payouts issued</small><strong>{currency(d.paidPayouts)}</strong><span>Recorded paid payouts · all dates</span></div>
    <div><small>Bank accounts to reconcile</small><strong>{d.unreconciled.length}</strong><span>For selected month end</span></div>
   </div>
   <div className={styles.sectionHead}><h3><Landmark size={18}/> Account overview</h3><button className="btn smallbtn" type="button" onClick={()=>onNavigate('Trust & bank')}>Open ledger <ArrowUpRight size={14}/></button></div>
   {d.bankBalances.length?<div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>Bank account</th><th>Type</th><th>Recorded book balance</th><th>Trust file liabilities</th><th>Review</th></tr></thead><tbody>{d.bankBalances.map(a=><tr key={a.id}><td>{a.name}</td><td>{a.kind}</td><td>{currency(a.bookBalance)}</td><td>{a.kind==='Trust'?currency(a.fileBalance):'—'}</td><td>{a.kind==='Trust'&&a.negativeFiles>0?<strong className={styles.warn}>Negative file balance</strong>:a.kind==='Trust'&&Math.abs(a.bookBalance-a.fileBalance)>.01?<span className={styles.warn}>Reconcile allocation</span>:<span>Check statement</span>}</td></tr>)}</tbody></table></div>:<p className={styles.muted}>No active brokerage bank accounts recorded.</p>}
   <p className={styles.note}>Book balances are based on recorded ledger entries and opening balances, not live bank feeds. Trust funds must not be released based on this summary.</p>
   <div className={styles.quickRow}><button type="button" className="btn" onClick={()=>onNavigate('Bank reconciliation')}><ClipboardCheck size={16}/> Bank reconciliation</button><button type="button" className="btn" onClick={()=>onNavigate('Agent payments')}><WalletCards size={16}/> Agent payments</button><button type="button" className="btn" onClick={()=>onNavigate('Cheque printing')}>Cheque register</button></div>
  </>}
  {tab==='Reporting'&&<>
   <div className={styles.stats}>
    <div><small>Firm sales in {period}</small><strong>{d.monthSales}</strong><span>Counted on verified firm-sale date</span></div>
    <div><small>Firm sales volume</small><strong>{currency(d.monthVolume)}</strong><span>Selected reporting month</span></div>
    <div><small>Our brokerage side commission</small><strong>{currency(d.monthSideCommission)}</strong><span>Expected gross before GST, not receipts</span></div>
    <div><small>Paid commission statements</small><strong>{d.monthPayouts.filter(p=>p.status==='Paid').length}</strong><span>Recorded payment date or entry date</span></div>
    <div><small>Indicative GST on firm sales</small><strong>{currency(d.firmMonth.reduce((total,x)=>total+brokerageSideCommission(x)*(x.gst_rate==null?5:Number(x.gst_rate))/100,0))}</strong><span>Estimated from recorded rates; not a GST return</span></div>
   </div>
   <div className={styles.sectionHead}><h3><FileSpreadsheet size={18}/> Firm sales register</h3><button type="button" className="btn smallbtn" onClick={()=>exportCSV(`RealVolt-firm-sales-${period}.csv`,[
    ['Firm date','Property','Listing / Sale ID','Agent user ID','Sale price','Our brokerage commission before GST','Completion date','Completed','Commission funds verified'],
    ...d.firmMonth.map(x=>[firmDate(x),x.address,x.transaction_number||x.id,x.user_id,x.sale_price||0,brokerageSideCommission(x),x.rv_completed_date||'',!!x.rv_completed_date,x.rv_funds_verified===true])
   ])}><Download size={15}/> Export CSV</button></div>
   {d.firmMonth.length?<div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>Firm date</th><th>Property</th><th>Sale price</th><th>Our side commission</th><th>Completion</th></tr></thead><tbody>{d.firmMonth.map(x=><tr key={x.id}><td>{firmDate(x)}</td><td>{x.address}</td><td>{currency(Number(x.sale_price))}</td><td>{currency(brokerageSideCommission(x))}</td><td>{x.rv_completed_date||x.completion_date||'—'}</td></tr>)}</tbody></table></div>:<p className={styles.muted}>No recorded firm sales for {period}.</p>}
   <div className={styles.sectionHead}><h3>Commission payment register</h3><button type="button" className="btn smallbtn" onClick={()=>exportCSV(`RealVolt-agent-payments-${period}.csv`,[
    ['Date','Transaction ID','Payee profile ID','Gross agent commission','GST on agent commission','Deductions','Net','Status','Payment reference'],
    ...d.monthPayouts.map(p=>[p.paid_date||p.created_at,p.deal_id,p.profile_id,p.gross,p.gst,p.deductions,p.net,p.status,p.payment_reference||''])
   ])}><Download size={15}/> Export CSV</button></div>
   <p className={styles.note}>This report is operational. It is not a GST return, corporate financial statement or BCFSA filing. Reconcile deposits, commission receipts, tax treatment and adjustments before formal reporting.</p>
  </>}
  {tab==='Compliance'&&<>
   <div className={styles.sectionHead}><h3><ShieldCheck size={18}/> Compliance review queue</h3><button type="button" className="btn smallbtn" onClick={()=>onNavigate('Audit & controls')}>Audit log <ArrowUpRight size={14}/></button></div>
   <div className={styles.complianceList}>{issues.map(issue=><button type="button" key={issue.title} onClick={()=>onNavigate(issue.go)}><span>{issue.value>0?<AlertTriangle size={16} color="#ab6b1d"/>:<CircleCheck size={16} color="#377d52"/>}<b>{issue.title}</b></span><strong>{issue.value}</strong></button>)}</div>
   <div className={styles.sectionHead}><h3><CalendarDays size={18}/> Outstanding document checks on firm files</h3></div>
   {urgentMissing.length?<div className={styles.complianceList}>{urgentMissing.slice(0,8).map(r=><button type="button" key={r.id} onClick={()=>onNavigate('Review queue')}><span><AlertTriangle size={16}/><b>{deals.find(d=>d.id===r.deal_id)?.address||'Transaction'}</b> · {r.label}</span><strong>Review</strong></button>)}</div>:<p className={styles.muted}>No unverified requirements found on loaded firm-sale records.</p>}
   <div className={styles.sectionHead}><h3>Recent brokerage audit events</h3><button type="button" className="btn smallbtn" onClick={()=>exportCSV(`RealVolt-audit-${period}.csv`,[['Timestamp','Action','Record ID','Actor user ID'],...audits.filter(a=>String(a.created_at).startsWith(period)).map(a=>[a.created_at,a.action,a.record_id||'',a.actor_id||''])])}><Download size={15}/> Export audit log</button></div>
   {audits.length?<div className={styles.complianceList}>{[...audits].sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at))).slice(0,5).map(a=><div key={a.id} className={styles.auditLine}><span>{a.action} · {a.record_id||'Record'}</span><small>{new Date(a.created_at).toLocaleString('en-CA')}</small></div>)}</div>:<p className={styles.muted}>No audit entries loaded.</p>}
   <p className={styles.note}>Managing broker review and approval remain required. This screen highlights exceptions; it does not certify compliance, reconcile accounts or authorize trust disbursements.</p>
  </>}
 </section>;
}
