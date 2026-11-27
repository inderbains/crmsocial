import {createClient} from 'npm:@supabase/supabase-js@2.89.0';
import nodemailer from 'npm:nodemailer@^9';
const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS','Cache-Control':'no-store'};
const reply=(ok:boolean,status=200)=>new Response(JSON.stringify({ok}),{status,headers:{...cors,'Content-Type':'application/json'}});
function code(){const a=new Uint32Array(1);do{crypto.getRandomValues(a);}while(a[0]>=4294000000);return String(a[0]%1000000).padStart(6,'0');}
Deno.serve(async req=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers:cors});if(req.method!=='POST')return reply(false,405);
 try{
  const token=req.headers.get('Authorization')?.replace(/^Bearer /i,'');if(!token)return reply(false,401);
  const url=Deno.env.get('SUPABASE_URL')!,key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,anon=Deno.env.get('SUPABASE_ANON_KEY')!;
  const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
  const auth=createClient(url,anon,{global:{headers:{Authorization:`Bearer ${token}`}},auth:{persistSession:false,autoRefreshToken:false}});
  const u=await db.auth.getUser(token);if(u.error||!u.data.user)return reply(false,403);
  const allowed=await auth.rpc('rv_platform_email_context');if(allowed.error||allowed.data!==true)return reply(false,403);
  // Token is checked by Auth and the user-scoped RPC before reading its session claim.
  const encoded=token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/');
  const claims=JSON.parse(atob(encoded.padEnd(Math.ceil(encoded.length/4)*4,'=')));
  const session=claims.session_id;if(claims.sub!==u.data.user.id||typeof session!=='string'||!u.data.user.email)return reply(false,403);
  const otp=code();const issued=await db.rpc('rv_platform_email_issue',{p_user:u.data.user.id,p_session:session,p_code:otp});
  if(issued.error||issued.data!==true)return reply(false,429);
  const text=`Your RealVolt platform administrator verification code is ${otp}. It expires in 10 minutes. Do not share this code. If you did not request it, change your password and review your account security.`;
  const subject='RealVolt admin verification code';
  const provider=(Deno.env.get('PLATFORM_EMAIL_PROVIDER')||Deno.env.get('INVITATION_EMAIL_PROVIDER')||'resend').trim().toLowerCase();
  if(provider==='gmail'){
   const user=(Deno.env.get('GMAIL_SMTP_USER')||'').trim(),pass=(Deno.env.get('GMAIL_APP_PASSWORD')||'').replace(/\s+/g,'');if(!user||!pass)return reply(false,503);
   const smtp=nodemailer.createTransport({host:'smtp.gmail.com',port:465,secure:true,auth:{user,pass},connectionTimeout:15000,greetingTimeout:15000,socketTimeout:20000,tls:{servername:'smtp.gmail.com'}});
   try{const r=await smtp.sendMail({from:{name:'RealVolt Security',address:user},to:u.data.user.email,subject,text});if(!r.accepted?.length)return reply(false,502);}finally{smtp.close();}
  }else if(provider==='resend'){
   const key=Deno.env.get('RESEND_API_KEY'),from=Deno.env.get('CLOSING_FROM_EMAIL');if(!key||!from)return reply(false,503);
   const r=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify({from,to:[u.data.user.email],subject,text})});if(!r.ok)return reply(false,502);
  }else return reply(false,503);
  return reply(true);
 }catch{return reply(false,502);}
});
