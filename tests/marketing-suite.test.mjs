import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const transpile = src => ts.transpileModule(src,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const moduleUrl = code => 'data:text/javascript;base64,'+Buffer.from(code).toString('base64');
const marketing=await import(moduleUrl(transpile(fs.readFileSync(new URL('../lib/marketing.ts',import.meta.url),'utf8'))));
const crm=moduleUrl(transpile(fs.readFileSync(new URL('../lib/crm.ts',import.meta.url),'utf8')));
const metaSource=fs.readFileSync(new URL('../lib/meta-leads.ts',import.meta.url),'utf8').replace("from './crm'", `from '${crm}'`);
const meta=await import(moduleUrl(transpile(metaSource)));
test('buyer matching requires published active property and area budget bedroom match',()=>{
 const h={id:'test',published:true,payload:{address:'123 Main St',city:'Surrey',price:'1250000',beds:'4',status:'active'}};
 assert.equal(marketing.matchesProperty({area:'Surrey',max_price:1300000,min_bedrooms:3,enabled:true},h),true);
 assert.equal(marketing.matchesProperty({area:'Langley',max_price:null,min_bedrooms:0,enabled:true},h),false);
 assert.equal(marketing.matchesProperty({area:'Surrey',max_price:1200000,min_bedrooms:3,enabled:true},h),false);
 assert.equal(marketing.matchesProperty({area:'Surrey',max_price:1300000,min_bedrooms:5,enabled:true},h),false);
 assert.equal(marketing.matchesProperty({area:'Surrey',max_price:null,min_bedrooms:0,enabled:false},h),false);
 assert.equal(marketing.matchesProperty({area:'Surrey',max_price:null,min_bedrooms:0,enabled:true},{...h,payload:{...h.payload,status:'sold'}}),false);
});
test('Just Sold copy does not invent a sale price',()=>{
 const copy=marketing.suggestAdCopy('Just sold',{id:'x',published:true,payload:{address:'123 Main St',city:'Surrey',status:'sold'}});
 assert.match(copy.headline,/Sold/);assert.doesNotMatch(copy.description,/\$\d+/);
});
test('Meta lead CSV imports with Unknown marketing consent and deduplicates',()=>{
 const data=meta.parseMetaLeadCSV('full_name,email,phone_number,city,budget,campaign_name\nA,first@example.com,6045550101,Surrey,1200000,Buyers\nB,FIRST@example.com,6045550102,Surrey,1200000,Buyers\nC,third@example.com,6045550103,Langley,800000,Sellers',new Set());
 assert.equal(data.contacts.length,2);assert.equal(data.skipped,1);assert.equal(data.contacts[0].communication_consent,'Unknown');
 assert.equal(data.contacts[0].preferred_area,'Surrey');assert.equal(data.contacts[0].budget,1200000);
});
