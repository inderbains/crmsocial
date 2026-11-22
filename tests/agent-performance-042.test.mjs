import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const require=createRequire(import.meta.url);
const ts=require('typescript');
const here=path.dirname(fileURLToPath(import.meta.url));
const lib=fs.readFileSync(path.join(here,'../lib/agent-performance.ts'),'utf8');
const code=ts.transpileModule(lib,{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText;
const {calculateAgentPerformance}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
const today='2026-11-21';
const deals=[
 {id:'listing1',kind:'Listing',listing_date:'2026-11-01'},
 {id:'firm1',kind:'Sale',rv_stage:'Sold',rv_firm_date:'2026-11-20',sale_price:1000000,review_status:'Submitted'},
 {id:'complete1',kind:'Sale',rv_stage:'Completed',rv_firm_date:'2026-10-20',rv_completed_date:'2026-11-15',sale_price:900000,review_status:'Approved'},
 {id:'pending',kind:'Sale',rv_stage:'Accepted offer',rv_firm_date:null,sale_price:1250000},
 {id:'collapsed',kind:'Sale',rv_stage:'Collapsed',rv_firm_date:'2026-11-12',sale_price:250000},
 {id:'completedWithNoAllocation',kind:'Sale',rv_stage:'Completed',rv_firm_date:'2026-11-16',rv_completed_date:'2026-11-20',review_status:'Approved',sale_price:700000},
];
const allocations=[{deal_id:'complete1',commission_before_gst:18000},{deal_id:'firm1',commission_before_gst:30000}];
const payouts=[{id:'p1',deal_id:'complete1',status:'Paid',net:14500,paid_date:'2026-11-20'},{id:'p2',deal_id:'firm1',status:'Authorized',net:22000,created_at:'2026-11-21'},{id:'p3',deal_id:'otherAgent',status:'Paid',net:100000,paid_date:'2026-11-20'}];
test('firm-sale tally begins with subject removal, excludes accepted offers and collapsed',()=>{
 const r=calculateAgentPerformance(deals,allocations,payouts,'month',today);
 assert.equal(r.firmSales,2);assert.equal(r.volumeCents,170000000);assert.equal(r.listings,1);
});
test('commission counts completed allocated sales, not firm conditional sales',()=>{
 const r=calculateAgentPerformance(deals,allocations,payouts,'month',today);
 assert.equal(r.earnedCents,1800000);assert.equal(r.missingAllocations,1);assert.equal(r.completedSales,2);
});
test('paid vs authorized payout separate and unrelated agent payment excluded',()=>{
 const r=calculateAgentPerformance(deals,allocations,payouts,'month',today);
 assert.equal(r.paidCents,1450000);assert.equal(r.authorizedUnpaidCents,2200000);
});
test('period filtering applies to event date, with sales not double counted',()=>{
 const r=calculateAgentPerformance([...deals,...deals],'all'==='all' ? allocations:[],payouts,'year',today);
 assert.equal(r.firmSales,3);
 assert.equal(r.listings,1);
 assert.equal(r.volumeCents,260000000);
});
test('future dates excluded, historical lifetime included',()=>{
 const d=[{id:'old',kind:'Sale',rv_stage:'Sold',rv_firm_date:'2025-01-01',sale_price:800000},{id:'future',kind:'Sale',rv_stage:'Sold',rv_firm_date:'2026-12-03',sale_price:300000}];
 assert.equal(calculateAgentPerformance(d,[],[],'year',today).firmSales,0);
 assert.equal(calculateAgentPerformance(d,[],[],'all',today).firmSales,1);
});
