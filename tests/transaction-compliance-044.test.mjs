import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..');
const sql=fs.readFileSync(path.join(root,'supabase/044_staged_compliance_archive.sql'),'utf8');
const code=(name)=>fs.readFileSync(path.join(root,name),'utf8');
const defaults=['Signed listing contract','MLS listing sheet / listing details','Disclosure (listing)',
 'FINTRAC identity verification','Signed purchase and sale contract','Commission disclosure',
 'Disclosure of services / representation','FINTRAC identity verification — buyer(s)',
 'Trade record sheet','Sale report form','Deposit cheque copy / deposit receipt',
 'Signed subject removal / unconditional contract','Lawyer completion letter',
 'Brokerage completion confirmation (PDF)','Commission Instruction Report — CIR (PDF)',
 'Internal commission payable statement (PDF)'];
test('required forms are staged in the migration',()=>{for(const item of defaults)assert.ok(sql.includes(item),item)});
test('separate listing, conditional-offer, firm and completion stages',()=>{for(const stage of ['listing','offer','firm','completion'])assert.ok(sql.includes(`'${stage}'`))});
test('does not require optional addendums for approval',()=>assert.match(sql,/\('Sale','offer','any','Contract addendum \(if applicable\)',false/));
test('written waiver and mandatory-only review safeguards',()=>{assert.ok(sql.includes('rv_waiver_reason'));assert.ok(sql.includes('AND r.rv_required'));assert.ok(sql.includes('NOT r.rv_waived'));});
test('legacy archive RPC is gated by mandatory completion documents',()=>{assert.ok(sql.includes('rv_compliance_archive_guard'));assert.ok(sql.includes('Completion confirmation, CIR and internal commission statement are mandatory at close'))});
test('archive manifest is immutable to users and scoped to brokerage',()=>{assert.ok(sql.includes('rv_closed_file_folders'));assert.ok(sql.includes('document_manifest jsonb NOT NULL'));assert.ok(sql.includes('public.current_brokerage()'));assert.ok(sql.includes('GRANT SELECT ON public.rv_closed_file_folders TO authenticated'));assert.ok(!sql.includes('GRANT UPDATE ON public.rv_closed_file_folders TO authenticated'))});
test('closing only after recorded payment',()=>{assert.match(sql,/status='Paid'/);assert.ok(sql.includes("rv_stage<>'Completed'"))});
test('commission statement is confidential and generated after actual agent payout',()=>{const s=code('app/compliance-closing-panel.tsx');assert.ok(s.includes("payout.status!=='Paid'"));assert.ok(s.includes('CONFIDENTIAL - NOT FOR LAWYERS'));assert.ok(s.includes('authorized agent payout')||s.includes('recorded, authorized agent payout'))});
test('lawyer mail cannot attach FINTRAC or internal commissions',()=>{const s=code('supabase/functions/closing-packet/index.ts');assert.ok(s.includes('fintrac|identity'));assert.ok(s.includes('internal.*commission'))});
test('close actions use compliance-checked RPC, not legacy bypass',()=>{assert.ok(code('app/transaction-actions.tsx').includes("rv_close_compliant_file"))});
test('compliance route and brokerage template management wired',()=>{assert.ok(code('app/back-office.tsx').includes("view==='Financial & compliance'"));assert.ok(code('app/brokerage-compliance-rules.tsx').includes('rv_refresh_brokerage_compliance'))});
