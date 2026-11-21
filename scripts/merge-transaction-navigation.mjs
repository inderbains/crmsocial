// Run in latest checkout. Preserve other modules; fail if the expected anchors changed.
import {readFileSync,writeFileSync} from 'node:fs';
const file='app/realvolt-workspace.tsx';let s=readFileSync(file,'utf8');
function replace(a,b){if(!s.includes(a))throw Error('Navigation anchor missing: '+a+'; merge manually. No file written.');s=s.replace(a,b)}
if(!s.includes('const [notificationDeal,setNotificationDeal]')){
 replace('const [isBrokerageAdmin,setIsBrokerageAdmin]=useState(false);',`const [isBrokerageAdmin,setIsBrokerageAdmin]=useState(false);
 const [notificationDeal,setNotificationDeal]=useState<string|undefined>(undefined);
 useEffect(()=>{const clear=()=>setNotificationDeal(undefined);window.addEventListener('realvolt:clear-transaction-link',clear);return()=>window.removeEventListener('realvolt:clear-transaction-link',clear)},[]);
 useEffect(()=>{const listener=(event:Event)=>{const detail=(event as CustomEvent<{id:string;office:boolean}>).detail;if(!detail?.id||detail.office&&!isBrokerageAdmin)return;if(!window.dispatchEvent(new Event('realvolt:before-navigate',{cancelable:true})))return;setNotificationDeal(detail.id);setPage(detail.office?'Back Office':'Transactions');setSectionView(detail.office?'Review queue':'All transactions');window.scrollTo(0,0)};window.addEventListener('realvolt:open-transaction',listener);return()=>window.removeEventListener('realvolt:open-transaction',listener)},[isBrokerageAdmin]);`);
 replace('const navigate=(p:Page)=>{','const navigate=(p:Page)=>{setNotificationDeal(undefined);');
 replace('const navigateSection=(nextSection:string)=>{','const navigateSection=(nextSection:string)=>{setNotificationDeal(undefined);');
 replace('<Transactions key={page} userId={user.id}','<Transactions key={page} initialDealId={notificationDeal} userId={user.id}');
 replace("'Expired listings','Terminated listings','Sales'","'Expired listings','Terminated listings','Archive','Sales'");
}
if(!s.includes('initialDealId={notificationDeal}'))throw Error('Incomplete transaction navigation');
if(process.argv.includes('--dry-run'))console.log('Navigation merge checked. No files changed.');else{writeFileSync(file,s);console.log('Transaction notification links + archive added; other modules preserved.')}
