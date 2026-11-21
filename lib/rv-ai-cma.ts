/** Transparent, deterministic CMA arithmetic. This is NOT an automated appraisal. */
export type Comparable={address:string;soldPrice:number;areaSqft:number;soldDate:string};
export type CmaInputs={address:string;areaSqft:number;bedrooms:number;bathrooms:number;comparables:Comparable[]};
export type CmaResult={estimate:number;low:number;high:number;medianPricePerSqft:number;sampleCount:number;methodology:string;comparables:Comparable[];warnings:string[]};
const median=(a:number[])=>{const s=[...a].sort((x,y)=>x-y);return s.length%2?s[Math.floor(s.length/2)]:(s[s.length/2-1]+s[s.length/2])/2};
export function computeCma(v:CmaInputs):CmaResult{
 if(!v.address?.trim()||v.address.length>200)throw new Error('Enter the subject address.');
 if(!Number.isFinite(v.areaSqft)||v.areaSqft<200||v.areaSqft>30000)throw new Error('Enter valid subject finished square footage.');
 if(!Number.isInteger(v.bedrooms)||v.bedrooms<0||v.bedrooms>30||!Number.isFinite(v.bathrooms)||v.bathrooms<0||v.bathrooms>30)throw new Error('Enter valid bedroom and bathroom counts.');
 if(!Array.isArray(v.comparables)||v.comparables.length<3||v.comparables.length>12)throw new Error('Enter 3–12 verified sold comparable properties.');
 const warnings:string[]=[];
 for(const c of v.comparables){
  if(!c.address?.trim()||c.address.length>200||!Number.isFinite(c.soldPrice)||c.soldPrice<10000||c.soldPrice>100000000||!Number.isFinite(c.areaSqft)||c.areaSqft<200||c.areaSqft>30000)throw new Error('Check each comparable address, verified sale price and floor area.');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(c.soldDate)||!Number.isFinite(Date.parse(c.soldDate))||c.soldDate>new Date().toISOString().slice(0,10))throw new Error('Comparable sale dates must be valid and not in the future.');
  if(Date.now()-Date.parse(c.soldDate+'T00:00:00Z')>180*86400000)warnings.push('One or more sales are older than six months; review current market conditions.');
 }
 const pricePerSqft=median(v.comparables.map(c=>c.soldPrice/c.areaSqft));
 const estimate=Math.round(pricePerSqft*v.areaSqft/1000)*1000;
 return {estimate,low:Math.round(estimate*.92/1000)*1000,high:Math.round(estimate*1.08/1000)*1000,
  medianPricePerSqft:Math.round(pricePerSqft),sampleCount:v.comparables.length,
  methodology:'Median sold price per finished square foot × subject finished area. ±8% illustrative range only. No adjustments for lot, condition, location, renovations, time or property rights.',
  comparables:v.comparables,warnings:[...new Set(warnings),'Agent must verify comparable sales, adjustments and local market evidence. Not a formal appraisal.']};
}
