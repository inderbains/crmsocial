/**
 * RealVolt standalone Leaderboard module routing merge.
 * Run from the repository root. This patches ONLY workspace-home.tsx and
 * realvolt-workspace.tsx, preserving unrelated newer application changes.
 * Preview with --dry-run. Copy agent-leaderboard.tsx/css separately first.
 */
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';

const dryRun=process.argv.includes('--dry-run');
const root=process.cwd();
const paths=['app/workspace-home.tsx','app/realvolt-workspace.tsx'].map(x=>resolve(root,x));
for(const p of paths){if(!existsSync(p))throw Error(`Missing ${p}. Run at RealVolt repository root.`);}
const [originalHome,originalWorkspace]=paths.map(p=>readFileSync(p,'utf8'));
function replaceOnce(source,oldText,newText,label){
  if(!source.includes(oldText))throw Error(`Could not locate ${label}; stop and merge manually. No files changed.`);
  return source.replace(oldText,newText);
}
let home=originalHome;
let workspace=originalWorkspace;

// Remove any previously installed on-dashboard version of the leaderboard.
home=home.replace(/^import AgentLeaderboard from ['"]\.\/agent-leaderboard['"];\s*\n/m,'');
home=home.replace(/<AgentLeaderboard\s+userId=\{userId\}\s*\/>/g,'');
if(!/\bTrophy\b/.test(home.split("from 'lucide-react'",1)[0])){
  home=home.replace(/(import\s*\{)([^}]+)(\}\s*from\s*['"]lucide-react['"])/,(_m,a,b,c)=>`${a}${b.trimEnd()},Trophy${c}`);
}
if(!home.includes("'Leaderboard';")&&!/export type ModuleName=[^;]*'Leaderboard'/.test(home)){
  home=home.replace(/(export type ModuleName=[^;]+);/,(_m,a)=>`${a}|'Leaderboard';`);
}
if(!home.includes("{name:'Leaderboard',description:")){
  const a="...(isBrokerageAdmin?[{name:'Back Office',description:'Brokerage-only control, office accounts and approvals.',icon:Building2,live:true}]:[])];";
  const b="...(isBrokerageAdmin?[{name:'Back Office',description:'Brokerage-only control, office accounts and approvals.',icon:Building2,live:true}]:[]),{name:'Leaderboard',description:'Celebrate top agents. Monthly and yearly rankings by completed sales and sales volume.',icon:Trophy,live:true}];";
  home=replaceOnce(home,a,b,'application modules list');
}
if(!home.includes("'Leaderboard':['Brokerage sales rankings'")){
  const a="'Back Office':['Brokerage file review','Agent management','Approval workflows and oversight']";
  const b=a+",'Leaderboard':['Brokerage sales rankings','Monthly and yearly performance','Sales counts and total volume']";
  home=replaceOnce(home,a,b,'ModuleOverview descriptions');
}
if(home.includes('<AgentLeaderboard userId={userId}/>')||home.includes("import AgentLeaderboard from './agent-leaderboard'"))throw Error('The home dashboard still contains old widget code; merge manually.');

if(!workspace.includes("import AgentLeaderboard from './agent-leaderboard'")){
  workspace=replaceOnce(workspace,
    "import WorkspaceHome,{ModuleOverview,type ModuleName} from './workspace-home';",
    "import WorkspaceHome,{ModuleOverview,type ModuleName} from './workspace-home';\nimport AgentLeaderboard from './agent-leaderboard';",'workspace imports');
}
const sidebarEnd="'SignVolt',...(isBrokerageAdmin?['Back Office']:[]),'My profile & billing'";
if(workspace.includes(sidebarEnd))workspace=workspace.replace(sidebarEnd,"'SignVolt',...(isBrokerageAdmin?['Back Office']:[]),'Leaderboard','My profile & billing'");
else if(!workspace.includes("'Leaderboard','My profile & billing'"))throw Error('Could not locate workspace app navigation; merge manually.');
const navEnd="page==='SignVolt'?['All requests','Drafts','Sent / in progress','Completed','Voided / declined / expired']:[...pages]";
if(workspace.includes(navEnd))workspace=workspace.replace(navEnd,"page==='SignVolt'?['All requests','Drafts','Sent / in progress','Completed','Voided / declined / expired']:page==='Leaderboard'?['Leaderboard']:[...pages]");
else if(!workspace.includes("page==='Leaderboard'?['Leaderboard']"))throw Error('Could not locate active module navigation; merge manually.');
const navClick="else if(pages.includes(page as typeof pages[number]))navigate(p as Page);else navigateSection(p)";
if(workspace.includes(navClick))workspace=workspace.replace(navClick,"else if(page==='Leaderboard')navigate('Leaderboard');else if(pages.includes(page as typeof pages[number]))navigate(p as Page);else navigateSection(p)");
else if(!workspace.includes("else if(page==='Leaderboard')navigate('Leaderboard')"))throw Error('Could not locate navigation click handler; merge manually.');
const banner="'CRM','Transactions','SignVolt','Back Office','My profile & billing','Open Houses'";
if(workspace.includes(banner))workspace=workspace.replace(banner,"'CRM','Transactions','SignVolt','Back Office','Leaderboard','My profile & billing','Open Houses'");
else if(!workspace.includes("'Back Office','Leaderboard','My profile & billing'"))throw Error('Could not locate module brand banner; merge manually.');
if(!workspace.includes("{page==='Leaderboard'&&<AgentLeaderboard")){
 const signvolt=" {page==='SignVolt'&&<SignVolt userId={user.id} view={sectionView} notify={notify}/>}";
 workspace=replaceOnce(workspace,signvolt," {page==='Leaderboard'&&<AgentLeaderboard userId={user.id} onBack={()=>navigate('My workspace')}/>}\n"+signvolt,'Leaderboard page render');
}
if(!/\bTrophy\b/.test(home))throw Error('Missing Trophy icon import; stop and merge manually.');
if(!home.includes("'Leaderboard'")||!workspace.includes("{page==='Leaderboard'&&<AgentLeaderboard"))throw Error('Incomplete merge; no files changed.');
if(dryRun){console.log('Dry run succeeded. Can update both workspace files without replacing other modules.');}
else{
  writeFileSync(paths[0],home);
  writeFileSync(paths[1],workspace);
  console.log('Updated workspace-home.tsx and realvolt-workspace.tsx. Existing dashboard widget removed; standalone card/page connected.');
}
