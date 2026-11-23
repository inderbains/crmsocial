import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const code=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('compact transaction flow renders each complex section in one selected step',()=>{
 const s=code('app/transactions.tsx');
 for(const name of ['TransactionActions','PostFirmDetails','DealAdmin','ComplianceClosingPanel','ClosingPanel']){
  assert.equal((s.match(new RegExp('<'+name+'\\b','g'))||[]).length,1,`Expected one ${name}`);
 }
 for(const step of ['actions','documents','compliance','commission','closing'])assert.ok(s.includes(`'${step}'`));
});
test('office keeps read-only closed files distinct from approved queue',()=>{
 const s=code('app/realvolt-workspace.tsx'),t=code('app/transactions.tsx');
 assert.ok(s.includes("'Closed files'"));assert.ok(t.includes("view==='Closed files'?d.rv_stage==='Archived'"));
 assert.ok(t.includes("rv_close_compliant_file"));
});
test('payout leads to cheque, only issue triggers return to closing',()=>{
 const a=code('app/deal-admin.tsx'),b=code('app/office-cheques.tsx');
 assert.ok(a.includes('Continue to Agent Payments'));
 assert.ok(b.includes("await rpc('issue_office_cheque'"));
 assert.ok(b.includes('onIssued?.(dealId)'));
 assert.ok(!b.slice(b.indexOf('async function prepare'),b.indexOf('return <><section')).includes('onIssued?.'));
});
test('completion confirmation is independent of payout but internal statement requires Paid',()=>{
 const s=code('app/compliance-closing-panel.tsx');
 assert.ok(s.includes("kind==='completion'"));assert.ok(s.includes("payout.status!=='Paid'"));
 assert.ok(s.includes("generate('completion')"));assert.ok(s.includes("generate('statement')"));
});
test('historical invalid doc verifications are revoked by migration',()=>{
 const s=code('supabase/052_workflow_and_compliance_safety.sql');
 assert.ok(s.includes('rv_verified_at = NULL'));
 assert.ok(s.includes('rv_reject_clearly_wrong_doc_verification'));
 assert.ok(s.includes("then 'Receipt of funds' else 'Sale report form'"));
});
