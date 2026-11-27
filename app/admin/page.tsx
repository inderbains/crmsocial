'use client';
import { useRef, useState, type FormEvent } from 'react';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import styles from './platform.module.css';

type Account = {id:string;email:string|null;account_name:string;brokerage:string|null;brokerage_role:string|null;created_at:string;last_sign_in_at:string|null;verified:boolean;banned:boolean;platform_owner:boolean};
type Overview = {generated_at:string; stats:Record<string,number>;matching_accounts:number;accounts:Account[];recent_admin_activity:{id:number;action:string;occurred_at:string}[]};
const labels:Record<string,string>={accounts:'Registered accounts',brokerages:'Brokerages',brokerage_admins:'Brokerage admins',agents:'Registered agents',pending_invitations:'Pending invitations',signed_in_24h:'Signed in · last 24h',crm_records:'CRM records · total',transaction_records:'Transaction records · total',stored_files:'Stored files · total'};
function date(v:string|null){return v?new Date(v).toLocaleString():'Never';}
export default function PlatformAdmin(){
 const client=useRef<SupabaseClient|null>(null);
 const [phase,setPhase]=useState<'login'|'verify'|'dashboard'>('login');
 const [email,setEmail]=useState(''),[password,setPassword]=useState(''),[code,setCode]=useState('');
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 const [data,setData]=useState<Overview|null>(null),[search,setSearch]=useState(''),[applied,setApplied]=useState(''),[offset,setOffset]=useState(0);
 function getClient(){
  if(client.current)return client.current;
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if(!url||!key)throw new Error('Supabase is not configured.');
  // Dedicated in-memory session: never reads or changes a workspace session.
  client.current=createClient(url,key,{auth:{storageKey:'rv-platform-admin-084',persistSession:false,autoRefreshToken:true,detectSessionInUrl:false}});
  return client.current;
 }
 async function clear(){setData(null);setCode('');setPassword('');setEmail('');setOffset(0);setApplied('');setSearch('');setPhase('login');if(client.current){await client.current.auth.signOut({scope:'local'});client.current=null;}}
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
 return <div className={styles.shell}>
 <div className={styles.top}><div className={styles.brand}><span>ϟ</span>realvolt.<small> PLATFORM ADMIN</small></div>{phase!=='login'&&<button disabled={busy} onClick={()=>{setError('');void clear();}}>Sign out</button>}</div>
 {error&&<div className={styles.error} role="alert">{error}</div>}
 {phase==='login'&&<form className={styles.auth} onSubmit={login}><h1>Platform owner sign in</h1><p>Separate from your brokerage workspace. A verification code will be sent to your registered email.</p><label>Email<input type="email" autoComplete="username" required value={email} onChange={e=>setEmail(e.target.value)}/></label><label>Password<input type="password" autoComplete="current-password" required value={password} onChange={e=>setPassword(e.target.value)}/></label><button disabled={busy}>{busy?'Checking…':'Sign in'}</button></form>}
 {phase==='verify'&&<form className={styles.auth} onSubmit={verify}><h1>Check your email</h1><p>Enter the six-digit code sent to your registered platform owner email. It expires after 10 minutes.</p><label>Six-digit email code<input required inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={code} onChange={e=>setCode(e.target.value)}/></label><button disabled={busy}>{busy?'Verifying…':'Verify & open dashboard'}</button><button type="button" disabled={busy} onClick={()=>void resend()}>Resend code</button></form>}
 {phase==='dashboard'&&<><div className={styles.heading}><div><h1>Platform overview</h1><p>Account directory and aggregated usage. Private customer content is not available here.</p></div><button disabled={busy} onClick={()=>void refresh()}>Refresh</button></div>
 {data&&<><p className={styles.updated}>Updated {date(data.generated_at)} · Recent sign-ins are not a live online-user count.</p><div className={styles.grid}>{Object.entries(data.stats).map(([k,v])=><div className={styles.stat} key={k}><p>{labels[k]||k}</p><strong>{v.toLocaleString()}</strong></div>)}</div></>}
 <section className={styles.panel}><h2>Registered accounts</h2><form className={styles.search} onSubmit={e=>{e.preventDefault();void refresh(0,search);}}><input aria-label="Search accounts" placeholder="Search email or brokerage" value={search} onChange={e=>setSearch(e.target.value)}/><button disabled={busy}>Search</button></form>{data?<><div className={styles.table}><table><thead><tr>{['Name','Email','Brokerage','Role','Last sign-in','Account status'].map(x=><th key={x}>{x}</th>)}</tr></thead><tbody>{data.accounts.map(a=><tr key={a.id}><td>{a.account_name||'—'}</td><td>{a.email||'—'}</td><td>{a.brokerage||'Independent / none'}</td><td>{a.platform_owner?'Platform owner'+(a.brokerage_role?` · ${a.brokerage_role}`:''):a.brokerage_role||'Independent'}</td><td>{date(a.last_sign_in_at)}</td><td>{a.banned?'Suspended':a.verified?'Verified':'Unverified'}</td></tr>)}</tbody></table></div><div className={styles.pages}><span>{data.matching_accounts?offset+1:0}–{Math.min(offset+50,data.matching_accounts)} of {data.matching_accounts}</span><button disabled={busy||offset===0} onClick={()=>void refresh(Math.max(0,offset-50))}>Previous</button><button disabled={busy||offset+50>=data.matching_accounts} onClick={()=>void refresh(offset+50)}>Next</button></div></>:<p>Loading authorized data…</p>}</section>
 {data&&<section className={styles.panel}><h2>Recent platform access</h2>{data.recent_admin_activity.map(a=><div className={styles.log} key={a.id}><span>{a.action}</span><span>{date(a.occurred_at)}</span></div>)}</section>}
 </>}
 </div>;
}
