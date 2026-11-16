/** Office lead-routing preview only. Actual assignments require trusted backend enforcement. */
export type OfficeRulePreview={agent_user_id:string;area:string;min_price:number|null;max_price:number|null;max_open_leads:number;enabled:boolean};
export function eligibleRules(rules:OfficeRulePreview[],area:string,price:number|null){
 const location=area.trim().toLowerCase();
 return rules.filter(rule=>{
  if(!rule.enabled)return false;
  const areas=rule.area.split(',').map(a=>a.trim().toLowerCase()).filter(Boolean);
  if(areas.length&&(!location||!areas.some(a=>location.includes(a)||a.includes(location))))return false;
  if(rule.min_price!==null&&(price===null||price<rule.min_price))return false;
  if(rule.max_price!==null&&(price===null||price>rule.max_price))return false;
  return true;
 });
}
