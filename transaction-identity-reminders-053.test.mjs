import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const root = new URL('../', import.meta.url);
const file = name=>readFileSync(new URL(name,root),'utf8');
test('opened transaction identifies its assigned Realtor from central profile',()=>{
 const src=file('app/transactions.tsx');
 assert.match(src,/Assigned Realtor:/);
 assert.match(src,/from\('office_agents'\)/);
 assert.match(src,/setFileOwnerName\(profile\.data\.full_name\.trim\(\)\)/);
});
test('reminder edit is a modal, not an inline dashboard form',()=>{
 const src=file('app/personal-dates.tsx');
 assert.match(src,/role="dialog" aria-modal="true"/);
 assert.match(src,/className=\{styles\.reminderOverlay\}/);
 assert.match(src,/Add reminder/);
 assert.match(src,/Save reminder/);
 assert.match(src,/onSubmit=\{save\}/);
 const css=file('app/SmartInbox037.module.css');
 assert.match(css,/\.reminderOverlay\{position:fixed/);
});
test('pre-cheque release has document review and explicit approval',()=>{
 const src=file('app/office-cheques.tsx');
 assert.match(src,/rv_release_gate_status/);
 assert.match(src,/rv_approve_commission_release/);
 assert.match(src,/!!c\.payout_id&&!gate\?\.approved/);
 assert.match(src,/Review file compliance/);
 const sql=file('supabase/053_pre_cheque_document_approval.sql');
 assert.match(sql,/FUNCTION public\.issue_office_cheque/);
 assert.match(sql,/rv_release_gate_status\(c\.payout_id\)/);
});
