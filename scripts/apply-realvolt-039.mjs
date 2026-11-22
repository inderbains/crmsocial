#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const source=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const target=path.resolve(process.argv[2]||'');
function stop(message){console.error('Fix 039 stopped without changing files: '+message);process.exit(1)}
if(!process.argv[2]||!fs.existsSync(path.join(target,'package.json')))stop('Run: node scripts/apply-realvolt-039.mjs /path/to/crmsocial');
const read=(p)=>{const file=path.join(target,p);if(!fs.existsSync(file))stop('Missing required project file: '+p);return fs.readFileSync(file,'utf8')};
const original=read('app/back-office-dashboard.tsx');
const parent=read('app/back-office.tsx');
const css=read('app/globals.css');
if(!css.includes('.bo-module-grid')||!css.includes('.bo-module-card'))stop('Original module-card styles missing. Need current globals.css for an exact merge.');
if(!original.includes('function BackOfficeDashboard')||!original.includes('BackOfficeDashboard'))stop('Unrecognized Back Office dashboard source.');
if(!(original.includes('boMiniModules')||original.includes('const groups:Group[]')||original.includes('bo-module-card')))stop('Back Office dashboard differs from tested Fix 034/038; please provide latest source ZIP.');
if(!parent.includes('BackOfficeDashboard'))stop('Back Office parent has no dashboard component.');
if(!parent.includes("if(view==='Dashboard')"))stop('Back Office dashboard route changed. Please provide source ZIP.');
if(!parent.includes('onNavigate'))stop('Back Office routing is missing.');
if(!parent.includes('const [')||!parent.includes('const db='))stop('Unexpected back-office.tsx structure.');

let adjusted=parent;
const noticeBlock=/<section\s+className="panel personal-dates-card"\s*>\s*<TransactionUpdates\s+userId=\{userId\}\s+office\s*\/>\s*<\/section>/g;
adjusted=adjusted.replace(noticeBlock,'');
// In some builds the standalone component is unwrapped, but only remove the office-only instance.
adjusted=adjusted.replace(/<TransactionUpdates\s+userId=\{userId\}\s+office\s*\/>/g,'');
if(!adjusted.includes('<TransactionUpdates'))adjusted=adjusted.replace(/import TransactionUpdates from '\.\/transaction-updates';\s*/,'');
adjusted=adjusted.replace(/<BackOfficeDashboard(?!\s+userId=)/,'<BackOfficeDashboard userId={userId}');
const financeImport="import OfficeFinancialCompliance from './office-financial-compliance';";
if(!adjusted.includes(financeImport)){
 const anchor="import BackOfficeDashboard from './back-office-dashboard';";
 if(!adjusted.includes(anchor))stop('Could not find BackOfficeDashboard import in parent.');
 adjusted=adjusted.replace(anchor,anchor+'\n'+financeImport);
}
if(!adjusted.includes("if(view==='Financial & compliance')")){
 const anchor='\n return <><div className="headrow">';
 if(!adjusted.includes(anchor))stop('Could not locate parent route insertion point.');
 const route="\n if(view==='Financial & compliance')return <OfficeFinancialCompliance brokerageName={brokerage.name} deals={deals} accounts={accounts} ledger={ledger} reconciliations={recs} requirements={requirements} payouts={payouts} audits={audits} statements={statements} billingAlerts={billingAlerts} onNavigate={onNavigate||(()=>{})}/>;";
 adjusted=adjusted.replace(anchor,route+anchor);
}
if(adjusted.includes('<TransactionUpdates userId={userId} office/>'))stop('A duplicate legacy office-notification panel remains.');

// Parent uses existing distinct native modules; no modifications to transactions, payments, RLS or workspace routing.
const replacements=new Map([['app/back-office.tsx',adjusted]]);
for(const f of ['app/back-office-dashboard.tsx','app/office-financial-compliance.tsx','app/Office036.module.css','app/SmartInbox037.tsx','app/SmartInbox037.module.css','lib/office-insights.mjs','lib/office-insights.d.mts']){
 const src=path.join(source,f);
 if(!fs.existsSync(src))stop('Installer package incomplete: '+f);
 if(f==='app/back-office-dashboard.tsx'||f==='app/office-financial-compliance.tsx'||!fs.existsSync(path.join(target,f)))replacements.set(f,fs.readFileSync(src,'utf8'));
}
// TypeScript does not know how to compile Deno editor/reference-only code.
const tsconfigPath=path.join(target,'tsconfig.json');
if(fs.existsSync(tsconfigPath)){
 const raw=fs.readFileSync(tsconfigPath,'utf8');
 try{const conf=JSON.parse(raw);conf.exclude||=['node_modules'];if(!Array.isArray(conf.exclude))throw new Error('Invalid exclude');let changed=false;for(const p of ['reference-only','edge-editor','reference-patched-parent-files'])if(!conf.exclude.includes(p)){conf.exclude.push(p);changed=true}if(changed)replacements.set('tsconfig.json',JSON.stringify(conf,null,2)+'\n');}catch{console.warn('tsconfig.json is not plain JSON; exclude example folders manually if they exist.');}
}
// All validation and source reads are complete; only now start writing files.
const backup=fs.mkdtempSync(path.join(os.tmpdir(),'realvolt-039-backup-'));
for(const [rel,data] of replacements){const file=path.join(target,rel),backupFile=path.join(backup,rel);fs.mkdirSync(path.dirname(file),{recursive:true});if(fs.existsSync(file)){fs.mkdirSync(path.dirname(backupFile),{recursive:true});fs.copyFileSync(file,backupFile)}fs.writeFileSync(file,data)}
console.log(`Fix 039 applied to ${target}. Backups: ${backup}`);
console.log('Next: npm run build — only push to GitHub after a successful build and visual checks.');
