import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const sql=read('supabase/085_platform_email_verification.sql'),ui=read('app/admin/page.tsx'),edge=read('supabase/functions/platform-admin-email/index.ts');
test('overview requires server-side email proof',()=>assert.match(sql,/IF NOT public\.rv_platform_email_verified\(\)/));
test('password and live session required',()=>{assert.match(sql,/"method":"password"/);assert.match(sql,/auth\.sessions/);assert.match(sql,/session_id::text=auth\.jwt\(\)->>'session_id'/)});
test('issue restricted to service role',()=>{assert.match(sql,/REVOKE ALL ON FUNCTION public\.rv_platform_email_issue\(uuid,uuid,text\) FROM PUBLIC, anon, authenticated, service_role/);assert.match(sql,/GRANT EXECUTE ON FUNCTION public\.rv_platform_email_issue\(uuid,uuid,text\) TO service_role/)});
test('code limits and consumption',()=>{for(const re of [/attempts>=5/,/issue_count>=5/,/60 seconds/,/10 minutes/,/verified_until IS NOT NULL/,/1 hour/])assert.match(sql,re)});
test('email sent only to authenticated owner',()=>{assert.match(edge,/auth\.getUser\(token\)/);assert.match(edge,/rv_platform_email_context/);assert.match(edge,/to:u\.data\.user\.email/);assert.doesNotMatch(edge,/req\.json\(/)});
test('UI uses email instead of TOTP',()=>{assert.match(ui,/platform-admin-email/);assert.match(ui,/rv_platform_email_verify/);assert.doesNotMatch(ui,/auth\.mfa\./)});
