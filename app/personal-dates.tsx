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
const dateLabel=(day:string)=>new Date(day+'T12:00:00Z').toLocaleDateString('en-CA',{month:'short',day:'numeric',timeZone:'UTC'});
const timeLabel=(stamp:string)=>new Date(stamp).toLocaleDateString('en-CA',{month:'short',day:'numeric',timeZone:'America/Vancouver'});
const nextDateTitle=(x:TxDate)=>x.kind==='Listing'?'Listing expiry':x.display_status==='Accepted offer'?'Subject removal':x.display_status==='Completed'?'Possession':'Completion';
const daysFrom=(d:string,offset:number)=>{const dt=new Date(d+'T12:00:00Z');dt.setUTCDate(dt.getUTCDate()+offset);return dt.toISOString().slice(0,10)};
export default function PersonalDates({userId,notify}:{userId:string;notify:(s:string)=>void}){
 const db=getSupabase()!;
 const [entries,setEntries]=useState<Entry[]>([]),[dates,setDates]=useState<TxDate[]>([]),[notices,setNotices]=useState<Notice[]>([]),[addresses,setAddresses]=useState<Record<string,string>>({});
 const [tasks,setTasks]=useState<Task[]>([]),[clients,setClients]=useState<Client[]>([]),[notes,setNotes]=useState<ClientNote[]>([]);
 const [editing,setEditing]=useState<(Omit<Entry,'id'>&{id?:string})|null>(null),[completed,setCompleted]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[today,setToday]=useState(brokerageDay());
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
 const personalVisible=entries.filter(x=>x.completed===completed&&(completed||x.event_date>=today)).sort((a,b)=>a.event_date.localeCompare(b.event_date)).slice(0,2);
 const upcoming=dates.filter(x=>x.next_date&&x.next_date>=today);
 const reminderItems:InboxItem[]=[...personal.filter(x=>x.event_date<=dueSoon).map(x=>({id:'date-'+x.id,title:x.title,detail:`Personal reminder · ${dateLabel(x.event_date)}`,onOpen:()=>setEditing({...x})})),...tasks.filter(x=>x.due_date&&x.due_date<=dueSoon).map(x=>({id:'task-'+x.id,title:x.title,detail:`CRM follow-up · ${dateLabel(x.due_date!)}`,onOpen:()=>x.contact_id?openClient(x.contact_id):window.dispatchEvent(new Event('realvolt:open-crm-tasks'))}))].sort((a,b)=>a.detail.localeCompare(b.detail));
 const upcomingItems:InboxItem[]=upcoming.map(x=>({id:'tx-'+x.id,title:`${nextDateTitle(x)} · ${dateLabel(x.next_date!)}`,detail:x.address,onOpen:()=>openDeal(x.id)}));
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
 ];
 return <section className={styles.personalCard} aria-label="Your personal workspace">
  <div className={styles.personalTopButton}><button className="btn primary" type="button" disabled={busy} onClick={()=>setEditing({title:'',event_date:today,notes:'',completed:false})}>+ Add date</button></div>
  <div className={styles.personalMain}>
   <div className={styles.personalLeft}><p className={styles.eyebrow}>YOUR PERSONAL WORKSPACE</p><h2>Dates to remember</h2><p className={styles.subtle}>{new Date(today+'T12:00:00Z').toLocaleDateString('en-CA',{weekday:'long',month:'long',day:'numeric',year:'numeric',timeZone:'UTC'})} · Vancouver time</p>
    <div className={styles.personTabs}><button type="button" className={`${styles.personTab} ${!completed?styles.personTabActive:''}`} onClick={()=>setCompleted(false)}>Upcoming</button><button type="button" className={`${styles.personTab} ${completed?styles.personTabActive:''}`} onClick={()=>setCompleted(true)}>Completed</button></div>
    {personalVisible.map(x=><button key={x.id} className={styles.personDate} type="button" onClick={()=>setEditing({...x})}><span className={styles.dateBadge}>{dateLabel(x.event_date)}</span><span className={styles.personDateText}><strong>{x.title}</strong><small>{x.completed?'Completed':'Personal reminder'}</small></span></button>)}
    {!personalVisible.length&&<p className={styles.personEmpty}>{completed?'No completed dates.':'No personal dates coming up.'}</p>}{error&&<p role="alert" className={styles.personEmpty}>{error}</p>}
   </div>
   <div className={styles.personalRight}><SmartInbox037 tabs={tabs} ariaLabel="Agent notification inbox"/></div>
  </div>
  {editing&&<form className={styles.editor} onSubmit={save}><div className={styles.editorGrid}><label>Reminder<input required maxLength={200} value={editing.title} onChange={e=>setEditing({...editing,title:e.target.value})}/></label><label>Date<input type="date" required value={editing.event_date} onChange={e=>setEditing({...editing,event_date:e.target.value})}/></label></div><label style={{marginTop:8}}>Notes<textarea rows={2} maxLength={4000} value={editing.notes} onChange={e=>setEditing({...editing,notes:e.target.value})}/></label><div className={styles.editorActions}><button type="submit" className="btn primary" disabled={busy}>Save</button><button type="button" className="btn" onClick={()=>setEditing(null)} disabled={busy}>Cancel</button>{editing.id&&<><button type="button" className="btn" disabled={busy} onClick={()=>void run(async()=>{const r=await db.from('agent_personal_dates').update({completed:!editing.completed}).eq('id',editing.id).eq('user_id',userId);if(r.error)throw r.error;setEditing(null)})}>{editing.completed?'Reopen':'Complete'}</button><button type="button" className="btn" disabled={busy} onClick={()=>{if(window.confirm('Delete this personal reminder?'))void run(async()=>{const r=await db.from('agent_personal_dates').delete().eq('id',editing.id).eq('user_id',userId);if(r.error)throw r.error;setEditing(null)})}}>Delete</button></>}</div></form>}
 </section>;
}
