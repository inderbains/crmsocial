'use client';
import {
  ArrowRight, ArrowUpRight, CalendarClock, CalendarDays,
  ClipboardCheck, ClipboardList, FileCheck2, FilePenLine, Files, House,
  Landmark, WalletCards, Printer, UserRound, UserRoundPlus, SlidersHorizontal,
  Scale, ShieldCheck, Settings2, Database,
  Megaphone, Route, ChartNoAxesCombined, RefreshCw,
  AlertCircle, CreditCard, FilePlus2, TrendingUp, CircleCheck,
} from 'lucide-react';
import type {LucideIcon} from 'lucide-react';
import {brokerageDay} from '../lib/listing-status';
import {transactionLabel} from '../lib/agent-reports';
import {summarizeWorkflow} from '../lib/transaction-workflow.mjs';

type Module = {name:string;description:string;icon:LucideIcon;badge?:number};
type Group = {heading:string;hint:string;modules:Module[]};
type Props = {
  brokerageName:string;
  deals:any[];
  requirements:any[];
  payouts:any[];
  bills:any[];
  accounts:any[];
  ledger:any[];
  reconciliations:any[];
  billingAlerts:any[];
  onNavigate:(view:string)=>void;
  onRefresh:()=>void;
  refreshing:boolean;
  allocations:any[];
  matches:any[];
  closingDeliveries:any[];
  statements:any[];
  statementFeatureReady:boolean;
  workflowEvents:any[];
};
const asDate=(s:string)=>new Date(`${s}T12:00:00Z`);
const shortDate=(s:string)=>new Intl.DateTimeFormat('en-CA',{month:'short',day:'numeric',timeZone:'UTC'}).format(asDate(s));
const fullDate=(s:string)=>new Intl.DateTimeFormat('en-CA',{weekday:'long',month:'long',day:'numeric',year:'numeric',timeZone:'UTC'}).format(asDate(s));
const dayPlus=(iso:string,n:number)=>{const d=asDate(iso);d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)};
const money=(n:number)=>new Intl.NumberFormat('en-CA',{style:'currency',currency:'CAD',maximumFractionDigits:0}).format(n);

export default function BackOfficeDashboard({brokerageName,deals,requirements,payouts,bills,accounts,ledger,reconciliations,billingAlerts,onNavigate,onRefresh,refreshing,allocations,matches,closingDeliveries,statements,statementFeatureReady,workflowEvents}:Props){
  const today=brokerageDay();
  const workflow=summarizeWorkflow(deals,{today,ledger,payouts,allocations,matches,accounts,deliveries:closingDeliveries,requirements});
  const pendingWorkflow=workflow.filter(w=>w.percent<100&&w.status!=='Draft');
  const previousBankMonth=new Date(today.slice(0,7)+'-01T12:00:00Z');previousBankMonth.setUTCDate(0);
  const previousStatementPeriod=previousBankMonth.toISOString().slice(0,7);
  const missingStatements=accounts.filter(a=>a.active!==false && !statements.some(s=>s.account_id===a.id && String(s.period_end).startsWith(previousStatementPeriod)));
  const accountNotReconciled=accounts.filter(a=>a.active!==false && !reconciliations.some(rec=>rec.account_id===a.id && String(rec.period_end).startsWith(previousStatementPeriod)));
  const openWorkflow=(dealId:string,view:string)=>{window.sessionStorage.setItem('realvolt:workflow-target-deal',dealId);onNavigate(view)};

  const nextWeek=dayPlus(today,7);
  const nextFortnight=dayPlus(today,14);
  const recentSince=dayPlus(today,-6);
  const previousMonthEnd=dayPlus(today.slice(0,7)+'-01',-1);
  const todayDate=fullDate(today);
  const upcoming=deals.filter(d=>d.kind==='Sale' && d.completion_date>=today && d.completion_date<=nextFortnight).sort((a,b)=>String(a.completion_date).localeCompare(String(b.completion_date)));
  const newFiles=deals.filter(d=>typeof d.created_at==='string' && d.created_at.slice(0,10)>=recentSince).sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at)));
  const submitted=deals.filter(d=>d.review_status==='Submitted');
  const changes=deals.filter(d=>d.review_status==='Changes requested');
  const approved=deals.filter(d=>d.review_status==='Approved');
  const unverified=requirements.filter(r=>!r.verified).length;
  const unpaid=payouts.filter(p=>p.status==='Authorized').length;
  const outstandingBills=bills.filter(b=>b.status==='Outstanding').length;
  const subjectDates=deals.filter(d=>d.subject_date>=today && d.subject_date<=nextWeek && d.review_status!=='Draft').sort((a,b)=>String(a.subject_date).localeCompare(String(b.subject_date)));
  const completedDatesPast=deals.filter(d=>d.kind==='Sale'&&d.completion_date&&d.completion_date<today&&d.review_status!=='Approved');
  const trustAccounts=accounts.filter(a=>a.active!==false && a.kind==='Trust');
  const pendingRecs=accounts.filter(a=>a.active!==false && a.opening_date<=previousMonthEnd && !reconciliations.some(r=>r.account_id===a.id && r.period_end===previousMonthEnd));
  const pendingDeposits=deals.filter(d=>d.kind==='Sale' && d.deposit_holder==='our_brokerage' && Number(d.deposit_amount)>0 && (()=>{
    const recorded=ledger.filter(l=>l.deal_id===d.id && trustAccounts.some(a=>a.id===l.account_id)).reduce((sum,l)=>sum+Number(l.amount||0),0);
    return recorded + 0.01 < Number(d.deposit_amount);
  })());
  const reminders=[
    {count:statementFeatureReady?missingStatements.length:0,label:'Monthly bank statements still missing',target:'Bank reconciliation',icon:Landmark},
    {count:pendingRecs.length,label:'Prior-month bank reconciliations pending',target:'Bank reconciliation',icon:Landmark},
    {count:pendingDeposits.length,label:'Deposits to verify against trust entries',target:'Trust & bank',icon:Landmark},
    {count:unverified,label:'Document requirements awaiting verification',target:'Review queue',icon:Files},
    {count:unpaid,label:'Authorized agent payments not marked paid',target:'Agent payments',icon:WalletCards},
    {count:subjectDates.length,label:'Subject dates within 7 days',target:'Review queue',icon:CalendarDays},
    {count:completedDatesPast.length,label:'Past completion dates to check',target:'Review queue',icon:AlertCircle},
    {count:billingAlerts.length,label:'Unresolved billing alerts',target:'Audit & controls',icon:CreditCard},
  ].filter(r=>r.count>0);
  const reminderCount=reminders.reduce((total,r)=>total+r.count,0);
  const groups:Group[]=[
    {heading:'Transactions & Review',hint:'Review incoming files and keep transactions moving.',modules:[
      {name:'Review queue',description:'Review submitted files, documents and approvals.',icon:ClipboardCheck,badge:submitted.length},
      {name:'Changes requested',description:'Follow up on files returned to agents for correction.',icon:FilePenLine,badge:changes.length},
      {name:'Approved',description:'Access approved transaction records and files.',icon:FileCheck2,badge:approved.length},
    ]},
    {heading:'Agents & Payments',hint:'Manage people, plans, commissions and payouts.',modules:[
      {name:'Agents & profiles',description:'Agent contact details, licences, production and records.',icon:UserRound},
      {name:'New agent setup',description:'Onboard agents, agreements and required documents.',icon:UserRoundPlus},
      {name:'Plans & monthly fees',description:'Commission splits, recurring fees and deductions.',icon:SlidersHorizontal},
      {name:'Cheque printing',description:'Print authorized cheques and access cheque registers.',icon:Printer},
      {name:'Agent payments',description:'Authorize payouts and choose cheque or EFT.',icon:WalletCards,badge:unpaid},
      {name:'Payroll & salaries',description:'Create and approve staff pay runs, then choose cheque or EFT.',icon:UserRound},
      {name:'EFT payments',description:'Track agent and salary EFTs and confirm bank settlement.',icon:CreditCard},
    ]},
    {heading:'Trust & Accounting',hint:'Track brokerage money, banking and financial controls.',modules:[
      {name:'Trust & bank',description:'Deposits, releases, accounts and ledger entries.',icon:Landmark,badge:pendingDeposits.length},
      {name:'Bank reconciliation',description:'Monthly PDF/CSV statements, manual lines, trust checks and broker approval.',icon:Scale,badge:pendingRecs.length},
      {name:'Reports',description:'Production, commissions and brokerage financial reports.',icon:ChartNoAxesCombined},
      {name:'Audit & controls',description:'Audit history, exceptions and accounting safeguards.',icon:ShieldCheck,badge:billingAlerts.length},
    ]},
    {heading:'Brokerage Administration',hint:'Set up and oversee the brokerage workspace.',modules:[
      {name:'Brokerage Control',description:'Office-wide connections and administration hub.',icon:ClipboardList},
      {name:'Brokerage settings',description:'Brokerage identity, templates and workspace colours.',icon:Settings2},
    ]},
    {heading:'Listings & Marketing',hint:'Office listings, lead distribution and connected campaigns.',modules:[
      {name:'Office DDF & Listings',description:'Authorized office DDF feed and listing inventory.',icon:Database},
      {name:'Office Meta Accounts',description:'Connect brokerage Facebook, Instagram and Meta.',icon:Megaphone},
      {name:'Office Lead Routing',description:'Configure brokerage lead-assignment rules.',icon:Route},
      {name:'Office Marketing Dashboard',description:'Track office-wide marketing and campaign activity.',icon:TrendingUp},
    ]},
  ];
  const jump=(id:string)=>document.getElementById(id)?.scrollIntoView({behavior:'smooth',block:'start'});
  return <div className="bo-dashboard">
    <div className="bo-heading">
      <div><p className="bo-kicker">BROKERAGE OPERATIONS · {brokerageName}</p><h1>Back Office</h1><p>One clear place for transactions, agents, accounting and approvals.</p></div>
      <button type="button" className="bo-refresh" disabled={refreshing} onClick={onRefresh}><RefreshCw size={17}/> Refresh</button>
    </div>

    <section className="bo-overview" aria-label="Back Office summary">
      <div className="bo-overview-top"><div><p className="bo-kicker">YOUR BROKERAGE AT A GLANCE</p><h2>Today's overview</h2><p>{todayDate} · Vancouver time · Live brokerage records</p></div><button type="button" className="bo-cta" onClick={()=>onNavigate('Review queue')}>Review submitted files <ArrowUpRight size={17}/></button></div>
      <div className="bo-metrics">
        <button type="button" className="bo-metric" onClick={()=>jump('bo-upcoming')}><span className="bo-metric-icon"><CalendarClock size={19}/></span><strong>{upcoming.length}</strong><span>Upcoming completions</span><small>Next 14 days</small></button>
        <button type="button" className="bo-metric" onClick={()=>jump('bo-recent')}><span className="bo-metric-icon"><FilePlus2 size={19}/></span><strong>{newFiles.length}</strong><span>New transactions</span><small>Last 7 days</small></button>
        <button type="button" className="bo-metric" onClick={()=>onNavigate('Review queue')}><span className="bo-metric-icon"><ClipboardCheck size={19}/></span><strong>{submitted.length}</strong><span>Pending review</span><small>Submitted files</small></button>
        <button type="button" className="bo-metric" onClick={()=>jump('bo-attention')}><span className="bo-metric-icon"><AlertCircle size={19}/></span><strong>{reminderCount}</strong><span>Action reminders</span><small>Across {reminders.length} categories</small></button>
      </div>
    </section>

    <section className="bo-detail" aria-label="Transaction workflow tracker" style={{marginBottom:20}}>
      <div className="bo-detail-head"><div><p className="bo-kicker">CONNECTED MODULES · LIVE STATUS</p><h2>Automatic transaction workflow</h2><p style={{marginTop:6,fontSize:13,color:'var(--muted, #65756e)'}}>The next work queue updates as the agent, broker and accounting team complete their required actions. Routing does not send money or legal emails.</p></div><span className="bo-count">{pendingWorkflow.length} active files</span></div>
      {pendingWorkflow.length ? <div className="bo-list">{pendingWorkflow.slice(0,8).map(w=><div className="bo-list-row bo-static-row" key={w.dealId} style={{display:'grid',gridTemplateColumns:'minmax(0,1fr) auto',gap:12,alignItems:'center'}}>
        <div style={{minWidth:0}}><strong style={{fontSize:14}}>{w.address || `Transaction ${w.transactionNumber||''}`}</strong><small style={{display:'block',marginTop:4}}>#{transactionLabel(w.transactionNumber ?? null)} · {w.stage} · Assigned: {w.owner}</small><div style={{height:5,background:'#e1eae3',borderRadius:9,marginTop:9,overflow:'hidden'}}><div style={{height:'100%',width:`${w.percent}%`,background:'#17643f',borderRadius:9}}/></div><small style={{display:'block',marginTop:5}}>{w.nextAction}</small>{w.blockers.length>0&&<small style={{display:'block',color:'#a23b27',marginTop:3}}>{w.blockers.join('; ')}</small>}</div>
        <button type="button" className="bo-cta" onClick={()=>openWorkflow(w.dealId,w.nextModule)} aria-label={`Open ${w.nextModule} for ${w.address}`} style={{whiteSpace:'nowrap'}}>Open {w.nextModule} <ArrowRight size={15}/></button>
      </div>)}</div>:<div className="bo-empty"><CircleCheck size={20}/> No files are awaiting the next workflow action.</div>}
      <p className="bo-footnote">Clicking opens the responsible module; select the transaction there. Financial and broker approvals still require authorized users.</p>
      {workflowEvents.length>0&&<details style={{marginTop:12}}><summary style={{cursor:'pointer',fontSize:13}}>Recent workflow activity ({workflowEvents.length})</summary><div className="bo-list">{workflowEvents.slice(0,8).map(e=><div className="bo-list-row bo-static-row" key={e.id}><span className="bo-list-text"><b>{e.event_type.replaceAll('_',' ')}</b><small>{e.old_value?'From '+e.old_value+' → ':''}{e.new_value}</small></span><small>{new Date(e.occurred_at).toLocaleString('en-CA')}</small></div>)}</div></details>}

    </section>
    <section className="bo-detail" style={{marginBottom:20}} aria-label="Monthly statement checklist">
      <div className="bo-detail-head"><div><p className="bo-kicker">MONTH-END ACCOUNTING</p><h2>Monthly bank statement checklist</h2></div><button type="button" className="bo-text-action" onClick={()=>onNavigate('Bank reconciliation')}>Open reconciliation <ArrowRight size={15}/></button></div>
      {statementFeatureReady?<p className="bo-footnote">{previousStatementPeriod}: {missingStatements.length} account(s) awaiting statements · {accountNotReconciled.length} account(s) not yet approved. Evidence must be reviewed before approval.</p>:<p className="bo-footnote">PDF statement checklist is not activated. Run Supabase migrations 027 and 028 before using this feature.</p>}
      <div className="bo-list">{statementFeatureReady&&accounts.filter(a=>a.active!==false).map(a=>{const st=statements.some(s=>s.account_id===a.id&&String(s.period_end).startsWith(previousStatementPeriod));const approved=reconciliations.some(rec=>rec.account_id===a.id&&String(rec.period_end).startsWith(previousStatementPeriod));return <button type="button" className="bo-list-row" key={a.id} onClick={()=>onNavigate('Bank reconciliation')}><Landmark size={17}/><span className="bo-list-text">{a.name} <small>{a.kind} · {previousStatementPeriod}</small></span><b>{approved?'Approved & locked':st?'Reconciliation pending':'Awaiting statement'}</b><ArrowRight size={15}/></button>})}</div>
    </section>
    <div className="bo-activity-grid">
      <section className="bo-detail" id="bo-attention"><div className="bo-detail-head"><div><p className="bo-kicker">PRIORITIES</p><h2>Needs your attention</h2></div><span className="bo-count">{reminderCount} items</span></div>
        {reminders.length ? <div className="bo-list">{reminders.slice(0,5).map(r=><button key={r.label} type="button" className="bo-list-row" onClick={()=>onNavigate(r.target)}><span className="bo-list-icon"><r.icon size={17}/></span><span className="bo-list-text">{r.label}</span><b>{r.count}</b><ArrowRight size={15}/></button>)}</div> : <div className="bo-empty"><CircleCheck size={20}/> No outstanding action reminders found in the loaded records.</div>}
        {reminders.length>5&&<button type="button" className="bo-text-action" onClick={()=>onNavigate('Audit & controls')}>More items in Audit & controls <ArrowRight size={15}/></button>}
      </section>
      <section className="bo-detail" id="bo-upcoming"><div className="bo-detail-head"><div><p className="bo-kicker">NEXT TWO WEEKS</p><h2>Upcoming completions</h2></div><span className="bo-count">{upcoming.length} deals</span></div>
        {upcoming.length?<div className="bo-list">{upcoming.slice(0,5).map(d=><div className="bo-list-row bo-static-row" key={d.id}><span className="bo-date"><strong>{shortDate(d.completion_date)}</strong></span><span className="bo-list-text"><b>{d.address}</b><small>#{transactionLabel(d.transaction_number)} · {d.review_status}</small></span></div>)}</div>:<div className="bo-empty"><CalendarDays size={20}/> No recorded sale completions in the next 14 days.</div>}
      </section>
    </div>

    <section className="bo-detail bo-recent" id="bo-recent"><div className="bo-detail-head"><div><p className="bo-kicker">RECENT ACTIVITY</p><h2>New transactions added</h2></div><span className="bo-count">Last 7 days</span></div>
      {newFiles.length?<div className="bo-recent-list">{newFiles.slice(0,4).map(d=><div className="bo-recent-item" key={d.id}><span className="bo-list-icon"><House size={17}/></span><span><b>{d.address}</b><small>{d.kind} · {d.review_status} · {shortDate(d.created_at.slice(0,10))}</small></span></div>)}</div>:<div className="bo-empty"><Files size={19}/> New transactions will appear here when agents add them.</div>}
    </section>

    <div className="bo-modules-title"><div><p className="bo-kicker">YOUR BACK OFFICE</p><h2>Applications & tools</h2><p>Open any module to manage that part of your brokerage.</p></div><span className="bo-count">18 modules</span></div>
    {groups.map(group=><section className="bo-group" key={group.heading}><div className="bo-group-head"><h3>{group.heading}</h3><p>{group.hint}</p></div><div className="bo-module-grid">{group.modules.map(m=><button key={m.name} type="button" className="bo-module-card" onClick={()=>onNavigate(m.name)}><span className="bo-module-top"><span className="bo-module-icon"><m.icon size={24}/></span>{!!m.badge&&<span className="bo-module-badge">{m.badge} {m.name==='Approved'?'files':'items'}</span>}</span><strong>{m.name}</strong><span className="bo-module-description">{m.description}</span><span className="bo-module-open">Open module <ArrowUpRight size={16}/></span></button>)}</div></section>)}
    <p className="bo-footnote">Counts reflect the brokerage records currently accessible to your account. Reminders are operational checks, not personal calendar notifications. Reconciliation balances and approvals must be verified within the dedicated banking module.</p>
  </div>;
}
