'use client';
import {useId,useState} from 'react';
import {emptyLawyer,hasLawyer,matchingLawyers,type Lawyer,type LawyerEntry} from '../lib/lawyers';
import ManualContactInput from './manual-contact-input';

export default function LawyerChoice({side,value,lawyers,onChange,disabled=false}:{side:'buyer'|'seller';value:LawyerEntry;lawyers:Lawyer[];onChange:(v:LawyerEntry)=>void;disabled?:boolean}){
 const uid=useId();
 const [typed,setTyped]=useState('');
 const [searching,setSearching]=useState(false);
 const query=typed.trim();
 // Suggestions come only from the brokerage directory, never from browser history.
 // Focus alone (including focus of a previously populated field) does not open results.
 const matches=searching&&!disabled&&!value.id&&query.length>=3&&typed===value.name?matchingLawyers(lawyers,query):[];
 const update=(key:keyof Omit<LawyerEntry,'id'>,text:string)=>onChange({...value,id:null,[key]:text});
 const fieldId=(k:string)=>`${uid}-${side}-rv-contact-${k}`;
 return <section className="panel" style={{padding:20}} onBlur={e=>{if(!e.currentTarget.contains(e.relatedTarget)){setSearching(false);setTyped('')}}}>
  <div className="sectionhead"><h3>{side==='buyer'?'Buyer’s lawyer':'Seller’s lawyer'}</h3>{hasLawyer(value)&&<button className="btn smallbtn" type="button" disabled={disabled} onClick={()=>{onChange(emptyLawyer());setSearching(false);setTyped('')}}>Clear</button>}</div>
  <div className="field">
   <label htmlFor={fieldId('name')}>Lawyer / contact name</label>
   <ManualContactInput id={fieldId('name')} disabled={disabled} readOnly={!!value.id} required={hasLawyer(value)} placeholder="Type at least 3 letters to search" value={value.name} onChange={text=>{setTyped(text);setSearching(true);update('name',text)}}/>
  </div>
  {matches.length>0&&<div aria-label={'Matching '+side+' lawyers'}><p className="hint">Saved lawyers in your brokerage</p>{matches.map(l=><button style={{display:'block',width:'100%',textAlign:'left',marginBottom:6}} className="btn" type="button" key={l.id} disabled={disabled} onClick={()=>{onChange({...l});setSearching(false);setTyped('')}}><span><b>{l.name}</b><br/>{l.firm} · {l.email}<br/>{l.address}</span></button>)}</div>}
  {searching&&query.length>=3&&typed===value.name&&!value.id&&!matches.length&&<p className="hint">No matching lawyer. Complete the details below to add this contact.</p>}
  {(['firm','address','email','phone'] as const).map(k=><div className="field" key={k}>
   <label htmlFor={fieldId(k)}>{{firm:'Law firm',address:'Office address',email:'Email',phone:'Phone'}[k]}</label>
   <ManualContactInput id={fieldId(k)} disabled={disabled} readOnly={!!value.id} required={!value.id&&hasLawyer(value)&&(k==='address'||k==='email')} inputMode={k==='email'?'email':k==='phone'?'tel':'text'} value={value[k]} onFocus={()=>{setSearching(false);setTyped('')}} onChange={text=>update(k,text)}/>
  </div>)}
  <p className="hint">{value.id?'Saved lawyer selected. Clear to choose or enter a different contact.':'New lawyers are added to your brokerage’s directory when you save the transaction.'}</p>
 </section>;
}
