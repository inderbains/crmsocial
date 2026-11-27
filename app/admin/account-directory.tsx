'use client';
import {useEffect,useRef,useState,type FormEvent} from 'react';
import type {SupabaseClient} from '@supabase/supabase-js';
import styles from './platform.module.css';
import ui from './directory.module.css';
export type DirectoryPerson={id:string;email:string|null;account_name:string;brokerage:string|null;brokerage_role:string|null;last_sign_in_at:string|null;verified:boolean;banned:boolean;platform_owner:boolean;invited:boolean;deletion_requested:boolean};
type Brokerage={id:string;name:string;member_count:number;invitation_count:number};
type Page<T>={total:number;rows:T[]};
type Mode='brokerages'|'members'|'independent'|'owners';
function useDirectory<T>(sb:SupabaseClient,mode:Mode,brokerage:string|null,query:string,revision:number){
 const [offset,setOffset]=useState(0),[data,setData]=useState<Page<T>|null>(null),[error,setError]=useState('');
 useEffect(()=>{let active=true;setData(null);setError('');sb.rpc('rv_platform_directory',{p_mode:mode,p_brokerage:brokerage,p_offset:offset,p_search:query}).then(r=>{if(!active)return;if(r.error)setError('Directory unavailable. Verify your admin session and install SQL 089.');else setData(r.data as Page<T>);},()=>{if(active)setError('Directory request failed.');});return()=>{active=false;};},[sb,mode,brokerage,query,offset,revision]);
 return {offset,setOffset,data,error};
}
function Paging({total,offset,setOffset}:{total:number;offset:number;setOffset:(n:number)=>void}){return <div className={styles.pages}><span>{total?Math.min(offset+1,total):0}–{Math.min(offset+50,total)} of {total}</span><button disabled={!offset} onClick={()=>setOffset(Math.max(0,offset-50))}>Previous</button><button disabled={offset+50>=total} onClick={()=>setOffset(offset+50)}>Next</button></div>;}
function People({sb,mode,brokerage,query,revision,onManage,onDelete}:{sb:SupabaseClient;mode:'members'|'independent'|'owners';brokerage:string|null;query:string;revision:number;onManage:(p:DirectoryPerson)=>void;onDelete:(p:DirectoryPerson)=>void}){
 const {data,error,offset,setOffset}=useDirectory<DirectoryPerson>(sb,mode,brokerage,query,revision);
 if(error)return <p role="alert" className={styles.error}>{error}</p>;
 if(!data)return <p role="status">Loading accounts…</p>;
 return <>{!data.rows.length?<p>No matching accounts on this page.</p>:<div className={styles.table}><table><thead><tr>{['Name','Email','Brokerage','Role','Last sign-in','Status','Actions'].map(s=><th key={s}>{s}</th>)}</tr></thead><tbody>{data.rows.map(a=><tr key={`${a.invited?'invited':'user'}:${a.id}`}><td>{a.account_name||'Name not provided'}</td><td>{a.email||'—'}</td><td>{a.brokerage||'No linked brokerage'}</td><td>{a.platform_owner?'Platform owner':a.brokerage_role==='admin'?'Administrator':a.brokerage_role==='agent'?'Agent':'Independent / unassigned'}</td><td>{a.last_sign_in_at?new Date(a.last_sign_in_at).toLocaleString():'Never'}</td><td><span className={a.banned?ui.dangerText:ui.muted}>{a.invited?'Invitation pending':a.banned?'Sign-in blocked':a.verified?'Verified':'Unverified'}</span>{a.deletion_requested&&<small className={ui.muted}> · Deletion review</small>}</td><td>{a.platform_owner?<span className={ui.muted}>Protected</span>:a.invited?<div className={ui.actions}><button className={ui.delete} onClick={()=>onDelete(a)}>Cancel invitation</button></div>:<div className={ui.actions}><button onClick={()=>onManage(a)}>Manage</button><button className={ui.delete} onClick={()=>onDelete(a)}>Delete</button></div>}</td></tr>)}</tbody></table></div>}<Paging total={data.total} offset={offset} setOffset={setOffset}/></>;
}
function BrokerageGroups({sb,query,revision,onManage,onDelete,onDeleteBrokerage}:{sb:SupabaseClient;query:string;revision:number;onManage:(p:DirectoryPerson)=>void;onDelete:(p:DirectoryPerson)=>void;onDeleteBrokerage:(b:Brokerage)=>void}){
 const {data,error,offset,setOffset}=useDirectory<Brokerage>(sb,'brokerages',null,query,revision);const [expanded,setExpanded]=useState<string[]>([]);
 if(error)return <p className={styles.error} role="alert">{error}</p>;
 if(!data)return <p role="status">Loading brokerages…</p>;
 return <>{!data.rows.length&&<p>No matching brokerages.</p>}{data.rows.map(b=>{const open=expanded.includes(b.id);return <article className={ui.brokerage} key={b.id}><div className={ui.groupHeader}><button className={ui.groupButton} aria-expanded={open} onClick={()=>setExpanded(old=>open?old.filter(x=>x!==b.id):[...old,b.id])}><span><strong>{b.name}</strong><small>{b.member_count} registered · {b.invitation_count} pending invitations</small></span><span>{open?'−':'+'}</span></button><button className={ui.deleteBrokerage} onClick={()=>onDeleteBrokerage(b)}>Delete brokerage</button></div>{open&&<div className={ui.groupBody}><People key={`${b.id}:${query}`} sb={sb} mode="members" brokerage={b.id} query={query} revision={revision} onManage={onManage} onDelete={onDelete}/></div>}</article>;})}<Paging total={data.total} offset={offset} setOffset={setOffset}/></>;
}
type Target={kind:'account'|'invitation';person:DirectoryPerson}|{kind:'brokerage';brokerage:Brokerage};
export default function AccountDirectory({sb,onManage,onChange}:{sb:SupabaseClient;onManage:(p:DirectoryPerson)=>void;onChange:()=>void}){
 const [search,setSearch]=useState(''),[query,setQuery]=useState(''),[revision,setRevision]=useState(0),[target,setTarget]=useState<Target|null>(null),[confirmation,setConfirmation]=useState(''),[reason,setReason]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState('');
 const dialog=useRef<HTMLDialogElement|null>(null);
 const expected=target?(target.kind==='brokerage'?target.brokerage.name:target.person.email||''):'';
 const matches=!!expected&&confirmation.trim().toLowerCase()===expected.trim().toLowerCase();
 useEffect(()=>{const el=dialog.current;if(target&&el&&!el.open)el.showModal();else if(!target&&el?.open)el.close();},[target]);
 function open(t:Target){setTarget(t);setConfirmation('');setReason('');setError('');setMessage('');}
 function choose(p:DirectoryPerson){if(p.platform_owner)return;open({kind:p.invited?'invitation':'account',person:p});}
 function close(){if(!busy){setTarget(null);setError('');}}
 async function act(action:'delete'|'review'){
  if(!target||busy)return;
  if(action==='delete'&&!matches)return;
  if(action==='review'&&(target.kind!=='account'||reason.trim().length<5))return;
  setBusy(true);setError('');setMessage('');
  try{
   let r;
   if(target.kind==='brokerage')r=await sb.rpc('rv_platform_delete_empty_test_brokerage',{p_brokerage:target.brokerage.id,p_name:confirmation.trim()});
   else if(target.kind==='invitation')r=await sb.rpc('rv_platform_cancel_test_invitation',{p_profile:target.person.id,p_email:confirmation.trim()});
   else if(action==='review')r=await sb.rpc('rv_platform_delete_review',{p_user:target.person.id,p_reason:reason.trim(),p_cancel:false});
   else r=await sb.rpc('rv_platform_delete_unused_test_account',{p_user:target.person.id,p_email:confirmation.trim()});
   if(r.error||r.data!==true)throw new Error(r.error?.message||'Action failed; nothing confirmed deleted.');
   setMessage(target.kind==='brokerage'?'Empty test brokerage deleted. Member logins were retained and are now unassigned.':target.kind==='invitation'?'Pending invitation cancelled. Existing login accounts unchanged.':action==='delete'?'Unused test account deleted.':'Deletion review requested; account and business records retained.');
   setTarget(null);setRevision(v=>v+1);onChange();
  }catch(e){setError(e instanceof Error?e.message:'Account action failed');}finally{setBusy(false);}
 }
 return <section className={styles.panel}><h2>Account directory</h2><p className={ui.muted}>Brokerages and their members are grouped by membership. Independent or unassigned accounts are separate.</p><form className={styles.search} onSubmit={(e:FormEvent)=>{e.preventDefault();setQuery(search.trim());}}><input aria-label="Search directory" placeholder="Search agent name, email or brokerage" value={search} onChange={e=>setSearch(e.target.value)}/><button>Search</button><button type="button" onClick={()=>{setSearch('');setQuery('');setRevision(v=>v+1);}}>Clear</button></form>
 {message&&<p role="status" className={ui.notice}>{message}</p>}
 <h3 className={ui.heading}>Brokerages</h3><BrokerageGroups key={`brokerages:${query}`} sb={sb} query={query} revision={revision} onManage={onManage} onDelete={choose} onDeleteBrokerage={b=>open({kind:'brokerage',brokerage:b})}/>
 <h3 className={ui.heading}>Independent agents / unassigned accounts</h3><People key={`independent:${query}`} sb={sb} mode="independent" brokerage={null} query={query} revision={revision} onManage={onManage} onDelete={choose}/>
 <h3 className={ui.heading}>Platform owners</h3><People key={`owners:${query}`} sb={sb} mode="owners" brokerage={null} query={query} revision={revision} onManage={onManage} onDelete={choose}/>
 <dialog ref={dialog} className={ui.deleteDialog} onCancel={e=>{e.preventDefault();close();}} aria-labelledby="rv-delete-title">
 {target&&<div className={ui.dialogContent}><h3 id="rv-delete-title">{target.kind==='brokerage'?'Delete brokerage':target.kind==='invitation'?'Cancel invitation':'Delete account'}</h3>
 <p><strong>{target.kind==='brokerage'?target.brokerage.name:target.person.account_name||target.person.email}</strong>{target.kind!=='brokerage'&&<> · {target.person.email}</>}</p>
 <p>{target.kind==='brokerage'?'Permanently remove this empty test brokerage, its setup records and invitations. All existing user logins and private workspaces are retained and become unassigned. Transactions, files and retained financial records block deletion.':target.kind==='invitation'?'Remove this unused invitation. Existing login accounts will not be deleted.':'Permanently remove this unused test login and its identity/setup records. Business data, uploaded files and the last brokerage administrator are protected. This is not a production erasure process.'}</p>
 {error&&<p className={styles.error} role="alert">{error}</p>}
 <label>Type {target.kind==='brokerage'?'the brokerage name':'the email address'} to confirm: <strong>{expected}</strong><input autoFocus value={confirmation} onChange={e=>setConfirmation(e.target.value)} disabled={busy}/></label>
 <div className={ui.actions}><button className={ui.delete} disabled={busy||!matches} onClick={()=>void act('delete')}>{busy?'Processing…':target.kind==='brokerage'?'Delete empty test brokerage':target.kind==='invitation'?'Cancel pending invitation':'Delete unused test account'}</button><button disabled={busy} onClick={close}>Close</button></div>
 {target.kind==='account'&&<><hr/><p>For accounts with retained records, request a deletion review instead.</p><label>Reason for deletion review<input value={reason} onChange={e=>setReason(e.target.value)} maxLength={500} disabled={busy}/></label><button disabled={busy||reason.trim().length<5} onClick={()=>void act('review')}>Request deletion review</button></>}
 </div>}
 </dialog>
 </section>;
}
