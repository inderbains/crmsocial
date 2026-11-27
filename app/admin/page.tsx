'use client';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import styles from './platform.module.css';
import ManagementPanel from './management-panel';
import AccountDirectory,{type DirectoryPerson} from './account-directory';

type Account = {id:string;email:string|null;account_name:string;brokerage:string|null;brokerage_role:string|null;created_at:string;last_sign_in_at:string|null;verified:boolean;banned:boolean;platform_owner:boolean};
type Overview = {generated_at:string; stats:Record<string,number>;matching_accounts:number;accounts:Account[];recent_admin_activity:{id:number;action:string;occurred_at:string}[]};
const labels:Record<string,string>={accounts:'Registered accounts',brokerages:'Brokerages',brokerage_admins:'Brokerage admins',agents:'Registered agents',pending_invitations:'Pending invitations',signed_in_24h:'Signed in · last 24h',crm_records:'CRM records · total',transaction_records:'Transaction records · total',stored_files:'Stored files · total'};
const ADMIN_STORAGE_KEY='rv-platform-admin-086';
function date(v:string|null){return v?new Date(v).toLocaleString():'Never';}
export default function PlatformAdmin(){
 const client=useRef<SupabaseClient|null>(null);
 const shell=useRef<HTMLDivElement|null>(null);
 const [phase,setPhase]=useState<'checking'|'login'|'verify'|'dashboard'>('checking');
 const [email,setEmail]=useState(''),[password,setPassword]=useState(''),[code,setCode]=useState('');
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 const [focused,setFocused]=useState<DirectoryPerson|null>(null);
 const [data,setData]=useState<Overview|null>(null),[applied,setApplied]=useState(''),[offset,setOffset]=useState(0);
 function getClient(){
  if(client.current)return client.current;
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if(!url||!key)throw new Error('Supabase is not configured.');
  // Dedicated per-tab session: never reads or changes a workspace session.
  client.current=createClient(url,key,{auth:{storageKey:ADMIN_STORAGE_KEY,storage:window.sessionStorage,persistSession:true,autoRefreshToken:true,detectSessionInUrl:false}});
  return client.current;
 }
 async function clear(explicit=false){
  setFocused(null);setData(null);setCode('');setPassword('');setEmail('');setOffset(0);setApplied('');setPhase('checking');setBusy(true);
  let revoked=false,signedOut=false;
  const sb=client.current;
  try{if(sb){if(explicit){try{const r=await sb.rpc('rv_platform_email_sign_out');revoked=!r.error&&r.data===true;}catch{/* still attempt Auth sign-out */}}
    try{const r=await sb.auth.signOut({scope:'local'});signedOut=!r.error;}catch{/* local storage is cleared below */}
    await sb.auth.stopAutoRefresh();
  }}finally{
   client.current=null;
   window.sessionStorage.removeItem(ADMIN_STORAGE_KEY);
   window.sessionStorage.removeItem(ADMIN_STORAGE_KEY+'-code-verifier');
   window.sessionStorage.removeItem(ADMIN_STORAGE_KEY+'-user');
   setPhase('login');setBusy(false);
  }
  if(explicit&&!revoked&&!signedOut)setError('Signed out on this tab. Server revocation could not be confirmed; check your connection.');
 }
 useEffect(()=>{
  let active=true;
  const hide=()=>{if(shell.current)shell.current.style.visibility='hidden';};
  // A browser history snapshot must never display previously rendered account data.
  const show=(e:PageTransitionEvent)=>{if(e.persisted){hide();window.location.reload();}};
  window.addEventListener('pagehide',hide);window.addEventListener('pageshow',show);
  async function restore(){
   try{const sb=getClient();await sb.auth.startAutoRefresh();
    const session=await sb.auth.getSession();if(!active)return;
    if(session.error||!session.data.session){setPhase('login');return;}
    const verified=await sb.rpc('rv_platform_email_verified');if(!active)return;
    if(verified.error||verified.data!==true){await clear();return;}
    const result=await sb.rpc('rv_platform_admin_overview',{p_offset:0,p_search:''});if(!active)return;
    if(result.error||!result.data){await clear();return;}
    setData(result.data as Overview);setPhase('dashboard');
   }catch{if(active){setData(null);setPhase('login');setError('Could not restore the admin session. Sign in again.');}}
  }
  void restore();
  return()=>{active=false;window.removeEventListener('pagehide',hide);window.removeEventListener('pageshow',show);if(client.current)void client.current.auth.stopAutoRefresh();};
 },[]);
 async function load(start=0,query=''){
  setData(null);const {data:payload,error:e}=await getClient().rpc('rv_platform_admin_overview',{p_offset:start,p_search:query});
  if(e||!payload){await clear();throw new Error('Platform access could not be verified. Sign in again.');}
  setData(payload as Overview);setOffset(start);setApplied(query);setPhase('dashboard');
 }
 async function login(e:FormEvent){e.preventDefault();setBusy(true);setError('');setData(null);
  try{const sb=getClient();const r=await sb.auth.signInWithPassword({email:email.trim(),password});setPassword('');if(r.error)throw new Error('Sign-in failed. Check your credentials.');
   const permission=await sb.rpc('rv_platform_admin_allowed');if(permission.error||permission.data!==true){await clear();throw new Error('Platform owner access required.');}
   await requestCode();setPhase('verify');
  }catch(e){await clear();setError(e instanceof Error?e.message:'Sign-in failed.');}finally{setBusy(false);}
 }
 async function requestCode(){const r=await getClient().functions.invoke('platform-admin-email',{body:{action:'send'}});if(r.error||r.data?.ok!==true)throw new Error('Unable to send email code. Wait at least one minute and try again; check the email provider if this continues.');}
 async function resend(){setBusy(true);setError('');setCode('');try{await requestCode();}catch(e){setError(e instanceof Error?e.message:'Unable to resend code.');}finally{setBusy(false);}}
 async function verify(e:FormEvent){e.preventDefault();setBusy(true);setError('');try{const r=await getClient().rpc('rv_platform_email_verify',{p_code:code.trim()});if(r.error||r.data!==true)throw new Error('Code incorrect, expired, or attempt limit reached. Request a new code if needed.');setCode('');await load();}catch(e){setError(e instanceof Error?e.message:'Verification failed.');}finally{setBusy(false);}}
 async function refresh(start=offset,query=applied){setBusy(true);setError('');try{await load(start,query);}catch(e){setError(e instanceof Error?e.message:'Unable to load platform.');}finally{setBusy(false);}}
 return <div ref={shell} className={styles.shell}>
 <div className={styles.top}><div className={styles.brand}><span>ϟ</span>realvolt.<small> PLATFORM ADMIN</small></div>{(phase==='verify'||phase==='dashboard')&&<button disabled={busy} onClick={()=>{setError('');void clear(true);}}>Sign out</button>}</div>
 {error&&<div className={styles.error} role="alert">{error}</div>}
 {phase==='checking'&&<div className={styles.auth} role="status"><h1>Checking session…</h1><p>Verifying platform access.</p></div>}
 {phase==='login'&&<form className={styles.auth} onSubmit={login}><h1>Platform owner sign in</h1><p>Separate from your brokerage workspace. A verification code will be sent to your registered email.</p><label>Email<input type="email" autoComplete="username" required value={email} onChange={e=>setEmail(e.target.value)}/></label><label>Password<input type="password" autoComplete="current-password" required value={password} onChange={e=>setPassword(e.target.value)}/></label><button disabled={busy}>{busy?'Checking…':'Sign in'}</button></form>}
 {phase==='verify'&&<form className={styles.auth} onSubmit={verify}><h1>Check your email</h1><p>Enter the six-digit code sent to your registered platform owner email. It expires after 10 minutes.</p><label>Six-digit email code<input required inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={code} onChange={e=>setCode(e.target.value)}/></label><button disabled={busy}>{busy?'Verifying…':'Verify & open dashboard'}</button><button type="button" disabled={busy} onClick={()=>void resend()}>Resend code</button></form>}
 {phase==='dashboard'&&<><div className={styles.heading}><div><h1>Platform overview</h1><p>Account directory and aggregated usage. Private customer content is not available here.</p></div><button disabled={busy} onClick={()=>void refresh()}>Refresh</button></div>
 {data&&<><p className={styles.updated}>Updated {date(data.generated_at)} · Recent sign-ins are not a live online-user count.</p><div className={styles.grid}>{Object.entries(data.stats).map(([k,v])=><div className={styles.stat} key={k}><p>{labels[k]||k}</p><strong>{v.toLocaleString()}</strong></div>)}</div></>}
 {data&&<AccountDirectory sb={getClient()} onManage={a=>{setFocused(a);window.requestAnimationFrame(()=>document.getElementById('rv-account-management')?.scrollIntoView({behavior:'smooth',block:'start'}));}} onChange={()=>{setFocused(null);void refresh(0,'');}}/>}
 {data&&<div id="rv-account-management"><ManagementPanel sb={getClient()} accounts={focused?[focused,...data.accounts.filter(a=>a.id!==focused.id)]:data.accounts} focusId={focused?.id}/></div>}
 {data&&<section className={styles.panel}><h2>Recent platform access</h2>{data.recent_admin_activity.map(a=><div className={styles.log} key={a.id}><span>{a.action}</span><span>{date(a.occurred_at)}</span></div>)}</section>}
 </>}
 </div>;
}
