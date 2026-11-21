import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
const root=new URL('../',import.meta.url).pathname;
const sql=readFileSync(join(root,'supabase/033_brokerage_sales_leaderboard.sql'),'utf8');
const page=readFileSync(join(root,'app/agent-leaderboard.tsx'),'utf8');
const workspace=readFileSync(join(root,'app/workspace-home.tsx'),'utf8');

test('leaderboard tenant isolation is derived from the signed-in user, not a client brokerage ID',()=>{
  assert.match(sql,/FROM public\.brokerage_members m\s+WHERE m\.user_id = auth\.uid\(\)/i);
  assert.match(sql,/d\.brokerage_id = v_brokerage/);
  assert.match(sql,/m\.brokerage_id = v_brokerage/);
  assert.match(sql,/SECURITY DEFINER/);
  assert.match(sql,/REVOKE ALL ON FUNCTION public\.rv_brokerage_sales_leaderboard\(text,text\)/);
  assert.doesNotMatch(sql,/p_brokerage_id/i);
});

test('sales require sale price, actual completion date, confirmed milestone, no commissions',()=>{
  assert.match(sql,/d\.kind = 'Sale'/);
  assert.match(sql,/d\.sale_price IS NOT NULL AND d\.sale_price > 0/);
  assert.match(sql,/d\.completion_date >= v_period_start/);
  assert.match(sql,/d\.completion_date < v_period_end/);
  assert.match(sql,/ms\.event_type = 'Completion confirmed'/);
  assert.match(sql,/count\(cs\.id\)/);
  assert.match(sql,/sum\(cs\.sale_price\)/);
  assert.doesNotMatch(sql,/commission_(?:before|total|earned)|listing_commission|selling_commission/i);
});

test('month and year in Vancouver and database decides sort order',()=>{
  assert.match(sql,/America\/Vancouver/);
  assert.match(sql,/p_period NOT IN \('month','year'\)/);
  assert.match(sql,/p_sort NOT IN \('volume','sales'\)/);
  assert.match(sql,/row_number\(\) OVER/);
});

test('workspace displays compact leaderboard with both period and rank controls',()=>{
  assert.match(workspace,/import AgentLeaderboard from '\.\/agent-leaderboard';/);
  assert.match(workspace,/<AgentLeaderboard userId=\{userId\}\/>/);
  assert.match(page,/Monthly/);
  assert.match(page,/Yearly/);
  assert.match(page,/Volume/);
  assert.match(page,/Sales/);
  assert.match(page,/qualifiedRows\.slice\(0,5\)/);
  assert.match(page,/getSupabase\(\)/);
  assert.match(page,/\.rpc\('rv_brokerage_sales_leaderboard'/);
});
