'use client';
import {useCallback,useEffect,useMemo,useState} from 'react';
import {RefreshCw,ShieldCheck,ArrowUpRight} from 'lucide-react';
import {getSupabase} from '../lib/supabase';
import {brokerageDay} from '../lib/listing-status';
import {computeOfficeInsights} from '../lib/office-insights.mjs';
import SmartInbox037,{type InboxTab,type InboxItem} from './SmartInbox037';
import styles from './SmartInbox037.module.css';
import old from './Office036.module.css';

type Props={userId?:string;brokerageName:string;deals:any[];requirements:any[];payouts:any[];bills:any[];accounts:any[];ledger:any[];reconciliations:any[];billingAlerts:any[];onNavigate:(view:string)=>void;onRefresh:()=>void;refreshing:boolean;allocations:any[];matches:any[];closingDeliveries:any[];statements:any[];statementFeatureReady:boolean;workflowEvents:any[]};
type Notice={id:number;deal_id:string;message:string;created_at:string;read_at:string|null};
type Summary={id:string;address:string;kind:string;display_status:string;next_date:string|null;review_status:string};
const dateLabel=(s:string)=>new Date(s+'T12:00:00Z').toLocaleDateString('en-CA',{month:'short',day:'numeric',timeZone:'UTC'});
const timeLabel=(s:string)=>new Date(s).toLocaleDateString('en-CA',{month:'short',day:'numeric',timeZone:'America/Vancouver'});
const dateType=(s:Summary)=>s.kind==='Listing'?'Listing expiry':s.display_status==='Accepted offer'?'Subject removal':s.display_status==='Completed'?'Possession':'Completion';
export default function BackOfficeDashboard({userId,brokerageName,deals,requirements,payouts,accounts,ledger,reconciliations,billingAlerts,onNavigate,onRefresh,refreshing,statementFeatureReady}:Props){
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
   db.from('deal_files').select('id,address,kind,review_status,rv_stage,subject_date,completion_date,created_at,updated_at,brokerage_id').eq('brokerage_id',id).order('created_at',{ascending:false}).limit(300),
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
 const previousMonth=lastMonth;
 const insights=useMemo(()=>computeOfficeInsights({deals:merged,payouts,accounts,ledger,reconciliations,requirements,reconciliationMonth:previousMonth},today.slice(0,7)),[merged,payouts,accounts,ledger,reconciliations,requirements,previousMonth,today]);
 const submissions=merged.filter(d=>d.review_status==='Submitted').sort((a,b)=>String(b.updated_at||b.created_at||'').localeCompare(String(a.updated_at||a.created_at||'')));
 const needsDocs=merged.filter(d=>requirements.some(r=>r.deal_id===d.id&&r.verified!==true)&&d.review_status!=='Draft');
 const freshnessCutoff=new Date(Date.now()-48*60*60*1000).toISOString();
 const freshSubmissions=submissions.filter(d=>String(d.updated_at||d.created_at||'')>=freshnessCutoff);
 const freshIds=new Set(freshSubmissions.map(d=>d.id));
 const reviewList=[...submissions.filter(d=>!freshIds.has(d.id)),...needsDocs.filter(d=>d.review_status!=='Submitted')];
 const upcoming=summary.filter(d=>d.next_date&&d.next_date>=today&&d.review_status!=='Draft');
 const uniqueNotices=notices.filter((x,i,arr)=>arr.findIndex(a=>a.deal_id===x.deal_id&&a.message===x.message)===i);
 const openDeal=(id:string)=>window.dispatchEvent(new CustomEvent('realvolt:open-transaction',{detail:{id,office:true}}));
 async function openNotice(n:Notice){if(!n.read_at){const r=await db.from('rv_transaction_notifications').update({read_at:new Date().toISOString()}).eq('id',n.id).eq('recipient_id',sessionUserId);if(!r.error)setNotices(a=>a.map(x=>x.id===n.id?{...x,read_at:new Date().toISOString()}:x))}openDeal(n.deal_id)}
 const fileItems:InboxItem[]=freshSubmissions.map(d=>({id:'submitted-'+d.id,title:`${d.kind==='Sale'?'Sale':'Listing'} submitted`,detail:d.address||'Transaction',unread:true,onOpen:()=>openDeal(d.id)}));
 const reviewItems:InboxItem[]=reviewList.map(d=>({id:'review-'+d.id,title:'Documents need verification',detail:d.address||'Transaction',onOpen:()=>openDeal(d.id)}));
 const upcomingItems:InboxItem[]=upcoming.map(x=>({id:'date-'+x.id,title:`${dateType(x)} · ${dateLabel(x.next_date!)}`,detail:x.address||'Transaction',onOpen:()=>openDeal(x.id)}));
 const activityItems:InboxItem[]=uniqueNotices.map(n=>({id:'activity-'+n.id,title:n.message,detail:`${merged.find(d=>d.id===n.deal_id)?.address||'Transaction'} · ${timeLabel(n.created_at)}`,unread:!n.read_at,onOpen:()=>void openNotice(n)}));
 const tabs:InboxTab[]=[
  {key:'new',label:'New files',count:fileItems.length,items:fileItems,empty:'No new files awaiting review.'},
  {key:'review',label:'Review',count:reviewItems.length,items:reviewItems,empty:'No outstanding document reviews.'},
  {key:'upcoming',label:'Upcoming',count:upcomingItems.length,items:upcomingItems,empty:'No important dates coming up.'},
  {key:'activity',label:'Activity',count:activityItems.filter(x=>x.unread).length,items:activityItems,empty:noticeError||'No recent transaction activity.'},
 ];
 const modules=[['Review queue','Agents & profiles','Agent payments','Cheque printing'],['Trust & bank','Bank reconciliation','Financial & compliance','Reports','Audit & controls']];
 return <div className={old.boCompact}>
  <div className={old.boHeader}><div><p className={old.eyebrow}>BROKERAGE OPERATIONS · {brokerageName}</p><h1>Back Office</h1></div><button type="button" className="btn smallbtn" onClick={()=>{onRefresh();void load()}} disabled={refreshing}><RefreshCw size={15}/> Refresh</button></div>
  <section className={styles.officeCard} aria-label="Office updates">
   <div className={styles.officeLeft}><p className={styles.eyebrow}>YOUR OFFICE AT A GLANCE</p><h2>Office updates</h2><p className={styles.subtle}>One place for new files and important updates.</p>
    <div className={styles.officePreview}>
     <button type="button" onClick={()=>onNavigate('Review queue')}><b>{submissions.length}</b> Files awaiting approval</button>
     <button type="button" onClick={()=>onNavigate('Financial & compliance')}><b>{insights.unreconciled.length}</b> Reconciliations to check</button>
     <button type="button" onClick={()=>onNavigate('Agent payments')}><b>{insights.authorized.length}</b> Agent payments pending</button>
    </div>
   </div>
   <div className={styles.officeRight}><SmartInbox037 tabs={tabs} ariaLabel="Back Office notification inbox"/></div>
  </section>
  <section className={old.boPanel} aria-label="Accounting and compliance overview"><h3><ShieldCheck size={17} style={{verticalAlign:'middle',marginRight:7}}/>Accounting, reporting & compliance</h3><p className={old.boTiny}>Trust accounts: {accounts.filter(a=>a.kind==='Trust'&&a.active!==false).length} · Outstanding reconciliations: {insights.unreconciled.length} · Unverified document requirements: {requirements.filter(r=>r.verified!==true&&merged.some(d=>d.id===r.deal_id)).length} · Monthly statements: {statementFeatureReady?'Enabled':'Setup required'}</p><button type="button" className="btn smallbtn" onClick={()=>onNavigate('Financial & compliance')}>Open financial & compliance centre <ArrowUpRight size={14}/></button></section>
  <h2 className={old.boSectionHeading}>Applications & tools</h2>
  <div className={old.boMiniModules}>{modules.flat().map(m=><button type="button" key={m} onClick={()=>onNavigate(m)}>{m}</button>)}</div>
  <details><summary className={old.boTiny} style={{cursor:'pointer'}}>More brokerage tools</summary><div className={old.boMiniModules} style={{marginTop:10}}>{['Changes requested','Approved','New agent setup','Plans & monthly fees','Payroll & salaries','EFT payments','Brokerage settings','Brokerage Control','Office DDF & Listings','Office Meta Accounts','Office Lead Routing','Office Marketing Dashboard'].map(m=><button type="button" key={m} onClick={()=>onNavigate(m)}>{m}</button>)}</div></details>
  <p className={old.boTiny}>Financial summaries are read-only. Trust releases and agent payments require the existing authorization workflow.</p>
 </div>;
}
