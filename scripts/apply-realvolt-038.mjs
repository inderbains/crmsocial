#!/usr/bin/env node
/** RealVolt 038 - merge-only installer. Apply to a FRESH checkout; backups outside repo. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const bundle=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const repo=process.argv[2]&&path.resolve(process.argv[2]);
const code=fs.existsSync(path.join(bundle,'github-files'))?path.join(bundle,'github-files'):bundle;
function abort(reason){console.error('RealVolt 038 STOPPED — no project files changed.\n'+reason);process.exit(1)}
if(!repo || !fs.existsSync(path.join(repo,'package.json')))abort('Usage: node /path/to/RealVolt_038/scripts/apply-realvolt-038.mjs /path/to/crmsocial');
function read(rel){const p=path.join(repo,rel);if(!fs.existsSync(p))abort('Missing '+rel+' in target repository');return fs.readFileSync(p,'utf8')}
function onceReplace(text,search,replacement,label){if(!text.includes(search))abort('Expected integration point not found: '+label+' — latest source needs a manual merge');return text.replace(search,replacement)}
const changed=new Map();
const backPath='app/back-office.tsx';let back=read(backPath);
if(!back.includes("import OfficeFinancialCompliance from './office-financial-compliance';")){
 back=onceReplace(back,"import BackOfficeDashboard from './back-office-dashboard';","import BackOfficeDashboard from './back-office-dashboard';\nimport OfficeFinancialCompliance from './office-financial-compliance';",'Back Office financial import');
}
const oldUpdates='<section className="panel personal-dates-card"><TransactionUpdates userId={userId} office/></section>';
back=back.replace(oldUpdates,'');
if(!back.includes('<TransactionUpdates'))back=back.replace("import TransactionUpdates from './transaction-updates';",'');
// Earlier Fix037 zip contained Dashboard requiring userId while older Back Office caller omitted it.
back=back.replace(/<BackOfficeDashboard(?!\s+userId=)/,'<BackOfficeDashboard userId={userId}');
if(!back.includes("if(view==='Financial & compliance')")){
 const anchor='\n return <><div className="headrow">';
 const code='\n if(view===\'Financial & compliance\')return <OfficeFinancialCompliance brokerageName={brokerage.name} deals={deals} accounts={accounts} ledger={ledger} reconciliations={recs} requirements={requirements} payouts={payouts} audits={audits} statements={statements} billingAlerts={billingAlerts} onNavigate={onNavigate||(()=>{})}/>;';
 back=onceReplace(back,anchor,code+anchor,'Financial & compliance route');
}
if(back.includes('<TransactionUpdates userId={userId} office/>'))abort('The duplicate legacy Back Office notices remain; review back-office.tsx before applying.');
changed.set(backPath,back);

const navPath='app/realvolt-workspace.tsx';let nav=read(navPath);
// The route must be visible both in the flat navigation and the grouped Trust & Accounting menu.
nav=nav.replaceAll("'Bank reconciliation','Reports','Audit & controls'","'Bank reconciliation','Financial & compliance','Reports','Audit & controls'");
if(!nav.includes("'Financial & compliance'"))abort('Could not integrate Financial & compliance navigation — current menu differs.');
if(!nav.includes('realvolt:open-transaction'))abort('No transaction deep-link event in workspace; inbox items could not open the correct file.');
if(!nav.includes('realvolt:open-crm-contact')){
 nav=onceReplace(nav,'const [notificationDeal,setNotificationDeal]=useState<string|undefined>(undefined);','const [notificationDeal,setNotificationDeal]=useState<string|undefined>(undefined);\n const [rv038ContactId,setRv038ContactId]=useState<string|undefined>(undefined);','CRM selection state');
 const listener=" useEffect(()=>{const open=(event:Event)=>{const id=(event as CustomEvent<{id:string}>).detail?.id;if(!id)return;if(!window.dispatchEvent(new Event('realvolt:before-navigate',{cancelable:true})))return;setRv038ContactId(id);setNotificationDeal(undefined);setPage('CRM');setSectionView('Contacts');window.scrollTo(0,0)};const tasks=()=>{if(!window.dispatchEvent(new Event('realvolt:before-navigate',{cancelable:true})))return;setRv038ContactId(undefined);setPage('CRM');setSectionView('Follow-ups');window.scrollTo(0,0)};window.addEventListener('realvolt:open-crm-contact',open);window.addEventListener('realvolt:open-crm-tasks',tasks);return()=>{window.removeEventListener('realvolt:open-crm-contact',open);window.removeEventListener('realvolt:open-crm-tasks',tasks)}},[]);\n";
 nav=onceReplace(nav,' useEffect(()=>{const clear=()=>setNotificationDeal(undefined);',listener+' useEffect(()=>{const clear=()=>setNotificationDeal(undefined);','workspace transaction listener');
 nav=onceReplace(nav,'<CRM userId={user.id} notify={notify} view={sectionView}/>','<CRM userId={user.id} notify={notify} view={sectionView} openContactId={rv038ContactId}/>','CRM render');
}
changed.set(navPath,nav);

const crmPath='app/crm.tsx';let crm=read(crmPath);
if(!crm.includes('openContactId?:string')){
 crm=onceReplace(crm,'export default function CRM({userId,notify,view="Overview"}:{userId:string;notify:(s:string)=>void;view?:string}){','export default function CRM({userId,notify,view="Overview",openContactId}:{userId:string;notify:(s:string)=>void;view?:string;openContactId?:string}){','CRM props');
 const anchor=' useEffect(()=>{void reload()},[reload]);';
 crm=onceReplace(crm,anchor,anchor+"\n useEffect(()=>{if(openContactId&&!loading&&!error&&contacts.some(c=>c.id===openContactId)){setSelected(openContactId);setTab('Contacts')}},[openContactId,contacts,loading,error]);",'CRM data load hook');
}
changed.set(crmPath,crm);

// TypeScript includes every tsx file, even examples placed in /reference-only or /edge-editor.
const configPath='tsconfig.json';const configText=read(configPath);let config;
try{config=JSON.parse(configText)}catch{abort('tsconfig.json is not plain JSON; please merge exclusions manually')}
config.exclude ||= ['node_modules'];
for(const p of ['reference-only','edge-editor','reference-patched-parent-files','realvolt-fix*-backup-*'])if(!config.exclude.includes(p))config.exclude.push(p);
changed.set(configPath,JSON.stringify(config,null,2)+'\n');

// A transaction-detail page should render only one action selector.
const tx=read('app/transactions.tsx');
const txActions=[...tx.matchAll(/<TransactionActions\b/g)].length;
if(txActions!==1)abort(`Transaction Actions markup count is ${txActions}; expected exactly 1. This may explain the repeated buttons. Use the actual current transactions.tsx to resolve duplicates before deploying.`);

for(const rel of ['app/Office036.module.css','app/SmartInbox037.module.css','app/SmartInbox037.tsx','app/personal-dates.tsx','app/back-office-dashboard.tsx','app/office-financial-compliance.tsx','app/transaction-actions.tsx','lib/office-insights.mjs','lib/office-insights.d.mts','tests/office-insights-038.test.mjs']){
 const from=path.join(code,rel);if(!fs.existsSync(from))abort('Package missing '+rel);
 changed.set(rel,fs.readFileSync(from,'utf8'));
}
const backup=fs.mkdtempSync(path.join(os.tmpdir(),'realvolt038-backup-'));
for(const [rel,data] of changed){const dst=path.join(repo,rel),old=path.join(backup,rel);fs.mkdirSync(path.dirname(dst),{recursive:true});if(fs.existsSync(dst)){fs.mkdirSync(path.dirname(old),{recursive:true});fs.copyFileSync(dst,old)}fs.writeFileSync(dst,data)}
console.log(`Applied RealVolt Fix 038 to ${repo}.\nOriginal changed files backed up outside repo at ${backup}`);
console.log('Next: npm run typecheck && npm run build && node --test tests/office-insights-038.test.mjs');
console.log('Do not upload the entire source archive or example directories to GitHub.');
