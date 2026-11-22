#!/usr/bin/env node
// Fix 040 - targeted, guarded patch for current RealVolt GitHub checkout.
// Does not modify Supabase, send emails, or execute financial operations.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const patch=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const target=process.argv[2]&&path.resolve(process.argv[2]);
const stop=message=>{console.error('Fix 040: '+message+' No files changed.');process.exit(1)};
if(!target||!fs.existsSync(path.join(target,'package.json')))stop('Provide your real crmsocial checkout: node scripts/apply-realvolt-040.mjs /path/to/crmsocial');
const read=(p)=>fs.existsSync(path.join(target,p))?fs.readFileSync(path.join(target,p),'utf8'):stop('Missing '+p);
const parent=read('app/back-office.tsx');
const dash=read('app/back-office-dashboard.tsx');
const css=read('app/globals.css');
const inbox=read('app/SmartInbox037.tsx');
const inboxStyle=read('app/SmartInbox037.module.css');
for(const f of ['lib/transaction-workflow.mjs','lib/office-insights.mjs','app/Office036.module.css'])read(f);
if(!css.includes('.bo-module-card')||!css.includes('.bo-module-grid'))stop('Original orange-icon Back Office module-card CSS missing. Apply Fix 039 first or supply your current code.');
if(!dash.includes('bo-module-card')||!dash.includes('BackOfficeDashboard')||!dash.includes('SmartInbox037'))stop('Back Office layout differs from the tested Fix 039 version. Do not overwrite it blindly.');
for(const mod of ['Review queue','Agent payments','Trust & bank','Accounting','Reporting','Compliance'])if(!dash.includes(`name:'${mod}'`))stop('Existing Back Office card not found: '+mod);
if(!parent.includes("if(view==='Dashboard')")||!parent.includes('<BackOfficeDashboard'))stop('Unrecognized Back Office route.');
if(!inbox.includes('useState<InboxKey|null>(null)'))stop('Compact inbox has been significantly changed.');

// Only remove the legacy *office-mode* standalone panel, not the agent's personal reminders.
// JSX is transformed only when the panel contains a single TransactionUpdates office component.
const entireStandalone=/<section\b[^>]*>\s*<TransactionUpdates\b(?=[^>]*\boffice\b)[^>]*\/>\s*<\/section>/g;
const singleStandalone=/<TransactionUpdates\b(?=[^>]*\boffice\b)[^>]*\/>/g;
function removeOfficeDuplicate(text){
 const before=text;
 text=text.replace(entireStandalone,'').replace(singleStandalone,'');
 if(/<TransactionUpdates\b(?=[^>]*\boffice\b)[^>]*\/>/.test(text))throw new Error('Unknown office-only TransactionUpdates markup remains.');
 if(!text.includes('<TransactionUpdates'))text=text.replace(/import\s+TransactionUpdates\s+from\s+['"]\.\/transaction-updates['"];?\s*/g,'');
 return {text,removed:before!==text};
}
let fixedParent, fixedWorkspace;
try{
 fixedParent=removeOfficeDuplicate(parent);
 if(fs.existsSync(path.join(target,'app/realvolt-workspace.tsx')))fixedWorkspace=removeOfficeDuplicate(read('app/realvolt-workspace.tsx'));
}catch(e){stop(e.message)}
fixedParent.text=fixedParent.text.replace(/<BackOfficeDashboard(?!\s+userId=)/,'<BackOfficeDashboard userId={userId}');
if(fixedParent.text.includes('<TransactionUpdates')&&/office\s*\/>/.test(fixedParent.text))stop('Still found an office-only standalone updates panel.');
const files=new Map();
for(const rel of ['app/back-office-dashboard.tsx','app/SmartInbox037.tsx','app/SmartInbox037.module.css']){
 const source=path.join(patch,rel);if(!fs.existsSync(source))stop('Incomplete patch package: '+rel);
 files.set(rel,fs.readFileSync(source,'utf8'));
}
if(fixedParent.text!==parent)files.set('app/back-office.tsx',fixedParent.text);
if(fixedWorkspace?.removed)files.set('app/realvolt-workspace.tsx',fixedWorkspace.text);
if(fixedParent.text.includes("<TransactionUpdates userId={userId} office"))stop('Old office updates still visible.');
// Validate source candidates before writing anything to the project.
if(!files.get('app/back-office-dashboard.tsx').includes("label:'Deal stages'"))stop('Missing Deal stages tab in patch.');
if(!files.get('app/SmartInbox037.tsx').includes("|'workflow'"))stop('Missing workflow inbox type.');
const backup=fs.mkdtempSync(path.join(os.tmpdir(),'realvolt-040-backup-'));
for(const [rel,text] of files){const dest=path.join(target,rel),saved=path.join(backup,rel);fs.mkdirSync(path.dirname(saved),{recursive:true});if(fs.existsSync(dest))fs.copyFileSync(dest,saved);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,text,'utf8')}
console.log('Fix 040 updated '+files.size+' file(s) in '+target);
for(const name of files.keys())console.log(' - '+name);
console.log('Backups: '+backup);
console.log('Next: npm run build. Only commit to GitHub after a successful build and visual check.');
