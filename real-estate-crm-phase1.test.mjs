import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const sql=readFileSync('supabase/rvcrm_20261118_real_estate_phase1.sql','utf8');
const ui=readFileSync('app/real-estate-crm/real-estate-crm.tsx','utf8');
const ai=readFileSync('app/api/rvcrm/ai-draft/route.ts','utf8');
test('new CRM tables all enable RLS',()=>{
 for(const t of ['rvcrm_real_estate_profiles','rvcrm_contact_deals','rvcrm_ai_drafts']){
  assert.ok(sql.includes(`alter table public.${t} enable row level security;`));
 }
});
test('CRM reuses canonical contacts, tasks, notes and deals',()=>{
 for(const t of ['crm_contacts','crm_tasks','crm_notes','deal_files']) assert.ok(ui.includes(`'${t}'`));
 assert.ok(!sql.includes('create table if not exists public.crm_contacts'));
});
test('link policies verify ownership at BOTH ends',()=>{
 assert.ok(sql.includes('rvcrm_owns_contact(contact_id,user_id) and public.rvcrm_owns_deal(deal_id,user_id)'));
 assert.ok(sql.includes("new.user_id <> auth.uid()"));
});
test('AI drafts require authenticated user and opt-in; no sending',()=>{
 for(const text of ['db.auth.getUser(token)','communication_consent','ai_draft_enabled','reviewRequired:true,sent:false']) assert.ok(ai.includes(text));
 assert.ok(!ai.includes('sendEmail('));assert.ok(!ai.includes('sendSms('));
});
