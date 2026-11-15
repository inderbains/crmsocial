/** DDF registry data: a Destination ID is a reference, NEVER a credential. */
export type DdfScope='office'|'agent';
export type DdfStatus='pending_verification'|'authorized'|'paused'|'revoked'|'error';
export type DdfConnection={id:string;brokerage_id:string;owner_user_id:string|null;scope:DdfScope;destination_id:string;member_id:string;status:DdfStatus;last_synced_at:string|null;last_error:string|null;created_at:string};
export type DdfListing={id:string;brokerage_id:string;mls_number:string;address:string;city:string;price:number|null;beds:number|null;baths:number|null;area_sqft:number|null;headline:string;description:string;status:string;photos:unknown;media:unknown;attribution:string;marketing_authorized:boolean;last_seen_at:string;};
export const ddfReferenceValid=(s:string)=>/^[A-Za-z0-9_.-]{3,120}$/.test(s);
export const ddfMemberIdValid=(s:string)=>!s||/^[A-Za-z0-9_.-]{2,120}$/.test(s);
export const ddfStatusLabel=(s:DdfStatus)=>({pending_verification:'Pending approval',authorized:'Authorized',paused:'Paused',revoked:'Revoked',error:'Needs attention'}[s]);
export function listingToDraft(l:DdfListing,agent:string,brokerage:string,accent:string){
 const photos=Array.isArray(l.photos)?l.photos.filter((x):x is string=>typeof x==='string'&&/^https:\/\//.test(x)).slice(0,30):[];
 return {published:false,ddf_listing_id:l.id,payload:{title:l.headline||l.address||`MLS® ${l.mls_number}`,address:l.address,city:l.city,price:l.price===null?'':String(l.price),beds:l.beds===null?'':String(l.beds),baths:l.baths===null?'':String(l.baths),area:l.area_sqft===null?'':String(l.area_sqft),description:l.description,photos,agent,email:'',phone:'',brokerage,accent}};
}
