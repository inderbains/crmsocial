'use client';
import {useEffect,useRef,useState,type FormEvent} from 'react';
import {getSupabase} from '../../lib/supabase';
import {createClient,type SupabaseClient} from '@supabase/supabase-js';
import styles from './activation.module.css';

type Invitation={id:string;brokerage_id:string;brokerage_name:string;email:string;full_name:string;phone:string;license_number:string;agent_split:number;monthly_office_fee:number;monthly_software_fee:number;monthly_board_fee:number;fee_gst_rate:number;billing_method:string;start_date:string};
const money=(n:number)=>Number(n).toLocaleString('en-CA',{style:'currency',currency:'CAD'});
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const message=(e:unknown)=>e instanceof Error?e.message:typeof e==='object'&&e!==null&&'message' in e?String(e.message):'Unable to continue. Please try again.';
export default function AcceptInvitation(){
 const [stage,setStage]=useState<'loading'|'verify'|'form'|'done'|'invalid'>('loading');
 const [invite,setInvite]=useState<Invitation|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const [name,setName]=useState(''),[phone,setPhone]=useState(''),[licence,setLicence]=useState(''),[password,setPassword]=useState(''),[confirm,setConfirm]=useState(''),[agree,setAgree]=useState(false);
 const token=useRef(''),profile=useRef(''),verifiedUser=useRef(''),inFlight=useRef(false);
 const activation=useRef<SupabaseClient|null>(null);
 const [dashboardReady,setDashboardReady]=useState(false);
 const base=process.env.NEXT_PUBLIC_BASE_PATH||'';
 useEffect(()=>{
  const url=new URL(window.location.href);
  profile.current=url.searchParams.get('invite')||'';
  token.current=new URLSearchParams(url.hash.slice(1)).get('token_hash')||'';
  if(!uuid.test(profile.current)||!token.current){setError('This invitation link is incomplete or has already been used. Ask your brokerage to send a fresh invitation.');setStage('invalid');return;}
  setStage('verify');
 },[]);
 async function verify(){
  if(inFlight.current)return;inFlight.current=true;setBusy(true);setError('');
  try{
   const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
   if(!url||!key)throw new Error('RealVolt authentication is not configured.');
   const db=activation.current??createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false,storageKey:'rv-invite-activation'}});activation.current=db;
   // Never trust an existing browser session or a brokerage ID supplied in a URL.
   const result=await db.auth.verifyOtp({token_hash:token.current,type:'email'});
   if(result.error||!result.data.session||!result.data.user)throw new Error('This invitation link is invalid, expired or already used. Ask your brokerage to resend it.');
   verifiedUser.current=result.data.user.id;token.current='';
   window.history.replaceState(null,'',window.location.pathname+window.location.search);
   const details=await db.rpc('rv_invitation_details',{p_profile:profile.current});
   if(details.error)throw details.error;
   const data=details.data as Invitation;
   if(!data||data.id!==profile.current||data.email.toLowerCase()!==result.data.user.email?.toLowerCase())throw new Error('Invitation does not match your verified account.');
   // After verified identity and exact invitation match, retire only the previous local browser session.
   const normal=getSupabase();if(!normal)throw new Error('RealVolt authentication is unavailable.');
   const previous=await normal.auth.getSession();if(previous.error)throw previous.error;
   if(previous.data.session){const cleared=await normal.auth.signOut({scope:'local'});if(cleared.error)throw new Error('Could not close the previous browser session. Use a private window and request a fresh invitation.');}
   setInvite(data);setName(data.full_name);setPhone(data.phone||'');setLicence(data.license_number||'');setStage('form');
  }catch(e){setError(message(e));if(!token.current)setStage('invalid');}finally{inFlight.current=false;setBusy(false);}
 }
 async function accept(e:FormEvent<HTMLFormElement>){
  e.preventDefault();if(inFlight.current||!invite)return;
  if(!agree||!name.trim()||password.length<12||password!==confirm){setError('Enter your name, use matching passwords of at least 12 characters and accept the invitation terms.');return;}
  inFlight.current=true;setBusy(true);setError('');
  try{
   const db=activation.current;if(!db)throw new Error('Your verification session is unavailable. Request a fresh invitation.');
   const user=await db.auth.getUser();
   if(user.error||user.data.user?.id!==verifiedUser.current||user.data.user.email?.toLowerCase()!==invite.email.toLowerCase())throw new Error('Your session has changed. Request a fresh invitation.');
   const fresh=await db.rpc('rv_invitation_details',{p_profile:invite.id});if(fresh.error)throw fresh.error;
   const updated=fresh.data as Invitation;
   if(JSON.stringify(updated)!==JSON.stringify(invite)){setInvite(updated);setAgree(false);throw new Error('The brokerage invitation has changed. Review the updated terms and accept again.');}
   const changed=await db.auth.updateUser({password});if(changed.error)throw changed.error;
   // RPC derives brokerage/role server-side, checks verified email, expiration and existing membership.
   const result=await db.rpc('rv_accept_invitation',{p_profile:invite.id,p_name:name.trim(),p_phone:phone,p_licence:licence,p_expected:invite});
   if(result.error)throw result.error;
   setPassword('');setConfirm('');setStage('done');
   // Do not copy the OTP session to the shared workspace client. Sign in explicitly as the new agent.
   const normal=getSupabase();if(!normal)throw new Error('Account activated. Sign in using a private browser window.');
   const previous=await normal.auth.getSession();if(previous.error)throw previous.error;
   if(previous.data.session){const cleared=await normal.auth.signOut({scope:'local'});if(cleared.error)throw new Error('Account activated. Could not close the other session. Use a private window to sign in.');}
   const linked=await normal.auth.signInWithPassword({email:invite.email,password});
   if(linked.error||linked.data.user?.id!==verifiedUser.current)throw new Error('Account activated. Open a private window and sign in with your new email and password.');
   const checked=await normal.auth.getUser();
   const [membership,profileRow]=await Promise.all([normal.from('brokerage_members').select('brokerage_id,role').eq('user_id',verifiedUser.current).maybeSingle(),normal.from('office_agents').select('id,brokerage_id,user_id,status').eq('id',invite.id).eq('user_id',verifiedUser.current).maybeSingle()]);
   if(checked.error||checked.data.user?.id!==verifiedUser.current||membership.error||profileRow.error||membership.data?.role!=='agent'||!profileRow.data||profileRow.data.status!=='Active'||profileRow.data.brokerage_id!==membership.data.brokerage_id||membership.data.brokerage_id!==invite.brokerage_id){await normal.auth.signOut({scope:'local'});throw new Error('Account activated, but workspace access could not be verified. Contact your brokerage.');}
   setDashboardReady(true);
  }catch(e){setError(message(e));}finally{inFlight.current=false;setBusy(false);}
 }
 return <main className={styles.screen}><section className={styles.card}>
  <div className={styles.brand}><svg aria-hidden="true" width="40" height="40" viewBox="0 0 64 64"><rect width="64" height="64" rx="16" fill="#da2c00"/><path d="M36.3 9 16 36.9h16L28 56l21-30H32.8L36.3 9Z" fill="none" stroke="#d8f38a" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round"/></svg>realvolt<b>.</b></div>
  <p className={styles.eyebrow}>BROKERAGE INVITATION</p>
  {stage==='loading'&&<p>Opening your invitation…</p>}
  {stage==='verify'&&<><h1>You've been invited!</h1><p>Verify your secure email link to create your RealVolt account and join your brokerage.</p><button className={styles.primary} type="button" disabled={busy} onClick={()=>void verify()}>{busy?'Verifying…':'Continue to create account'}</button><p className={styles.small}>If you are testing another account, use a private browser window. The previous local browser session is closed after your invitation is verified.</p></>}
  {stage==='form'&&invite&&<><h1>Create your agent profile</h1><p>Create your account and accept your brokerage invitation.</p><form onSubmit={accept} className={styles.form}>
   <label>Assigned brokerage (locked)<input readOnly value={invite.brokerage_name} /></label>
   <label>Full name<input required autoComplete="name" value={name} onChange={e=>setName(e.target.value)} /></label>
   <label>Email address (verified)<input type="email" readOnly value={invite.email} autoComplete="username" /></label>
   <div className={styles.two}><label>Phone (optional)<input autoComplete="tel" value={phone} onChange={e=>setPhone(e.target.value)}/></label><label>Licence number (optional)<input value={licence} onChange={e=>setLicence(e.target.value)}/></label></div>
   <label>Create password<input type="password" required minLength={12} autoComplete="new-password" value={password} onChange={e=>setPassword(e.target.value)}/></label>
   <label>Confirm password<input type="password" required minLength={12} autoComplete="new-password" value={confirm} onChange={e=>setConfirm(e.target.value)}/></label>
   <div className={styles.terms}><strong>Your brokerage terms</strong><p>Agent split: {invite.agent_split}% · Brokerage: {100-Number(invite.agent_split)}%</p><p>Monthly office: {money(invite.monthly_office_fee)} · Software: {money(invite.monthly_software_fee)} · Board: {money(invite.monthly_board_fee)}</p><p>Plus GST at {invite.fee_gst_rate}% · {invite.billing_method} · Start: {invite.start_date}</p></div>
   <label className={styles.check}><input type="checkbox" required checked={agree} onChange={e=>setAgree(e.target.checked)}/>I accept this brokerage invitation and have reviewed the commission split, fees, GST and collection method.</label>
   <button className={styles.primary} disabled={busy||!agree} type="submit">{busy?'Creating account…':'Accept invitation & create profile'}</button>
  </form></>}
  {stage==='done'&&<><h1>Invitation accepted!</h1><p>Your account is active with {invite?.brokerage_name}. You can now sign in with your email and password.</p>{dashboardReady?<button className={styles.primary} disabled={busy} type="button" onClick={async()=>{setBusy(true);const normal=getSupabase();try{const u=await normal?.auth.getUser();if(!u||u.error||u.data.user?.id!==verifiedUser.current){setDashboardReady(false);setError('The browser account changed. Sign in privately with your invited email.');return;}window.location.replace(`${base}/workspace/`);}finally{setBusy(false);}}}>Open my dashboard</button>:<p>Sign in from a private browser window using your new email and password if your previous account is still signed in.</p>}</>}
  {stage==='invalid'&&<><h1>Invitation unavailable</h1><p>Contact your brokerage administrator for a new invitation.</p></>}
  {error&&<p role="alert" className={styles.error}>{error}</p>}
  <p className={styles.footer}>Secure RealVolt account activation</p>
 </section></main>;
}
