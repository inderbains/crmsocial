#!/usr/bin/env node
/** Idempotent, guarded merge. Pass the current crmsocial repository path as first argument. */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
let ts;
try{ts=require('typescript')}catch{throw new Error('Install dependencies first: npm install (TypeScript parser required)')}
const here=path.dirname(fileURLToPath(import.meta.url));
const source=path.resolve(here,'..');
const repo=path.resolve(process.argv[2]||'.');
const target=(file)=>path.join(repo,file);
const get=(file)=>fs.readFileSync(target(file),'utf8');
const needed=['app/office-agent-profile.tsx','app/agent-account.tsx','app/transactions.tsx','app/transaction-actions.tsx','package.json'];
for(const f of needed)if(!fs.existsSync(target(f)))throw Error('Missing '+f+'. Point installer to the current crmsocial checkout.');
const planned=new Map();
function set(file,code){planned.set(file,code)}
function insertBeforeExactly(s,needle,replacement,file){const i=s.indexOf(needle);if(i<0||s.indexOf(needle,i+1)>=0)throw Error('Cannot safely locate unique anchor in '+file+': '+needle.slice(0,75));return s.slice(0,i)+replacement+s.slice(i)}
const files=['app/agent-performance-summary.tsx','app/agent-performance-summary.module.css','lib/agent-performance.ts'];
for(const f of files)set(f,fs.readFileSync(path.join(source,f),'utf8'));
// 1. Brokerage Agent Profile: insert metrics above filters and tabs, reuse live prop data/RLS.
{
 const f='app/office-agent-profile.tsx';let s=get(f);
 if(!s.includes("import AgentPerformanceSummary from './agent-performance-summary';")){
   s=insertBeforeExactly(s,"import Transactions from './transactions';", "import AgentPerformanceSummary from './agent-performance-summary';\n", f);
 }
 if(!s.includes('<AgentPerformanceSummary')){
   const needle="{!agent.user_id&&<div className=\"notice\">";
   s=insertBeforeExactly(s,needle,'<AgentPerformanceSummary linked={!!agent.user_id} deals={own} allocations={allocations.filter(a=>ids.has(a.deal_id))} payouts={ownPay}/> ',f);
 }
 set(f,s);
}
// 2. Agent's OWN profile: agent-filtered DB reads, no other brokerage report exposed.
{
 const f='app/agent-account.tsx';let s=get(f);
 if(!s.includes("import AgentPerformanceSummary from './agent-performance-summary';"))
   s=insertBeforeExactly(s,"import AgentMarketingEditor from './agent-marketing-editor';", "import AgentPerformanceSummary from './agent-performance-summary';\n",f);
 if(!s.includes('performanceDeals,setPerformanceDeals')){
   s=insertBeforeExactly(s,' async function load(){',
` const [performanceDeals,setPerformanceDeals]=useState<any[]>([]),[performanceAllocations,setPerformanceAllocations]=useState<any[]>([]),[performanceError,setPerformanceError]=useState('');
 useEffect(()=>{
  let live=true;
  const current=profiles.find(p=>p.user_id===userId);
  if(!current){setPerformanceDeals([]);setPerformanceAllocations([]);return()=>{live=false}}
  void(async()=>{try{
   const rows:any[]=[];
   for(let offset=0;;offset+=1000){
    const r=await db.from('deal_files').select('id,user_id,brokerage_id,kind,review_status,listing_date,created_at,rv_stage,rv_firm_date,rv_completed_date,sale_price').eq('user_id',userId).eq('brokerage_id',current.brokerage_id).range(offset,offset+999);
    if(r.error)throw r.error;rows.push(...(r.data||[]));if((r.data||[]).length<1000)break;
   }
   const allocs:any[]=[];
   for(let i=0;i<rows.length;i+=150){
    const ids=rows.slice(i,i+150).map(d=>d.id);
    const r=await db.from('agent_commission_allocations').select('deal_id,commission_before_gst').in('deal_id',ids);
    if(r.error)throw r.error;allocs.push(...(r.data||[]));
   }
   if(live){setPerformanceDeals(rows);setPerformanceAllocations(allocs);setPerformanceError('')}
  }catch(e){if(live){setPerformanceError('Performance totals are temporarily unavailable: '+String((e as Error).message));setPerformanceDeals([]);setPerformanceAllocations([])}}})();
  return()=>{live=false};
 },[userId,profiles]);
`,f);
 }
 if(!s.includes('<AgentPerformanceSummary')){
   const needle="{!profiles.length&&!error&&<p>No brokerage invitation is linked to this account. Ask your brokerage to invite your sign-in email.</p>}";
   s=insertBeforeExactly(s,needle,`{profiles.some(p=>p.user_id===userId)&&<AgentPerformanceSummary linked deals={performanceDeals} allocations={performanceAllocations} payouts={payouts.filter(p=>profiles.some(a=>a.user_id===userId&&a.id===p.profile_id))}/>} {performanceError&&<div className="notice" role="alert">{performanceError}</div>}`,f);
 }
 set(f,s);
}
// 3. Collapse accidental repeated <TransactionActions/> JSX nodes in the current transaction detail.
function actionElements(code,file){
 const sf=ts.createSourceFile(file,code,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);const out=[];
 function visit(n){if(ts.isJsxSelfClosingElement(n)&&n.tagName.getText(sf)==='TransactionActions')out.push(n);ts.forEachChild(n,visit)}visit(sf);
 return {sf,nodes:out};
}
{
 const f='app/transactions.tsx';let s=get(f);const {sf,nodes}=actionElements(s,f);
 if(nodes.length===0)throw Error('Cannot find <TransactionActions/> in '+f+'; no safe automatic fix. Please provide latest file.');
 if(nodes.length>1){
   // Duplicate nodes must use the active transaction detail. Refuse to remove distinct workflows.
   const d=nodes.map(n=>{const x=n.attributes.properties.find(p=>ts.isJsxAttribute(p)&&p.name.text==='deal');return x?.getText(sf)||''});
   if(new Set(d).size!==1||!d[0].includes('active'))throw Error('Several different TransactionActions call sites found; cannot safely decide which to remove.');
   const positions=nodes.slice(1).map(n=>[n.getStart(sf),n.getEnd()]).sort((a,b)=>b[0]-a[0]);
   for(const [start,end] of positions)s=s.slice(0,start)+s.slice(end);
   console.log(`Removed ${positions.length} duplicate TransactionActions instances`);
 }
 const actionFile=get('app/transaction-actions.tsx');
 const headings=actionFile.match(/<h[1-6][^>]*>Transaction actions<\/h[1-6]>/gi)||[];
 if(headings.length>1)throw Error('transaction-actions.tsx itself contains repeated action layouts. Provide the current file for a safe merge.');
 if(actionElements(s,f).nodes.length!==1)throw Error('Transaction actions must appear exactly once after patch');
 set(f,s);
}
// Preflight syntax and commit only after the complete merge is valid.
for(const [file,code] of planned){
 if(!/\.(ts|tsx)$/.test(file))continue;
 const jsx=file.endsWith('.tsx');
 const sf=ts.createSourceFile(file,code,ts.ScriptTarget.Latest,true,jsx?ts.ScriptKind.TSX:ts.ScriptKind.TS);
 if(sf.parseDiagnostics.length){throw Error(`Syntax error in ${file}: `+sf.parseDiagnostics.map(d=>ts.flattenDiagnosticMessageText(d.messageText,' ')).join('; '))}
}
const backup=path.join(repo,'.realvolt-042-backups');fs.mkdirSync(backup,{recursive:true});
for(const [file,code] of planned){
 const dst=target(file);fs.mkdirSync(path.dirname(dst),{recursive:true});
 if(fs.existsSync(dst)){
   const old=fs.readFileSync(dst,'utf8');
   if(old===code)continue;
   fs.writeFileSync(path.join(backup,file.replaceAll('/','__')+'.txt'),old);
 }
 fs.writeFileSync(dst,code);
 console.log('Updated '+file);
}
console.log('Fix 042 installed. Next: npm run build; then test agent profile and one sale file. No SQL required.');
