import {createClient} from 'npm:@supabase/supabase-js@2.89.0';
const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS','Content-Type':'application/json','Cache-Control':'no-store'};
const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers});
Deno.serve(async req=>{
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
 if(req.method!=='POST')return reply({ok:false},405);
 try{
  const token=req.headers.get('Authorization')?.match(/^Bearer (\S+)$/i)?.[1];
  const url=Deno.env.get('SUPABASE_URL'),anon=Deno.env.get('SUPABASE_ANON_KEY'),service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if(!token)return reply({ok:false,message:'Sign in required'},401);
  if(!url||!anon||!service)return reply({ok:false,message:'Server configuration missing'},503);
  const sb=createClient(url,anon,{global:{headers:{Authorization:`Bearer ${token}`}},auth:{persistSession:false,autoRefreshToken:false}});
  const user=await sb.auth.getUser(token);if(user.error||!user.data.user)return reply({ok:false,message:'Invalid session'},401);
  const verified=await sb.rpc('rv_platform_email_verified');if(verified.error||verified.data!==true)return reply({ok:false,message:'Verified owner required'},403);
  const {user_id,action}=await req.json();
  if(typeof user_id!=='string'||!/^[-0-9a-f]{36}$/i.test(user_id)||!['disable','enable'].includes(action)||user_id===user.data.user.id)return reply({ok:false,message:'Invalid action'},400);
  const target=await sb.rpc('rv_platform_management_context',{p_user:user_id});if(target.error||!target.data||target.data.owner!==false)return reply({ok:false,message:'Protected or unavailable account'},403);
  const pre=await sb.rpc('rv_platform_signin_control_audit',{p_user:user_id,p_action:action+' requested'});if(pre.error||pre.data!==true)return reply({ok:false,message:'Action not authorized'},403);
  const admin=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});
  // Auth ban blocks new sign-ins; existing access JWTs and privileged RPCs need separate hardening.
  const result=await admin.auth.admin.updateUserById(user_id,{ban_duration:action==='disable'?'87600h':'none'});
  const audit=await sb.rpc('rv_platform_signin_control_audit',{p_user:user_id,p_action:action+(result.error?' failed':' accepted')});
  if(result.error)return reply({ok:false,message:'Auth rejected the sign-in change.'},502);
  return reply({ok:true,audit_recorded:!audit.error&&audit.data===true,message:action==='disable'?'New sign-ins disabled. Existing sessions are not guaranteed revoked.':'Sign-in ban removed. Other access restrictions may remain.'});
 }catch{return reply({ok:false,message:'Account action failed'},500);}
});
