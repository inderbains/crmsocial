import test from 'node:test';
import assert from 'node:assert/strict';
import {buildStageSnapshot,percent} from '../lib/lead-funnel-analytics.mjs';

test('shows only real counts, never sample numbers',()=>{
 const r=buildStageSnapshot({New:4});
 assert.equal(r.total,4); assert.deepEqual(r.rows.map(x=>x.reached),[4,0,0,0,0,0]);
 assert.equal(r.rows[0].reachPct,100);assert.equal(r.rows[1].fromPriorPct,0);
});
test('stage totals and cumulative order are derived accurately',()=>{
 const r=buildStageSnapshot({New:10,Contacted:8,Qualified:6,Active:4,'Under contract':2,Closed:1,Lost:3});
 assert.equal(r.total,34);assert.equal(r.closed,1);assert.equal(r.qualifiedOrLater,13);
 assert.deepEqual(r.rows.map(x=>x.reached),[34,21,13,7,3,1]);
 assert.equal(r.rows[1].reachPct,61.8);
 assert.equal(r.rows[1].fromPriorPct,61.8);
});
test('no fake conversion percentage with empty denominator',()=>{
 assert.equal(percent(0,0),null);assert.equal(percent(2,0),null);
 assert.equal(percent(5,10),50);assert.equal(buildStageSnapshot().total,0);
});
test('lost contacts are excluded from post-capture progression',()=>{
 const r=buildStageSnapshot({Lost:8,Contacted:2,Closed:1});
 assert.equal(r.total,11);assert.equal(r.rows[0].reached,11);
 assert.equal(r.rows[1].reached,3);assert.equal(r.lost,8);
});
