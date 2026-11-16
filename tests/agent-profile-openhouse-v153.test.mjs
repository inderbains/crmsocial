import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {openHouseDateTimeToIso,openHouseLocalParts,OPEN_HOUSE_POSTER_TEMPLATES} from '../lib/open-house.ts';
import {agentMediaUrl,safeWebsite} from '../lib/agent-profile.ts';
const file = path=>readFileSync(new URL(path,import.meta.url),'utf8');

test('open house has five selectable poster styles',()=>{
 assert.deepEqual(OPEN_HOUSE_POSTER_TEMPLATES.map(x=>x.id),['classic','modern','luxury','minimal','bold']);
 const editor=file('../app/open-house-manager.tsx');
 assert.match(editor,/OPEN_HOUSE_POSTER_TEMPLATES\.map/);
 assert.match(editor,/poster_template:form\.poster_template/);
 assert.match(editor,/rv-openhouse-poster rv-oh-style-/);
});

test('a single local event date uses from/to fields and respects time zone',()=>{
 assert.equal(openHouseDateTimeToIso('2026-11-15','13:00','America/Vancouver'),'2026-11-15T21:00:00.000Z');
 assert.deepEqual(openHouseLocalParts('2026-11-15T21:00:00.000Z','America/Vancouver'),{date:'2026-11-15',time:'13:00'});
 assert.equal(openHouseDateTimeToIso('2026-07-15','13:00','America/Vancouver'),'2026-07-15T20:00:00.000Z');
 assert.throws(()=>openHouseDateTimeToIso('2026-03-08','02:30','America/Vancouver'));
 assert.throws(()=>openHouseDateTimeToIso('2026-02-30','11:00','America/Vancouver'));
 const manager=file('../app/open-house-manager.tsx');
 assert.match(manager,/Open house date/);
 assert.match(manager,/From<\/label>/);
 assert.match(manager,/To<\/label>/);
});

test('agents edit own public profile, and Open House pulls it',()=>{
 const profile=file('../app/agent-marketing-editor.tsx');
 const openHouse=file('../app/open-house-manager.tsx');
 const account=file('../app/agent-account.tsx');
 assert.match(profile,/agent_workspace_profiles/);
 assert.match(profile,/\.eq\('user_id',userId\)/);
 assert.match(profile,/onConflict:'user_id'/);
 assert.match(profile,/Agent biography/);
 assert.match(profile,/Agent headshot/);
 assert.match(account,/<AgentMarketingEditor userId=/);
 assert.match(openHouse,/agentProfile\?\.full_name/);
 assert.match(openHouse,/Refresh from My Profile/);
 assert.match(openHouse,/Edit My Profile/);
});

test('public photos constrained to user folder and marketing-only imagery',()=>{
 const sql=file('../supabase/022_agent_marketing_profile_open_house_templates.sql');
 assert.match(sql,/storage\.foldername\(name\)/);
 assert.match(sql,/SELECT auth\.uid\(\)/);
 assert.match(sql,/rv_agent_marketing_profile_owner_files/);
 assert.match(sql,/poster_template IN \('classic','modern','luxury','minimal','bold'\)/);
 assert.ok(agentMediaUrl('https://db.example','agent123/headshot/photo.png').endsWith('/agent123/headshot/photo.png'));
 assert.equal(safeWebsite('javascript:alert(1)'),false);
 assert.equal(safeWebsite('https://example.com'),true);
});
