'use client';
import {useEffect,useState,type FormEvent} from 'react';
import {Building2,UserRound,ShieldCheck,RefreshCw,Database,HousePlus,ArrowUpRight} from 'lucide-react';
import {getSupabase} from '../lib/supabase';
import type {Brand} from '../lib/designs';
import {ddfMemberIdValid,ddfReferenceValid,ddfStatusLabel,listingToDraft,type DdfConnection,type DdfListing,type DdfScope} from '../lib/ddf';

type Membership={brokerage_id:string;role:string};
const money=(n:number|null)=>n==null?'Price on request':new Intl.NumberFormat('en-CA',{style:'currency',currency:'CAD',maximumFractionDigits:0}).format(n);
export default function DdfHub({userId,brand,notify,onPropertyPages}:{userId:string;brand:Brand;notify:(s:string)=>void;onPropertyPages:()=>void}){
 const [membership,setMembership]=useState<Membership|null>(null);
 const [brokerageName,setBrokerageName]=useState('');
 const [connections,setConnections]=useState<DdfConnection[]>([]);
 const [listings,setListings]=useState<DdfListing[]>([]);
 const [ownership,setOwnership]=useState<string[]>([]);
 const [scope,setScope]=useState<DdfScope>('agent');
 const [destination,setDestination]=useState('');
 const [memberId,setMemberId]=useState('');
 const [saving,setSaving]=useState(false),[loading,setLoading]=useState(true),[loadError,setLoadError]=useState('');
 const [mode,setMode]=useState<'my'|'office'>('my');
 const db=getSupabase();
 async function refresh(){
  if(!db)return;
  setLoading(true);setLoadError('');
  const m=await db.from('brokerage_members').select('brokerage_id,role').eq('user_id',userId).maybeSingle();
  if(m.error){setLoadError('Membership lookup failed: '+m.error.message);setLoading(false);return;}
  const member=m.data as Membership|null;setMembership(member);
  if(!member){setConnections([]);setListings([]);setLoading(false);return;}
  const [c,l,o,b]=await Promise.all([
   db.from('ddf_connections').select('id,brokerage_id,owner_user_id,scope,destination_id,member_id,status,last_synced_at,last_error,created_at').eq('brokerage_id',member.brokerage_id).order('created_at'),
   db.from('ddf_listings').select('id,brokerage_id,mls_number,address,city,price,beds,baths,area_sqft,headline,description,status,photos,media,attribution,marketing_authorized,last_seen_at').eq('brokerage_id',member.brokerage_id).order('last_seen_at',{ascending:false}).limit(150),
   db.from('ddf_listing_agents').select('listing_id').eq('brokerage_id',member.brokerage_id).eq('user_id',userId),
   db.from('brokerages').select('name').eq('id',member.brokerage_id).maybeSingle()
  ]);
  if(c.error||l.error||o.error){setLoadError('Run supabase/015_ddf_listing_foundation.sql. '+(c.error||l.error||o.error)!.message);}else{
   setConnections((c.data||[]) as DdfConnection[]);setListings((l.data||[]) as DdfListing[]);setOwnership((o.data||[]).map(x=>x.listing_id));
  }
  setBrokerageName(b.data?.name||'Your brokerage');setLoading(false);
 }
 useEffect(()=>{void refresh();/* userId changes remount in parent */},[userId]);
 const isAdmin=membership?.role==='admin';
 const yourConnection=connections.find(c=>c.scope==='agent'&&c.owner_user_id===userId);
 const officeConnection=connections.find(c=>c.scope==='office');
 const selected=scope==='office'?officeConnection:yourConnection;
 useEffect(()=>{setDestination(selected?.destination_id||'');setMemberId(selected?.member_id||'');},[scope,selected?.id,selected?.destination_id,selected?.member_id]);
 function chooseScope(next:DdfScope){setScope(next);const current=next==='office'?officeConnection:yourConnection;setDestination(current?.destination_id||'');setMemberId(current?.member_id||'');}
 async function save(e:FormEvent){e.preventDefault();if(!membership||!db)return;
  const code=destination.trim(),agent=memberId.trim();
  if(!ddfReferenceValid(code)||!ddfMemberIdValid(agent)){notify('Enter a valid Destination ID (letters, numbers, dots, underscores or dashes).');return;}
  setSaving(true);
  const value={destination_id:code,member_id:scope==='agent'?agent:''};
  const r=selected
   ?await db.from('ddf_connections').update(value).eq('id',selected.id).select('id').single()
   :await db.from('ddf_connections').insert({...value,scope,brokerage_id:membership.brokerage_id,owner_user_id:scope==='agent'?userId:null}).select('id').single();
  if(r.error)notify('DDF reference not saved: '+r.error.message);
  else{notify('Feed reference saved. CREA authorization and provider verification are still required.');await refresh();}
  setSaving(false);
 }
 async function createDraft(listing:DdfListing){if(!db)return;
  if(!listing.marketing_authorized){notify('The DDF provider must authorize marketing use before page generation.');return;}
  setSaving(true);
  const data=listingToDraft(listing,brand.name,brokerageName,brand.color);
  const check=await db.from('property_pages').select('id').eq('user_id',userId).eq('ddf_listing_id',listing.id).maybeSingle();
  if(check.error){notify(check.error.message);setSaving(false);return;}
  if(check.data){notify('You already have a property page for this listing. Open Property Pages.');setSaving(false);onPropertyPages();return;}
  const result=await db.from('property_pages').insert({...data,user_id:userId}).select('id').single();
  if(result.error)notify('Property draft failed: '+result.error.message);
  else{notify('Private property draft created. Review everything before publishing.');onPropertyPages();}
  setSaving(false);
 }
 const myListings=listings.filter(l=>ownership.includes(l.id));
 const visibleListings=mode==='office'&&isAdmin?listings:myListings;
 return <>
 <div className="headrow"><div><p className="eyebrow">REALVOLT LISTING AUTOMATION</p><h1>DDF & Listing Sync</h1><p>Connect authorized feeds, separate office and agent data, and turn listings into property pages.</p></div><button className="btn" disabled={loading} onClick={()=>void refresh()}><RefreshCw size={16}/> Refresh</button></div>
 {loadError&&<div className="notice" role="alert">{loadError}</div>}
 {loading?<section className="panel">Loading DDF settings…</section>:!membership?<section className="panel"><h2>Brokerage membership required</h2><p>Your account is not linked to a RealVolt brokerage yet. An administrator must add you through Back Office before this feature can use office or agent DDF feeds.</p></section>:<>
 <div className="ddf-metrics">
  <div className="panel"><b>{brokerageName}</b><p className="muted">Current brokerage</p></div>
  <div className="panel"><b>{myListings.length}</b><p className="muted">My synced listings</p></div>
  <div className="panel"><b>{isAdmin?listings.length:'—'}</b><p className="muted">Office listings</p></div>
 </div>
 <section className="panel ddf-panel"><div className="sectionhead"><div><h2>DDF connection settings</h2><p className="muted">A saved feed reference is not a live connection.</p></div><ShieldCheck size={25}/></div>
  <div className="ddf-switch"><button type="button" className={'btn '+(scope==='agent'?'primary':'')} onClick={()=>chooseScope('agent')}><UserRound size={15}/> My Listings</button>{isAdmin&&<button type="button" className={'btn '+(scope==='office'?'primary':'')} onClick={()=>chooseScope('office')}><Building2 size={15}/> All Office Listings</button>}</div>
  <form onSubmit={save} className="ddf-form">
    <div className="field"><label htmlFor="ddf-destination">CREA DDF Destination ID / feed reference</label><input id="ddf-destination" autoComplete="off" required maxLength={120} placeholder="Enter the reference issued for your approved feed" value={destination} onChange={e=>setDestination(e.target.value)}/></div>
    {scope==='agent'&&<div className="field"><label htmlFor="ddf-member">Agent MLS® member ID (optional)</label><input id="ddf-member" autoComplete="off" maxLength={120} placeholder="For matching listings to your agent profile" value={memberId} onChange={e=>setMemberId(e.target.value)}/></div>}
    <div className="ddf-status"><span className="badge">{selected?ddfStatusLabel(selected.status):'Not registered'}</span>{selected?.last_synced_at&&<span className="muted">Last sync: {new Date(selected.last_synced_at).toLocaleString('en-CA')}</span>}</div>
    <button type="submit" className="btn primary" disabled={saving}>{saving?'Saving…':selected?'Update feed reference':'Save feed reference'}</button>
    <p className="hint">Never paste a REALTOR.ca password, CREA API token or private secret here. The technology provider must verify feed permissions on a secure backend before any listings are imported.</p>
  </form>
  {isAdmin&&<div className="notice"><b>Office admin control</b><p>Only a verified brokerage admin can register the All Offices feed. Agent-level feeds are tied to the signed-in agent account; no one can claim another agent’s connection.</p></div>}
 </section>
 <section className="panel"><div className="sectionhead"><div><h2>Listing inventory</h2><p className="muted">The database is ready for authorized server-side imports. Nothing is imported from a pasted code alone.</p></div><Database size={22}/></div>
  {isAdmin&&<div className="ddf-switch"><button className={'btn '+(mode==='my'?'primary':'')} onClick={()=>setMode('my')} type="button">My Listings</button><button className={'btn '+(mode==='office'?'primary':'')} onClick={()=>setMode('office')} type="button">Office Listings</button></div>}
  {!visibleListings.length?<div className="empty"><HousePlus size={35}/><h3>No verified DDF listings yet</h3><p>Once the feed is approved and the secure synchronization worker is configured, your listings will appear here. You can continue making manual property pages in the meantime.</p><button className="btn" onClick={onPropertyPages}>Open Property Pages <ArrowUpRight size={15}/></button></div>:<div className="ddf-listings">{visibleListings.map(l=><article key={l.id} className="ddf-listing"><div><span className="badge">{l.status.toUpperCase()}</span><p className="muted">MLS® {l.mls_number}</p><h3>{l.headline||l.address}</h3><p>{[l.address,l.city].filter(Boolean).join(', ')} · {money(l.price)}</p><p className="hint">{l.beds??'—'} beds · {l.baths??'—'} baths · {l.area_sqft??'—'} sq ft</p></div><button className="btn" disabled={!l.marketing_authorized||saving} title={!l.marketing_authorized?'Marketing permission required':'Generate a property-page draft'} onClick={()=>void createDraft(l)}>Create property draft</button></article>)}</div>}
 </section>
 </>}
 </>;
}
