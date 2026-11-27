import {createClient} from 'npm:@supabase/supabase-js@2.89.0';
import Stripe from 'npm:stripe@17.7.0';
import nodemailer from 'npm:nodemailer@^9';
const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS'};
const reply=(v:unknown,status=200)=>new Response(JSON.stringify(v),{status,headers:{...cors,'Content-Type':'application/json'}});
Deno.serve(async(req:Request)=>{if(req.method==='OPTIONS')return new Response('ok',{headers:cors});if(req.method!=='POST')return reply({error:'POST required'},405);
try{const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}}),token=req.headers.get('Authorization')?.replace(/^Bearer /i,'');if(!token)return reply({error:'Sign in required'},401);const u=await db.auth.getUser(token);if(u.error||!u.data.user)return reply({error:'Invalid session'},401);
const body=await req.json(),p=await db.from('office_agents').select('*').eq('id',body.profile_id).single();if(p.error)return reply({error:'Agent unavailable'},404);const a=p.data;
const m=await db.from('brokerage_members').select('*').eq('user_id',u.data.user.id).single();const admin=m.data?.role==='admin'&&m.data.brokerage_id===a.brokerage_id;
const app=Deno.env.get('APP_URL');if(!app)return reply({error:'Configure APP_URL'},503);
if(body.action==='invite'){if(!admin)return reply({error:'Brokerage admin required'},403);if(a.status!=='Invited'||a.user_id)return reply({error:'Agent already enrolled'},409);
 const inviteUrl=new URL(app.replace(/\/+$/, '')+'/accept-invitation/');
 if(inviteUrl.protocol!=='https:'||inviteUrl.username||inviteUrl.password||inviteUrl.search||inviteUrl.hash)return reply({error:'APP_URL must be the deployed HTTPS application base URL'},503);
 // Service-only RPC checks the exact invitation, administrator, and existing Auth identity.
 const pre=await db.rpc('rv_invitation_preflight_092',{p_profile:a.id,p_admin:u.data.user.id});
 if(pre.error)return reply({error:'Invitation unavailable or email already registered. Use a new email or contact platform support.'},409);
 let invitedUid=pre.data as string|null;
 if(!invitedUid){
   const created=await db.auth.admin.createUser({email:a.email,email_confirm:false,app_metadata:{rv_invite_profile:a.id}});
   if(created.error||!created.data.user)return reply({error:'This email could not be reserved. It may already be registered. Use a different email or contact platform support.'},409);
   invitedUid=created.data.user.id;
 }
 // Recheck after creation. Never issue a magic link to an unrelated existing account.
 const checked=await db.rpc('rv_invitation_preflight_092',{p_profile:a.id,p_admin:u.data.user.id});
 if(checked.error||checked.data!==invitedUid)return reply({error:'Invitation identity could not be verified.'},409);
 const renewed=await db.from('office_agents').update({invitation_expires_at:new Date(Date.now()+14*86400000).toISOString()}).eq('id',a.id).eq('status','Invited').is('user_id',null).select('id').maybeSingle();
 if(renewed.error||!renewed.data)return reply({error:'Invitation no longer pending.'},409);
 const link=await db.auth.admin.generateLink({type:'magiclink',email:a.email,options:{redirectTo:inviteUrl.toString()}});
 if(link.error||link.data.user.id!==invitedUid||link.data.user.app_metadata?.rv_invite_profile!==a.id)return reply({error:'Could not create a secure invitation for the selected agent.'},409);
 const hash=link.data.properties.hashed_token;if(!hash)return reply({error:'Could not create a secure invitation'},502);
 inviteUrl.searchParams.set('invite',a.id);
 // Keep the one-time token out of server request URLs. The activation page exchanges it only after a deliberate click.
 inviteUrl.hash=new URLSearchParams({token_hash:hash}).toString();
 // The invitation link is sensitive: it must only be sent through the selected provider,
 // never returned to the browser, stored in logs, or included in debug messages.
 const inviteText=`Hello ${a.full_name},\n\nYour brokerage has invited you to RealVolt. Open the secure link to verify your email, create a password and accept your brokerage invitation:\n\n${inviteUrl.toString()}\n\nOnce signed in, review your commission plan and fees securely inside RealVolt.\n\nIf you did not expect this invitation, contact your brokerage.`;
 const provider=(Deno.env.get('INVITATION_EMAIL_PROVIDER')||'resend').trim().toLowerCase();
 if(provider==='gmail'){
   const gmailUser=(Deno.env.get('GMAIL_SMTP_USER')||'').trim();
   const gmailPassword=(Deno.env.get('GMAIL_APP_PASSWORD')||'').replace(/\s+/g,'');
   if(!gmailUser||!gmailPassword) return reply({error:'Configure GMAIL_SMTP_USER and GMAIL_APP_PASSWORD in Supabase Edge Function Secrets'},503);
   if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(gmailUser)) return reply({error:'Invalid Gmail sender email'},503);
   const smtp=nodemailer.createTransport({
     host:'smtp.gmail.com', port:465, secure:true,
     auth:{user:gmailUser,pass:gmailPassword},
     connectionTimeout:15000, greetingTimeout:15000, socketTimeout:20000,
     tls:{servername:'smtp.gmail.com'}
   });
   try{
     const receipt=await smtp.sendMail({
       from:{name:'RealVolt Invitations',address:gmailUser},to:a.email,
       subject:'Your brokerage invitation to RealVolt', text:inviteText
     });
     if(!receipt.accepted?.length) throw new Error('Recipient was not accepted');
   }catch(e){
     // Do not expose SMTP credentials or links through server logs or the response.
     return reply({error:'Gmail could not send the invitation. Check Gmail 2-Step Verification, App Password, and Edge Function logs.'},502);
   }finally{ smtp.close(); }
 }else if(provider==='resend'){
   const key=Deno.env.get('RESEND_API_KEY'),from=Deno.env.get('CLOSING_FROM_EMAIL');
   if(!key||!from) return reply({error:'Configure invitation email sender'},503);
   const r=await fetch('https://api.resend.com/emails',{
     method:'POST',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json','Idempotency-Key':'agent-invite/'+a.id+'/'+String(body.request_id||crypto.randomUUID())},
     body:JSON.stringify({from,to:[a.email],subject:'Your brokerage invitation to RealVolt',text:inviteText})
   });
   if(!r.ok) return reply({error:'Invitation email was rejected by Resend'},502);
 }else{return reply({error:'Set INVITATION_EMAIL_PROVIDER to gmail or resend'},503)}
 const saved=await db.from('office_agents').update({invitation_sent_at:new Date().toISOString()}).eq('id',a.id);if(saved.error)throw saved.error;return reply({status:'Invitation email accepted by provider'})}
if(!['checkout','portal'].includes(body.action))return reply({error:'Invalid action'},400);
if(a.user_id!==u.data.user.id||a.status!=='Active')return reply({error:'Only the enrolled agent can manage their card'},403);
if(a.billing_method!=='Credit card')return reply({error:'This plan uses cheque deductions'},409);
const config=await db.from('brokerage_payment_accounts').select('*').eq('brokerage_id',a.brokerage_id).single();if(config.error)return reply({error:'Configure the brokerage payment account'},503);const tax=config.data.tax_rate_id,options=config.data.stripe_account_id?{stripeAccount:config.data.stripe_account_id}:{};const secret=Deno.env.get('STRIPE_SECRET_KEY');if(!secret||!tax)return reply({error:'Configure Stripe and the GST tax rate'},503);const stripe=new Stripe(secret,{httpClient:Stripe.createFetchHttpClient()});const rate=await stripe.taxRates.retrieve(tax,options);if(rate.inclusive||Number(rate.percentage)!==Number(a.fee_gst_rate))return reply({error:'Configured Stripe tax rate must match the agent fee GST rate and be exclusive'},409);let acct=(await db.from('agent_card_accounts').select('*').eq('profile_id',a.id).maybeSingle()).data;
if(!acct){const customer=await stripe.customers.create({email:a.email,name:a.full_name,metadata:{office_agent_id:a.id,brokerage_id:a.brokerage_id}},{...options,idempotencyKey:'office-customer/'+a.id});const saved=await db.from('agent_card_accounts').upsert({profile_id:a.id,customer_id:customer.id});if(saved.error)throw saved.error;acct={customer_id:customer.id}}
if(body.action==='portal'){const portal=await stripe.billingPortal.sessions.create({customer:acct.customer_id,return_url:app},options);return reply({url:portal.url})}
if(acct.subscription_id)return reply({error:'A subscription already exists. Use Manage card.'},409);
const items=[['Office fee',a.monthly_office_fee],['Software fee',a.monthly_software_fee],['Board fee',a.monthly_board_fee]].filter(([,v])=>Number(v)>0).map(([name,v])=>({price_data:{currency:'cad',product_data:{name:String(name)},unit_amount:Math.round(Number(v)*100),recurring:{interval:'month' as const}},quantity:1,tax_rates:[tax]}));
if(!items.length)return reply({error:'No monthly fees configured'},400);
if(acct.checkout_session){const previous=await stripe.checkout.sessions.retrieve(acct.checkout_session,options);if(previous.status==='open')return reply({url:previous.url});if(previous.status==='complete')return reply({error:'Subscription is being finalized. Refresh shortly.'},409)}
const session=await stripe.checkout.sessions.create({mode:'subscription',customer:acct.customer_id,payment_method_types:['card'],line_items:items,client_reference_id:a.id,metadata:{office_agent_id:a.id},subscription_data:{metadata:{office_agent_id:a.id}},success_url:app+'/?billing=success',cancel_url:app+'/?billing=cancelled'},{...options,idempotencyKey:'office-checkout/'+a.id+'/'+(acct.checkout_session||'initial')});
const saved=await db.from('agent_card_accounts').update({checkout_session:session.id}).eq('profile_id',a.id);if(saved.error)throw saved.error;return reply({url:session.url});
}catch(e){return reply({error:e instanceof Error?e.message:'Operation failed'},400)}});
