import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const root=new URL('../',import.meta.url);
const read=(path)=>readFileSync(new URL(path,root),'utf8');
const personal=read('app/personal-dates.tsx');
const inbox=read('app/SmartInbox037.tsx');
const home=read('app/workspace-home.tsx');
const css=read('app/SmartInbox037.module.css');
const sql=read('supabase/045_agent_and_brokerage_home.sql');

test('editable quote has no motivation heading and reminder button is renamed',()=>{
 assert.match(personal,/quoteEditing\?<form/);
 assert.match(personal,/Edit your dashboard quote/);
 assert.doesNotMatch(personal,/My motivation/);
 assert.match(personal,/\+ Add reminder/);
 assert.doesNotMatch(personal,/\+ Add date/);
});
test('sales goal uses only month firm sales and not legal completion event',()=>{
 assert.match(personal,/\.in\('rv_stage',\['Sold','Completed','Archived'\]\)/);
 assert.match(personal,/\.gte\('rv_firm_date',monthStart\)/);
 assert.match(personal,/\.lte\('rv_firm_date',today\)/);
 assert.match(personal,/\.eq\('kind','Sale'\)/);
 assert.match(personal,/\.gt\('sale_price',0\)/);
});
test('brokerage goal uses existing secure brokerage leaderboard',()=>{
 assert.match(personal,/db\.rpc\('rv_brokerage_sales_leaderboard'/);
 assert.match(personal,/brokerageHome\?'Office monthly sales goal':'Monthly sales goal'/);
 assert.match(home,/brokerageHome=\{isBrokerageAdmin\}/);
 assert.match(home,/brokerageId=\{brokerageId\}/);
});
test('five categories include completed reminders and stay collapsed by default',()=>{
 for(const s of ['Reminders','Upcoming','Activity','Clients','Completed'])assert.match(personal,new RegExp(`label:'${s}'`));
 assert.match(inbox,/useState<InboxKey\|null>\(null\)/);
 assert.match(inbox,/\|'completed';/);
});
test('preferences tables have brokerage admin RLS and private agent settings',()=>{
 assert.match(sql,/CREATE TABLE IF NOT EXISTS public\.rv_agent_dashboard_preferences/);
 assert.match(sql,/CREATE TABLE IF NOT EXISTS public\.rv_brokerage_dashboard_preferences/);
 assert.match(sql,/user_id=auth\.uid\(\)/);
 assert.match(sql,/public\.is_brokerage_admin\(brokerage_id\)/);
});
test('existing Back Office code is not included or overwritten',()=>{
 assert.doesNotMatch(home,/back-office-dashboard\.tsx/);
 assert.match(css,/\.personalMain\{grid-template-columns/);
});
