/** Agent-controlled, public-facing marketing identity. Private billing details stay in office_agents. */
export const AGENT_MEDIA_BUCKET='realvolt-agent-brand-public';
export type AgentMarketingProfile={
 full_name:string; professional_title:string; biography:string; public_email:string; public_phone:string;
 license_number:string; website_url:string; headshot_path:string; logo_path:string;
};
export const emptyAgentMarketingProfile:AgentMarketingProfile={
 full_name:'',professional_title:'REALTOR®',biography:'',public_email:'',public_phone:'',
 license_number:'',website_url:'',headshot_path:'',logo_path:''
};
export function agentMediaUrl(supabaseUrl:string,path:string):string{
 if(!path||!supabaseUrl)return '';
 return `${supabaseUrl.replace(/\/$/,'')}/storage/v1/object/public/${AGENT_MEDIA_BUCKET}/${path.split('/').map(encodeURIComponent).join('/')}`;
}
export function safeWebsite(url:string):boolean{
 if(!url.trim())return true;
 try{const parsed=new URL(url.trim());return ['https:','http:'].includes(parsed.protocol)}catch{return false}
}
