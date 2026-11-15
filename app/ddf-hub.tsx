'use client';

import {useEffect,useState,type FormEvent} from 'react';
import {Building2,UserRound,ShieldCheck,RefreshCw,Database,HousePlus,ArrowUpRight} from 'lucide-react';
import {getSupabase} from '../lib/supabase';
import type {Brand} from '../lib/designs';
import {ddfMemberIdValid,ddfReferenceValid,ddfStatusLabel,listingToDraft,type DdfConnection,type DdfListing,type DdfScope} from '../lib/ddf';

type Membership={brokerage_id:string;role:string};
type DdfHubProps={
 userId:string;
 brand:Brand;
 notify:(message:string)=>void;
 onPropertyPages:()=>void;
 /** The workspace owns personal connections; Back Office owns brokerage connections. */
 surface:'agent'|'office';
};
const money=(n:number|null)=>n==null?'Price on request':new Intl.NumberFormat('en-CA',{style:'currency',currency:'CAD',maximumFractionDigits:0}).format(n);

export default function DdfHub({userId,brand,notify,onPropertyPages,surface}:DdfHubProps){
 const [membership,setMembership]=useState<Membership|null>(null);
 const [brokerageName,setBrokerageName]=useState('');
 const [connection,setConnection]=useState<DdfConnection|null>(null);
 const [listings,setListings]=useState<DdfListing[]>([]);
 const [ownership,setOwnership]=useState<string[]>([]);
 const [destination,setDestination]=useState('');
 const [memberId,setMemberId]=useState('');
 const [saving,setSaving]=useState(false);
 const [loading,setLoading]=useState(true);
 const [loadError,setLoadError]=useState('');
 const db=getSupabase();
 const isOffice=surface==='office';
 const scope:DdfScope=isOffice?'office':'agent';
 const isAdmin=membership?.role==='admin';

 async function refresh(){
  if(!db){setLoadError('Supabase has not been configured.');setLoading(false);return;}
  setLoading(true);setLoadError('');
  const m=await db.from('brokerage_members').select('brokerage_id,role').eq('user_id',userId).maybeSingle();
  if(m.error){setLoadError('Membership lookup failed: '+m.error.message);setLoading(false);return;}
  const member=m.data as Membership|null;
  setMembership(member);
  if(!member||(isOffice&&member.role!=='admin')){
   setConnection(null);setListings([]);setOwnership([]);setLoading(false);return;
  }
  let connectionQuery=db.from('ddf_connections')
   .select('id,brokerage_id,owner_user_id,scope,destination_id,member_id,status,last_synced_at,last_error,created_at')
   .eq('brokerage_id',member.brokerage_id).eq('scope',scope);
  if(!isOffice)connectionQuery=connectionQuery.eq('owner_user_id',userId);
  const listingQuery=db.from('ddf_listings')
   .select('id,brokerage_id,mls_number,address,city,price,beds,baths,area_sqft,headline,description,status,photos,media,attribution,marketing_authorized,last_seen_at')
   .eq('brokerage_id',member.brokerage_id).order('last_seen_at',{ascending:false}).limit(150);
  const [c,l,o,b]=await Promise.all([
   connectionQuery.maybeSingle(),
   listingQuery,
   isOffice?Promise.resolve({data:[] as {listing_id:string}[],error:null}):db.from('ddf_listing_agents')
    .select('listing_id').eq('brokerage_id',member.brokerage_id).eq('user_id',userId),
   db.from('brokerages').select('name').eq('id',member.brokerage_id).maybeSingle()
  ]);
  if(c.error||l.error||o.error){
   setLoadError('DDF tables are unavailable. Run supabase/015_ddf_listing_foundation.sql first. '+(c.error||l.error||o.error)!.message);
   setConnection(null);setListings([]);setOwnership([]);
  }else{
   const found=c.data as DdfConnection|null;
   setConnection(found);
   setDestination(found?.destination_id||'');
   setMemberId(found?.member_id||'');
   setListings((l.data||[]) as DdfListing[]);
   setOwnership((o.data||[]).map(x=>x.listing_id));
  }
  setBrokerageName(b.data?.name||'Your brokerage');
  setLoading(false);
 }
 useEffect(()=>{void refresh();},[userId,surface]);

 async function save(e:FormEvent<HTMLFormElement>){
  e.preventDefault();
  if(!membership||!db||isOffice&&!isAdmin)return;
  const code=destination.trim(),agent=memberId.trim();
  if(!ddfReferenceValid(code)||!ddfMemberIdValid(agent)){
   notify('Enter a valid DDF Destination ID (letters, numbers, dots, underscores or dashes).');return;
  }
  setSaving(true);
  const value={destination_id:code,member_id:isOffice?'':agent};
  const r=connection
   ?await db.from('ddf_connections').update(value).eq('id',connection.id).select('id').single()
   :await db.from('ddf_connections').insert({...value,scope,brokerage_id:membership.brokerage_id,owner_user_id:isOffice?null:userId}).select('id').single();
  if(r.error)notify('DDF reference not saved: '+r.error.message);
  else{notify('DDF reference saved. CREA/provider authorization and server-side verification are still required.');await refresh();}
  setSaving(false);
 }
 async function createDraft(listing:DdfListing){
  if(!db)return;
  if(!listing.marketing_authorized){notify('The data provider must authorize marketing use before property page generation.');return;}
  setSaving(true);
  const data=listingToDraft(listing,brand.name,brokerageName,brand.color);
  const check=await db.from('property_pages').select('id').eq('user_id',userId).eq('ddf_listing_id',listing.id).maybeSingle();
  if(check.error){notify(check.error.message);setSaving(false);return;}
  if(check.data){notify('A property page already exists for this listing.');setSaving(false);onPropertyPages();return;}
  const result=await db.from('property_pages').insert({...data,user_id:userId}).select('id').single();
  if(result.error)notify('Property draft failed: '+result.error.message);
  else{notify('Private property draft created. Review it before publishing.');onPropertyPages();}
  setSaving(false);
 }
 const visibleListings=isOffice?listings:listings.filter(l=>ownership.includes(l.id));

 return <>
  <div className="headrow">
   <div>
    <p className="eyebrow">{isOffice?'BROKERAGE BACK OFFICE':'AGENT WORKSPACE'}</p>
    <h1>{isOffice?'Office DDF & Listings':'My DDF & Listings'}</h1>
    <p>{isOffice?'Register your brokerage’s authorized All Offices DDF feed and review the office listing inventory.':'Register your personal My Listings feed and manage your assigned property listings.'}</p>
   </div>
   <button className="btn" disabled={loading} onClick={()=>void refresh()}><RefreshCw size={16}/> Refresh</button>
  </div>
  {loadError&&<div className="notice" role="alert">{loadError}</div>}
  {loading?<section className="panel">Loading DDF settings…</section>
  :!membership?<section className="panel"><h2>Brokerage membership required</h2><p>An administrator must link your account to a RealVolt brokerage before you can register a DDF feed.</p></section>
  :isOffice&&!isAdmin?<section className="panel"><h2>Brokerage admin access required</h2><p>Only a verified brokerage administrator can connect the All Offices DDF feed or view the office listing inventory. Your personal feed is under My DDF & Listings.</p></section>
  :<>
   <div className="ddf-metrics">
    <div className="panel"><b>{brokerageName}</b><p className="muted">Brokerage</p></div>
    <div className="panel"><b>{visibleListings.length}</b><p className="muted">{isOffice?'Office listings shown':'My synced listings'}</p></div>
    <div className="panel"><b>{connection?ddfStatusLabel(connection.status):'Not registered'}</b><p className="muted">{isOffice?'Office feed status':'Personal feed status'}</p></div>
   </div>
   <section className="panel ddf-panel">
    <div className="notice" role="note">
     <ShieldCheck size={18}/>
     <div><b>CREA website authorization is required</b>
      <p>A DDF feed is registered for an identified website. If your existing feed is for your personal website, keep using it there. RealVolt cannot import that feed just because you enter its reference, and you must not share your DDF username or password with RealVolt.</p>
      <p>After RealVolt receives CREA Technology Provider approval, authorize RealVolt in the DDF dashboard for your approved member website and then add the assigned feed reference here. Ask CREA how your hosted property pages and subdomains should be registered. <a href="https://www.realtor.ca/ddf/technology-providers" target="_blank" rel="noopener noreferrer">Official provider requirements</a></p>
     </div>
    </div>
    <div className="sectionhead"><div><h2>{isOffice?'Brokerage DDF Connection':'My Personal DDF Connection'}</h2><p className="muted">{isOffice?'All Offices feed · Brokerage administrators only':'My Listings feed · Your account only'}</p></div>{isOffice?<Building2 size={25}/>:<UserRound size={25}/>}</div>
    <form onSubmit={save} className="ddf-form">
     <div className="field"><label htmlFor="ddf-destination">Authorized CREA DDF Destination ID / feed reference</label><input id="ddf-destination" autoComplete="off" required maxLength={120} placeholder="Enter the reference for your approved feed" value={destination} onChange={e=>setDestination(e.target.value)}/></div>
     {!isOffice&&<div className="field"><label htmlFor="ddf-member">Agent MLS® member ID (optional)</label><input id="ddf-member" autoComplete="off" maxLength={120} placeholder="Used to match listings to your agent profile" value={memberId} onChange={e=>setMemberId(e.target.value)}/></div>}
     <div className="ddf-status"><span className="badge">{connection?ddfStatusLabel(connection.status):'Not registered'}</span>{connection?.last_synced_at&&<span className="muted">Last sync: {new Date(connection.last_synced_at).toLocaleString('en-CA')}</span>}</div>
     <button type="submit" className="btn primary" disabled={saving||!!loadError}>{saving?'Saving…':connection?'Update feed reference':'Save feed reference'}</button>
     <p className="hint">Never enter your REALTOR.ca password, CREA API token or secret here. Saving a reference does not activate the feed. The approved provider must verify authorization on a secure backend before importing any listings.</p>
    </form>
    {isOffice&&<div className="notice"><ShieldCheck size={18}/><b>Brokerage-only access</b><p>The office feed is stored against this brokerage. Agents cannot change it or view its connection settings, even if they know the Destination ID.</p></div>}
   </section>
   <section className="panel"><div className="sectionhead"><div><h2>{isOffice?'All Office Listings':'My Listings'}</h2><p className="muted">Only verified, authorized server-side imports appear here. No listings are imported by entering a reference alone.</p></div><Database size={22}/></div>
    {!visibleListings.length?<div className="empty"><HousePlus size={35}/><h3>No verified DDF listings yet</h3><p>Once authorization and the secure synchronization worker are configured, {isOffice?'the brokerage’s inventory':'your assigned listings'} will appear here. Manual property pages are still available.</p><button className="btn" onClick={onPropertyPages}>Open Property Pages <ArrowUpRight size={15}/></button></div>
    :<div className="ddf-listings">{visibleListings.map(l=><article key={l.id} className="ddf-listing"><div><span className="badge">{l.status.toUpperCase()}</span><p className="muted">MLS® {l.mls_number}</p><h3>{l.headline||l.address}</h3><p>{[l.address,l.city].filter(Boolean).join(', ')} · {money(l.price)}</p><p className="hint">{l.beds??'—'} beds · {l.baths??'—'} baths · {l.area_sqft??'—'} sq ft</p></div><button className="btn" disabled={!l.marketing_authorized||saving} title={!l.marketing_authorized?'Marketing permission required':'Generate a property-page draft'} onClick={()=>void createDraft(l)}>Create property draft</button></article>)}</div>}
   </section>
  </>}
 </>;
}
