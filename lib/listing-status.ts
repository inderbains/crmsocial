export type ListingStatus='Active'|'Expired'|'Terminated'|'Sold';
export type ListingTerms={id:string;kind:string;expiry_date:string|null;termination_date:string|null;termination_reason:string|null;listing_status:ListingStatus};
export function brokerageDay(now=new Date()){return new Intl.DateTimeFormat('en-CA',{timeZone:'America/Vancouver',year:'numeric',month:'2-digit',day:'2-digit'}).format(now)}
export function listingStatus(kind:string,expiry:string|null,termination:string|null,today=brokerageDay()):ListingStatus{return kind==='Sale'?'Sold':termination&&termination<=today?'Terminated':expiry&&expiry<today?'Expired':'Active'}
