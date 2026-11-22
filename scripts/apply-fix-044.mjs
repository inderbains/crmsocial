/** RealVolt Fix 044 non-destructive merge for the current project.
 * Usage: node /path/to/fix044/scripts/apply-fix-044.mjs /path/to/crmsocial
 * Existing files are modified by anchored transformations, not overwritten from older snapshots.
 */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const release=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const repo=path.resolve(process.argv[2]||process.cwd());
const read=p=>fs.readFileSync(path.join(repo,p),'utf8');
const from=p=>fs.readFileSync(path.join(release,p),'utf8');
const changes=new Map();
function edit(p,fn){const raw=read(p);const next=fn(raw);if(next===raw&&!raw.includes('rv044'))console.log('No change',p);else if(next!==raw)changes.set(p,next)}
function ensure(s,anchor,p){if(!s.includes(anchor))throw new Error('Unexpected source in '+p+': missing '+anchor.slice(0,70));}
function once(s,needle,insert,p){if(s.includes(insert))return s;ensure(s,needle,p);return s.replace(needle,insert+needle)}
try{
 edit('app/transactions.tsx',s=>{
  const p='app/transactions.tsx';
  s=once(s,"import ClosingPanel from './closing-panel';","import ComplianceClosingPanel from './compliance-closing-panel';\n",p);
  const old="if(!r.error)setDocs(r.data)}};";
  if(s.includes(old))s=s.replace(old,"if(!r.error){setDocs(r.data);setDocumentRevision(n=>n+1)}}};");
  const panel="{active.kind==='Sale'&&['Completed','Archived'].includes(active.rv_stage||'')&&<ComplianceClosingPanel key={active.id+'-'+documentRevision} deal={active} docs={docs} office={backOffice} notify={notify} onSaved={refreshFile}/>}";
  s=once(s,"{backOffice&&active.review_status==='Submitted'",panel,p);
  if(!s.includes('onSaved={refreshFile}/>')||!s.includes('<ClosingPanel')){
   const re=/<ClosingPanel (.*?)notify=\{notify\}\s*\/>/s;
   if(!re.test(s))throw new Error('Cannot safely extend ClosingPanel in '+p);
   s=s.replace(re,(m)=>m.replace('notify={notify}','notify={notify} onSaved={refreshFile}'));
  }
  return s;
 });
 edit('app/transaction-actions.tsx',s=>{
  if(s.includes("db.rpc('rv_close_compliant_file'"))return s;
  const needle="const r=await db.rpc('rv_tx_action',{p_deal:deal.id,p_action:action,p_date:needsDate?date:null,p_document:needsPDF?document:null,p_note:note});";
  ensure(s,needle,'app/transaction-actions.tsx');return s.replace(needle,"const r=action==='archive'?await db.rpc('rv_close_compliant_file',{p_deal:deal.id}):await db.rpc('rv_tx_action',{p_deal:deal.id,p_action:action,p_date:needsDate?date:null,p_document:needsPDF?document:null,p_note:note});");
 });
 edit('app/deal-admin.tsx',s=>{
  const p='app/deal-admin.tsx',updated=from(p);
  if(s.includes('Compliance documents by transaction stage'))return s;
  const baseStart='<h2>Required documents</h2>',baseEnd='{canCheck&&<div className="actions"><input aria-label="New required document"';
  const targetStart='<h2>Compliance documents by transaction stage</h2>';
  const i=s.indexOf(baseStart),j=s.indexOf(baseEnd,i),a=updated.indexOf(targetStart),b=updated.indexOf(baseEnd,a);
  if(i<0||j<0||a<0||b<0)throw new Error('Cannot safely replace document checklist in '+p);
  s=s.slice(0,i)+updated.slice(a,b)+s.slice(j);
  s=s.replace('type Requirement={id:string;label:string;document_id:string|null;verified:boolean};','type Requirement={id:string;label:string;document_id:string|null;verified:boolean;rv_phase?:string;rv_required?:boolean;rv_waived?:boolean;rv_waiver_reason?:string};');
  s=s.replace(".eq('deal_id',dealId).order('label')", ".eq('deal_id',dealId).order('rv_phase').order('label')");
  s=s.replace(" const canCheck=backOffice", " const missingMandatory=requirements.filter(r=>r.rv_required!==false&&!r.rv_waived&&(!r.verified||!r.document_id));\n const canCheck=backOffice");
  s=s.replace(".insert({deal_id:dealId,label:label.trim()})", ".insert({deal_id:dealId,label:label.trim(),rv_phase:kind==='Listing'?'listing':'completion'})");
  s=s.replace('Install supabase/006_agent_reports.sql to enable document checklists, agent statements and activity history.','Document checklist unavailable. Verify migrations 006 and 044 in Supabase.');
  return s;
 });
 edit('app/closing-panel.tsx',s=>{
  const p='app/closing-panel.tsx',updated=from(p);
  s=once(s,"import {getSupabase} from '../lib/supabase';","import {saveClosingPDF} from '../lib/transaction-document-save';\n",p);
  if(!s.includes('onSaved?:()=>Promise<void>')){
   ensure(s,'notify:(s:string)=>void}){',p);s=s.replace('notify:(s:string)=>void}){','notify:(s:string)=>void;onSaved?:()=>Promise<void>}){');
   ensure(s,'{dealId,docs,notify}:',p);s=s.replace('{dealId,docs,notify}:','{dealId,docs,notify,onSaved}:');
  }
  if(!s.includes('async function saveCir()')){
   const fromStart=updated.indexOf(' async function saveCir()'),fromEnd=updated.indexOf(' function download(',fromStart);
   if(fromStart<0||fromEnd<0)throw new Error('Corrupt updated ClosingPanel');
   s=once(s,' function download(',updated.slice(fromStart,fromEnd),p);
  }
  if(!s.includes('Save CIR PDF to transaction file')){
   const marker='<button style={{marginTop:16}} className="btn primary"';
   const btn='<button type="button" style={{marginTop:16,marginRight:10}} className="btn" disabled={busy||docs.some(d=>d.name===\'Commission_Instruction_Report.pdf\')} onClick={()=>void saveCir()}>Save CIR PDF to transaction file</button>';
   s=once(s,marker,btn,p);
  }
  const list='{docs.map(d=><label key={d.id}';
  if(s.includes(list))s=s.replace(list,'{docs.filter(d=>!/(?:internal|agent[_ .-]*commission|commission[_ .-]*payable|FINTRAC|identity|ID[_ .-]*verification|agent[_ .-]*payout|office[_ .-]*fee)/i.test(d.name)).map(d=><label key={d.id}');
  return s;
 });
 edit('app/back-office.tsx',s=>{
  const p='app/back-office.tsx';
  s=once(s,"import OfficeAgentProfile from './office-agent-profile';","import OfficeFinancialCompliance from './office-financial-compliance';\nimport BrokerageComplianceRules from './brokerage-compliance-rules';\n",p);
  const view=" if(view==='Financial & compliance')return <><OfficeFinancialCompliance brokerageName={brokerage.name} deals={deals} accounts={accounts} ledger={ledger} reconciliations={recs} requirements={requirements.filter(r=>r.rv_required!==false&&!r.rv_waived)} payouts={payouts} audits={audits} statements={statements} billingAlerts={billingAlerts} onNavigate={onNavigate||(()=>{})}/><BrokerageComplianceRules brokerageId={brokerage.id} notify={notify}/></>;\n";
  s=once(s," if(view==='Dashboard')return",view,p);
  s=s.replace('requirements={requirements} payouts={payouts}', 'requirements={requirements.filter(r=>r.rv_required!==false&&!r.rv_waived)} payouts={payouts}');
  return s;
 });
 const edge='supabase/functions/closing-packet/index.ts';
 if(fs.existsSync(path.join(repo,edge))){edit(edge,s=>{
  const old='commission.statement|agent.payout|internal.deduction|office.fee|identity.verification';
  return s.includes(old)?s.replace(old,'commission.statement|commission.payable|internal.*commission|agent.payout|internal.deduction|office.fee|identity.verification|fintrac|identity|private.id'):s;
 })}
 const newFiles=['app/compliance-closing-panel.tsx','app/brokerage-compliance-rules.tsx','lib/transaction-document-save.ts','supabase/044_staged_compliance_archive.sql'];
 for(const p of newFiles){const next=from(p),full=path.join(repo,p);if(!fs.existsSync(full)||read(p)!==next)changes.set(p,next)}
 if(!fs.existsSync(path.join(repo,'package.json')))throw new Error('Provide the root of the RealVolt project, not an individual app folder.');
 if(process.argv.includes('--dry-run')){console.log('Dry-run:',[...changes.keys()].join(', '));process.exit(0)}
 const backupDir=path.join(repo,'rv044-original-backups');
 fs.mkdirSync(backupDir,{recursive:true});
 for(const [p,next] of changes){const target=path.join(repo,p);fs.mkdirSync(path.dirname(target),{recursive:true});if(fs.existsSync(target)){
  const backup=path.join(backupDir,p+'.txt');fs.mkdirSync(path.dirname(backup),{recursive:true});fs.copyFileSync(target,backup);
 }fs.writeFileSync(target,next,'utf8');console.log('Updated',p)}
 console.log('Application merge complete. Next: run SQL 044 in staging, npm run build, and test file lifecycle before production.');
}catch(e){console.error('Fix 044 stopped safely:',e.message);process.exit(1)}
