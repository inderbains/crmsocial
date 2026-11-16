/** RealVolt ad-draft helpers. This module NEVER publishes an ad or sends data to Meta. */
export type CampaignGoal='website_visits'|'instant_leads';
export type PlannedChannel='Facebook'|'Instagram';
export type PlannedCta='LEARN_MORE'|'CONTACT_US'|'BOOK_NOW'|'SIGN_UP';
export const campaignGoals:{value:CampaignGoal;label:string;description:string}[]=[
 {value:'website_visits',label:'Property website visits',description:'Direct visitors to an authorized property website or lead page'},
 {value:'instant_leads',label:'Meta instant lead form',description:'Prepare lead-form messaging; actual form creation requires Meta authorization'},
];
export const ctaLabels:Record<PlannedCta,string>={LEARN_MORE:'Learn more',CONTACT_US:'Contact us',BOOK_NOW:'Book now',SIGN_UP:'Sign up'};
export function validHttpsDestination(value:string){
 if(!value.trim())return false;
 try{const u=new URL(value);return u.protocol==='https:'&&!!u.hostname&&!u.username&&!u.password;}catch{return false;}
}
/** Counting days inclusively gives a budget estimate, not an actual charge or Meta forecast. */
export function estimatedBudget(dailyBudget:number,start:string|null,end:string|null){
 if(!start||!end||!Number.isFinite(dailyBudget)||dailyBudget<=0)return null;
 const first=Date.parse(start+'T12:00:00Z'),last=Date.parse(end+'T12:00:00Z');
 if(!Number.isFinite(first)||!Number.isFinite(last)||last<first)return null;
 const days=Math.round((last-first)/86_400_000)+1;
 if(days>366)return null;
 return Math.round(days*dailyBudget*100)/100;
}
/** Stock/sample imagery is never accepted as a publish-ready ad creative. */
export function authorizedCreative(payload:{photo?:string;photoSource?:string}|null|undefined){
 if(!payload)return false;
 return (payload.photoSource==='upload'||payload.photoSource==='property') && !!payload.photo?.trim();
}
export function readinessIssues(p:{campaign_name:string;headline:string;description:string;campaign_goal:CampaignGoal;destination_url:string;planned_start:string|null;planned_end:string|null;daily_budget:number;placements:PlannedChannel[]},creative:{photo?:string;photoSource?:string}|null|undefined){
 const issues:string[]=[];
 if(!p.campaign_name.trim()||!p.headline.trim()||!p.description.trim())issues.push('Add a campaign name, headline and caption');
 if(!Number.isFinite(p.daily_budget)||p.daily_budget<=0)issues.push('Enter a positive daily budget');
 if(!p.placements.length)issues.push('Choose Facebook or Instagram');
 if(p.campaign_goal==='website_visits'&&!validHttpsDestination(p.destination_url))issues.push('Add an HTTPS landing-page URL');
 if(p.campaign_goal==='instant_leads')issues.push('Meta instant form is pending authorization — keep as draft');
 if(p.planned_start&&p.planned_end&&p.planned_end<p.planned_start)issues.push('End date cannot be before start date');
 if(!authorizedCreative(creative))issues.push('Choose an authorized property image from Design Studio');
 return issues;
}
