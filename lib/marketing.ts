export type BuyerSearch={id?:string;user_id?:string;contact_id:string;area:string;max_price:number|null;min_bedrooms:number;enabled:boolean};
export type MatchContact={id:string;full_name:string;email:string;communication_consent:string;preferred_area:string;budget:number|null};
export type MatchingProperty={id:string;published:boolean;payload:{title?:string;address?:string;city?:string;price?:string;beds?:string;status?:string}};
export function matchesProperty(search:Pick<BuyerSearch,'area'|'max_price'|'min_bedrooms'|'enabled'>,home:MatchingProperty){
 if(!search.enabled||!home.published||(home.payload.status||'active')!=='active')return false;
 const areas=search.area.split(',').map(v=>v.trim().toLowerCase()).filter(Boolean);
 const location=[home.payload.city||'',home.payload.address||''].join(' ').toLowerCase();
 if(areas.length&&!areas.some(a=>location.includes(a)))return false;
 const price=Number(home.payload.price||0),beds=Number(home.payload.beds||0);
 if(search.max_price!==null&&(!price||price>search.max_price))return false;
 if(search.min_bedrooms>0&&(!beds||beds<search.min_bedrooms))return false;
 return true;
}
export const adTypes=['Just listed','Just sold','Open house','Price reduction','Buyer leads','Seller leads'] as const;
export type AdType=typeof adTypes[number];
export function suggestAdCopy(type:AdType,property?:MatchingProperty){
 const name=property?.payload.address||property?.payload.title||'your next home';
 const city=property?.payload.city||'your community';
 switch(type){
  case 'Just listed':return {headline:`Just Listed in ${city}`,description:`Explore ${name}. View photos, property details and request a showing.`};
  case 'Just sold':return {headline:`Just Sold in ${city}`,description:`Another successful move in ${city}. Thinking of selling? Ask about your home's value.`};
  case 'Open house':return {headline:`Open House in ${city}`,description:`Explore ${name}. Contact us for the confirmed date and time.`};
  case 'Price reduction':return {headline:`New Price in ${city}`,description:`Explore the updated asking price for ${name}. Contact the listing agent for details.`};
  case 'Buyer leads':return {headline:`Find Your Next Home`,description:`Tell us your preferred area, budget and property type so we can help you explore suitable homes.`};
  case 'Seller leads':return {headline:`Thinking of Selling?`,description:`Request a conversation about your home's potential value and the local market.`};
 }
}
