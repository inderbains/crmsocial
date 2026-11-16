'use client';
import {useMemo,useState,type FormEvent} from 'react';
import {CalendarDays,ChevronLeft,ChevronRight,Clock3,Edit3,Facebook,Instagram,Plus,CheckCircle2,Archive,CalendarX2} from 'lucide-react';
import type {Draft} from '../lib/designs';
import {SOCIAL_CHANNELS,calendarStats,dayKey,draftChannels,draftStatus,localDateAt,monthDays,plannedDrafts,statusLabel,validLocalDateTime,type PlanningStatus,type SocialChannel} from '../lib/content-calendar';

type Props={drafts:Draft[];busy:boolean;onEdit:(d:Draft)=>void;onCreate:()=>void;onSave:(d:Draft)=>Promise<boolean>;notify:(s:string)=>void};
type Scope='all'|'Facebook'|'Instagram';
const dateLabel=(value:string)=>{if(!validLocalDateTime(value))return 'Not planned';return new Date(value).toLocaleString('en-CA',{month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit'});};

export default function ContentCalendar({drafts,busy,onEdit,onCreate,onSave,notify}:Props){
 const now=new Date();
 const [month,setMonth]=useState(()=>new Date(now.getFullYear(),now.getMonth(),1));
 const [selectedDay,setSelectedDay]=useState(()=>dayKey(now));
 const [view,setView]=useState<'calendar'|'agenda'>('calendar');
 const [scope,setScope]=useState<Scope>('all');
 const [selectedId,setSelectedId]=useState('');
 const [planDate,setPlanDate]=useState(()=>localDateAt(dayKey(now),10));
 const [targets,setTargets]=useState<SocialChannel[]>(['Instagram']);
 const [planStatus,setPlanStatus]=useState<'planned'|'ready'>('planned');
 const [submitting,setSubmitting]=useState(false);
 const tz=Intl.DateTimeFormat().resolvedOptions().timeZone||'your local time zone';
 const stats=useMemo(()=>calendarStats(drafts),[drafts]);
 const allPlanned=useMemo(()=>plannedDrafts(drafts),[drafts]);
 const planned=useMemo(()=>allPlanned.filter(d=>scope==='all'||draftChannels(d).includes(scope)),[allPlanned,scope]);
 const byDay=useMemo(()=>{
  const map=new Map<string,Draft[]>();for(const item of planned){const key=item.date.slice(0,10);map.set(key,[...(map.get(key)||[]),item]);}return map;
 },[planned]);
 const chosen=drafts.find(d=>d._id===selectedId);
 const onPick=(d:Draft)=>{setSelectedId(d._id||'');setPlanDate(validLocalDateTime(d.date)?d.date:localDateAt(selectedDay,10));setTargets(draftChannels(d).length?draftChannels(d):['Instagram']);setPlanStatus(draftStatus(d)==='ready'?'ready':'planned');};
 const chooseDay=(key:string)=>{setSelectedDay(key);setPlanDate(localDateAt(key,10));};
 const changeMonth=(diff:number)=>{setMonth(d=>new Date(d.getFullYear(),d.getMonth()+diff,1));};
 async function submitPlan(e:FormEvent){
  e.preventDefault();
  if(!chosen?._id){notify('Save a post in Design Studio first.');return;}
  if(!validLocalDateTime(planDate)){notify('Select a valid date and time.');return;}
  if(new Date(planDate).getTime()<Date.now()){notify('Choose a future time for a new plan.');return;}
  if(targets.length===0){notify('Choose Facebook, Instagram or both.');return;}
  setSubmitting(true);
  const ok=await onSave({...chosen,date:planDate,platform:targets[0],channels:targets,scheduleStatus:planStatus,scheduleTimezone:tz});
  setSubmitting(false);
  if(ok){setSelectedDay(planDate.slice(0,10));setMonth(new Date(Number(planDate.slice(0,4)),Number(planDate.slice(5,7))-1,1));notify('Post plan saved. It will not publish until Meta publishing is activated.');}
 }
 async function changeStatus(d:Draft,next:PlanningStatus){
  if(!d._id)return;
  if(next==='draft'){
   if(await onSave({...d,date:'',scheduleStatus:'draft'}))notify('Post moved back to Drafts.');
   return;
  }
  if(next==='archived'){
   if(await onSave({...d,date:'',scheduleStatus:'archived'}))notify('Post archived.');
   return;
  }
  if(!validLocalDateTime(d.date)){notify('Select a planned date first.');return;}
  if(await onSave({...d,scheduleStatus:next}))notify('Post marked '+statusLabel(next)+'.');
 }
 const dayItems=byDay.get(selectedDay)||[];
 const visibleAgenda=scope==='all'?allPlanned:planned;
 return <div className="rv-calendar-app">
  <div className="headrow rv-calendar-header"><div><h1>Content Calendar</h1><p>Plan your Facebook and Instagram posts, choose publishing times and prepare your content for review.</p></div><button className="btn primary" onClick={onCreate}><Plus size={16}/> Create a post</button></div>
  <div className="rv-calendar-warning" role="note"><Clock3 size={17}/><span><strong>Planning only.</strong> Dates saved here do not publish automatically. Meta publishing and ad spending remain disabled until the live connection is tested.</span></div>
  <div className="rv-calendar-stats">{([{key:'drafts',title:'Drafts'},{key:'planned',title:'Planned'},{key:'ready',title:'Ready for review'}] as const).map(x=><div key={x.key} className="rv-calendar-stat"><b>{stats[x.key]}</b><span>{x.title}</span></div>)}</div>
  <div className="rv-calendar-grid-main">
   <section className="panel rv-calendar-board" aria-label="Post calendar">
    <div className="rv-calendar-toolbar"><div className="rv-calendar-month"><button type="button" className="btn smallbtn" aria-label="Previous month" onClick={()=>changeMonth(-1)}><ChevronLeft size={16}/></button><h2>{month.toLocaleDateString('en-CA',{month:'long',year:'numeric'})}</h2><button type="button" className="btn smallbtn" aria-label="Next month" onClick={()=>changeMonth(1)}><ChevronRight size={16}/></button></div><div className="rv-calendar-toolbar-actions"><button className="btn smallbtn" onClick={()=>{const d=new Date();setMonth(new Date(d.getFullYear(),d.getMonth(),1));chooseDay(dayKey(d));}}>Today</button><div className="rv-calendar-views" role="group" aria-label="Calendar view"><button className={view==='calendar'?'selected':''} onClick={()=>setView('calendar')}>Month</button><button className={view==='agenda'?'selected':''} onClick={()=>setView('agenda')}>Agenda</button></div></div></div>
    <div className="rv-calendar-filter"><label htmlFor="rv-channel-filter">Show posts for</label><select id="rv-channel-filter" value={scope} onChange={e=>setScope(e.target.value as Scope)}><option value="all">All channels</option><option value="Facebook">Facebook</option><option value="Instagram">Instagram</option></select></div>
    {view==='calendar'?<div className="rv-calendar-month-grid"><div className="rv-calendar-weekdays">{['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d=><span key={d}>{d}</span>)}</div><div className="rv-calendar-days">{monthDays(month.getFullYear(),month.getMonth()).map(cell=>{
      const matches=byDay.get(cell.key)||[];return <button type="button" key={cell.key} onClick={()=>chooseDay(cell.key)} className={'rv-calendar-day'+(cell.inMonth?'':' is-outside')+(cell.key===selectedDay?' is-selected':'')+(cell.key===dayKey(now)?' is-today':'')} aria-label={`${cell.key}, ${matches.length} planned posts`} aria-pressed={cell.key===selectedDay}><span className="rv-calendar-day-num">{cell.date}</span>{matches.length>0&&<span className="rv-calendar-day-pills"><span>{matches.length} post{matches.length>1?'s':''}</span><small>{matches.some(d=>draftStatus(d)==='ready')?'Ready':'Planned'}</small></span>}</button>;
     })}</div></div>:<div className="rv-calendar-agenda">{visibleAgenda.length?visibleAgenda.map(d=><article className="rv-calendar-agenda-row" key={d._id}><div className="rv-calendar-agenda-date"><CalendarDays size={15}/>{dateLabel(d.date)}</div><div className="rv-calendar-item-meta"><strong>{d.title}</strong><span>{draftChannels(d).join(' + ')||'No channels selected'} · {statusLabel(draftStatus(d))}</span></div><button className="btn smallbtn" onClick={()=>onPick(d)}>Reschedule</button><button className="btn smallbtn" onClick={()=>onEdit({...d})}>Edit</button></article>):<div className="empty"><h3>No planned posts yet</h3><p>Save a Design Studio draft, then choose its date and channels below.</p></div>}</div>}
    <div className="rv-calendar-selected"><div className="sectionhead"><h3>{new Date(selectedDay+'T12:00:00').toLocaleDateString('en-CA',{weekday:'long',month:'short',day:'numeric'})}</h3><span className="badge">{dayItems.length} planned</span></div>{dayItems.length?dayItems.map(d=><div className="rv-calendar-post" key={d._id}><div className="rv-calendar-post-details"><b>{d.title}</b><span>{d.date.slice(11)} · {draftChannels(d).join(' + ')} · {statusLabel(draftStatus(d))}</span></div><div className="rv-calendar-post-actions"><button className="btn smallbtn" onClick={()=>onPick(d)}>Move</button><button className="btn smallbtn" onClick={()=>onEdit({...d})}>Edit</button></div></div>):<p className="muted">Nothing planned for this date. Pick a draft below to add one.</p>}</div>
   </section>
   <section className="panel rv-calendar-planner" aria-label="Post planner"><h2>Plan a post</h2><p className="muted">Choose a saved design, set the time, then select Facebook, Instagram or both.</p>
    <form onSubmit={submitPlan}>
     <div className="field"><label htmlFor="rv-plan-draft">Saved design</label><select id="rv-plan-draft" value={selectedId} onChange={e=>{const d=drafts.find(x=>x._id===e.target.value);if(d)onPick(d);else setSelectedId('');}}><option value="">Select a saved design</option>{drafts.filter(d=>d._id&&draftStatus(d)!=='archived').map(d=><option value={d._id} key={d._id}>{d.title} {d.date?'(planned)':'(draft)'}</option>)}</select></div>
     <div className="field"><label htmlFor="rv-plan-when">Date & time</label><input id="rv-plan-when" type="datetime-local" required value={planDate} onChange={e=>setPlanDate(e.target.value)}/><span className="rv-calendar-tz">Time zone: {tz}</span></div>
     <fieldset className="rv-calendar-channels"><legend>Channels</legend>{SOCIAL_CHANNELS.map(c=><label key={c}><input type="checkbox" checked={targets.includes(c)} onChange={e=>setTargets(prev=>e.target.checked?[...prev,c]:prev.filter(t=>t!==c))}/>{c==='Facebook'?<Facebook size={16}/>:<Instagram size={16}/>} {c}</label>)}</fieldset>
     <div className="field"><label htmlFor="rv-plan-status">Review status</label><select id="rv-plan-status" value={planStatus} onChange={e=>setPlanStatus(e.target.value as 'planned'|'ready')}><option value="planned">Planned</option><option value="ready">Ready for review</option></select></div>
     <button disabled={busy||submitting||!selectedId} className="btn primary rv-calendar-submit">{submitting?'Saving…':'Save to calendar'}</button>
     {chosen&&<div className="rv-calendar-plan-secondary"><button type="button" disabled={busy||submitting} className="btn smallbtn" onClick={()=>onEdit({...chosen})}><Edit3 size={14}/> Edit design</button>{chosen.date&&<button type="button" disabled={busy||submitting} className="btn smallbtn" onClick={()=>void changeStatus(chosen,'draft')}><CalendarX2 size={14}/> Unplan</button>}<button type="button" disabled={busy||submitting} className="btn smallbtn" onClick={()=>void changeStatus(chosen,'archived')}><Archive size={14}/> Archive</button></div>}
    </form>
    <div className="rv-calendar-upcoming"><h3><CheckCircle2 size={18}/> Up next</h3>{planned.filter(d=>new Date(d.date).getTime()>=Date.now()).slice(0,5).map(d=><button key={d._id} onClick={()=>onPick(d)}><span><b>{d.title}</b><small>{dateLabel(d.date)}</small></span><span className="badge">{statusLabel(draftStatus(d))}</span></button>)}{!planned.some(d=>new Date(d.date).getTime()>=Date.now())&&<p className="muted">Your next planned post will appear here.</p>}</div>
   </section>
  </div>
 </div>;
}
