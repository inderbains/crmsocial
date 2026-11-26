'use client';
import {useCallback,useEffect,useState,type FormEvent} from 'react';
import {getSupabase} from '../lib/supabase';
import {brokerageDay} from '../lib/listing-status';
import SmartInbox037,{type InboxTab,type InboxItem} from './SmartInbox037';
import styles from './SmartInbox037.module.css';

type Entry={id:string;title:string;event_date:string;notes:string;completed:boolean};
type TxDate={id:string;address:string;kind:string;display_status:string;next_date:string|null};
type Notice={id:number;deal_id:string;message:string;created_at:string;read_at:string|null};
type NoticeDeal={id:string;address:string;kind:string;rv_stage:string|null;review_status:string};
type Task={id:string;contact_id:string|null;title:string;due_date:string|null;completed:boolean};
type DashboardPrefs={motivation_quote:string;monthly_sales_goal:number};
const DEFAULT_QUOTE='Consistency creates results.';
const validGoal=(n:number)=>Number.isInteger(n)&&n>=1&&n<=10000;

const dateLabel=(day:string)=>new Date(day+'T12:00:00Z').toLocaleDateString('en-CA',{month:'short',day:'numeric',timeZone:'UTC'});
const timeLabel=(stamp:string)=>new Date(stamp).toLocaleDateString('en-CA',{month:'short',day:'numeric',timeZone:'America/Vancouver'});
const nextDateTitle=(x:TxDate)=>x.kind==='Listing'?'Listing expiry':x.display_status==='Accepted offer'?'Subject removal':x.display_status==='Completed'?'Possession':'Completion';
export default function PersonalDates({userId,notify,brokerageHome=false,brokerageId}:{userId:string;notify:(s:string)=>void;brokerageHome?:boolean;brokerageId?:string|null}){

 const db=getSupabase()!;
 const [entries,setEntries]=useState<Entry[]>([]),[dates,setDates]=useState<TxDate[]>([]),[notices,setNotices]=useState<Notice[]>([]);
 const [noticeDeals,setNoticeDeals]=useState<Record<string,NoticeDeal>>({});
 const [tasks,setTasks]=useState<Task[]>([]);
 const [editing,setEditing]=useState<(Omit<Entry,'id'>&{id?:string})|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[today,setToday]=useState(brokerageDay());
 useEffect(()=>{
  if(!editing)return;
  const closeOnEscape=(e:KeyboardEvent)=>{if(e.key==='Escape'&&!busy)setEditing(null)};
  window.addEventListener('keydown',closeOnEscape);
  return()=>window.removeEventListener('keydown',closeOnEscape);
 },[Boolean(editing),busy]);
 const [quote,setQuote]=useState(''),[quoteDraft,setQuoteDraft]=useState(''),[quoteEditing,setQuoteEditing]=useState(false);
 const [goal,setGoal]=useState(5),[goalDraft,setGoalDraft]=useState('5'),[goalEditing,setGoalEditing]=useState(false);
 const [salesCount,setSalesCount]=useState(0),[settingsBusy,setSettingsBusy]=useState(false),[settingsError,setSettingsError]=useState(''),[salesError,setSalesError]=useState('');
 const prefTable=brokerageHome?'rv_brokerage_dashboard_preferences':'rv_agent_dashboard_preferences';
 const prefKey=brokerageHome?'brokerage_id':'user_id';
 const prefOwner=brokerageHome?brokerageId:userId;
 useEffect(()=>{
  let active=true;
  setQuote('');setGoal(5);setGoalDraft('5');setQuoteEditing(false);setGoalEditing(false);setSettingsError('');
  if(!prefOwner)return()=>{active=false};
  void (async()=>{
   const r=await db.from(prefTable).select('motivation_quote,monthly_sales_goal').eq(prefKey,prefOwner).maybeSingle();
   if(!active)return;
   if(r.error){setSettingsError('Dashboard settings unavailable. Install SQL 045 first.');return;}
   const prefs=r.data as DashboardPrefs|null;
   if(prefs){setQuote(prefs.motivation_quote||'');setQuoteDraft(prefs.motivation_quote||'');setGoal(validGoal(prefs.monthly_sales_goal)?prefs.monthly_sales_goal:5);setGoalDraft(String(validGoal(prefs.monthly_sales_goal)?prefs.monthly_sales_goal:5))}
  })();
  return()=>{active=false};
 },[db,prefTable,prefKey,prefOwner]);
 useEffect(()=>{
  let active=true;
  const monthStart=today.slice(0,7)+'-01';
  if(brokerageHome&&!brokerageId){setSalesCount(0);return()=>{active=false};}
  async function refreshSales(){
   if(brokerageHome){
    const r=await db.rpc('rv_brokerage_sales_leaderboard',{p_period:'month',p_sort:'sales'});
    if(!active)return;
    if(r.error){setSalesError('Office sales unavailable. Check your leaderboard setup.');return;}
    const rows=Array.isArray(r.data)?r.data:[];
    setSalesCount(rows.reduce((acc:number,row:{sales_count?:number|string})=>acc+Math.max(0,Number(row.sales_count)||0),0));
   }else{
    const r=await db.from('deal_files').select('id',{count:'exact',head:true})
     .eq('user_id',userId).eq('kind','Sale').in('rv_stage',['Sold','Completed','Archived'])
     .gte('rv_firm_date',monthStart).lte('rv_firm_date',today).gt('sale_price',0);
    if(!active)return;
    if(r.error){setSalesError('Firm sales unavailable. Check transaction setup.');return;}
    setSalesCount(r.count||0);
   }
   setSalesError('');
  }
  void refreshSales();
  const timer=setInterval(()=>void refreshSales(),15000);
  const focus=()=>void refreshSales();window.addEventListener('focus',focus);
  return()=>{active=false;clearInterval(timer);window.removeEventListener('focus',focus)};
 },[db,brokerageHome,brokerageId,userId,today]);
 async function savePref(kind:'quote'|'goal',e:FormEvent){
  e.preventDefault();
  if(!prefOwner){notify('Brokerage membership is still loading.');return;}
  const newGoal=kind==='goal'?Number(goalDraft):goal;
  if(!validGoal(newGoal)){notify('Enter a monthly goal from 1 to 10,000.');return;}
  const newQuote=(kind==='quote'?quoteDraft:quote).trim().slice(0,240);
  setSettingsBusy(true);
  const result=await db.from(prefTable).upsert({[prefKey]:prefOwner,motivation_quote:newQuote,monthly_sales_goal:newGoal,updated_at:new Date().toISOString()},{onConflict:prefKey});
  setSettingsBusy(false);
  if(result.error){setSettingsError(result.error.message);notify('Could not save dashboard settings.');return;}
  setQuote(newQuote);setGoal(newGoal);setQuoteEditing(false);setGoalEditing(false);setSettingsError('');
  notify(kind==='quote'?'Quote saved':'Monthly sales goal saved');
 }

 const load=useCallback(async()=>{
  // Home is an inbox and calendar, not a duplicate transaction filing system.
  // Agents see their own dates; brokerage admins see their brokerage's dates.
  const txDateQuery=db.from('rv_tx_summary').select('id,address,kind,display_status,next_date')
    .not('next_date','is',null).neq('review_status','Draft').order('next_date').limit(80);
  const [p,t,n,task]=await Promise.all([
   db.from('agent_personal_dates').select('id,title,event_date,notes,completed').eq('user_id',userId).order('event_date').limit(100),
   brokerageHome&&brokerageId?txDateQuery.eq('brokerage_id',brokerageId):txDateQuery.eq('user_id',userId),
   db.from('rv_transaction_notifications').select('id,deal_id,message,created_at,read_at')
    .eq('recipient_id',userId).is('read_at',null).order('created_at',{ascending:false}).limit(100),
   db.from('crm_tasks').select('id,contact_id,title,due_date,completed').eq('user_id',userId)
    .eq('completed',false).not('due_date','is',null).order('due_date').limit(80),
  ]);
  if(p.error)setError('Personal reminders unavailable. Check your workspace setup.');
  else {setEntries((p.data||[]) as Entry[]);setError('')}
  if(!t.error)setDates((t.data||[]) as TxDate[]);
  if(!task.error)setTasks((task.data||[]) as Task[]);
  if(!n.error){
   const rows=(n.data||[]) as Notice[];
   setNotices(rows);
   const ids=[...new Set(rows.map(x=>x.deal_id))];
   if(ids.length){
    const a=await db.from('deal_files').select('id,address,kind,rv_stage,review_status').in('id',ids);
    if(!a.error)setNoticeDeals(Object.fromEntries(((a.data||[]) as NoticeDeal[]).map(x=>[x.id,x])));
   }else setNoticeDeals({});
  }
 },[db,userId,brokerageHome,brokerageId]);
 useEffect(()=>{void load();const tick=setInterval(()=>{setToday(brokerageDay());void load()},15000);const focus=()=>void load();window.addEventListener('focus',focus);
  const subscription=db.channel(`rv037-agent-notices-${userId}`).on('postgres_changes',{event:'*',schema:'public',table:'rv_transaction_notifications',filter:`recipient_id=eq.${userId}`},()=>void load()).subscribe();
  return()=>{clearInterval(tick);window.removeEventListener('focus',focus);void db.removeChannel(subscription)};
 },[db,load,userId]);
 async function run(fn:()=>Promise<void>){setBusy(true);try{await fn();await load()}catch(e){notify((e as Error).message)}finally{setBusy(false)}}
 async function save(e:FormEvent){e.preventDefault();if(!editing)return;await run(async()=>{const {id,...values}=editing;const payload={...values,title:values.title.trim()};const r=id?await db.from('agent_personal_dates').update(payload).eq('id',id).eq('user_id',userId):await db.from('agent_personal_dates').insert({...payload,user_id:userId});if(r.error)throw r.error;setEditing(null);notify('Reminder saved')})}
 const openDeal=(id:string)=>window.dispatchEvent(new CustomEvent('realvolt:open-transaction',{detail:{id,office:brokerageHome}}));
 const openClient=(id:string)=>window.dispatchEvent(new CustomEvent('realvolt:open-crm-contact',{detail:{id}}));
 async function openNotice(n:Notice){
  const found=await db.from('deal_files').select('id,review_status,rv_stage').eq('id',n.deal_id).maybeSingle();
  if(found.error||!found.data){notify('Cannot open this notification’s file: '+(found.error?.message||'File unavailable'));return;}
  const deal=found.data;
  const section=deal.rv_stage==='Archived'?'Closed Files':deal.review_status==='Approved'?'Approved':deal.review_status==='Changes requested'?'Changes requested':'Review queue';
  const focus=deal.review_status==='Changes requested'&&!brokerageHome?'corrections':deal.review_status==='Submitted'&&brokerageHome?'compliance':undefined;
  const detail:{id:string;office:boolean;section?:string;focus?:string;accepted?:boolean}={id:n.deal_id,office:brokerageHome,section,focus};
  window.dispatchEvent(new CustomEvent('realvolt:open-transaction',{detail}));
  if(!detail.accepted)return;
  const r=await db.from('rv_transaction_notifications').update({read_at:new Date().toISOString()}).eq('deal_id',n.deal_id).eq('recipient_id',userId).is('read_at',null);
  if(r.error){notify('Could not clear notification: '+r.error.message);return;}
  setNotices(a=>a.filter(x=>x.deal_id!==n.deal_id));
 }
 const remaining=Math.max(0,goal-salesCount);
 const progressPercent=Math.min(100,Math.round(salesCount/Math.max(goal,1)*100));
 const progressMessage=remaining>0?`${remaining} sale${remaining===1?'':'s'} left this month`:salesCount>goal?`Goal exceeded by ${salesCount-goal} sale${salesCount-goal===1?'':'s'}!`:'Monthly goal achieved!';

 // One unread notification per transaction prevents document-upload bursts from
 // repeating the same file. Opening a notice preserves its permanent record.
 const notificationItems:InboxItem[]=[];
 const seenDeals=new Set<string>();
 for(const n of notices){
  if(n.read_at||!noticeDeals[n.deal_id]||seenDeals.has(n.deal_id))continue;
  seenDeals.add(n.deal_id);
  const deal=noticeDeals[n.deal_id];
  notificationItems.push({id:'notice-'+n.id,title:n.message,detail:`${deal.address||'Transaction'} · ${timeLabel(n.created_at)}`,unread:true,onOpen:()=>void openNotice(n)});
 }
 // Dates in Upcoming are property and transaction deadlines, not reminder tasks.
 const upcomingItems:InboxItem[]=dates.filter(x=>x.next_date&&x.next_date>=today).map(x=>({
  id:'tx-'+x.id,title:`${nextDateTitle(x)} · ${dateLabel(x.next_date!)}`,
  detail:x.address,onOpen:()=>openDeal(x.id)
 }));
 // All unfinished personal reminders and dated CRM follow-ups stay here,
 // including overdue dates. They are not repeated in Upcoming.
 const reminderItems:InboxItem[]=[
  ...entries.filter(x=>!x.completed).map(x=>({
   date:x.event_date,item:{id:'date-'+x.id,title:x.title,detail:`${x.event_date<today?'Overdue · ':''}Reminder · ${dateLabel(x.event_date)}`,onOpen:()=>setEditing({...x})} as InboxItem
  })),
  ...tasks.filter(x=>x.due_date).map(x=>({
   date:x.due_date!,item:{id:'task-'+x.id,title:x.title,detail:`${x.due_date!<today?'Overdue · ':''}CRM follow-up · ${dateLabel(x.due_date!)}`,
    onOpen:()=>x.contact_id?openClient(x.contact_id):window.dispatchEvent(new Event('realvolt:open-crm-tasks'))} as InboxItem
  })),
 ].sort((a,b)=>a.date.localeCompare(b.date)).map(x=>x.item);
 const tabs:InboxTab[]=[
  {key:'new',label:'Notifications',count:notificationItems.length,items:notificationItems,unreadCount:notificationItems.length,empty:'You are all caught up.'},
  {key:'upcoming',label:'Upcoming Dates',count:upcomingItems.length,items:upcomingItems,empty:'No upcoming transaction dates.'},
  {key:'reminders',label:'Reminder Dates',count:reminderItems.length,items:reminderItems,empty:'No outstanding reminders.'},
 ];
 return <><section className={styles.personalCard} aria-label={brokerageHome?'Brokerage home workspace':'Agent home workspace'}>
  <div className={styles.personalTopButton}><button className="btn primary" type="button" disabled={busy} onClick={()=>setEditing({title:'',event_date:today,notes:'',completed:false})}>+ Add reminder</button></div>
  <div className={styles.personalMain}>
   <div className={styles.personalLeft}>
    <p className={styles.eyebrow}>{brokerageHome?'BROKERAGE WORKSPACE':'YOUR PERSONAL WORKSPACE'}</p>
    {quoteEditing?<form className={styles.quoteEditor} onSubmit={e=>void savePref('quote',e)}>
     <label className={styles.srOnly} htmlFor="rv-home-quote">Your quote</label>
     <textarea id="rv-home-quote" autoFocus value={quoteDraft} maxLength={240} rows={2} onChange={e=>setQuoteDraft(e.target.value)} placeholder="Write your quote…" onKeyDown={e=>{if(e.key==='Escape'){e.preventDefault();setQuoteEditing(false)}else if(e.key==='Enter'&&(e.ctrlKey||e.metaKey)){e.preventDefault();e.currentTarget.form?.requestSubmit()}}}/>
     <div className={styles.miniActions}><button className={styles.miniPrimary} disabled={settingsBusy}>Save</button><button type="button" disabled={settingsBusy} onClick={()=>setQuoteEditing(false)}>Cancel</button></div>
    </form>:<button type="button" className={styles.quoteDisplay} onClick={()=>{setQuoteDraft(quote);setQuoteEditing(true)}} aria-label="Edit the displayed quote directly"><span>“{quote||DEFAULT_QUOTE}”</span></button>}
    <div className={styles.goalHeader}><span>{brokerageHome?'Office monthly sales goal':'Monthly sales goal'}</span><button type="button" onClick={()=>{setGoalDraft(String(goal));setGoalEditing(v=>!v)}} className={styles.goalEdit} aria-label="Change monthly sales goal">Change goal</button></div>
    {goalEditing?<form className={styles.goalForm} onSubmit={e=>void savePref('goal',e)}><label htmlFor="rv-goal-input" className={styles.srOnly}>Monthly sales target</label><input id="rv-goal-input" type="number" min="1" max="10000" step="1" value={goalDraft} onChange={e=>setGoalDraft(e.target.value)} required/><button className={styles.miniPrimary} disabled={settingsBusy}>Save</button><button type="button" disabled={settingsBusy} onClick={()=>setGoalEditing(false)}>Cancel</button></form>:<>
     <div className={styles.goalNumbers}><strong>{salesCount}</strong><span>of {goal} firm sales</span></div>
     <div className={styles.goalTrack} role="progressbar" aria-label="Monthly firm sales goal progress" aria-valuenow={salesCount} aria-valuemin={0} aria-valuemax={Math.max(goal,salesCount)}><div className={styles.goalFill} style={{width:`${progressPercent}%`}}/></div>
     <p className={styles.goalMessage}>{progressMessage}</p>
    </>}
    {settingsError&&<p className={styles.goalError} role="alert">{settingsError}</p>}
    {salesError&&<p className={styles.goalError} role="status">{salesError}</p>}
    {error&&<p className={styles.goalError} role="alert">{error}</p>}
   </div>
   <div className={styles.personalRight}><SmartInbox037 tabs={tabs} autoOpenUnread preferredUnreadTab={notificationItems.length?'new':undefined} ariaLabel={brokerageHome?'Brokerage workspace updates':'Agent workspace updates'}/></div>
  </div>
 </section>
 {editing&&<div className={styles.reminderOverlay} onMouseDown={e=>{if(e.target===e.currentTarget&&!busy)setEditing(null)}}>
  <section className={styles.reminderModal} role="dialog" aria-modal="true" aria-labelledby="rv-reminder-dialog-title">
   <div className={styles.reminderModalHead}>
    <div><p className={styles.eyebrow}>PERSONAL WORKSPACE</p><h2 id="rv-reminder-dialog-title">{editing.id?'Edit reminder':'Add reminder'}</h2><p>Keep your follow-ups and important dates together.</p></div>
    <button type="button" className={styles.reminderClose} onClick={()=>setEditing(null)} disabled={busy} aria-label="Close reminder popup">×</button>
   </div>
   <form className={styles.reminderForm} onSubmit={save}>
    <div className={styles.editorGrid}>
     <label htmlFor="rv-reminder-title">Reminder<input id="rv-reminder-title" autoFocus required maxLength={200} placeholder="e.g. Call buyer about financing" value={editing.title} onChange={e=>setEditing({...editing,title:e.target.value})}/></label>
     <label htmlFor="rv-reminder-date">Date<input id="rv-reminder-date" type="date" required value={editing.event_date} onChange={e=>setEditing({...editing,event_date:e.target.value})}/></label>
    </div>
    <label htmlFor="rv-reminder-notes">Notes (optional)<textarea id="rv-reminder-notes" rows={3} maxLength={4000} placeholder="Add details or a follow-up plan…" value={editing.notes} onChange={e=>setEditing({...editing,notes:e.target.value})}/></label>
    <div className={styles.editorActions}>
     <button type="submit" className="btn primary" disabled={busy}>{busy?'Saving…':'Save reminder'}</button>
     <button type="button" className="btn" onClick={()=>setEditing(null)} disabled={busy}>Cancel</button>
     {editing.id&&<><button type="button" className="btn" disabled={busy} onClick={()=>void run(async()=>{const r=await db.from('agent_personal_dates').update({completed:!editing.completed}).eq('id',editing.id).eq('user_id',userId);if(r.error)throw r.error;setEditing(null)})}>{editing.completed?'Reopen reminder':'Mark completed'}</button><button type="button" className="btn" disabled={busy} onClick={()=>{if(window.confirm('Delete this personal reminder?'))void run(async()=>{const r=await db.from('agent_personal_dates').delete().eq('id',editing.id).eq('user_id',userId);if(r.error)throw r.error;setEditing(null)})}}>Delete</button></>}
    </div>
   </form>
  </section>
 </div>}
 </>;
}
