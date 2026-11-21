// @ts-nocheck
// Self-contained dashboard deployment. Same implementation as repository function.
import {createClient} from 'npm:@supabase/supabase-js@2.89.0';
import {PDFDocument,StandardFonts,rgb} from 'npm:pdf-lib@1.17.1';
function calculateClosing(d){
 const cents=v=>{const n=Number(v);if(!Number.isFinite(n)||n<0||n>9999999999999)throw new Error('Invalid commission or deposit amount');return Math.round((n+Number.EPSILON)*100)};
 const listing=cents(d.listing_commission),selling=cents(d.selling_commission),deposit=cents(d.deposit_amount);
 const rate=Number(d.gst_rate);if(!Number.isFinite(rate)||rate<0||rate>100)throw new Error('Invalid GST rate');
 const listingGST=Math.round(listing*rate/100),sellingGST=Math.round(selling*rate/100);
 const commission=listing+selling,gst=listingGST+sellingGST,total=commission+gst;
 const held=d.deposit_holder==='our_brokerage'?deposit:0;
 const ownCommission=d.representation==='listing'?listing+listingGST:selling+sellingGST;
 if(d.deposit_holder==='other_brokerage'&&!d.deposit_brokerage?.trim())throw new Error('Enter the brokerage holding the deposit');
 return {listing,selling,listingGST,sellingGST,commission,gst,total,deposit,held,deducted:Math.min(held,ownCommission),remittance:Math.max(0,held-ownCommission),shortfall:Math.max(0,ownCommission-held),ownCommission,external:d.deposit_holder==='other_brokerage'};
}
const money=cents=>new Intl.NumberFormat('en-CA',{style:'currency',currency:'CAD'}).format(cents/100);
function packetTexts(d,brokerage,side,extra=''){
 const lawyer=d[side+'_lawyer'];if(!lawyer?.email)throw new Error('Select the '+side+' lawyer before preparing documents');
 if(!d.completion_date||!d.buyer_name?.trim()||!d.seller_name?.trim())throw new Error('Complete buyer/seller legal names and completion date');
 if(d.kind!=='Sale')throw new Error('Closing documents require a sale');
 const c=calculateClosing(d);
 const common=`${brokerage.name}\n${brokerage.address}\n${brokerage.email} | ${brokerage.phone}\n\nProperty: ${d.address}\nMLS: ${d.mls_number||'Not entered'}\nBuyer(s): ${d.buyer_name}\nSeller(s): ${d.seller_name}\nSale price: ${money(Math.round(Number(d.sale_price||0)*100))}\nCompletion: ${d.completion_date}\nFile reference: ${d.id}\n\nTo: ${lawyer.name}\n${lawyer.firm}\n${lawyer.address}\nEmail: ${lawyer.email}\n`;
 const summary=`\nListing commission (before GST): ${money(c.listing)}\nSelling commission (before GST): ${money(c.selling)}\nCommission subtotal: ${money(c.commission)}\nGST (${d.gst_rate}%): ${money(c.gst)}\nTotal commission including GST: ${money(c.total)}\nOur brokerage commission including GST: ${money(c.ownCommission)}\n\nDeposit recorded: ${money(c.deposit)}\nDeposit holder: ${c.external?d.deposit_brokerage:brokerage.name}\nDeposit held by our brokerage: ${money(c.held)}\nProposed our-side commission to retain from deposit: ${money(c.deducted)}\nProposed remaining deposit balance (confirm all authorized disbursements): ${money(c.remittance)}\nOur commission still to be received: ${money(c.shortfall)}\n`;
 const external=c.external?'\nThe deposit is held by the other brokerage named above. It is not held by us and is not included in funds available for remittance by our brokerage. Coordinate commission payment and any deposit release with that holder.':'\nThe figures above are proposed completion instructions. Confirm cleared trust funds, signed commission instructions, other brokerage entitlements and the authorized release before paying or remitting any amount.';
 return {cir:'COMMISSION INSTRUCTION REPORT\n\n'+common+summary+external+(brokerage.cir_footer?'\n\n'+brokerage.cir_footer:'')+(extra?'\n\nBack-office instructions:\n'+extra:''),letter:'LETTER TO COMPLETE\n\n'+common+'\nDear '+lawyer.name+',\n\nPlease arrange completion of the transaction identified above on the completion date. The enclosed Commission Instruction Report sets out the brokerage commission, GST, deposit holder and proposed remittance figures.\n'+summary+external+'\n\n'+(extra||brokerage.letter_footer||'Please confirm receipt and advise our office of any missing information required to complete.')+'\n\nRegards,\n'+brokerage.name};
}


async function textPDF(text,timestamp='2000-01-01T00:00:00Z'){
 const pdf=await PDFDocument.create(),font=await pdf.embedFont(StandardFonts.Helvetica);let page=pdf.addPage([612,792]),y=744;
 pdf.setCreationDate(new Date(timestamp));pdf.setModificationDate(new Date(timestamp));
 // Explicitly reject characters the standard font cannot represent rather than alter names.
 font.encodeText(text.replace(/[\r\n\t]/g,' '));
 for(const para of text.split('\n')){let line='';const words=para.split(' ');for(const word of words){const parts=[];let part='';for(const ch of word){if(font.widthOfTextAtSize(part+ch,10)>510){parts.push(part);part=''}part+=ch}parts.push(part);for(const token of parts){if(line&&font.widthOfTextAtSize(line+' '+token,10)>510){draw(line);line=token}else line+=(line?' ':'')+token}}draw(line)}
 function draw(line){if(y<48){page=pdf.addPage([612,792]);y=744}page.drawText(line,{x:48,y,size:10,font,color:rgb(.08,.17,.14)});y-=15}
 return pdf.save();
}

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
 if(d.kind!=='Sale'||!['Sold','Completed'].includes(d.rv_stage)||d.review_status!=='Approved')return reply({error:'Approve the firm sale before preparing closing documents'},409);
 const b=await db.from('brokerages').select('*').eq('id',d.brokerage_id).single();if(b.error)throw b.error;
 const extra=String(body.instructions||'').trim();if(extra.length>8000)return reply({error:'Instructions are too long'},400);
 const template=await db.from('office_document_templates').select('*').eq('brokerage_id',d.brokerage_id).maybeSingle();if(template.error)throw template.error;const texts=packetTexts(d,{...b.data,...template.data},body.side,extra),recipient=d[body.side+'_lawyer'];
 const attachments=[];for(const [name,text] of Object.entries(texts))attachments.push({filename:name==='cir'?'Commission_Instruction_Report.pdf':'Letter_to_Complete.pdf',content:base64(await textPDF(text as string))});
 const ids=Array.isArray(body.document_ids)?[...new Set(body.document_ids.map(String))].sort():[];if(ids.length>20)return reply({error:'Select up to 20 additional files'},400);
 let total=0;
 for(const id of ids){const doc=await db.from('deal_documents').select('*').eq('id',id).eq('deal_id',d.id).single();if(doc.error)return reply({error:'An attachment is not part of this transaction'},400);const verified=await db.from('deal_requirements').select('id').eq('deal_id',d.id).eq('document_id',id).eq('verified',true).limit(1);if(verified.error||!verified.data?.length)return reply({error:'Verify each selected conveyancing attachment in Required documents before sending'},400);if(/(?:commission.statement|agent.payout|internal.deduction|office.fee|identity.verification)/i.test(doc.data.name))return reply({error:'Internal or identity documents cannot be attached to conveyancing emails'},400);const file=await db.storage.from('transaction-files').download(doc.data.path);if(file.error)throw file.error;total+=file.data.size;if(total>10*1024*1024)return reply({error:'Email attachments must total 10 MB or less'},400);attachments.push({filename:doc.data.name,content:base64(new Uint8Array(await file.data.arrayBuffer()))})}
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
