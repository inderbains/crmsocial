import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {eligibleRules} from '../lib/lead-routing.ts';
import {estimatedBudget,readinessIssues} from '../lib/meta-ad-planner.ts';
import {newDraft} from '../lib/designs.ts';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
test('Hostinger Calendar build fix preserves the strict social Draft type',()=>{
 const src=read('app/page.tsx');assert.match(src,/const payload:Omit<Draft,'_id'>/);
 assert.match(src,/scheduleStatus:rest\.date/);
});
test('agent marketing and office reporting are routed separately',()=>{
 const src=read('app/page.tsx');assert.match(src,/sectionView==='Office Marketing Dashboard'/);
 assert.match(src,/isBrokerageAdmin&&sectionView==='Office Marketing Dashboard'/);
 assert.match(src,/sectionView==='Post-Sale Follow-Ups'/);
 assert.match(src,/initialScope="brokerage"/);
 assert.match(src,/initialScope="agent"|<MetaConnections userId=/);
});
test('budget estimates count inclusive dates and reject impossible range',()=>{
 assert.equal(estimatedBudget(20,'2026-11-18','2026-11-20'),60);
 assert.equal(estimatedBudget(10,'2026-11-20','2026-11-18'),null);
});
test('sample template creative is never publish-ready',()=>{
 const p={campaign_name:'Test',headline:'New home',description:'Visit',campaign_goal:'website_visits',destination_url:'https://example.com',planned_start:'2026-11-18',planned_end:'2026-11-21',daily_budget:20,placements:['Facebook']};
 const sample=newDraft(0);assert.ok(readinessIssues(p,sample).some(issue=>/authorized property image/.test(issue)));
 const upload={...sample,photoSource:'upload',photo:'https://example.com/photo.jpg'};
 assert.deepEqual(readinessIssues(p,upload),[]);
});
test('lead rule preview filters by area, budget and enabled flag',()=>{
 const rules=[{agent_user_id:'a',area:'Surrey,Langley',min_price:800000,max_price:1500000,max_open_leads:10,enabled:true},{agent_user_id:'b',area:'Victoria',min_price:null,max_price:null,max_open_leads:10,enabled:true},{agent_user_id:'c',area:'Surrey',min_price:null,max_price:null,max_open_leads:10,enabled:false}];
 assert.deepEqual(eligibleRules(rules,'South Surrey',1000000).map(x=>x.agent_user_id),['a']);
 assert.deepEqual(eligibleRules(rules,'Surrey',1900000),[]);
});
test('office reports verify brokerage authorization inside database',()=>{
 const sql=read('supabase/020_marketing_office_and_post_sale.sql');
 assert.match(sql,/public\.is_brokerage_admin\(p_brokerage_id\)/);
 assert.match(sql,/auth\.uid\(\)/);
 assert.match(sql,/revoke all on function public\.rv_office_marketing_summary/);
});
test('post-sale workflow does not send mail and cannot duplicate follow-up sets',()=>{
 const sql=read('supabase/020_marketing_office_and_post_sale.sql');
 assert.match(sql,/on conflict\(user_id,property_id,contact_id\) do nothing/);
 assert.match(sql,/insert into public\.crm_tasks/);
 assert.doesNotMatch(sql,/http_post\(|send_email\(/);
});
test('included DDF and Meta APIs do not automatically spend or publish',()=>{
 const src=read('app/meta-ads.tsx');assert.match(src,/Planning mode only/);
 assert.match(src,/No ad was launched or charged/);
 const meta=read('supabase/018_meta_social_ads_connections.sql');assert.match(meta,/rv_meta_secret_tokens/);
 assert.match(meta,/revoke all on public\.rv_meta_secret_tokens from public,anon,authenticated/);
});
