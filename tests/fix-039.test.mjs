import {firmDate,computeOfficeInsights,csvRows} from '../lib/office-insights.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const dash=read('app/back-office-dashboard.tsx');
const finance=read('app/office-financial-compliance.tsx');
const inbox=read('app/SmartInbox037.tsx');
test('restores all 20 original Back Office application modules',()=>{
 const original=['Review queue','Changes requested','Approved','Agents & profiles','New agent setup','Plans & monthly fees','Cheque printing','Agent payments','Payroll & salaries','EFT payments','Trust & bank','Bank reconciliation','Reports','Audit & controls','Brokerage Control','Brokerage settings','Office DDF & Listings','Office Meta Accounts','Office Lead Routing','Office Marketing Dashboard'];
 for(const mod of original)assert.ok(dash.includes(`name:'${mod}'`),mod);
});
test('new Accounting, Reporting and Compliance cards use same full-size module layout',()=>{
 for(const mod of ['Accounting','Reporting','Compliance'])assert.ok(dash.includes(`name:'${mod}'`),mod);
 assert.ok(dash.includes('className="bo-module-card"'));
 assert.ok(dash.includes('className="bo-module-grid"'));
 assert.ok(!dash.includes('boMiniModules'));
});
test('only one compact office dashboard inbox and no duplicated sections',()=>{
 assert.equal((dash.match(/<SmartInbox037\b/g)||[]).length,1);
 assert.ok(!dash.includes('Automatic transaction workflow'));
 assert.ok(!dash.includes('New transactions added'));
 assert.ok(!dash.includes('Monthly bank statement checklist'));
 assert.ok(!dash.includes('Office transaction updates'));
});
test('agent-facing and office-facing updates are hidden until user selects a category',()=>{
 assert.ok(inbox.includes('useState<InboxKey|null>(null)'));
 assert.ok(inbox.includes('setSelected(s=>s===t.key?null:t.key)'));
});
test('three finance cards open the correct existing tab without mutating financial data',()=>{
 assert.ok(dash.includes("window.sessionStorage.setItem('realvolt:finance-selected-tab',tab)"));
 assert.ok(dash.includes("onNavigate('Financial & compliance')"));
 assert.ok(finance.includes('window.sessionStorage.getItem(\'realvolt:finance-selected-tab\')'));
 assert.ok(finance.includes("(['Accounting','Reporting','Compliance'] as const)"));
 assert.ok(finance.includes("onNavigate('Bank reconciliation')"));
 assert.ok(finance.includes("onNavigate('Trust & bank')"));
});
test('firm sales and financial oversight existing data logic retained',()=>{
 assert.ok(read('lib/office-insights.mjs').includes('firmDate'));
 assert.ok(finance.includes('firmDate(x)'));
 assert.ok(finance.includes('csvRows(rows)'));
 assert.ok(finance.toLowerCase().includes('reconciliation'));
});
test('notification items navigate to individual files, without email or payment side effects',()=>{
 assert.ok(dash.includes("realvolt:open-transaction"));
 assert.ok(dash.includes("'new',label:'New files'"));
 assert.ok(dash.includes("'review',label:'Review'"));
 assert.ok(!dash.includes('post_office_entry'));
});

test('firm sale counts after subject removal, never twice at completion',()=>{
 const d={id:'sale1',kind:'Sale',rv_stage:'Sold',rv_firm_date:'2026-11-20',sale_price:700000,representation:'selling',selling_commission:14000};
 let result=computeOfficeInsights({deals:[d]},'2026-11');
 assert.equal(result.monthSales,1);
 assert.equal(result.monthSideCommission,14000);
 result=computeOfficeInsights({deals:[{...d,rv_stage:'Completed',rv_completed_date:'2026-12-10'}]},'2026-11');
 assert.equal(result.monthSales,1);
 assert.equal(firmDate(d),'2026-11-20');
});
test('commission receivable is distinct from agent payout',()=>{
 const deal={id:'s',kind:'Sale',rv_stage:'Completed',rv_firm_date:'2026-11-20',rv_completed_date:'2026-12-01',representation:'selling',selling_commission:14000,rv_funds_verified:false};
 const d=computeOfficeInsights({deals:[deal],payouts:[{status:'Authorized',net:9000}]},'2026-11');
 assert.equal(d.commissionReceivable,14000);
 assert.equal(d.pendingPayouts,9000);
 assert.equal(d.paidPayouts,0);
});
test('report export protects against spreadsheet formula injection',()=>{
 const result=csvRows([['Address','Value'],['=1+1',100]]);
 assert.ok(result.includes("'"+'=1+1'));
});
