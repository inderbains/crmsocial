'use client';
import {useCallback,useEffect,useMemo,useState} from 'react';
import {RefreshCw,ClipboardCheck,FilePenLine,FileCheck2,UserRound,UserRoundPlus,SlidersHorizontal,Printer,WalletCards,CreditCard,Landmark,Scale,ChartNoAxesCombined,ShieldCheck,ClipboardList,Settings2,Database,Megaphone,Route,TrendingUp,ArrowUpRight,FileSpreadsheet,Archive} from 'lucide-react';
import type {LucideIcon} from 'lucide-react';
import {getSupabase} from '../lib/supabase';
import {currentTransactionIndex} from '../lib/current-transaction.mjs';
import {brokerageDay} from '../lib/listing-status';
import {computeOfficeInsights} from '../lib/office-insights.mjs';
import {summarizeWorkflow} from '../lib/transaction-workflow.mjs';
import SmartInbox037,{type InboxTab,type InboxItem} from './SmartInbox037';
import styles from './SmartInbox037.module.css';


type Module={name:string;description:string;icon:LucideIcon;badge?:number;route?:string};
type Group={heading:string;hint:string;modules:Module[]};
type Props={userId?:string;brokerageName:string;deals:any[];requirements:any[];payouts:any[];bills:any[];accounts:any[];ledger:any[];reconciliations:any[];billingAlerts:any[];onNavigate:(view:string)=>void;onRefresh:()=>void;refreshing:boolean;allocations:any[];matches:any[];closingDeliveries:any[];statements:any[];statementFeatureReady:boolean;workflowEvents:any[]};
type Notice={id:number;deal_id:string;message:string;created_at:string;read_at:string|null};
type Summary={id:string;address:string;kind:string;display_status:string;next_date:string|null;review_status:string};
const dateLabel=(s:string)=>new Date(s+'T12:00:00Z').toLocaleDateString('en-CA',{month:'short',day:'numeric',timeZone:'UTC'});
const timeLabel=(s:string)=>new Date(s).toLocaleDateString('en-CA',{month:'short',day:'numeric',timeZone:'America/Vancouver'});
const dateType=(s:Summary)=>s.kind==='Listing'?'Listing expiry':s.display_status==='Accepted offer'?'Subject removal':s.display_status==='Completed'?'Possession':'Completion';
export default function BackOfficeDashboard({userId,brokerageName,deals,requirements,payouts,accounts,ledger,reconciliations,billingAlerts,onNavigate,onRefresh,refreshing,statementFeatureReady,allocations,matches,closingDeliveries}:Props){
 const db=getSupabase()!;
 // Backwards-compatible with Back Office callers from Fix 036 that omitted userId.
 // Resolve from the authenticated session; RLS still enforces tenant boundaries.
 const [sessionUserId,setSessionUserId]=useState(userId||'');
 useEffect(()=>{if(userId){setSessionUserId(userId);return}let alive=true;void db.auth.getUser().then(({data})=>{if(alive)setSessionUserId(data.user?.id||'')});return()=>{alive=false}},[db,userId]);
 const [notices,setNotices]=useState<Notice[]>([]),[liveDeals,setLiveDeals]=useState<any[]>([]),[summary,setSummary]=useState<Summary[]>([]),[brokerageId,setBrokerageId]=useState<string>(''),[noticeError,setNoticeError]=useState('');
 const today=brokerageDay();
 const lastMonth=useMemo(()=>{const d=new Date(today.slice(0,7)+'-01T12:00:00Z');d.setUTCDate(0);return d.toISOString().slice(0,7)},[today]);
 const load=useCallback(async()=>{
  if(!sessionUserId)return;
  const member=await db.from('brokerage_members').select('brokerage_id,role').eq('user_id',sessionUserId).maybeSingle();
  if(member.error||member.data?.role!=='admin'||!member.data?.brokerage_id){setNoticeError('Office inbox requires a verified brokerage administrator.');return}
  const id=member.data.brokerage_id;setBrokerageId(id);
  const [n,d,s]=await Promise.all([
   db.from('rv_transaction_notifications').select('id,deal_id,message,created_at,read_at').eq('recipient_id',sessionUserId).order('created_at',{ascending:false}).limit(100),
   db.from('deal_files').select('id,address,kind,review_status,rv_stage,subject_date,completion_date,created_at,updated_at,brokerage_id,user_id,parent_listing_id,rv_deleted_at').is('rv_deleted_at',null).eq('brokerage_id',id).order('created_at',{ascending:false}).limit(300),
   db.from('rv_tx_summary').select('id,address,kind,display_status,next_date,review_status').eq('brokerage_id',id).not('next_date','is',null).order('next_date').limit(80),
  ]);
  if(!n.error)setNotices(n.data||[]);
  if(!d.error)setLiveDeals(d.data||[]);
  if(!s.error)setSummary(s.data||[]);
  setNoticeError(n.error?'Office notifications unavailable.':'');
 },[db,sessionUserId]);
 useEffect(()=>{void load();const tick=setInterval(()=>void load(),15000);const focus=()=>void load();window.addEventListener('focus',focus);return()=>{clearInterval(tick);window.removeEventListener('focus',focus)}},[load]);
 useEffect(()=>{if(!brokerageId)return;
  const noticeSub=db.channel(`rv037-office-inbox-${sessionUserId}`).on('postgres_changes',{event:'*',schema:'public',table:'rv_transaction_notifications',filter:`recipient_id=eq.${sessionUserId}`},()=>void load()).subscribe();
  const dealSub=db.channel(`rv037-office-deals-${brokerageId}`).on('postgres_changes',{event:'*',schema:'public',table:'deal_files',filter:`brokerage_id=eq.${brokerageId}`},()=>void load()).subscribe();
  return()=>{void db.removeChannel(noticeSub);void db.removeChannel(dealSub)};
 },[db,sessionUserId,brokerageId,load]);
 const merged=useMemo(()=>{const map=new Map(deals.map(d=>[d.id,d]));for(const live of liveDeals)map.set(live.id,{...map.get(live.id),...live});return [...map.values()]},[deals,liveDeals]);
 const current=useMemo(()=>currentTransactionIndex(merged),[merged]);
 const displayDeals=current.rows;
 const previousMonth=lastMonth;
 const insights=useMemo(()=>computeOfficeInsights({deals:merged,payouts,accounts,ledger,reconciliations,requirements,reconciliationMonth:previousMonth},today.slice(0,7)),[merged,payouts,accounts,ledger,reconciliations,requirements,previousMonth,today]);
 const submissions=displayDeals.filter(d=>d.review_status==='Submitted').sort((a,b)=>String(b.updated_at||b.created_at||'').localeCompare(String(a.updated_at||a.created_at||'')));
 const needsDocs=displayDeals.filter(d=>requirements.some(r=>r.deal_id===d.id&&r.verified!==true)&&d.review_status!=='Draft');
 const reviewList=[...submissions,...needsDocs.filter(d=>d.review_status!=='Submitted')]; // Pending reviews remain in their folder even after a notification is read.
 const upcoming=summary.filter(d=>d.next_date&&d.next_date>=today&&d.review_status!=='Draft'&&current.currentId(d.id)===d.id);
 const unreadNotices=notices.filter(n=>!n.read_at); // Inbox is transient; transaction records are not.
 const openDeal=(id:string)=>{const target=current.currentId(id),deal=merged.find(d=>d.id===target);window.dispatchEvent(new CustomEvent('realvolt:open-transaction',{detail:{id:target,office:true,section:deal?.rv_stage==='Archived'?'Closed Files':deal?.review_status==='Approved'?'Approved':deal?.review_status==='Changes requested'?'Changes requested':'Review queue',focus:deal?.review_status==='Submitted'?'compliance':undefined}}))};
 async function openNotice(n:Notice){
  const target=current.currentId(n.deal_id);
  const found=await db.from('deal_files').select('id,rv_stage,review_status').eq('id',target).maybeSingle();
  if(found.error||!found.data){setNoticeError('Cannot open the source transaction: '+(found.error?.message||'File unavailable'));return;}
  const deal=found.data;
  const section=deal.rv_stage==='Archived'?'Closed Files':deal.review_status==='Approved'?'Approved':deal.review_status==='Changes requested'?'Changes requested':'Review queue';
  const detail:{id:string;office:boolean;section:string;focus?:string;accepted?:boolean}={id:target,office:true,section,focus:deal.review_status==='Submitted'?'compliance':undefined};
  window.dispatchEvent(new CustomEvent('realvolt:open-transaction',{detail}));
  if(!detail.accepted)return; // A cancelled navigation must not consume a notification.
  const sourceIds=[...new Set(unreadNotices.filter(x=>current.currentId(x.deal_id)===target).map(x=>x.deal_id))];
  const r=await db.from('rv_transaction_notifications').update({read_at:new Date().toISOString()}).in('deal_id',sourceIds).eq('recipient_id',sessionUserId).is('read_at',null);
  if(r.error){setNoticeError('Could not mark notification as read: '+r.error.message);return;}
  setNotices(a=>a.filter(x=>!sourceIds.includes(x.deal_id)));
 }
 const reviewItems:InboxItem[]=reviewList.map(d=>({id:'review-'+d.id,title:'Documents need verification',detail:d.address||'Transaction',onOpen:()=>openDeal(d.id)}));
 const upcomingItems:InboxItem[]=upcoming.map(x=>({id:'date-'+x.id,title:`${dateType(x)} · ${dateLabel(x.next_date!)}`,detail:x.address||'Transaction',onOpen:()=>openDeal(x.id)}));

 // The previous Automatic Transaction Workflow is retained as an on-demand tab.
 // It only recommends the next responsible module; it never sends legal emails or releases money.
 const stages=useMemo(()=>summarizeWorkflow(displayDeals,{today,ledger,payouts,allocations,matches,accounts,deliveries:closingDeliveries,requirements}),
  [displayDeals,today,ledger,payouts,allocations,matches,accounts,closingDeliveries,requirements]);
 const openWorkflow=(dealId:string,nextModule:string)=>{
  if(['Transactions','Review queue','Changes requested','Approved','Closed Files'].includes(nextModule)||!nextModule){openDeal(dealId);return;}
  try{window.sessionStorage.setItem('realvolt:workflow-target-deal',dealId)}catch{}
  onNavigate(nextModule==='Transactions'?'Review queue':nextModule||'Review queue');
 };
 const displayStages=stages.map(x=>{const d=displayDeals.find(r=>r.id===x.dealId);return d?.kind==='Sale'&&d.rv_stage==='Accepted offer'&&d.review_status==='Draft'?{...x,status:'Accepted offer',stage:'Accepted offer',percent:50,owner:'Agent',nextAction:'Monitor subjects and signed amendments',nextModule:'Review queue'}:x});
 const stageItems:InboxItem[]=displayStages.filter(x=>x.status!=='Draft'&&x.percent<100).map(x=>({
  id:'stage-'+x.dealId,
  title:`${x.address||'Transaction'} · ${x.stage}`,
  detail:`${x.percent}% · ${x.owner}: ${x.nextAction}`,
  progress:x.percent,
  onOpen:()=>openWorkflow(x.dealId,x.nextModule),
 }));
 // Route transient Back Office notices into Review or Deal stages.
 // Current review state wins, so an older upload notification cannot reopen a finished approval.
 const dealIndex=new Map(merged.map(d=>[d.id,d]));
 const officeNoticeCategory=(n:Notice):'review'|'workflow'=>{
  const d=dealIndex.get(current.currentId(n.deal_id));
  return d?.review_status==='Submitted'||d?.review_status==='Changes requested'?'review':'workflow';
 };
 const reviewAlerts:InboxItem[]=[],workflowAlerts:InboxItem[]=[];
 const reviewAlertDeals=new Set<string>(),workflowAlertDeals=new Set<string>();
 const actionableNotices=unreadNotices.filter(n=>dealIndex.has(n.deal_id));
 for(const n of actionableNotices){
  const key=officeNoticeCategory(n),seen=key==='review'?reviewAlertDeals:workflowAlertDeals;
  const target=current.currentId(n.deal_id);
  if(seen.has(target))continue;
  seen.add(target);
  const stage=key==='workflow'?stageItems.find(item=>item.id==='stage-'+target):undefined;
  (key==='review'?reviewAlerts:workflowAlerts).push({id:'notification-'+n.id,title:stage?.title||n.message,detail:stage?`${stage.detail} · ${n.message}`:`${dealIndex.get(target)?.address||'Transaction'} · ${timeLabel(n.created_at)}`,progress:stage?.progress,unread:true,onOpen:()=>void openNotice(n)});
 }
 const reviewTabItems=[...reviewAlerts,...reviewItems.filter(x=>!reviewAlertDeals.has(x.id.slice('review-'.length)))];
 const workflowTabItems=[...workflowAlerts,...stageItems.filter(x=>!workflowAlertDeals.has(x.id.slice('stage-'.length)))];
 const latestOfficeNotice=actionableNotices.length?officeNoticeCategory(actionableNotices[0]):undefined;
 const tabs:InboxTab[]=[
  {key:'review',label:'Review',count:reviewTabItems.length,items:reviewTabItems,unreadCount:reviewAlerts.length,empty:'No outstanding document reviews.'},
  {key:'upcoming',label:'Upcoming',count:upcomingItems.length,items:upcomingItems,empty:'No important dates coming up.'},
  {key:'workflow',label:'Deal stages',count:workflowTabItems.length,items:workflowTabItems,unreadCount:workflowAlerts.length,empty:'No outstanding transaction stages.'},
 ];

 const submitted=displayDeals.filter(d=>d.review_status==='Submitted');
 const changes=displayDeals.filter(d=>d.review_status==='Changes requested');
 const approved=displayDeals.filter(d=>d.review_status==='Approved'&&d.rv_stage!=='Archived');
 const closedFiles=merged.filter(d=>d.kind==='Sale'&&d.rv_stage==='Archived');
 const unpaid=payouts.filter(p=>p.status==='Authorized').length;
 const pendingDeposits=merged.filter(d=>d.kind==='Sale'&&d.deposit_holder==='our_brokerage'&&Number(d.deposit_amount)>0&&ledger.filter(l=>l.deal_id===d.id&&accounts.some(a=>a.kind==='Trust'&&a.id===l.account_id)).reduce((n,l)=>n+Number(l.amount||0),0)+.01<Number(d.deposit_amount));
 const pendingRecs=insights.unreconciled;
  const groups:Group[]=[
    {heading:'Transactions & Review',hint:'Review incoming files and keep transactions moving.',modules:[
      {name:'Review queue',description:'Review submitted files, documents and approvals.',icon:ClipboardCheck,badge:submitted.length},
      {name:'Changes requested',description:'Follow up on files returned to agents for correction.',icon:FilePenLine,badge:changes.length},
      {name:'Approved',description:'Access approved transaction records and files.',icon:FileCheck2,badge:approved.length},
      {name:'Closed Files',description:'Read-only archived sales, uploaded documents and linked listing records.',icon:Archive,badge:closedFiles.length},
    ]},
    {heading:'Agents & Payments',hint:'Manage people, plans, commissions and payouts.',modules:[
      {name:'Agent Management',route:'Agents & profiles',description:'Profiles, onboarding, plans, monthly fees and agreements.',icon:UserRound},
      {name:'Agent Commissions',route:'Agent payments',description:'Authorize payouts and review commission statements.',icon:WalletCards,badge:unpaid},
      {name:'Payroll & Salaries',route:'Payroll & salaries',description:'Staff pay runs, salary approvals and payment methods.',icon:UserRound},
      {name:'Payment Centre',route:'Cheque printing',description:'Cheque printing and EFT registers; existing payment controls.',icon:CreditCard},
    ]},
    {heading:'Accounting, Reporting & Compliance',hint:'One home for bookkeeping and financial oversight.',modules:[
      {name:'Accounting & Trust',route:'Trust & bank',description:'Bank accounts, ledgers, balances and financial oversight.',icon:Landmark},
      {name:'Bank Reconciliation',route:'Bank reconciliation',description:'Monthly statements, matching, General expenses and approval.',icon:Scale,badge:pendingRecs.length},
      {name:'Reports',description:'Production, commissions, recorded expenses and GST summaries.',icon:ChartNoAxesCombined},
      {name:'Compliance & Audit',route:'Audit & controls',description:'Required documents, exceptions, controls and audit history.',icon:ShieldCheck},
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
 const totalModules=groups.reduce((n,g)=>n+g.modules.length,0);
 const jumpFinance=(tab:'Accounting'|'Reporting'|'Compliance')=>{
  try {window.sessionStorage.setItem('realvolt:finance-selected-tab',tab)} catch {}
  onNavigate('Financial & compliance');
 };

 return <div className="bo-dashboard">
  <div className="bo-heading"><div><p className="bo-kicker">{brokerageName} · BROKERAGE OPERATIONS</p><h1>Back Office</h1><p>Transactions, agents, accounting and compliance — all in one place.</p></div>
   <button type="button" className="bo-refresh" onClick={()=>{onRefresh();void load()}} disabled={refreshing}><RefreshCw size={17}/> Refresh</button>
  </div>
  <section className={styles.officeCard} aria-label="Office updates">
   <div className={styles.officeLeft}><p className={styles.eyebrow}>YOUR BROKERAGE AT A GLANCE</p><h2>Office updates</h2><p className={styles.subtle}>New files, reviews and deal progress — in one place.</p>
    <div className={styles.officePreview}>
     <button type="button" onClick={()=>onNavigate('Review queue')}><b>{submitted.length}</b> Files awaiting review</button>
     <button type="button" onClick={()=>jumpFinance('Compliance')}><b>{requirements.filter(r=>!r.verified&&merged.some(d=>d.id===r.deal_id)).length}</b> Document checks</button>
     <button type="button" onClick={()=>jumpFinance('Accounting')}><b>{insights.unreconciled.length}</b> Reconciliations to check</button>
    </div>
   </div>
   <div className={styles.officeRight}>{noticeError&&<p className={styles.goalError} role="alert">{noticeError}</p>}<SmartInbox037 tabs={tabs} ariaLabel="Back Office updates" autoOpenUnread preferredUnreadTab={latestOfficeNotice}/></div>
  </section>
  <div className="bo-modules-title"><div><p className="bo-kicker">YOUR BACK OFFICE</p><h2>Applications & tools</h2><p>Manage transactions, agents and financial operations.</p></div><span className="bo-count">{totalModules} modules</span></div>
  {groups.map(group=><section className="bo-group" key={group.heading}>
   <div className="bo-group-head"><h3>{group.heading}</h3><p>{group.hint}</p></div>
   <div className={`bo-module-grid ${group.heading==='Transactions & Review'?'bo-module-grid-four':''}`}>{group.modules.map(m=><button key={m.name} type="button" className="bo-module-card" onClick={()=>['Accounting','Reporting','Compliance'].includes(m.name)?jumpFinance(m.name as 'Accounting'|'Reporting'|'Compliance'):onNavigate(m.route||m.name)}>
    <span className="bo-module-top"><span className="bo-module-icon"><m.icon size={24}/></span>{!!m.badge&&<span className="bo-module-badge">{m.badge} items</span>}</span>
    <strong>{m.name}</strong><span className="bo-module-description">{m.description}</span><span className="bo-module-open">Open module <ArrowUpRight size={16}/></span>
   </button>)}</div>
  </section>)}
  <p className="bo-footnote">Financial dashboards are informational. Trust transfers, commission releases and agent payments require separate approval and reconciliation controls.</p>
 </div>;
}
