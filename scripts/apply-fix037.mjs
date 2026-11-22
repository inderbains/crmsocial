#!/usr/bin/env node
/** Safely apply Fix037 to a CURRENT RealVolt repo copy; no files changed until preflight passes. */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
const src=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const repo=process.argv[2]&&path.resolve(process.argv[2]);
if(!repo||!fs.existsSync(path.join(repo,'package.json'))){console.error('Usage: node scripts/apply-fix037.mjs /path/to/crmsocial');process.exit(1)}
const read=p=>fs.readFileSync(path.join(repo,p),'utf8');
const requireReplace=(text,needle,replacement,desc)=>{if(!text.includes(needle))throw Error(`Fix037 cannot find ${desc}; current source differs. NO FILES CHANGED. Merge manually.`);return text.replace(needle,replacement)};
const pending=new Map();
const navPath='app/realvolt-workspace.tsx',crmPath='app/crm.tsx';
let nav=read(navPath),crm=read(crmPath);
// A direct client-opening event is routed through the existing workspace and CRM page.
if(!nav.includes("realvolt:open-crm-contact")){
 nav=requireReplace(nav,"const [notificationDeal,setNotificationDeal]=useState<string|undefined>(undefined);","const [notificationDeal,setNotificationDeal]=useState<string|undefined>(undefined);\n const [rv037ContactId,setRv037ContactId]=useState<string|undefined>(undefined);",'workspace notification state');
 const hook=" useEffect(()=>{const open=(event:Event)=>{const id=(event as CustomEvent<{id:string}>).detail?.id;if(!id)return;if(!window.dispatchEvent(new Event('realvolt:before-navigate',{cancelable:true})))return;setRv037ContactId(id);setNotificationDeal(undefined);setPage('CRM');setSectionView('Contacts');window.scrollTo(0,0)};const tasks=()=>{if(!window.dispatchEvent(new Event('realvolt:before-navigate',{cancelable:true})))return;setRv037ContactId(undefined);setPage('CRM');setSectionView('Follow-ups');window.scrollTo(0,0)};window.addEventListener('realvolt:open-crm-contact',open);window.addEventListener('realvolt:open-crm-tasks',tasks);return()=>{window.removeEventListener('realvolt:open-crm-contact',open);window.removeEventListener('realvolt:open-crm-tasks',tasks)}},[]);\n";
 const anchor=" useEffect(()=>{const clear=()=>setNotificationDeal(undefined);";
 if(!nav.includes(anchor))throw Error('Fix037 cannot find workspace navigation listener. NO FILES CHANGED.');
 nav=nav.replace(anchor,hook+anchor);
 nav=requireReplace(nav,"<CRM userId={user.id} notify={notify} view={sectionView}/>","<CRM userId={user.id} notify={notify} view={sectionView} openContactId={rv037ContactId}/>",'CRM render integration');
 }
if(!crm.includes('openContactId?:string')){
 crm=requireReplace(crm,'export default function CRM({userId,notify,view="Overview"}:{userId:string;notify:(s:string)=>void;view?:string}){','export default function CRM({userId,notify,view="Overview",openContactId}:{userId:string;notify:(s:string)=>void;view?:string;openContactId?:string}){','CRM props');
 const anchor=" useEffect(()=>{void reload()},[reload]);";
 crm=requireReplace(crm,anchor,anchor+"\n useEffect(()=>{if(openContactId&&!loading&&!error&&contacts.some(c=>c.id===openContactId)){setSelected(openContactId);setTab('Contacts')}},[openContactId,contacts,loading,error]);",'CRM data load hook');
}
pending.set(navPath,nav);pending.set(crmPath,crm);
for(const p of ['app/SmartInbox037.tsx','app/SmartInbox037.module.css','app/personal-dates.tsx','app/back-office-dashboard.tsx']){
 if(!fs.existsSync(path.join(src,p)))throw Error(`Patch archive missing ${p}. No files changed.`);
 pending.set(p,fs.readFileSync(path.join(src,p)));
}
for(const p of ['app/Office036.module.css','lib/office-insights.mjs','lib/office-insights.d.mts'])if(!fs.existsSync(path.join(repo,p)))pending.set(p,fs.readFileSync(path.join(src,p)));
const back=path.join(os.tmpdir(),`realvolt-fix037-backup-${path.basename(repo)}-${Date.now()}`);
fs.mkdirSync(back,{recursive:true});
for(const [p,body] of pending){const target=path.join(repo,p);fs.mkdirSync(path.dirname(target),{recursive:true});if(fs.existsSync(target)){const dst=path.join(back,p);fs.mkdirSync(path.dirname(dst),{recursive:true});fs.copyFileSync(target,dst)}fs.writeFileSync(target,body)}
console.log(`Fix037 applied to ${repo}. Backups outside repo: ${back}`);
console.log('Run: npm run build. Review diff before committing. No SQL is required.');
