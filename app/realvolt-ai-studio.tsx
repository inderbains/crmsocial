'use client';
import {useEffect,useState,type FormEvent} from 'react';
import {BrainCircuit,ClipboardCopy,FileText,Printer,Download,Sparkles} from 'lucide-react';
import {getSupabase} from '../lib/supabase';
import s from './realvolt-enhancements.module.css';
type Mode='cma'|'listing'|'marketing'|'lead';
type Contact={id:string;full_name:string;stage:string;contact_type:string};
type Value={estimate:number;low:number;high:number;medianPricePerSqft:number;sampleCount:number;warnings:string[];methodology:string;comparables:Array<{address:string;soldPrice:number;areaSqft:number;soldDate:string}>};
const money=(n:number)=>new Intl.NumberFormat('en-CA',{style:'currency',currency:'CAD',maximumFractionDigits:0}).format(n);
export default function RealVoltAIStudio({userId,notify}:{userId:string;notify:(message:string)=>void}){
 const [mode,setMode]=useState<Mode>('cma'),[address,setAddress]=useState(''),[beds,setBeds]=useState('4'),[baths,setBaths]=useState('3'),[sqft,setSqft]=useState('2500'),[details,setDetails]=useState(''),[platform,setPlatform]=useState('Instagram');
 const [comparables,setComparables]=useState(''),[contactId,setContactId]=useState(''),[contacts,setContacts]=useState<Contact[]>([]),[content,setContent]=useState(''),[value,setValue]=useState<Value|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 useEffect(()=>{const db=getSupabase();if(!db)return;void db.from('crm_contacts').select('id,full_name,stage,contact_type').eq('user_id',userId).order('created_at',{ascending:false}).limit(300).then(r=>{if(!r.error)setContacts(r.data||[])})},[userId]);
 const switchMode=(m:Mode)=>{setMode(m);setContent('');setValue(null);setError('')};
 async function generate(e:FormEvent){e.preventDefault();if(busy)return;setBusy(true);setError('');setContent('');setValue(null);
  try{
   const db=getSupabase();if(!db)throw new Error('Supabase configuration missing');
   const {data:{session}}=await db.auth.getSession();if(!session)throw new Error('Sign in first.');
   const payload:Record<string,unknown>={mode,address,bedrooms:Number(beds),bathrooms:Number(baths),areaSqft:Number(sqft),details,platform,contactId};
   if(mode==='cma'){
    const rows=comparables.split('\n').map(x=>x.trim()).filter(Boolean);
    if(rows.length<3||rows.length>12)throw new Error('Enter 3–12 actual sold comparables, one per line.');
    payload.comparables=rows.map((line,index)=>{
     const [location,price,area,date,...extra]=line.split('|').map(x=>x.trim());
     if(extra.length||!location||!price||!area||!date)throw new Error(`Comparable ${index+1}: use Address | Sold price | SqFt | YYYY-MM-DD`);
     return {address:location,soldPrice:Number(price.replace(/[$,\s]/g,'')),areaSqft:Number(area.replace(/[,\s]/g,'')),soldDate:date};
    });
   }
   const response=await fetch('/api/realvolt-ai/generate',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${session.access_token}`},body:JSON.stringify(payload)});
   const result=await response.json() as {error?:string;content?:string;calculation?:Value|null};
   if(!response.ok)throw new Error(result.error||'Could not generate report');
   setContent(result.content||'');setValue(result.calculation||null);notify('Prepared for your review. Nothing was sent or published.');
  }catch(e){setError(e instanceof Error?e.message:'Could not generate content')}finally{setBusy(false)}
 }
 async function copy(){try{await navigator.clipboard.writeText(content);notify('Copied. Review before sharing.')}catch{notify('Please select and copy the text manually.')}}
 async function downloadCma(){if(!content||mode!=='cma')return;
  try{
   const {PDFDocument,StandardFonts,rgb}=await import('pdf-lib');
   const pdf=await PDFDocument.create();const font=await pdf.embedFont(StandardFonts.Helvetica);
   let page=pdf.addPage([595,842]),y=790;const margin=48;
   const write=(line:string,size:number=10)=>{
    if(y<58){page=pdf.addPage([595,842]);y=790;}
    page.drawText(line.slice(0,110),{x:margin,y,size,font,color:rgb(0.11,0.26,0.2)});y-=size+8;
   };
   write('REALVOLT  |  INDICATIVE COMPARATIVE MARKET ANALYSIS',14);
   write('Prepared for REALTOR review - not a formal property appraisal',9);y-=18;
   if(value){
    write(`Subject: ${address}`,11);
    write(`Illustrative range: CAD ${money(value.low)} - ${money(value.high)}`,11);
    write(`Median-based midpoint: CAD ${money(value.estimate)}`,11);
    write(`Median sale price per finished sqft: CAD ${money(value.medianPricePerSqft)}`,10);
    write(`Agent-entered comparable sales: ${value.sampleCount}`,10);y-=12;
    write('VERIFIED SALES PROVIDED BY AGENT',11);
    for(const c of value.comparables){
     write(`${c.address.slice(0,55)} | ${money(c.soldPrice)} | ${c.areaSqft} sqft | ${c.soldDate}`,9);
    }
    y-=12;write('NARRATIVE AND LIMITATIONS',11);
   }
   for(const line of content.replace(/[\u2010-\u2015]/g,'-').replace(/[^\x20-\x7E\n]/g,'?').split('\n')){
    if(!line.trim()){y-=8;continue;}
    const words=line.split(/\s+/);let current='';
    for(const word of words){
      const part=current?current+' '+word:word;
      if(font.widthOfTextAtSize(part,10)>495 && current){write(current);current=word;}else current=part;
      // Guard against exceptionally long unbroken tokens
      while(font.widthOfTextAtSize(current,10)>495){write(current.slice(0,85));current=current.slice(85);}
    }
    if(current)write(current);
   }
   const bytes=await pdf.save();const blob=new Blob([new Uint8Array(bytes)],{type:'application/pdf'});
   const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download='RealVolt_CMA_Draft.pdf';link.click();
   window.setTimeout(()=>URL.revokeObjectURL(url),2000);notify('CMA PDF saved. Review before emailing or printing.');
  }catch(e){notify('PDF export failed: '+(e instanceof Error?e.message:'Unknown error'))}
 }

 return <section className={s.wrap}>
  <header className={s.head}><div><span className={s.eyebrow}>REALVOLT / AGENTIC AI</span><h1>Work smarter, keep control.</h1><p>Create evidence-based CMA summaries and review-ready content using your own property details and CRM.</p></div><Sparkles size={25} color="#da4c16"/></header>
  <div className={s.notice}><BrainCircuit size={19}/><span>Every output is a <b>draft for agent review</b>. CMA uses only comparable sales you enter; no MLS, DDF, current market database, or email sender is connected by this tool.</span></div>
  <div className={s.row} style={{marginBottom:22}}>{([['cma','CMA report'],['listing','Listing description'],['marketing','Marketing content'],['lead','Lead next steps']] as const).map(([key,label])=><button type="button" key={key} className={mode===key?s.pillActive:s.pill} onClick={()=>switchMode(key)}>{label}</button>)}</div>
  <div className={s.gridTwo}>
   <div className={s.panel}>
    <h2>{mode==='cma'?'Comparable market analysis':mode==='listing'?'Describe this listing':mode==='marketing'?'Create marketing content':'Lead intelligence'}</h2>
    <form className={s.form} onSubmit={generate}>
     {mode==='lead'?<label>Existing CRM contact<select value={contactId} required onChange={e=>setContactId(e.target.value)}><option value="">Choose a contact</option>{contacts.map(c=><option key={c.id} value={c.id}>{c.full_name} · {c.stage}</option>)}</select></label>:
     <><label>Property address<input required maxLength={200} value={address} onChange={e=>setAddress(e.target.value)} placeholder="Address, city, province"/></label>
      <div className={s.gridTwo}><label>Bedrooms<input type="number" required min="0" max="30" value={beds} onChange={e=>setBeds(e.target.value)}/></label><label>Bathrooms<input type="number" required min="0" max="30" step="0.5" value={baths} onChange={e=>setBaths(e.target.value)}/></label></div>
      {mode==='cma'&&<><label>Subject finished area (sq ft)<input required type="number" min="200" max="30000" value={sqft} onChange={e=>setSqft(e.target.value)}/></label>
       <label>Verified closed comparable sales<textarea rows={8} required value={comparables} onChange={e=>setComparables(e.target.value)} placeholder={'123 Example St, Surrey | 1250000 | 2400 | 2026-09-01\n124 Example St, Surrey | 1295000 | 2500 | 2026-08-21\n125 Example St, Surrey | 1320000 | 2550 | 2026-08-14'}/></label><p className={s.muted}>One verified sold comparable per line: Address | Sale price | Finished square feet | Closing date (YYYY-MM-DD). Sample entries are format examples only.</p></>}
      {mode==='marketing'&&<label>Platform<select value={platform} onChange={e=>setPlatform(e.target.value)}><option>Instagram</option><option>Facebook</option><option>LinkedIn</option><option>Email campaign</option></select></label>}
      <label>{mode==='cma'?'Condition, lot, upgrades and other notes (optional)':'Verified features and property details'}<textarea rows={4} maxLength={2500} value={details} onChange={e=>setDetails(e.target.value)} placeholder="Only include confirmed facts. Avoid claims you cannot verify."/></label></>}
     <button disabled={busy} className={s.primary} type="submit"><BrainCircuit size={17}/>{busy?'Preparing…':mode==='cma'?'Calculate & prepare report':'Generate draft'}</button>
    </form>
   </div>
   <div className={s.panel}>
    <h2><FileText size={18} style={{verticalAlign:'middle',marginRight:7}}/>Your review copy</h2>
    {error&&<div role="alert" className={s.error}>{error}</div>}
    {!content&&!busy&&!error&&<p className={s.empty}>Select a tool, enter verified details, and generate a report or draft. Your existing CRM and website builder remain unchanged.</p>}
    {busy&&<p className={s.muted}>Preparing your draft…</p>}
    {value&&<div className={s.notice} style={{display:'block'}}><b>Indicative CMA range</b><h2 style={{margin:'8px 0'}}>{money(value.low)} – {money(value.high)}</h2><p className={s.muted}>Midpoint {money(value.estimate)} · {value.sampleCount} agent-supplied sales · median {money(value.medianPricePerSqft)}/sq ft</p><p className={s.compLabel}>{value.methodology}</p></div>}
    {content&&<><div className={s.result} id="realvolt-ai-result">{content}</div><div className={s.row} style={{marginTop:24}}><button className={s.secondary} onClick={()=>void copy()}><ClipboardCopy size={16}/> Copy</button><button className={s.secondary} onClick={()=>window.print()}><Printer size={16}/> Print</button>{mode==='cma'&&<button className={s.secondary} onClick={()=>void downloadCma()}><Download size={16}/> CMA PDF</button>}</div><p className={s.compLabel}>Review all property facts, consent requirements, and the wording before sharing. Nothing was automatically sent or published.</p></>}
   </div>
  </div>
 </section>;
}
