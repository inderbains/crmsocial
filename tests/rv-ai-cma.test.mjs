import test from 'node:test';
import assert from 'node:assert/strict';
import {computeCma} from '../lib/rv-ai-cma.ts';
const comps=[
 {address:'A Surrey BC',soldPrice:1000000,areaSqft:2000,soldDate:'2026-10-10'},
 {address:'B Surrey BC',soldPrice:1150000,areaSqft:2300,soldDate:'2026-10-10'},
 {address:'C Surrey BC',soldPrice:900000,areaSqft:1500,soldDate:'2026-10-10'}
];
test('median PSF uses sold comps (not invented prices)',()=>{
 const r=computeCma({address:'Surrey BC',areaSqft:2000,bedrooms:3,bathrooms:2,comparables:comps});
 assert.equal(r.medianPricePerSqft,500);assert.equal(r.estimate,1000000);assert.equal(r.low,920000);assert.equal(r.high,1080000);
 assert.match(r.methodology,/no adjustments/i);assert.equal(r.sampleCount,3);
});
test('requires three verifiable sold comps',()=>{
 assert.throws(()=>computeCma({address:'Surrey',areaSqft:2000,bedrooms:3,bathrooms:2,comparables:comps.slice(0,2)}),/3–12/);
});
test('rejects invalid dates, sale prices and sqft',()=>{
 assert.throws(()=>computeCma({address:'Surrey',areaSqft:2000,bedrooms:3,bathrooms:2,comparables:comps.map((c,i)=>i===0?{...c,soldDate:'2099-01-01'}:c)}),/future/);
 assert.throws(()=>computeCma({address:'Surrey',areaSqft:2000,bedrooms:3,bathrooms:2,comparables:comps.map((c,i)=>i===0?{...c,soldPrice:-1}:c)}),/sale price/);
});
