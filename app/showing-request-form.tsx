'use client';
import {useState,type FormEvent} from 'react';
import {CalendarCheck} from 'lucide-react';
import {getSupabase} from '../lib/supabase';

type Props={propertyId?:string;preview?:boolean};
/** The anonymous browser calls a narrowly scoped server-side RPC, never inserts CRM rows directly. */
export default function ShowingRequestForm({propertyId,preview=false}:Props){
 const [name,setName]=useState(''),[email,setEmail]=useState(''),[phone,setPhone]=useState('');
 const [when,setWhen]=useState(''),[message,setMessage]=useState(''),[website,setWebsite]=useState('');
 const [busy,setBusy]=useState(false),[done,setDone]=useState(false),[error,setError]=useState('');
 async function submit(e:FormEvent){
  e.preventDefault();if(!propertyId||preview)return;
  setBusy(true);setError('');
  try{
   const db=getSupabase();if(!db)throw new Error('The showing form is temporarily unavailable.');
   const date=new Date(when);
   if(!Number.isFinite(date.getTime())||date.getTime()<Date.now())throw new Error('Choose a future showing date and time.');
   if(!email.trim()&&!phone.trim())throw new Error('Enter an email or phone number.');
   const {error:rpcError}=await db.rpc('submit_property_showing',{
    p_property_id:propertyId,p_name:name.trim(),p_email:email.trim(),p_phone:phone.trim(),
    p_requested_at:date.toISOString(),p_message:message.trim(),p_website:website
   });
   if(rpcError)throw rpcError;
   setDone(true);
  }catch(err){setError((err as Error).message)}finally{setBusy(false)}
 }
 if(preview||!propertyId)return <section className="rv-showing-box"><h3><CalendarCheck size={18}/> Request a showing</h3><p className="hint">The showing request form appears here when you publish this page.</p></section>;
 if(done)return <section className="rv-showing-box" role="status"><h3>Request received</h3><p>Your preferred time has been sent to the listing agent. The appointment is not confirmed until the agent contacts you.</p></section>;
 return <section className="rv-showing-box"><h3><CalendarCheck size={18}/> Request a showing</h3><p className="muted">Choose a preferred time. The agent will confirm availability.</p>
  <form onSubmit={submit}>
   <div className="field"><label htmlFor="showing-name">Your name</label><input id="showing-name" required minLength={2} maxLength={150} autoComplete="name" value={name} onChange={e=>setName(e.target.value)}/></div>
   <div className="field"><label htmlFor="showing-email">Email address</label><input id="showing-email" type="email" maxLength={240} autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)}/></div>
   <div className="field"><label htmlFor="showing-phone">Phone</label><input id="showing-phone" type="tel" maxLength={40} autoComplete="tel" value={phone} onChange={e=>setPhone(e.target.value)}/></div>
   <div className="field"><label htmlFor="showing-when">Preferred date and time</label><input id="showing-when" type="datetime-local" required value={when} onChange={e=>setWhen(e.target.value)}/></div>
   <div className="field"><label htmlFor="showing-message">Message (optional)</label><textarea id="showing-message" maxLength={2000} value={message} onChange={e=>setMessage(e.target.value)} placeholder="Questions or accessibility requirements"/></div>
   <div className="rv-honeypot" aria-hidden="true"><label htmlFor="showing-website">Leave this field blank</label><input id="showing-website" tabIndex={-1} autoComplete="off" value={website} onChange={e=>setWebsite(e.target.value)}/></div>
   <button disabled={busy} className="btn primary" type="submit">{busy?'Sending…':'Request showing'}</button>
   {error&&<p className="notice" role="alert">{error}</p>}
   <p className="hint">By submitting, you agree that the listing agent may contact you about this showing. This does not automatically subscribe you to marketing emails.</p>
  </form>
 </section>;
}
