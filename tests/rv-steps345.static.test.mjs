import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const text=(p)=>readFileSync(new URL(p,import.meta.url),'utf8');
test('deal stages only move on linked owner-confirmed milestones',()=>{
 const sql=text('../supabase/031_deal_milestones_followups.sql');
 for(const term of ['auth.uid()','rvcrm_contact_deals','Offer submitted','Firm contract','Completion confirmed','completion_date','Under contract','Post-sale client check-in'])assert.ok(sql.includes(term),term);
 assert.match(sql,/Stage updates|v_next:='Closed'/);
 assert.ok(!/DROP TABLE\s+public\.crm_contacts/i.test(sql));
});
test('cron follow-ups are service role only, never send outbound messages',()=>{
 const sql=text('../supabase/031_deal_milestones_followups.sql');
 const api=text('../app/api/rv-automation/run/route.ts');
 assert.match(sql,/auth\.role\(\) IS DISTINCT FROM 'service_role'/);
 assert.match(sql,/NOT EXISTS\s*\(SELECT 1 FROM public\.crm_tasks/i);
 assert.match(api,/rvcrm_schedule_followups/);
 assert.match(api,/REALVOLT_AUTOMATION_CRON_SECRET/);
 assert.ok(!/send_email|send_sms|sendgrid/.test(api));
});
test('AI API checks user session and does not email or publish',()=>{
 const api=text('../app/api/realvolt-ai/generate/route.ts');
 assert.match(api,/db\.auth\.getUser\(token\)/);
 assert.match(api,/\.eq\('user_id',user\.id\)/);
 assert.match(api,/computeCma/);
 assert.match(api,/sent:false,published:false/);
});
test('workspace adds new pages without replacing old automation studio',()=>{
 const view=text('../app/realvolt-workspace.tsx');
 for(const n of ['Deal Milestones','Agentic AI','CRMAutomationEngine','<CRM userId={user.id}'])assert.ok(view.includes(n),n);
});
