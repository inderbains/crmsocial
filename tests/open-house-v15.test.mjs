import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import fs from 'node:fs';
const require=createRequire(import.meta.url);
const qrSource=require('../lib/vendor/qrcode/index.js');
const errLevel=require('../lib/vendor/qrcode/QRErrorCorrectLevel.js');
const root=new URL('../',import.meta.url);
const read=(p)=>fs.readFileSync(new URL(p,root),'utf8');

test('QR generator creates a full code for an open house URL',()=>{
 const value='https://realvolt.ca/open-house/?id=987fcdeb-51a2-43ce-aafb-123456789abc';
 const qr=new qrSource(0,errLevel.M);qr.addData(value);qr.make();
 const size=qr.getModuleCount();assert.ok(size>=25&&size<=81);assert.equal(qr.modules.length,size);
 assert.equal(qr.isDark(0,0),true);assert.ok(qr.modules.every(row=>row.length===size));
});
test('app routes Open Houses from agent workspace and keeps brokerage controls separate',()=>{
 const p=read('app/page.tsx'),home=read('app/workspace-home.tsx');
 assert.match(p,/page==='Open Houses'&&<OpenHouseManager/);
 assert.match(p,/onOpenHouses=\{\(\)=>navigate\('Open Houses'\)\}/);
 assert.match(home,/m\.name==='Open Houses'\?onOpenHouses\(\)/);
 assert.match(home,/isBrokerageAdmin\?\[/);
});
test('visitor check-in waits for successful registration before opening sheet',()=>{
 const p=read('app/open-house/page.tsx');
 assert.ok(p.indexOf("rpc('register_open_house_visitor'")<p.indexOf('await unlock(pass)'));
 assert.match(p,/type="email"/);assert.match(p,/type="tel"/);
 assert.match(p,/marketing_consent:marketing/);
});
test('database restricts check-in identities and connects CRM follow-up',()=>{
 const s=read('supabase/021_open_house_qr_checkin.sql');
 for(const v of ['ENABLE ROW LEVEL SECURITY','FOR SELECT TO authenticated','REVOKE ALL ON public.open_house_checkins FROM public,anon,authenticated','INSERT INTO public.crm_contacts','INSERT INTO public.crm_notes','INSERT INTO public.crm_tasks','open_house_sheet_for_pass','p_marketing_consent','sheet_path IS NOT NULL']) assert.ok(s.includes(v),v);
 assert.match(s,/open_house_publish_requires_sheet/);
 assert.match(s,/storage\.foldername\(name\)/);
});
test('signage exports through browser print with locally rendered QR code',()=>{
 const p=read('app/open-house-manager.tsx'), css=read('app/globals.css');
 assert.match(p,/window\.print\(\)/);assert.match(p,/<QRImage url=\{link\}/);
 assert.match(css,/@media print/);assert.match(css,/\.rv-openhouse-poster/);
});
