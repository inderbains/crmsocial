import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const page=read('app/page.tsx');
const home=read('app/workspace-home.tsx');
const meta=read('app/meta-connections.tsx');
const css=read('app/globals.css');
test('Back Office menu depends on verified admin membership',()=>{
 assert.match(page,/isBrokerageAdmin\?\['Back Office'\]:\[\]/);
 assert.match(page,/rpc\('is_brokerage_admin'/);
 assert.match(page,/membership\.data\?\.role==='admin'/);
 assert.match(page,/p==='Back Office'&&!isBrokerageAdmin/);
});
test('Office-specific views are only rendered for brokerage admins',()=>{
 for(const office of ['Office Meta Accounts','Office DDF & Listings','Office Lead Routing','Brokerage Control']){
  assert.ok(page.includes(`sectionView==='${office}'`),office+' must have a protected view');
 }
 assert.match(page,/page==='Back Office'&&isBrokerageAdmin&&sectionView==='Office Meta Accounts'/);
});
test('Agent account cannot self-select a brokerage role',()=>{
 assert.doesNotMatch(home,/htmlFor="workspace-type"/);
 assert.match(home,/isBrokerageAdmin\?\[\{name:'Back Office'/);
 assert.match(home,/isBrokerageAdmin\?'BROKERAGE ADMIN':'AGENT WORKSPACE'/);
});
test('Meta agent and brokerage views are fixed to navigation context',()=>{
 assert.match(meta,/const scope=initialScope/);
 assert.doesNotMatch(meta,/setScope/);
 assert.match(meta,/scope==='brokerage'&&!loading&&!officeId/);
 assert.match(meta,/rpc\('is_brokerage_admin'/);
});
test('Mobile navigation is responsive and accessible',()=>{
 assert.match(page,/aria-label="Open navigation"/);
 assert.match(page,/aria-expanded=\{mobileMenuOpen\}/);
 assert.match(page,/aria-label="Close navigation"/);
 assert.match(css,/\.rv-mobile-scrim/);
 assert.match(css,/@media\(max-width:760px\)/);
});
