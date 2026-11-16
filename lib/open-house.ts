export type OpenHouseEvent = {
 id:string; user_id:string; property_id:string|null; title:string; address:string; city:string;
 starts_at:string; ends_at:string; timezone:string; status:'draft'|'published'|'closed';
 sheet_path:string|null; cover_path:string|null; agent_name:string; agent_email:string;
 agent_phone:string; brokerage_name:string; poster_template?:OpenHousePosterTemplate; created_at?:string;
};
export type OpenHouseVisitor = {
 id:string; event_id:string; owner_user_id:string; contact_id:string|null;
 visitor_name:string; visitor_email:string; visitor_phone:string;
 marketing_consent:boolean; source:string; created_at:string; last_seen_at:string;
 sheet_opens:number;
};
export type PublicOpenHouse = Pick<OpenHouseEvent,'title'|'address'|'city'|'starts_at'|'ends_at'|'timezone'|'agent_name'|'agent_phone'|'agent_email'|'brokerage_name'> & {cover_path:string|null};

export const OPEN_HOUSE_BUCKET='realvolt-openhouse-public';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function validEventId(id:string):boolean{return UUID.test(id);}
export function openHouseLink(id:string,origin:string,basePath:string=''):string{
 if(!validEventId(id))throw new Error('Invalid open house ID');
 return `${origin}${basePath}/open-house/?id=${encodeURIComponent(id)}`;
}
export function documentPublicUrl(supabaseUrl:string,path:string):string{
 // The bucket contains ONLY public marketing PDFs and photos; confidential documents are prohibited.
 return `${supabaseUrl.replace(/\/$/,'')}/storage/v1/object/public/${OPEN_HOUSE_BUCKET}/${path.split('/').map(encodeURIComponent).join('/')}`;
}
export function formatOpenHouseTime(iso:string,timeZone='America/Vancouver'){
 try{return new Intl.DateTimeFormat('en-CA',{timeZone,weekday:'short',month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit'}).format(new Date(iso));}
 catch{return new Date(iso).toLocaleString();}
}

/** Render a UTC event timestamp as the local calendar date/time at the property. */
export function openHouseLocalParts(iso:string,timeZone:string):{date:string;time:string}{
 const parts=new Intl.DateTimeFormat('en-GB',{timeZone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(iso));
 const val=(k:string)=>parts.find(p=>p.type===k)?.value||'';
 return {date:`${val('year')}-${val('month')}-${val('day')}`,time:`${val('hour')}:${val('minute')}`};
}
/** Convert a date and clock time in a *specified event time zone* into UTC. */
export function openHouseDateTimeToIso(date:string,time:string,timeZone:string):string{
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!/^\d{2}:\d{2}$/.test(time))throw new Error('Enter a date and time.');
 const [y,m,d]=date.split('-').map(Number),[h,min]=time.split(':').map(Number);
 if(y<2020||m<1||m>12||d<1||d>31||h<0||h>23||min<0||min>59)throw new Error('Invalid date or time.');
 const desired=Date.UTC(y,m-1,d,h,min);if(new Date(desired).toISOString().slice(0,10)!==date)throw new Error('Invalid date.');
 let guess=desired;
 for(let i=0;i<4;i++){
  const parts=openHouseLocalParts(new Date(guess).toISOString(),timeZone);
  const [py,pm,pd]=parts.date.split('-').map(Number),[ph,pmin]=parts.time.split(':').map(Number);
  const actual=Date.UTC(py,pm-1,pd,ph,pmin);
  guess+=desired-actual;
 }
 const iso=new Date(guess).toISOString();
 if(openHouseLocalParts(iso,timeZone).date!==date||openHouseLocalParts(iso,timeZone).time!==time)
  throw new Error('This time does not exist in the selected time zone (daylight saving change).');
 return iso;
}

export const OPEN_HOUSE_POSTER_TEMPLATES=[
 {id:'classic',label:'Classic Green'},
 {id:'modern',label:'Modern Split'},
 {id:'luxury',label:'Luxury Dark'},
 {id:'minimal',label:'Minimal White'},
 {id:'bold',label:'Bold Orange'},
] as const;
export type OpenHousePosterTemplate=typeof OPEN_HOUSE_POSTER_TEMPLATES[number]['id'];
