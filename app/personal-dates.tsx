'use client';
import {useCallback,useEffect,useMemo,useState,type FormEvent} from 'react';
import {getSupabase} from '../lib/supabase';
import {brokerageDay} from '../lib/listing-status';
import SmartInbox037,{type InboxTab,type InboxItem} from './SmartInbox037';
import styles from './SmartInbox037.module.css';

type Entry={id:string;title:string;event_date:string;notes:string;completed:boolean};
type TxDate={id:string;address:string;kind:string;display_status:string;next_date:string|null};
type Notice={id:number;deal_id:string;message:string;created_at:string;read_at:string|null};
type Task={id:string;contact_id:string|null;title:string;due_date:string|null;completed:boolean};
type Client={id:string;full_name:string;contact_type:string;created_at:string;updated_at:string};
type ClientNote={id:string;contact_id:string;activity_type:string;created_at:string};
type DashboardPrefs={motivation_quote:string;monthly_sales_goal:number};
const DEFAULT_QUOTE='Consistency creates results.';
const validGoal=(n:number)=>Number.isInteger(n)&&n>=1&&n<=10000;

const dateLabel=(day:string)=>new Date(day+'T12:00:00Z').toLocaleDateString('en-CA',{month:'short',day:'numeric',timeZone:'UTC'});
const timeLabel=(stamp:string)=>new Date(stamp).toLocaleDateString('en-CA',{month:'short',day:'numeric',timeZone:'America/Vancouver'});
const nextDateTitle=(x:TxDate)=>x.kind==='Listing'?'Listing expiry':x.display_status==='Accepted offer'?'Subject removal':x.display_status==='Completed'?'Possession':'Completion';
const daysFrom=(d:string,offset:number)=>{const dt=new Date(d+'T12:00:00Z');dt.setUTCDate(dt.getUTCDate()+offset);return dt.toISOString().slice(0,10)};
export default function PersonalDates({userId,notify,brokerageHome=false,brokerageId}:{userId:string;notify:(s:string)=>void;brokerageHome?:boolean;brokerageId?:string|null}){

 const db=getSupabase()!;
 const [entries,setEntries]=useState<Entry[]>([]),[dates,setDates]=useState<TxDate[]>([]),[notices,setNotices]=useState<Notice[]>([]),[addresses,setAddresses]=useState<Record<string,string>>({});
 const [tasks,setTasks]=useState<Task[]>([]),[clients,setClients]=useState<Client[]>([]),[notes,setNotes]=useState<ClientNote[]>([]);
 const [editing,setEditing]=useState<(Omit<Entry,'id'>&{id?:string})|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[today,setToday]=useState(brokerageDay());
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
  const [p,t,n,task,client,note]=await Promise.all([
   db.from('agent_personal_dates').select('id,title,event_date,notes,completed').eq('user_id',userId).order('event_date').limit(100),
   db.from('rv_tx_summary').select('id,address,kind,display_status,next_date').eq('user_id',userId).not('next_date','is',null).neq('review_status','Draft').order('next_date').limit(50),
   db.from('rv_transaction_notifications').select('id,deal_id,message,created_at,read_at').eq('recipient_id',userId).order('created_at',{ascending:false}).limit(50),
   db.from('crm_tasks').select('id,contact_id,title,due_date,completed').eq('user_id',userId).eq('completed',false).not('due_date','is',null).order('due_date').limit(40),
   db.from('crm_contacts').select('id,full_name,contact_type,created_at,updated_at').eq('user_id',userId).order('updated_at',{ascending:false}).limit(50),
   db.from('crm_notes').select('id,contact_id,activity_type,created_at').eq('user_id',userId).order('created_at',{ascending:false}).limit(50),
  ]);
  if(p.error){setError('Personal reminders unavailable. Check your existing workspace setup.')}else{setEntries(p.data||[]);setError('')}
  if(!t.error)setDates(t.data||[]);
  if(!n.error){setNotices(n.data||[]);const ids=[...new Set((n.data||[]).map(x=>x.deal_id))];if(ids.length){const a=await db.from('deal_files').select('id,address').in('id',ids);if(!a.error)setAddresses(Object.fromEntries((a.data||[]).map(x=>[x.id,x.address])))}else setAddresses({})}
  if(!task.error)setTasks(task.data||[]);
  if(!client.error)setClients(client.data||[]);
  if(!note.error)setNotes(note.data||[]);
 },[db,userId]);
 useEffect(()=>{void load();const tick=setInterval(()=>{setToday(brokerageDay());void load()},15000);const focus=()=>void load();window.addEventListener('focus',focus);
  const subscription=db.channel(`rv037-agent-notices-${userId}`).on('postgres_changes',{event:'*',schema:'public',table:'rv_transaction_notifications',filter:`recipient_id=eq.${userId}`},()=>void load()).subscribe();
  return()=>{clearInterval(tick);window.removeEventListener('focus',focus);void db.removeChannel(subscription)};
 },[db,load,userId]);
 async function run(fn:()=>Promise<void>){setBusy(true);try{await fn();await load()}catch(e){notify((e as Error).message)}finally{setBusy(false)}}
 async function save(e:FormEvent){e.preventDefault();if(!editing)return;await run(async()=>{const {id,...values}=editing;const payload={...values,title:values.title.trim()};const r=id?await db.from('agent_personal_dates').update(payload).eq('id',id).eq('user_id',userId):await db.from('agent_personal_dates').insert({...payload,user_id:userId});if(r.error)throw r.error;setEditing(null);notify('Reminder saved')})}
 const openDeal=(id:string)=>window.dispatchEvent(new CustomEvent('realvolt:open-transaction',{detail:{id,office:false}}));
 const openClient=(id:string)=>window.dispatchEvent(new CustomEvent('realvolt:open-crm-contact',{detail:{id}}));
 async function openNotice(n:Notice){if(!n.read_at){const r=await db.from('rv_transaction_notifications').update({read_at:new Date().toISOString()}).eq('id',n.id).eq('recipient_id',userId);if(r.error)notify(r.error.message);else setNotices(a=>a.map(x=>x.id===n.id?{...x,read_at:new Date().toISOString()}:x))}openDeal(n.deal_id)}
 const dueSoon=daysFrom(today,7),freshFrom=daysFrom(today,-7);
 const personal=entries.filter(x=>!x.completed&&x.event_date>=today).sort((a,b)=>a.event_date.localeCompare(b.event_date));
 const futurePersonal=personal.filter(x=>x.event_date>dueSoon);
 const completedItems:InboxItem[]=entries.filter(x=>x.completed).sort((a,b)=>b.event_date.localeCompare(a.event_date)).map(x=>({id:'done-'+x.id,title:x.title,detail:`Completed reminder · ${dateLabel(x.event_date)}`,onOpen:()=>setEditing({...x})}));
 const remaining=Math.max(0,goal-salesCount);
 const progressPercent=Math.min(100,Math.round(salesCount/Math.max(goal,1)*100));
 const progressMessage=remaining>0?`${remaining} sale${remaining===1?'':'s'} left this month`:salesCount>goal?`Goal exceeded by ${salesCount-goal} sale${salesCount-goal===1?'':'s'}!`:'Monthly goal achieved!';

 const upcoming=dates.filter(x=>x.next_date&&x.next_date>=today);
 const reminderItems:InboxItem[]=[...personal.filter(x=>x.event_date<=dueSoon).map(x=>({id:'date-'+x.id,title:x.title,detail:`Personal reminder · ${dateLabel(x.event_date)}`,onOpen:()=>setEditing({...x})})),...tasks.filter(x=>x.due_date&&x.due_date<=dueSoon).map(x=>({id:'task-'+x.id,title:x.title,detail:`CRM follow-up · ${dateLabel(x.due_date!)}`,onOpen:()=>x.contact_id?openClient(x.contact_id):window.dispatchEvent(new Event('realvolt:open-crm-tasks'))}))].sort((a,b)=>a.detail.localeCompare(b.detail));
 const upcomingItems:InboxItem[]=[
  ...upcoming.map(x=>({id:'tx-'+x.id,title:`${nextDateTitle(x)} · ${dateLabel(x.next_date!)}`,detail:x.address,onOpen:()=>openDeal(x.id)})),
  ...futurePersonal.map(x=>({id:'future-'+x.id,title:`Reminder · ${dateLabel(x.event_date)}`,detail:x.title,onOpen:()=>setEditing({...x})})),
 ];
 const uniqueNotices=notices.filter((n,i,a)=>a.findIndex(x=>x.deal_id===n.deal_id&&x.message===n.message)===i);
 const activityItems:InboxItem[]=uniqueNotices.map(n=>({id:'activity-'+n.id,title:n.message,detail:`${addresses[n.deal_id]||'Transaction'} · ${timeLabel(n.created_at)}`,unread:!n.read_at,onOpen:()=>void openNotice(n)}));
 const clientById=new Map(clients.map(c=>[c.id,c]));
 const clientEvents=[...clients.map(c=>({id:c.id,at:c.updated_at,title:c.created_at===c.updated_at?'New client':'Client updated',client:c})),...notes.filter(n=>clientById.has(n.contact_id)).map(n=>({id:n.contact_id,at:n.created_at,title:`${n.activity_type} recorded`,client:clientById.get(n.contact_id)!}))].sort((a,b)=>b.at.localeCompare(a.at));
 const uniqueClientEvents=clientEvents.filter((x,i,a)=>a.findIndex(y=>x.id===y.id)===i);
 const clientItems:InboxItem[]=uniqueClientEvents.map(x=>({id:'client-'+x.id,title:`${x.client.full_name} · ${x.title}`,detail:`${x.client.contact_type} · ${timeLabel(x.at)}`,unread:x.at.slice(0,10)>=freshFrom,onOpen:()=>openClient(x.id)}));
 const tabs:InboxTab[]=[
  {key:'reminders',label:'Reminders',count:reminderItems.length,items:reminderItems,empty:'No reminders due soon.'},
  {key:'upcoming',label:'Upcoming',count:upcomingItems.length,items:upcomingItems,empty:'No upcoming transaction dates.'},
  {key:'activity',label:'Activity',count:activityItems.filter(x=>x.unread).length,items:activityItems,empty:'No transaction updates yet.'},
  {key:'clients',label:'Clients',count:clientItems.filter(x=>x.unread).length,items:clientItems,empty:'No recent client activity.'},
  {key:'completed',label:'Completed',count:completedItems.length,items:completedItems,empty:'No completed reminders yet.'},
 ];
 return <section className={styles.personalCard} aria-label={brokerageHome?'Brokerage home workspace':'Agent home workspace'}>
  <div className={styles.personalTopButton}><button className="btn primary" type="button" disabled={busy} onClick={()=>setEditing({title:'',event_date:today,notes:'',completed:false})}>+ Add reminder</button></div>
  <div className={styles.personalMain}>
   <div className={styles.personalLeft}>
    <p className={styles.eyebrow}>{brokerageHome?'BROKERAGE WORKSPACE':'YOUR PERSONAL WORKSPACE'}</p>
    {quoteEditing?<form className={styles.quoteEditor} onSubmit={e=>void savePref('quote',e)}>
     <label className={styles.srOnly} htmlFor="rv-home-quote">Your quote</label>
     <textarea id="rv-home-quote" autoFocus value={quoteDraft} maxLength={240} rows={2} onChange={e=>setQuoteDraft(e.target.value)} placeholder="Write a quote…"/>
     <div className={styles.miniActions}><button className={styles.miniPrimary} disabled={settingsBusy}>Save</button><button type="button" disabled={settingsBusy} onClick={()=>setQuoteEditing(false)}>Cancel</button></div>
    </form>:<button type="button" className={styles.quoteDisplay} onClick={()=>{setQuoteDraft(quote);setQuoteEditing(true)}} title="Click to edit quote" aria-label="Edit your dashboard quote"><span>“{quote||DEFAULT_QUOTE}”</span><span className={styles.editPencil} aria-hidden="true">✎</span></button>}
    <div className={styles.goalHeader}><span>{brokerageHome?'Office monthly sales goal':'Monthly sales goal'}</span><button type="button" onClick={()=>{setGoalDraft(String(goal));setGoalEditing(v=>!v)}} className={styles.goalEdit} aria-label="Edit monthly sales goal" title="Edit goal">✎</button></div>
    {goalEditing?<form className={styles.goalForm} onSubmit={e=>void savePref('goal',e)}><label htmlFor="rv-goal-input" className={styles.srOnly}>Monthly sales target</label><input id="rv-goal-input" type="number" min="1" max="10000" step="1" value={goalDraft} onChange={e=>setGoalDraft(e.target.value)} required/><button className={styles.miniPrimary} disabled={settingsBusy}>Save</button><button type="button" disabled={settingsBusy} onClick={()=>setGoalEditing(false)}>Cancel</button></form>:<>
     <div className={styles.goalNumbers}><strong>{salesCount}</strong><span>of {goal} firm sales</span></div>
     <div className={styles.goalTrack} role="progressbar" aria-label="Monthly firm sales goal progress" aria-valuenow={salesCount} aria-valuemin={0} aria-valuemax={Math.max(goal,salesCount)}><div className={styles.goalFill} style={{width:`${progressPercent}%`}}/></div>
     <p className={styles.goalMessage}>{progressMessage}</p>
    </>}
    {settingsError&&<p className={styles.goalError} role="alert">{settingsError}</p>}
    {salesError&&<p className={styles.goalError} role="status">{salesError}</p>}
    {error&&<p className={styles.goalError} role="alert">{error}</p>}
   </div>
   <div className={styles.personalRight}><SmartInbox037 tabs={tabs} ariaLabel={brokerageHome?'Brokerage home notification inbox':'Agent notification inbox'}/></div>
  </div>
  {editing&&<form className={styles.editor} onSubmit={save}><div className={styles.editorGrid}><label>Reminder<input required maxLength={200} value={editing.title} onChange={e=>setEditing({...editing,title:e.target.value})}/></label><label>Date<input type="date" required value={editing.event_date} onChange={e=>setEditing({...editing,event_date:e.target.value})}/></label></div><label style={{marginTop:8}}>Notes<textarea rows={2} maxLength={4000} value={editing.notes} onChange={e=>setEditing({...editing,notes:e.target.value})}/></label><div className={styles.editorActions}><button type="submit" className="btn primary" disabled={busy}>Save</button><button type="button" className="btn" onClick={()=>setEditing(null)} disabled={busy}>Cancel</button>{editing.id&&<><button type="button" className="btn" disabled={busy} onClick={()=>void run(async()=>{const r=await db.from('agent_personal_dates').update({completed:!editing.completed}).eq('id',editing.id).eq('user_id',userId);if(r.error)throw r.error;setEditing(null)})}>{editing.completed?'Reopen':'Complete'}</button><button type="button" className="btn" disabled={busy} onClick={()=>{if(window.confirm('Delete this personal reminder?'))void run(async()=>{const r=await db.from('agent_personal_dates').delete().eq('id',editing.id).eq('user_id',userId);if(r.error)throw r.error;setEditing(null)})}}>Delete</button></>}</div></form>}
 </section>;
}
