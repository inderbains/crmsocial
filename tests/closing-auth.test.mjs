import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';import ts from 'typescript';
const source=fs.readFileSync(new URL('../supabase/functions/closing-packet/index.ts',import.meta.url),'utf8')
 .replace("import {createClient} from '@supabase/supabase-js';","const createClient=()=>globalThis.__closingDB;")
 .replace("'../_shared/calculations.mjs'",JSON.stringify(new URL('../supabase/functions/_shared/calculations.mjs',import.meta.url).href))
 .replace("'../_shared/pdf.mjs'",JSON.stringify(new URL('../supabase/functions/_shared/pdf.mjs',import.meta.url).href));
let handler;
globalThis.Deno={serve:fn=>{handler=fn},env:{get:key=>({SUPABASE_URL:'https://test.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'not-a-secret',CLOSING_FROM_EMAIL:'office@example.com',RESEND_API_KEY:'not-a-secret'})[key]}};
const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
const deal={id:'deal-1',user_id:'agent',brokerage_id:'office-A',kind:'Sale',review_status:'Submitted',address:'Test property',buyer_name:'Buyer',seller_name:'Seller',completion_date:'2026-12-01',sale_price:1000000,representation:'selling',listing_commission:0,selling_commission:15000,deposit_amount:50000,deposit_holder:'our_brokerage',deposit_brokerage:'',gst_rate:5,seller_lawyer:{name:'Seller Lawyer',email:'seller@example.com',firm:'Law Firm',address:'Surrey'}};
function setup({role='admin',brokerage='office-A',assigned='admin',status='Submitted'}={}){let calls=0;
 globalThis.__closingDB={auth:{getUser:async token=>({data:{user:token==='valid'?{id:'admin'}:null},error:token==='valid'?null:{}})},from:table=>{const filters={};const q={select:()=>q,eq:(k,v)=>{filters[k]=v;return q},single:async()=>{
 if(table==='deal_files')return {data:{...deal,review_status:status},error:null};
 if(table==='brokerage_members')return {data:filters.user_id==='agent'?{brokerage_id:'office-A',role:'agent'}:{brokerage_id:brokerage,role},error:null};
 if(table==='transaction_reviewers')return {data:{admin_id:assigned},error:null};
 if(table==='brokerages')return {data:{name:'Realty A',email:'office@example.com',phone:'6045550100',address:'Surrey'},error:null};
 return {data:null,error:{message:'Not part of this transaction'}};
 },maybeSingle:async()=>({data:null,error:null}),insert:async()=>({error:null}),update:()=>q,then:fn=>Promise.resolve({error:null}).then(fn)};return q}};
 const original=globalThis.fetch;globalThis.fetch=async()=>{calls++;return new Response(JSON.stringify({id:'provider-1'}),{status:200})};return {calls:()=>calls,restore:()=>{globalThis.fetch=original}};
}
const request=(body,auth='Bearer valid')=>new Request('https://test/functions/closing-packet',{method:'POST',headers:{...(auth?{Authorization:auth}:{}),'Content-Type':'application/json'},body:JSON.stringify({action:'preview',side:'seller',deal_id:'deal-1',...body})});
test('Closing endpoint rejects unauthenticated calls',async()=>{const mock=setup();try{assert.equal((await handler(request({},''))).status,401);assert.equal((await handler(request({},'Bearer bad'))).status,401);assert.equal(mock.calls(),0)}finally{mock.restore()}});
test('Agents, cross-brokerage admins and unassigned admins cannot prepare or send',async()=>{for(const opts of [{role:'agent'},{brokerage:'office-B'},{assigned:'different-admin'}]){const mock=setup(opts);try{assert.equal((await handler(request({action:'send'}))).status,403);assert.equal(mock.calls(),0)}finally{mock.restore()}}});
test('Draft and returned files cannot generate closing instructions',async()=>{for(const status of ['Draft','Changes requested']){const mock=setup({status});try{assert.equal((await handler(request({}))).status,409);assert.equal(mock.calls(),0)}finally{mock.restore()}}});
test('Preview is recipient-bound, has two PDFs and never sends an email',async()=>{const mock=setup();try{const res=await handler(request({recipient_email:'injected@example.com'}));assert.equal(res.status,200);const data=await res.json();assert.equal(data.recipient.email,'seller@example.com');assert.equal(data.attachments.length,2);assert.equal(data.preview_hash.length,64);assert.equal(mock.calls(),0)}finally{mock.restore()}});
test('Unrelated supporting files and stale previews are blocked',async()=>{const mock=setup();try{assert.equal((await handler(request({document_ids:['other-deal-doc']}))).status,400);assert.equal((await handler(request({action:'send',preview_hash:'stale'}))).status,409);assert.equal(mock.calls(),0)}finally{mock.restore()}});
test('Valid exact-preview send attaches PDFs and sends to saved lawyer',async()=>{const mock=setup();try{const p=await (await handler(request({}))).json();const sent=await handler(request({action:'send',preview_hash:p.preview_hash}));assert.equal(sent.status,200);assert.equal((await sent.json()).status,'accepted');assert.equal(mock.calls(),1)}finally{mock.restore()}});
