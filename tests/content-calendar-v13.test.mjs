import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {dirname,resolve} from 'node:path';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const {newDraft}=await import(pathToFileURL(resolve(root,'lib/designs.ts')).href);
const calendar=await import(pathToFileURL(resolve(root,'lib/content-calendar.ts')).href);

test('month grid begins on a Sunday and fully covers month',()=>{
 const days=calendar.monthDays(2026,10);
 assert.equal(days[0].key,'2026-11-01');
 assert.equal(days.filter(d=>d.inMonth).length,30);
 assert.equal(days.length%7,0);
 assert.ok(days.length>=35);
});
test('legacy single-platform drafts remain compatible',()=>{
 const x={...newDraft(0),platform:'Facebook',channels:undefined,date:'2026-11-16T09:30'};
 assert.deepEqual(calendar.draftChannels(x),['Facebook']);
 assert.equal(calendar.draftStatus(x),'planned');
});
test('multi-platform, archived, and unscheduled states are distinct',()=>{
 const x={...newDraft(0),date:'2026-11-16T11:00',channels:['Facebook','Instagram'],scheduleStatus:'ready'};
 assert.deepEqual(calendar.draftChannels(x),['Facebook','Instagram']);
 assert.equal(calendar.draftStatus(x),'ready');
 assert.equal(calendar.draftStatus({...x,date:''}),'draft');
 assert.equal(calendar.draftStatus({...x,date:'',scheduleStatus:'archived'}),'archived');
});
test('reject malformed dates and impossible calendar values',()=>{
 assert.equal(calendar.validLocalDateTime('2026-11-16T14:05'),true);
 assert.equal(calendar.validLocalDateTime('2026-02-30T14:05'),false);
 assert.equal(calendar.validLocalDateTime('2026-12-01T25:05'),false);
 assert.equal(calendar.validLocalDateTime('2026-12-01'),false);
});
test('planned list sorts and excludes archived, unscheduled posts',()=>{
 const x=newDraft(0);const a={...x,title:'Early',date:'2026-11-16T10:00'};const b={...x,title:'Later',date:'2026-11-18T10:00'};
 assert.deepEqual(calendar.plannedDrafts([b,{...x,title:'no date'},{...a,scheduleStatus:'archived'},a]).map(d=>d.title),['Early','Later']);
 assert.deepEqual(calendar.calendarStats([a,b,{...x,date:''},{...x,scheduleStatus:'archived'}]),{drafts:1,planned:2,ready:0,archived:1});
});
test('calendar is agent scoped and has no live publishing action',()=>{
 const page=readFileSync(resolve(root,'app/page.tsx'),'utf8');
 const app=readFileSync(resolve(root,'app/content-calendar.tsx'),'utf8');
 const css=readFileSync(resolve(root,'app/globals.css'),'utf8');
 assert.ok(page.includes('onSave={updateCalendarDraft}'));
 assert.ok(page.includes(".eq('user_id',user.id).select('id').single()"));
 assert.ok(app.includes('Planning only.'));
 assert.ok(app.includes('do not publish automatically'));
 assert.ok(!app.includes('/api/meta/publish'));
 assert.ok(css.includes('@media(max-width:600px)'));
});
