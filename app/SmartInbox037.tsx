'use client';
import {useId,useState} from 'react';
import styles from './SmartInbox037.module.css';

export type InboxKey='reminders'|'upcoming'|'activity'|'clients'|'new'|'review'|'workflow'|'completed'|'accepted'|'sold';
export type InboxItem={id:string;title:string;detail:string;onOpen:()=>void;unread?:boolean;progress?:number};
export type InboxTab={key:InboxKey;label:string;count:number;items:InboxItem[];empty:string};
/** Shared display-only inbox: no open tab on first render, no changes to financial permissions. */
export default function SmartInbox037({tabs,ariaLabel}: {tabs:InboxTab[];ariaLabel:string}){
 const [selected,setSelected]=useState<InboxKey|null>(null);
 const [expanded,setExpanded]=useState(false);
 const selectedTab=tabs.find(t=>t.key===selected);
 const panelId=useId();
 return <div className={styles.inbox} aria-label={ariaLabel}>
  <div className={styles.tabs} role="group" aria-label={ariaLabel+' categories'}>
   {tabs.map(t=><button key={t.key} type="button" className={`${styles.tab} ${selected===t.key?styles.active:''} ${t.key==='sold'?styles.tabSold:''}`} aria-pressed={selected===t.key} aria-controls={panelId} onClick={()=>{setSelected(s=>s===t.key?null:t.key);setExpanded(false)}}>
    <span>{t.label}</span>{t.count>0&&<span className={styles.count} aria-label={`${t.count} updates`}>{t.count>99?'99+':t.count}</span>}
   </button>)}
  </div>
  <div className={styles.results} id={panelId} aria-live="polite">
   {!selectedTab?<p className={styles.empty}>Select a category to see updates.</p>:
    selectedTab.items.length?<>{selectedTab.items.slice(0,expanded?25:3).map(x=><button type="button" key={x.id} onClick={x.onOpen} className={`${styles.item} ${x.unread?styles.unread:''} ${selected==='sold'?styles.itemSold:''}`} title={x.title}>
     <span className={styles.dot} aria-hidden="true"/><span className={styles.itemText}><strong>{x.title}</strong><small>{x.detail}</small>{typeof x.progress==='number'&&<span className={styles.progressTrack}><span className={styles.progressFill} style={{width:`${Math.max(0,Math.min(100,x.progress))}%`}}/></span>}</span><span className={styles.chevron} aria-hidden="true">›</span>
    </button>)}{selectedTab.items.length>3&&<button type="button" className={styles.moreButton} onClick={()=>setExpanded(v=>!v)}>{expanded?'Show fewer':`View more (${selectedTab.items.length})`}</button>}</>:<p className={styles.empty}>{selectedTab.empty}</p>}
  </div>
 </div>;
}
