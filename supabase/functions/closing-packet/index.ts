import {createClient} from '@supabase/supabase-js';
import {packetTexts} from '../_shared/calculations.mjs';
import {textPDF} from '../_shared/pdf.mjs';
const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS'};
const reply=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers:{...cors,'Content-Type':'application/json'}});
const base64=(bytes:Uint8Array)=>{let s='';for(const n of bytes)s+=String.fromCharCode(n);return btoa(s)};
Deno.serve(async(req:Request)=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers:cors});
 if(req.method!=='POST')return reply({error:'POST required'},405);
 try{
 const token=req.headers.get('Authorization')?.replace(/^Bearer /i,'');if(!token)return reply({error:'Sign in required'},401);
 const url=Deno.env.get('SUPABASE_URL')!,key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
 const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
 const auth=await db.auth.getUser(token);if(auth.error||!auth.data.user)return reply({error:'Invalid session'},401);
 const body=await req.json();if(!['preview','send'].includes(body.action)||!['buyer','seller'].includes(body.side))return reply({error:'Invalid action or lawyer side'},400);
 const deal=await db.from('deal_files').select('*').eq('id',body.deal_id).single();if(deal.error)return reply({error:'Transaction unavailable'},404);const d=deal.data;
 const member=await db.from('brokerage_members').select('*').eq('user_id',auth.data.user.id).single();
 const owner=await db.from('brokerage_members').select('*').eq('user_id',d.user_id).single();
 const assignment=await db.from('transaction_reviewers').select('admin_id').eq('agent_id',d.user_id).single();
 if(member.error||owner.error||assignment.error||member.data.role!=='admin'||member.data.brokerage_id!==d.brokerage_id||owner.data.brokerage_id!==d.brokerage_id||assignment.data.admin_id!==auth.data.user.id)return reply({error:'Only the assigned admin in this brokerage can prepare or send closing documents'},403);
 if(d.kind!=='Sale'||!['Submitted','Approved'].includes(d.review_status))return reply({error:'Submit the sale before preparing closing documents'},409);
 const b=await db.from('brokerages').select('*').eq('id',d.brokerage_id).single();if(b.error)throw b.error;
 const extra=String(body.instructions||'').trim();if(extra.length>8000)return reply({error:'Instructions are too long'},400);
 const texts=packetTexts(d,b.data,body.side,extra),recipient=d[body.side+'_lawyer'];
 const attachments=[];for(const [name,text] of Object.entries(texts))attachments.push({filename:name==='cir'?'Commission_Instruction_Report.pdf':'Letter_to_Complete.pdf',content:base64(await textPDF(text as string))});
 const ids=Array.isArray(body.document_ids)?[...new Set(body.document_ids.map(String))].sort():[];if(ids.length>20)return reply({error:'Select up to 20 additional files'},400);
 let total=0;
 for(const id of ids){const doc=await db.from('deal_documents').select('*').eq('id',id).eq('deal_id',d.id).single();if(doc.error)return reply({error:'An attachment is not part of this transaction'},400);const file=await db.storage.from('transaction-files').download(doc.data.path);if(file.error)throw file.error;total+=file.data.size;if(total>10*1024*1024)return reply({error:'Email attachments must total 10 MB or less'},400);attachments.push({filename:doc.data.name,content:base64(new Uint8Array(await file.data.arrayBuffer()))})}
 const payload={from:Deno.env.get('CLOSING_FROM_EMAIL')||'',reply_to:b.data.email,to:[recipient.email],subject:`${d.address} — CIR and completion instructions`,text:`Dear ${recipient.name},\n\nPlease find the Commission Instruction Report, letter to complete and selected transaction documents attached.\n\n${b.data.name}`,attachments};
 const canonical=JSON.stringify(payload),hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(canonical)))).map(n=>n.toString(16).padStart(2,'0')).join('');
 if(body.action==='preview')return reply({recipient:{name:recipient.name,email:recipient.email,side:body.side},attachments:attachments.slice(0,2),cir:texts.cir,letter:texts.letter,preview_hash:hash,additional_files:ids.length});
 if(body.preview_hash!==hash)return reply({error:'The file or recipients changed. Preview the documents again before sending.'},409);
 const apiKey=Deno.env.get('RESEND_API_KEY');if(!apiKey||!payload.from||!b.data.email)return reply({error:'Configure the email sender and brokerage reply-to email before sending'},503);
 const requestKey=`closing/${d.id}/${body.side}/${hash}`;
 const existing=await db.from('closing_deliveries').select('*').eq('request_key',requestKey).maybeSingle();if(existing.error)throw existing.error;
 if(existing.data?.status==='accepted')return reply({status:'accepted',id:existing.data.provider_id,duplicate:true});
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
