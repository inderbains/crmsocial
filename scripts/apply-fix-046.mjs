/** Apply RealVolt Fix 046 without replacing modern app/transactions.tsx.
 * node scripts/apply-fix-046.mjs /path/to/crmsocial --dry-run
 * node scripts/apply-fix-046.mjs /path/to/crmsocial
 */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const repo=path.resolve(process.argv[2]||'.');
const target=path.join(repo,'app/transactions.tsx');
const files=['app/staged-document-upload.tsx','app/staged-document-upload.module.css','supabase/046_named_compliance_uploads.sql'];
const must=(v,msg)=>{if(!v)throw new Error('Fix 046 stopped safely: '+msg)};
try{
 must(fs.existsSync(path.join(repo,'package.json')),'Pass the root of your current crmsocial project.');
 must(fs.existsSync(target),'Missing app/transactions.tsx');
 let code=fs.readFileSync(target,'utf8');
 const already=code.includes('<StagedDocumentUpload ');
 if(!already){
  const importAnchor="import TransactionActions from './transaction-actions';";
  must(code.includes(importAnchor),'TransactionActions import moved; merge manually.');
  code=code.replace(importAnchor,importAnchor+"\nimport StagedDocumentUpload from './staged-document-upload';");
  const stateAnchor=' const [documentRevision,setDocumentRevision]=useState(0);';
  must(code.includes(stateAnchor),'Expected document state not found. Merge manually.');
  code=code.replace(stateAnchor,stateAnchor+'\n const [requiredReady,setRequiredReady]=useState(false);');
  const selectAnchor=' useEffect(()=>{setSelected(initialDealId||null);setEditing(null)},[view,initialDealId]);';
  must(code.includes(selectAnchor),'Selection reset moved. Merge manually.');
  code=code.replace(selectAnchor,selectAnchor+'\n useEffect(()=>{setRequiredReady(false)},[selected]);');
  const generic=`<div className="field"><label htmlFor="deal-upload">Attach files (PDF, images, Word, Excel or text; up to 20 MB each)</label><input id="deal-upload" disabled={busy} type="file" multiple accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx,.txt" onChange={e=>{void upload(e.target.files);e.target.value=''}}/></div>`;
  must(code.includes(generic),'Generic upload field changed; merge manually rather than removing unknown upload logic.');
  must(code.split(generic).length===2,'Multiple generic upload inputs: review source manually.');
  code=code.replace(generic,'');
  const attachmentHeading='<h2 style={{marginTop:25}}>Attached documents</h2>';
  must(code.includes(attachmentHeading),'Attached documents heading moved; merge manually.');
  code=code.replace(attachmentHeading,attachmentHeading+`<StagedDocumentUpload key={active.id} deal={active} docs={docs} office={backOffice} displayStatus={statusFor(active)} notify={notify} onSaved={refreshFile} onReadyChange={setRequiredReady}/>`);
  const submit='disabled={busy||!docs.length} onClick={()=>void change(\'Submitted\')}'
  must(code.includes(submit),'Submit action changed; merge manually so required forms gate is preserved.');
  code=code.replace(submit,"disabled={busy||!docs.length||!requiredReady} onClick={()=>void change('Submitted')}");
 }
 const changes=new Map();
 if(!already)changes.set('app/transactions.tsx',code);
 for(const name of files){const value=fs.readFileSync(path.join(root,name),'utf8');const dest=path.join(repo,name);if(!fs.existsSync(dest)||fs.readFileSync(dest,'utf8')!==value)changes.set(name,value)}
 if(process.argv.includes('--dry-run')){console.log('Dry run. Planned changes:',[...changes.keys()].join(', ')||'None');process.exit(0)}
 const backup=path.join(repo,'rv046-backup');fs.mkdirSync(backup,{recursive:true});
 for(const [name,value] of changes){const dest=path.join(repo,name);fs.mkdirSync(path.dirname(dest),{recursive:true});if(fs.existsSync(dest)){
  const old=path.join(backup,name+'.txt');fs.mkdirSync(path.dirname(old),{recursive:true});fs.copyFileSync(dest,old);
 }fs.writeFileSync(dest,value,'utf8');console.log('Updated',name)}
 console.log('Fix 046 merged. Check SQL 044 installed; then run SQL 046 in staging. Run npm run build before GitHub deployment.');
}catch(e){console.error(e.message);process.exit(1)}
