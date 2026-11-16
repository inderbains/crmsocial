export type Brand={name:string;website:string;color:string};
export type DesignFormat='square'|'portrait'|'story';
export const designFormats:Record<DesignFormat,{label:string;width:number;height:number}>={
 square:{label:'Square post · 1080 × 1080',width:1080,height:1080},
 portrait:{label:'Portrait post · 1080 × 1350',width:1080,height:1350},
 story:{label:'Story / Reel cover · 1080 × 1920',width:1080,height:1920},
};
export function designSize(format?:string){return designFormats[(format||'square') as DesignFormat]||designFormats.square;}
export function exportFilename(draft:Draft){const subject=(draft.listingAddress||draft.title||'social-design').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,55)||'social-design';return `realvolt-${subject}-${draft.format||'square'}.png`;}

/** All new fields are optional to keep old social_drafts payloads readable. */
export type Draft={
  _id?:string;template:number;title:string;caption:string;platform:string;date:string;photo:string;
  listingId?:string;listingAddress?:string;listingPrice?:string;
  beds?:string;baths?:string;propertyArea?:string;
  agentName?:string;agentPhone?:string;agentEmail?:string;brokerageName?:string;
  format?:DesignFormat;accentColor?:string;callToAction?:string;subheading?:string;
  agentPhoto?:string;brokerageLogo?:string;showAgent?:boolean;showPrice?:boolean;
  photoGallery?:string[];photoSource?:'sample'|'upload'|'property';
  /** Planning-only fields; live Meta publishing is not enabled. */
  channels?:Array<'Facebook'|'Instagram'>;
  scheduleStatus?:'draft'|'planned'|'ready'|'archived';
  scheduleTimezone?:string;

};
export const defaultBrand:Brand={name:'Your brand',website:'yourwebsite.com',color:'#235e49'};
export const photos=['https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=1000&auto=format&fit=crop','https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?w=1000&auto=format&fit=crop','https://images.unsplash.com/photo-1600607687920-4e2a09cf159d?w=1000&auto=format&fit=crop','https://images.unsplash.com/photo-1600047509807-ba8f99d2cdde?w=1000&auto=format&fit=crop'];
// IMPORTANT: append instead of reordering. Existing drafts store a numeric template ID.
export const templates=[
 {name:'The Modern Listing',category:'Just listed',title:'A new place. A new beginning.',style:'',photo:0},
 {name:'Open Door',category:'Open house',title:'Come on in.',style:'editorial',photo:1},
 {name:'A Beautiful Next Chapter',category:'Just sold',title:'Made a move. Made it home.',style:'dark',photo:2},
 {name:'Local Perspective',category:'Market update',title:'Your market. In focus.',style:'',photo:3},
 {name:'Quiet Luxury',category:'Just listed',title:'Extraordinary every day.',style:'dark',photo:0},
 {name:'Sunday Showing',category:'Open house',title:'Find your next chapter.',style:'',photo:2},
 {name:'The Closing Note',category:'Just sold',title:'Another home. Another story.',style:'editorial',photo:3},
 {name:'Neighbourhood Notes',category:'Education',title:'Good advice. Great moves.',style:'editorial',photo:1},
 {name:'Price Improvement',category:'Price reduction',title:'A NEW PRICE. NEW POSSIBILITIES.',style:'dark',photo:2},
 {name:'Home Value Campaign',category:'Seller leads',title:'WHAT IS YOUR HOME WORTH?',style:'editorial',photo:0},
 {name:'Buyer Search Campaign',category:'Buyer leads',title:'YOUR NEXT HOME STARTS HERE.',style:'',photo:1},
 {name:'Just Listed Ad',category:'Meta ads',title:'JUST LISTED. BOOK YOUR TOUR.',style:'dark',photo:0},
 {name:'Just Sold Ad',category:'Meta ads',title:'JUST SOLD. WHAT ABOUT YOUR HOME?',style:'editorial',photo:3},
 {name:'Signature Just Listed',category:'Just listed',title:'JUST LISTED',style:'signature',photo:0},
 {name:'Signature Just Sold',category:'Just sold',title:'JUST SOLD',style:'signature',photo:2},
 {name:'Open House Spotlight',category:'Open house',title:'OPEN HOUSE',style:'signature',photo:1},
 {name:'Luxury Collection',category:'Just listed',title:'WELCOME HOME',style:'luxury',photo:3},
 {name:'New Price Alert',category:'Price reduction',title:'NEW PRICE',style:'signature',photo:2},
 {name:'Sell With Confidence',category:'Seller leads',title:'YOUR HOME. OUR EXPERTISE.',style:'luxury',photo:0},
 {name:'Find Your Next Home',category:'Buyer leads',title:'LET’S FIND YOUR NEXT HOME',style:'signature',photo:1},
 {name:'Meta Listing Campaign',category:'Meta ads',title:'TOUR THIS HOME',style:'signature',photo:0},
 {name:'Market Snapshot',category:'Market update',title:'THE MARKET AT A GLANCE',style:'luxury',photo:3},
 ];
export function newDraft(template:number):Draft{
 const t=templates[template]||templates[0];
 return {template,title:t.title,caption:'Interested in this property? Contact me for details and to book a private showing.\n\n#RealEstate #SurreyHomes',platform:'Instagram',channels:['Instagram'],scheduleStatus:'draft',date:'',photo:photos[t.photo],photoSource:'sample',format:'square',callToAction:'BOOK A SHOWING',showAgent:true,showPrice:!(t.category==='Just sold'||/just sold/i.test(t.name))};
}
/** Build a ready-to-edit post from a property owned by the signed-in agent. */
export function draftFromProperty(base:Draft, id:string, property:{address?:string;city?:string;price?:string;beds?:string;baths?:string;area?:string;agent?:string;phone?:string;email?:string;brokerage?:string;photos?:string[]}):Draft{
 const addr=[property.address,property.city].filter(Boolean).join(', ');
 const formatted=property.price&&Number(property.price)>0?'$'+Number(property.price).toLocaleString('en-CA'):'';
 return {...base,listingId:id,listingAddress:addr,listingPrice:formatted,
  beds:property.beds||'',baths:property.baths||'',propertyArea:property.area||'',
  agentName:property.agent||'',agentPhone:property.phone||'',agentEmail:property.email||'',brokerageName:property.brokerage||'',
  photo:property.photos?.[0]||base.photo,photoGallery:property.photos||[],photoSource:property.photos?.length?'property':base.photoSource,
  caption:[base.title,addr,formatted,'Contact '+(property.agent||'me')+' to learn more or request a showing.',(templates[base.template]?.category==='Just sold'||/just sold/i.test(templates[base.template]?.name||''))?'#RealEstate #JustSold':'#RealEstate #JustListed'].filter(Boolean).join('\n')};
}
