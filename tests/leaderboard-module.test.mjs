import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
const root=new URL('../',import.meta.url).pathname;
const home=readFileSync(join(root,'app/workspace-home.tsx'),'utf8');
const workspace=readFileSync(join(root,'app/realvolt-workspace.tsx'),'utf8');
const leaderboard=readFileSync(join(root,'app/agent-leaderboard.tsx'),'utf8');
const sql=readFileSync(join(root,'supabase/033_brokerage_sales_leaderboard.sql'),'utf8');

test('leaderboard appears as one application card, never as dashboard widget',()=>{
 assert.match(home,/name:'Leaderboard',description:/);
 assert.match(home,/icon:Trophy/);
 assert.doesNotMatch(home,/<AgentLeaderboard/);
 assert.doesNotMatch(home,/import AgentLeaderboard/);
});
test('clicking card routes to its own page in RealVolt workspace',()=>{
 assert.match(home,/onModule\(m.name as ModuleName\)/);
 assert.match(home,/ModuleName=[^;]*'Leaderboard'/);
 assert.match(workspace,/<AgentLeaderboard userId=\{user.id\} onBack=\{\(\)=>navigate\('My workspace'\)\}\/>/);
 assert.match(workspace,/page==='Leaderboard'/);
});
test('full monthly and annual ranking by volume or sales; no commission display',()=>{
 assert.match(leaderboard,/Monthly/);assert.match(leaderboard,/Yearly/);
 assert.match(leaderboard,/Volume/);assert.match(leaderboard,/Sales/);
 assert.match(leaderboard,/const visible=qualifiedRows/);
 assert.doesNotMatch(leaderboard,/qualifiedRows\.slice\(0,5\)/);
 assert.match(leaderboard,/getSupabase\(\)/);
 assert.match(leaderboard,/\.rpc\('rv_brokerage_sales_leaderboard'/);
 assert.doesNotMatch(leaderboard,/\.from\(['"]commissions/);
});
test('SQL enforces brokerage-scoped completed sales only, no payouts',()=>{
 assert.match(sql,/WHERE m\.user_id = auth\.uid\(\)/);
 assert.match(sql,/d\.brokerage_id = v_brokerage/);
 assert.match(sql,/ms\.event_type = 'Completion confirmed'/);
 assert.match(sql,/d\.completion_date >= v_period_start/);
 assert.match(sql,/count\(cs\.id\)/);
 assert.match(sql,/sum\(cs\.sale_price\)/);
 assert.doesNotMatch(sql,/commission_(?:before|total|earned)|listing_commission|selling_commission/i);
});
