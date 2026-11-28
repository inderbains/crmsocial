'use client';
import {useEffect,useRef,useState} from 'react';
import {getSupabase} from '../lib/supabase';

type Props={dealId:string;stage:string|null;completionDate:string|null;revision:number;onSaved:()=>Promise<void>};
export default function AutomaticCommissionStatement({dealId,stage,completionDate,revision,onSaved}:Props){
 const db=getSupabase()!;
 const refresh=useRef(onSaved);refresh.current=onSaved;
 const [state,setState]=useState('Checking payment record…');
 const [error,setError]=useState('');
 const [document,setDocument]=useState<{name:string;path:string}|null>(null);
 useEffect(()=>{
  let live=true,busy=false;
  async function check(){
   if(!live||busy)return;busy=true;
   try{
    const payment=await db.from('agent_payouts').select('id,status').eq('deal_id',dealId).maybeSingle();
    if(payment.error)throw payment.error;if(!live)return;
    if(payment.data?.status!=='Paid'){setState('Statement will be generated automatically after the agent payment is recorded.');setError('');return}
    const path=`rv-system/${dealId}/completion/commission-${payment.data.id}.pdf`;
    const read=()=>db.from('deal_documents').select('name,path').eq('deal_id',dealId).eq('path',path).maybeSingle();
    const existing=await read();if(existing.error)throw existing.error;if(!live)return;
    if(existing.data){setDocument(existing.data);setState('Automatically generated commission statement saved.');setError('');return}
    if(stage==='Archived'){setState('This historical file has no automatically generated statement. Check its original documents.');return}
    setState('Recorded payment found. Generating private commission statement…');
    const result=await db.functions.invoke('closing-packet',{body:{action:'commission_statement',deal_id:dealId}});
    if(result.error){let message=result.error.message;try{const payload=await result.error.context?.json();if(payload?.error)message=payload.error}catch{}throw new Error(message)}
    if(result.data?.status!=='saved')throw new Error('Payment record changed. The system will check again.');
    const saved=await read();if(saved.error)throw saved.error;if(!saved.data)throw new Error('Statement saved but not yet readable by this account.');
    if(live){setDocument(saved.data);setState('Automatically generated commission statement saved.');setError('');await refresh.current()}
   }catch(e){if(live){setError((e as Error).message);setState('Automatic statement is not ready. RealVolt will retry while this file is open.')}}finally{busy=false}
  }
  void check();const interval=window.setInterval(()=>void check(),20000);
  return()=>{live=false;window.clearInterval(interval)};
 },[db,dealId,stage,revision]);
 async function open(){if(!document)return;const url=await db.storage.from('transaction-files').createSignedUrl(document.path,120);if(url.error){setError(url.error.message);return}const a=window.document.createElement('a');a.href=url.data.signedUrl;a.target='_blank';a.rel='noopener noreferrer';a.click()}
 return <section style={{marginTop:18,borderTop:'1px solid #dce5dc',paddingTop:14}} aria-label="Legal completion and commission records">
  <h3>Legal completion &amp; commission records</h3>
  <p>Legal completion recorded: <b>{completionDate||'Not recorded'}</b>. The lawyer’s completion letter remains in the original transaction documents.</p>
  <p className="hint">{state}</p>{error&&<p className="notice" role="alert">{error}</p>}
  {document&&<div className="draftrow"><span>{document.name}</span><button type="button" className="btn" onClick={()=>void open()}>Open statement</button></div>}
 </section>;
}
