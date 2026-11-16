import type {Draft} from './designs';

export type SocialChannel='Facebook'|'Instagram';
export type PlanningStatus='draft'|'planned'|'ready'|'archived';
export const SOCIAL_CHANNELS:SocialChannel[]=['Facebook','Instagram'];

/** Old drafts had one `platform` and optional `date`. Keep those readable. */
export function draftChannels(d:Draft):SocialChannel[]{
 const candidate=Array.isArray(d.channels)?d.channels:[d.platform];
 return SOCIAL_CHANNELS.filter(c=>candidate.includes(c));
}
export function draftStatus(d:Draft):PlanningStatus{
 if(d.scheduleStatus==='archived')return 'archived';
 if(!d.date)return 'draft';
 if(d.scheduleStatus==='ready')return 'ready';
 return 'planned';
}
export function validLocalDateTime(value:string):boolean{
 if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value))return false;
 const date=new Date(value);
 if(Number.isNaN(date.getTime()))return false;
 const pad=(n:number)=>String(n).padStart(2,'0');
 return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`===value;
}
export function dayKey(d:Date):string{
 const pad=(n:number)=>String(n).padStart(2,'0');
 return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
}
export function monthDays(year:number,month:number):Array<{key:string;date:number;inMonth:boolean}>{
 const first=new Date(year,month,1);const offset=first.getDay();const last=new Date(year,month+1,0).getDate();
 const cells=Math.ceil((offset+last)/7)*7;
 return Array.from({length:cells},(_,i)=>{const current=new Date(year,month,i-offset+1);return {key:dayKey(current),date:current.getDate(),inMonth:current.getMonth()===month};});
}
export function plannedDrafts(drafts:Draft[]):Draft[]{
 return drafts.filter(d=>validLocalDateTime(d.date)&&draftStatus(d)!=='archived')
   .sort((a,b)=>a.date.localeCompare(b.date));
}
export function calendarStats(drafts:Draft[]){
 return {drafts:drafts.filter(d=>draftStatus(d)==='draft').length,
  planned:drafts.filter(d=>draftStatus(d)==='planned').length,
  ready:drafts.filter(d=>draftStatus(d)==='ready').length,
  archived:drafts.filter(d=>draftStatus(d)==='archived').length};
}
export function localDateAt(key:string,hour=10):string {return `${key}T${String(hour).padStart(2,'0')}:00`;}
export function statusLabel(status:PlanningStatus):string{return ({draft:'Draft',planned:'Planned',ready:'Ready for review',archived:'Archived'} as const)[status];}
