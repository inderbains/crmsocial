const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const base=path.resolve(__dirname,'..'); const read=p=>fs.readFileSync(path.join(base,p),'utf8');
const sql=read('supabase/088_platform_management.sql'), edge=read('supabase/functions/platform-account-control/index.ts'), ui=read('app/admin/management-panel.tsx'), page=read('app/admin/page.tsx');
const tests=[
 ['plan defaults and private schema',()=>{assert.match(sql,/4999/);assert.match(sql,/6999/);assert.match(sql,/REVOKE ALL ON rv_platform_private\.plans/)}],
 ['email verification gates and protected owner',()=>{assert.match(sql,/rv_platform_email_verified\(\) IS DISTINCT FROM true/);assert.match(sql,/Platform owner is protected/);assert.match(edge,/target\.data\.owner!==false/)}],
 ['brokerage plans assigned to brokerage',()=>{assert.match(sql,/ON CONFLICT\(brokerage_id\)/);assert.match(sql,/Plan does not match account type/)}],
 ['audit and no destructive auth actions',()=>{assert.match(edge,/rv_platform_signin_control_audit/);assert.doesNotMatch(edge,/deleteUser\(/);assert.match(ui,/No records have been deleted/)}],
 ['honest access and billing labels',()=>{assert.match(ui,/No recurring charges or entitlement enforcement yet/);assert.match(ui,/do not guarantee immediate revocation/);assert.doesNotMatch(edge,/stripe/i)}],
 ['session behavior retained',()=>{assert.match(page,/rv-platform-admin-086/);assert.match(page,/rv_platform_email_sign_out/);assert.match(page,/ManagementPanel sb=/)}]
]; for(const [name,fn] of tests){fn();console.log('PASS',name)}
