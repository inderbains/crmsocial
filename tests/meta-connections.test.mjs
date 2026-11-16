import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=(p)=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('separates personal and brokerage Meta assets',()=>{
 const ui=read('app/meta-connections.tsx');
 assert.match(ui,/connection_scope==='agent'/);
 assert.match(ui,/connection_scope==='brokerage'/);
 assert.match(ui,/Authorize .* Meta accounts/);
});
test('campaign plans link verified ad account and Page',()=>{
 const ui=read('app/meta-ads.tsx');
 assert.match(ui,/meta_ad_account_id/);assert.match(ui,/meta_page_id/);
 assert.match(ui,/special_ad_category:'HOUSING'/);
 assert.match(ui,/ads_management/);
});
test('read-only asset lists and server-only Meta credentials are enforced',()=>{
 const sql=read('supabase/018_meta_social_ads_connections.sql');
 for(const table of ['rv_meta_connections','rv_meta_assets','rv_meta_secret_tokens','rv_meta_page_tokens','rv_meta_oauth_states'])assert.match(sql,new RegExp(`alter table public\\.${table} enable row level security`));
 assert.match(sql,/revoke all on public.rv_meta_secret_tokens from public,anon,authenticated/);
 assert.match(sql,/rv_validate_meta_ad_assets/);
 assert.doesNotMatch(read('app/meta-connections.tsx'),/service_role|META_APP_SECRET|page_access_token/);
});
test('connector never creates a paid ad or public social post',()=>{
 const fn=read('supabase/functions/meta-connect/index.ts');
 assert.match(fn,/meta-connect/);
 assert.match(fn,/getUser\(jwt\)/);
 assert.match(fn,/state_hash:await sha256\(state\)/);
 assert.doesNotMatch(fn,/\/campaigns|\/adsets|\/ads\b|\/media_publish|\/feed\b/);
});
