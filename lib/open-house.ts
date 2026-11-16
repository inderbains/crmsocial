export type OpenHouseEvent = {
 id:string; user_id:string; property_id:string|null; title:string; address:string; city:string;
 starts_at:string; ends_at:string; timezone:string; status:'draft'|'published'|'closed';
 sheet_path:string|null; cover_path:string|null; agent_name:string; agent_email:string;
 agent_phone:string; brokerage_name:string; created_at?:string;
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

export function formatOpenHouseWindow(startIso:string,endIso:string,timeZone='America/Vancouver'){
 const first=formatOpenHouseTime(startIso,timeZone);
 try{return `${first} – ${new Intl.DateTimeFormat('en-CA',{timeZone,hour:'numeric',minute:'2-digit'}).format(new Date(endIso))}`;}
 catch{return first;}
}
