import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const base=new URL('../',import.meta.url);
const read=(f)=>readFileSync(new URL(f,base),'utf8');
const migration=read('supabase/migrations/029_office_payroll_eft.sql');
const nav=read('app/realvolt-workspace.tsx');
const bo=read('app/back-office.tsx');
const widget=read('app/office-payroll-eft.tsx');
test('both routes appear in the workspace and back office',()=>{
 assert.match(nav,/'Payroll & salaries','EFT payments'/);
 assert.match(bo,/OfficePayrollEFT/);
 assert.match(widget,/mode==='Payroll & salaries'/);
 assert.match(widget,/mode==='EFT payments'/);
});
test('salary and agent payments use the operating bank account',()=>{
 assert.match(migration,/a\.kind<>'Operating'/);
 assert.match(migration,/public\.mark_agent_payout_paid/);
 assert.match(migration,/public\.record_office_payroll_payment/);
});
test('no automatic bank transfer implementation is claimed or performed',()=>{
 assert.match(widget,/RealVolt does not send bank transfers yet/);
 assert.match(migration,/Does NOT send money/);
});
test('EFTs only enter ledger on confirmed settlement',()=>{
 const prepare=migration.match(/create or replace function public.prepare_office_eft\([\s\S]*?end \$\$;/)?.[0]||'';
 const submitted=migration.match(/create or replace function public.record_office_eft_submitted\([\s\S]*?end \$\$;/)?.[0]||'';
 const confirmed=migration.match(/create or replace function public.confirm_office_eft\([\s\S]*?end \$\$;/)?.[0]||'';
 assert.doesNotMatch(prepare,/post_office_entry|mark_agent_payout_paid|record_office_payroll_payment/);
 assert.doesNotMatch(submitted,/post_office_entry|mark_agent_payout_paid|record_office_payroll_payment/);
 assert.match(confirmed,/mark_agent_payout_paid/);
 assert.match(confirmed,/record_office_payroll_payment/);
});
test('payment methods are exclusive and use audit triggers',()=>{
 assert.match(migration,/eft_active_payout/);
 assert.match(migration,/eft_active_payroll/);
 assert.match(migration,/cheque_eft_guard/);
 assert.match(migration,/office_payment_audit/);
});
