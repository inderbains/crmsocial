import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import ts from 'typescript';
const js=ts.transpileModule(fs.readFileSync(new URL('../lib/office.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {previewPlan}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
test('80/20 split applies GST to agent share, then fees and fee GST',()=>{const p=previewPlan(10000,80,5,149,5);assert.equal(p.agent,800000);assert.equal(p.brokerage,200000);assert.equal(p.gst,40000);assert.equal(p.charges,14900);assert.equal(p.feeGST,745);assert.equal(p.net,824355)});
test('70/30 and no cheque-deducted fees preserve the split GST',()=>{const p=previewPlan(10000,70,5,0,5);assert.equal(p.agent,700000);assert.equal(p.brokerage,300000);assert.equal(p.gst,35000);assert.equal(p.net,735000)});
test('Rejects negative/nonfinite amounts and rates outside 0..100',()=>{assert.throws(()=>previewPlan(100,101,5,0,5));assert.throws(()=>previewPlan(100,80,-1,0,5));assert.throws(()=>previewPlan(NaN,80,5,0,5));assert.throws(()=>previewPlan(100,80,5,-1,5))});
