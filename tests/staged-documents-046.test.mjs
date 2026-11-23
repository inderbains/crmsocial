import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import cp from 'node:child_process';
const root=path.resolve(import.meta.dirname,'..');
const ui=fs.readFileSync(path.join(root,'app/staged-document-upload.tsx'),'utf8');
const sql=fs.readFileSync(path.join(root,'supabase/046_named_compliance_uploads.sql'),'utf8');
const forms=fs.readFileSync(path.join(root,'supabase/044_staged_compliance_archive.sql'),'utf8');
const source=process.env.RV046_TEST_SOURCE;
test('user-defined form set covers listing, offer, subject removal, and closing',()=>{
 for(const label of ['Signed listing contract','MLS listing sheet / listing details','Disclosure (listing)','FINTRAC identity verification','Signed purchase and sale contract','Commission disclosure','Disclosure of services / representation','FINTRAC identity verification — buyer(s)','Signed subject removal / unconditional contract','Trade record sheet','Sale report form','Deposit cheque copy / deposit receipt','Lawyer completion letter','Commission Instruction Report — CIR (PDF)'])assert.ok(forms.includes(label),label);
});
test('UI renders stages by form templates without hard-coded brokerage IDs',()=>{
 assert.match(ui,/rv_compliance_templates/);assert.match(ui,/deal_requirements/);assert.match(ui,/onReadyChange/);assert.match(ui,/Upload by document type/);assert.match(ui,/Verified by Back Office/);
});
test('agent cannot mark documents verified, document access scoped in SQL',()=>{
 assert.match(sql,/SECURITY DEFINER/);assert.match(sql,/d\.brokerage_id IS DISTINCT FROM public\.current_brokerage\(\)/);assert.match(sql,/p_additional/);assert.match(sql,/rv_required/);assert.match(sql,/verified=false/);assert.match(sql,/storage\.objects/);
 assert.doesNotMatch(ui,/verified:true/);
});
test('old documents preserved when replaced, optional addendums can be multiple',()=>{
 assert.match(ui,/A replacement keeps the earlier attachment in the audit history/);assert.match(ui,/multiple=\{isAddendum/);assert.match(sql,/additional/);assert.doesNotMatch(sql,/DELETE FROM public\.deal_documents/i);
});
test('installer merges safely twice and is anchored to only one upload surface',()=>{
 assert.ok(source&&fs.existsSync(source),'Set RV046_TEST_SOURCE to the RealVolt source directory');
 const dest=fs.mkdtempSync(path.join(os.tmpdir(),'realvolt046-'));
 try{
  fs.mkdirSync(path.join(dest,'app'),{recursive:true});fs.mkdirSync(path.join(dest,'lib'),{recursive:true});
  fs.copyFileSync(path.join(source,'package.json'),path.join(dest,'package.json'));
  fs.copyFileSync(path.join(source,'app/transactions.tsx'),path.join(dest,'app/transactions.tsx'));
  const runner=path.join(root,'scripts/apply-fix-046.mjs');
  cp.execFileSync('node',[runner,dest],{stdio:'pipe'});
  let s=fs.readFileSync(path.join(dest,'app/transactions.tsx'),'utf8');
  assert.equal((s.match(/<StagedDocumentUpload\s/g)||[]).length,1);
  assert.ok(s.includes('!requiredReady'));
  assert.ok(!s.includes('id="deal-upload"'));
  cp.execFileSync('node',[runner,dest],{stdio:'pipe'});
  assert.equal(fs.readFileSync(path.join(dest,'app/transactions.tsx'),'utf8'),s);
 }finally{fs.rmSync(dest,{force:true,recursive:true})}
});
