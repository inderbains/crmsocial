import {createClient} from 'npm:@supabase/supabase-js@2.89.0';
import nodemailer from 'npm:nodemailer@^9';
import {packetTexts} from '../_shared/calculations.mjs';
import {textPDF} from '../_shared/pdf.mjs';
const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS'};
const reply=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers:{...cors,'Content-Type':'application/json'}});
const safeLabel=(label:string)=>/^(Signed purchase and sale contract|Commission disclosure|Disclosure of services \/ representation|Signed subject removal \/ unconditional contract|Title search|Property Disclosure Statement \(PDS\)|Contract addendum \(if applicable\)|Subject extension or other addendum \(if applicable\)|Closing addendum \(if applicable\))(?:$| — additional )/i.test(label);
const forbiddenFile=/(?:commission[ _.-]*statement|commission[ _.-]*payable|internal|agent[ _.-]*(?:commission|payout|expense|gst)|office[ _.-]*fee|identity|fintrac|(?:^|[ _.-])(?:id|ids)(?:[ _.-]|$))/i;
const base64=(bytes:Uint8Array)=>{let s='';for(const n of bytes)s+=String.fromCharCode(n);return btoa(s)};
Deno.serve(async(req:Request)=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers:cors});
 if(req.method!=='POST')return reply({error:'POST required'},405);
 try{
 const token=req.headers.get('Authorization')?.replace(/^Bearer /i,'');if(!token)return reply({error:'Sign in required'},401);
 const url=Deno.env.get('SUPABASE_URL')!,key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
 const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
 const auth=await db.auth.getUser(token);if(auth.error||!auth.data.user)return reply({error:'Invalid session'},401);
 const body=await req.json();if(!['preview','send','commission_statement'].includes(body.action)||(body.action!=='commission_statement'&&!['buyer','seller'].includes(body.side)))return reply({error:'Invalid action or lawyer side'},400);
 const deal=await db.from('deal_files').select('*').eq('id',body.deal_id).single();if(deal.error)return reply({error:'Transaction unavailable'},404);const d=deal.data;
 const member=await db.from('brokerage_members').select('*').eq('user_id',auth.data.user.id).single();
 const owner=await db.from('brokerage_members').select('*').eq('user_id',d.user_id).single();
 const assignment=await db.from('transaction_reviewers').select('admin_id').eq('agent_id',d.user_id).single();
 if(member.error||owner.error||assignment.error||member.data.role!=='admin'||member.data.brokerage_id!==d.brokerage_id||owner.data.brokerage_id!==d.brokerage_id||assignment.data.admin_id!==auth.data.user.id)return reply({error:'Only the assigned admin in this brokerage can prepare or send closing documents'},403);
 if(d.kind!=='Sale'||!['Sold','Completed'].includes(d.rv_stage)||d.review_status!=='Approved')return reply({error:'Approve the firm sale before preparing closing documents'},409);
 if(body.action==='commission_statement'){
  if(d.rv_stage!=='Completed'||!d.rv_funds_verified||!d.rv_completion_letter||!d.rv_completed_date||d.rv_deleted_at)return reply({error:'Confirm legal completion and actual commission receipt first'},409);
  const result=await db.from('agent_payouts').select('id,deal_id,brokerage_id,profile_id,gross,gst,deductions,net,status,paid_date,payment_reference,ledger_id').eq('deal_id',d.id).eq('brokerage_id',d.brokerage_id).maybeSingle();
  if(result.error)throw result.error;const p=result.data;
  if(!p||p.status!=='Paid')return reply({status:'awaiting_payment'});
  if(!p.paid_date||!p.ledger_id)return reply({error:'Recorded payout is missing a payment date or accounting entry'},409);
  const agent=await db.from('office_agents').select('full_name').eq('id',p.profile_id).eq('brokerage_id',d.brokerage_id).eq('user_id',d.user_id).single();if(agent.error)throw agent.error;
  const brokerage=await db.from('brokerages').select('name').eq('id',d.brokerage_id).single();if(brokerage.error)throw brokerage.error;
  const path=`rv-system/${d.id}/completion/commission-${p.id}.pdf`;
  const existing=await db.from('deal_documents').select('id').eq('deal_id',d.id).eq('path',path).maybeSingle();if(existing.error)throw existing.error;
  const cad=(n:unknown)=>new Intl.NumberFormat('en-CA',{style:'currency',currency:'CAD'}).format(Number(n));
  const lines=['REALVOLT | PRIVATE BROKERAGE RECORD','INTERNAL COMMISSION PAYABLE STATEMENT','',`Brokerage: ${brokerage.data.name}`,`Realtor: ${agent.data.full_name}`,`Property: ${d.address}`,`Transaction: ${d.transaction_number||d.id}`,`Legal completion: ${d.rv_completed_date||'-'}`,'',`Agent commission: ${cad(p.gross)}`,`GST: ${cad(p.gst)}`,`Deductions: ${cad(p.deductions)}`,`Net payment recorded: ${cad(p.net)}`,'',`Payment date: ${p.paid_date}`,`Payment reference: ${p.payment_reference||'-'}`,`Payout ID: ${p.id}`,'','Confidential - for this brokerage and assigned agent only.','Figures reflect the recorded payout; not confirmation of bank clearance.'];
  if(!existing.data){
   const bytes=await textPDF(lines.join('\n'),`${p.paid_date}T00:00:00Z`);
   const uploaded=await db.storage.from('transaction-files').upload(path,bytes,{contentType:'application/pdf',upsert:false});
   if(uploaded.error){const already=await db.storage.from('transaction-files').download(path);if(already.error)throw uploaded.error;}
  }
  const registered=await db.rpc('rv099_register_statement',{p_deal:d.id,p_actor:auth.data.user.id,p_payout:p.id});if(registered.error)throw registered.error;
  return reply({status:'saved',document_id:registered.data,created:!existing.data});
 }
 const b=await db.from('brokerages').select('*').eq('id',d.brokerage_id).single();if(b.error)throw b.error;
 const extra=String(body.instructions||'').trim();if(extra.length>8000)return reply({error:'Instructions are too long'},400);
 const template=await db.from('office_document_templates').select('*').eq('brokerage_id',d.brokerage_id).maybeSingle();if(template.error)throw template.error;const texts=packetTexts(d,{...b.data,...template.data},body.side,extra),recipient=d[body.side+'_lawyer'];
 const attachments=[];for(const [name,text] of Object.entries(texts))attachments.push({filename:name==='cir'?'Commission_Instruction_Report.pdf':'Letter_to_Complete.pdf',content:base64(await textPDF(text as string))});
 const ids=Array.isArray(body.document_ids)?[...new Set(body.document_ids.map(String))].sort():[];if(ids.length>20)return reply({error:'Select up to 20 additional files'},400);
 let total=0;
 for(const id of ids){const doc=await db.from('deal_documents').select('*').eq('id',id).eq('deal_id',d.id).single();if(doc.error)return reply({error:'An attachment is not part of this transaction'},400);const verified=await db.from('deal_requirements').select('label,verified').eq('deal_id',d.id).eq('document_id',id);if(verified.error||!verified.data?.some(r=>r.verified&&safeLabel(r.label))||verified.data.some(r=>!safeLabel(r.label)))return reply({error:'Select only verified conveyancing categories; private IDs and internal records cannot be emailed'},400);if(forbiddenFile.test(doc.data.name))return reply({error:'Internal or identity documents cannot be attached to conveyancing emails'},400);const file=await db.storage.from('transaction-files').download(doc.data.path);if(file.error)throw file.error;total+=file.data.size;if(total>10*1024*1024)return reply({error:'Email attachments must total 10 MB or less'},400);attachments.push({filename:doc.data.name,content:base64(new Uint8Array(await file.data.arrayBuffer()))})}
 const provider=(Deno.env.get('CLOSING_EMAIL_PROVIDER')||'resend').trim().toLowerCase();
 const gmailUser=(Deno.env.get('GMAIL_SMTP_USER')||'').trim();
 const gmailPassword=(Deno.env.get('GMAIL_APP_PASSWORD')||'').replace(/\s+/g,'');
 const mailbox=(v:unknown)=>typeof v==='string'&&/^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(v);
 if(!mailbox(recipient.email))return reply({error:'The saved lawyer email must contain one valid email address'},400);
 const payload={from:provider==='gmail'?gmailUser:(Deno.env.get('CLOSING_FROM_EMAIL')||''),reply_to:b.data.email,to:[recipient.email],subject:`${d.address} — CIR and completion instructions`,text:`Dear ${recipient.name},\n\nPlease find the Commission Instruction Report, letter to complete and selected transaction documents attached.\n\n${b.data.name}`,attachments};
 const canonical=JSON.stringify(payload),hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(canonical)))).map(n=>n.toString(16).padStart(2,'0')).join('');
 if(body.action==='preview')return reply({recipient:{name:recipient.name,email:recipient.email,side:body.side},attachments:attachments.slice(0,2),cir:texts.cir,letter:texts.letter,preview_hash:hash,additional_files:ids.length,subject:payload.subject,sender:payload.from,reply_to:payload.reply_to||'',text:payload.text,attachment_names:attachments.map(a=>a.filename)});
 if(body.preview_hash!==hash)return reply({error:'The file or recipients changed. Preview the documents again before sending.'},409);
 const apiKey=Deno.env.get('RESEND_API_KEY');if(!['gmail','resend'].includes(provider)||(provider==='gmail'?(!gmailUser||!gmailPassword):!apiKey)||!payload.from||!mailbox(b.data.email)||(provider==='gmail'&&!mailbox(gmailUser)))return reply({error:'Configure the email sender and brokerage reply-to email before sending'},503);
 const requestKey=`closing/${d.id}/${body.side}/${hash}`;
 const existing=await db.from('closing_deliveries').select('*').eq('request_key',requestKey).maybeSingle();if(existing.error)throw existing.error;
 if(existing.data?.status==='accepted')return reply({status:'accepted',id:existing.data.provider_id,duplicate:true});
 if(provider==='gmail'){
  if(existing.data)return reply({error:'An earlier identical send is not confirmed. Check correspondence history and the sending mailbox before another attempt; SMTP cannot guarantee idempotency.'},409);
  const log=await db.from('closing_deliveries').insert({deal_id:d.id,brokerage_id:d.brokerage_id,side:body.side,recipient_email:recipient.email,recipient_name:recipient.name,request_key:requestKey,payload_hash:hash,payload,status:'pending',created_by:auth.data.user.id});
  if(log.error)return reply({error:log.error.code==='23505'?'An identical email is already being processed. Check history.':'Could not record the email attempt; nothing sent.'},409);
  const smtp=nodemailer.createTransport({host:'smtp.gmail.com',port:465,secure:true,auth:{user:gmailUser,pass:gmailPassword},connectionTimeout:15000,greetingTimeout:15000,socketTimeout:20000,tls:{servername:'smtp.gmail.com'}});
  let receipt;
  try{
   receipt=await smtp.sendMail({from:gmailUser,replyTo:b.data.email,to:recipient.email,subject:payload.subject,text:payload.text,attachments:attachments.map(a=>({filename:a.filename,content:a.content,encoding:'base64'}))});
  }catch(e){
   const code=Number((e as {responseCode?:number})?.responseCode);
   const rejected=Number.isFinite(code)&&code>=400&&code<600;
   await db.from('closing_deliveries').update({status:rejected?'failed':'pending',error:rejected?'SMTP rejected the message ('+code+'). Review provider configuration.':'SMTP outcome unconfirmed; check the sending mailbox before retrying.'}).eq('request_key',requestKey);
   return reply({error:rejected?'Gmail rejected the message. See compliance email history.':'Email outcome unconfirmed. Check the sending mailbox; do not send again automatically.'},502);
  }finally{smtp.close()}
  if(!receipt?.accepted?.length){await db.from('closing_deliveries').update({status:'failed',error:'SMTP did not accept the recipient'}).eq('request_key',requestKey);return reply({error:'Gmail did not accept the recipient'},502)}
  const logged=await db.from('closing_deliveries').update({status:'accepted',provider_id:receipt.messageId||null,error:null}).eq('request_key',requestKey);
  if(logged.error)return reply({error:'Gmail accepted the message but audit update failed. Check the sending mailbox and reconcile the pending attempt; do not send again.'},502);
  return reply({status:'accepted',id:receipt.messageId});
 }
 // Old ambiguous pending sends require reconciliation, because provider idempotency expires.
 if(existing.data&&Date.now()-Date.parse(existing.data.created_at)>23*60*60*1000)return reply({error:'An earlier send needs back-office reconciliation before retrying. Check the provider log.'},409);
 if(!existing.data){const log=await db.from('closing_deliveries').insert({deal_id:d.id,brokerage_id:d.brokerage_id,side:body.side,recipient_email:recipient.email,recipient_name:recipient.name,request_key:requestKey,payload_hash:hash,payload,status:'pending',created_by:auth.data.user.id});if(log.error&&log.error.code!=='23505')throw log.error}
 const response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json','Idempotency-Key':requestKey},body:canonical});const result=await response.json();
 if(!response.ok){await db.from('closing_deliveries').update({status:'failed',error:String(result.message||'Email provider rejected request')}).eq('request_key',requestKey);return reply({error:result.message||'Email provider rejected request'},502)}
 const logged=await db.from('closing_deliveries').update({status:'accepted',provider_id:result.id,error:null}).eq('request_key',requestKey);
 if(logged.error)return reply({error:'Provider accepted the email but history could not be updated. Retry the identical preview to reconcile.'},502);
 return reply({status:'accepted',id:result.id});
 }catch(e){console.error('Closing packet failed',e instanceof Error?e.message:'Unknown failure');return reply({error:e instanceof Error?e.message:'Unable to prepare closing packet'},400)}
});
