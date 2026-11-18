'use client';
import { useState } from 'react';
import { getSupabase } from '@/lib/supabase';
import { AgentWebsite, SITE_PAGES, type SitePage } from './AgentWebsite';
import type { AgentSite,AgentSiteDomain,AgentSiteDraft,LinkedAgentProfile } from '@/lib/rv-agent-site/types';
import { defaultSite,palettes } from '@/lib/rv-agent-site/types';
import styles from './AgentSiteStudio.module.css';

function generatedSlug(name: string):string {
  return name.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,45);
}
function withProfile(draft: AgentSiteDraft, p: LinkedAgentProfile):AgentSiteDraft {
  return {...draft,
    display_name:p.full_name||draft.display_name, brokerage_name:p.brokerage_name||draft.brokerage_name,
    biography:p.biography, public_email:p.public_email, public_phone:p.public_phone,
    professional_title:p.professional_title, license_number:p.license_number,
    headshot_path:p.headshot_path, logo_path:p.logo_path};
}

export function AgentSiteStudio({initial,initialDomains,profile}:{
  initial:AgentSite|null;initialDomains:AgentSiteDomain[];profile:LinkedAgentProfile;
}) {
  const initialDraft:AgentSiteDraft=initial ? {
    ...defaultSite,...initial,
  } : withProfile({...defaultSite,slug:generatedSlug(profile.full_name)},profile);
  const [site,setSite]=useState<AgentSiteDraft>(initialDraft);
  const [previewPage,setPreviewPage]=useState<SitePage>('home');
  const [domains,setDomains]=useState(initialDomains);
  const [domain,setDomain]=useState('');
  const [message,setMessage]=useState('');
  const [busy,setBusy]=useState(false);
  const [savedSlug,setSavedSlug]=useState(initial?.published?initial.slug:'');
  const [publicReady,setPublicReady]=useState(false);
  const [lastPublicUrl,setLastPublicUrl]=useState('');
  const [statusMessage,setStatusMessage]=useState('');
  const baseDomain=process.env.NEXT_PUBLIC_AGENT_SITE_BASE_DOMAIN || 'realvolt.ca';
  const profileLinked=site.use_profile_identity;
  const displayed=profileLinked?withProfile(site,profile):site;

  const change=(patch:Partial<AgentSiteDraft>)=>{
    setSite(previous=>({...previous,...patch}));
    setSavedSlug('');setPublicReady(false);setLastPublicUrl('');setStatusMessage('');
  };
  const set=(key:keyof AgentSiteDraft,value:string|boolean)=>change({[key]:value});

  async function accessToken():Promise<string>{
    const db=getSupabase();if(!db)throw new Error('Supabase is not configured');
    const {data,error}=await db.auth.getSession();
    if(error||!data.session?.access_token)throw new Error('Session expired: sign in to RealVolt again');
    return data.session.access_token;
  }
  async function checkPublic(slug:string) {
    const r=await fetch(`/api/agent-site/public-status?slug=${encodeURIComponent(slug)}`,{cache:'no-store'});
    const j=await r.json();
    if(!r.ok)throw new Error(j.reason||'Could not verify the public website');
    if(!j.ready)throw new Error('This website is not public yet. Verify that migrations 024 and 025 were run, and your Published setting was saved.');
    setPublicReady(true);setLastPublicUrl(j.url);
    setStatusMessage('Public website verified. The link below should open without signing in.');
  }
  async function save(){
    setBusy(true);setMessage('');setStatusMessage('');setPublicReady(false);
    try {
      const token=await accessToken();
      const draft=profileLinked?withProfile(site,profile):site;
      const r=await fetch('/api/agent-site',{
        method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},
        body:JSON.stringify(draft),
      });
      const data=await r.json();if(!r.ok)throw new Error(data.error||'Save failed');
      const persistedSlug=String(data.site?.slug||'');
      setSite({...draft,slug:persistedSlug});
      setSavedSlug(data.site?.published?persistedSlug:'');
      if(data.site?.published){
        setMessage('Website settings saved. Checking public URL…');
        await checkPublic(persistedSlug);
        setMessage('Website published successfully.');
      } else {
        setPublicReady(false);setLastPublicUrl('');setMessage('Website saved as private. Enable Publish, then save again to go live.');
      }
    } catch(e) {setMessage(e instanceof Error?e.message:'Could not save');}
    finally{setBusy(false)}
  }
  async function requestDomain(){
    setBusy(true);setMessage('');
    try{
      const token=await accessToken();
      const r=await fetch('/api/agent-site/domain',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify({hostname:domain})});
      const data=await r.json();if(!r.ok)throw new Error(data.error||'Domain request failed');
      setDomains(p=>[...p,data.domain]);setDomain('');setMessage('Domain requested. Add the TXT record to verify ownership.');
    }catch(e){setMessage(e instanceof Error?e.message:'Could not request domain')}
    finally{setBusy(false)}
  }
  async function verifyDomain(id:string){
    setBusy(true);setMessage('');
    try{
      const token=await accessToken();
      const r=await fetch('/api/agent-site/domain/verify',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify({id})});
      const data=await r.json();if(!r.ok)throw new Error(data.error||'Verification failed');
      setDomains(p=>p.map(x=>x.id===id?{...x,status:'ownership_verified'}:x));
      setMessage('Ownership verified. Hosting administrator must now connect DNS and SSL before activation.');
    }catch(e){setMessage(e instanceof Error?e.message:'Could not verify domain')}
    finally{setBusy(false)}
  }
  const field=(label:string,key:keyof AgentSiteDraft,placeholder='',multiline=false,disabled=false)=>
    <label className={styles.field}><span>{label}</span>{multiline?
      <textarea disabled={disabled} value={String(displayed[key])} placeholder={placeholder} onChange={e=>set(key,e.target.value)} rows={4}/>:
      <input disabled={disabled} value={String(displayed[key])} placeholder={placeholder} onChange={e=>set(key,e.target.value)}/>}</label>;
  return <div className={styles.shell}>
    <header className={styles.header}>
      <div><a className={styles.backLink} href="/workspace">← Back to RealVolt</a><span className={styles.kicker}>REALVOLT · AGENT WEBSITE</span><h1>My Website Studio</h1><p>Pick a design, use your RealVolt profile, and publish a working link.</p></div>
      <button className={styles.save} onClick={save} disabled={busy}>{busy?'Saving…':'Save & publish changes'}</button>
    </header>
    {message&&<p className={styles.notice} role="status">{message}</p>}
    <div className={styles.layout}><div className={styles.controls}>
      <section className={styles.card}><h2>1. Website template</h2><div className={styles.templates}>
        {(['modern','classic','luxury'] as const).map(name=><button key={name} type="button" className={`${styles.template} ${site.template===name?styles.active:''}`} onClick={()=>set('template',name)}><span className={styles.templateMini} data-template={name}><i/><i/><i/></span><b>{name[0].toUpperCase()+name.slice(1)}</b></button>)}
      </div></section>
      <section className={styles.card}><h2>2. Colour scheme</h2><div className={styles.palettes}>
        {palettes.map(p=><button type="button" key={p.label} className={styles.palette} onClick={()=>change({...p})}><i style={{background:p.primary_color}}/><i style={{background:p.accent_color}}/><span>{p.label}</span></button>)}
      </div><div className={styles.colours}>
        {([['Main','primary_color'],['Accent','accent_color'],['Background','background_color']] as const).map(([label,key])=><label key={key}>{label}<input type="color" value={site[key]} onChange={e=>set(key,e.target.value)}/></label>)}
      </div></section>
      <section className={styles.card}><h2>3. Connect My Profile</h2>
        <label className={styles.toggle}><input type="checkbox" checked={profileLinked} onChange={e=>change({use_profile_identity:e.target.checked})}/> Automatically use my public RealVolt profile</label>
        <p>When enabled, your name, biography, professional title, public contact details, headshot and logo come from <b>My Profile & Billing</b>. Future saved profile changes update your published site automatically.</p>
        {profileLinked&&<div className={styles.profileSummary}><b>{profile.full_name||'Complete your public profile first'}</b><p>{profile.professional_title} · {profile.public_phone}</p><p>{profile.biography?profile.biography.slice(0,170)+'…':'No biography yet. Add one under My Profile & Billing.'}</p><a href="/workspace?onboard=1">Go to RealVolt → My Profile & Billing</a></div>}
        {field('Name','display_name','Your name',false,profileLinked)}
        {field('Brokerage','brokerage_name','Brokerage',false,profileLinked&&!!profile.brokerage_name)}
        {field('Professional title','professional_title','REALTOR®',false,profileLinked)}
        {field('Biography','biography','Tell buyers and sellers about yourself',true,profileLinked)}
        {field('Public email','public_email','agent@example.com',false,profileLinked)}
        {field('Phone number','public_phone','604-555-0000',false,profileLinked)}
        {field('Licence number','license_number','',false,profileLinked)}
        {!profileLinked&&field('Headshot HTTPS URL','headshot_url','https://...')}
        {field('Website headline','tagline','Your next move starts here')}
        {field('Hero photo HTTPS URL','hero_image_url','https://...')}
      </section>
      <section className={styles.card}><h2>4. Publish & working URL</h2>
        {field('Website slug','slug','your-name')}
        <p className={styles.subdomain}>Preview address: <b>/site/{site.slug||'your-name'}</b> (works without domain DNS)</p>
        <p className={styles.subdomain}>Future subdomain: <b>{site.slug||'your-name'}.{baseDomain}</b> (requires DNS + SSL setup)</p>
        <label className={styles.toggle}><input type="checkbox" checked={site.published} onChange={e=>set('published',e.target.checked)}/> Publish my website</label>
        <button type="button" className={styles.save} disabled={busy} onClick={save}>{busy?'Working…':'Save and check public link'}</button>
        {publicReady&&savedSlug===site.slug&&site.published&&lastPublicUrl&&<p><a href={lastPublicUrl} target="_blank" rel="noreferrer" className={styles.workingLink}>Open published website ↗</a></p>}
        {statusMessage&&<p role="status">{statusMessage}</p>}
        {!publicReady&&<p>The public link appears only after the database confirms that your saved website is published. Simply checking Publish does not make a website live.</p>}
      </section>
      <section className={styles.card}><h2>5. Connect custom domain</h2>
        <p>Save first. Request a domain, verify its DNS TXT record, then configure DNS and SSL at your host.</p>
        <div className={styles.domainRow}><input value={domain} onChange={e=>setDomain(e.target.value)} placeholder="www.yourdomain.ca"/><button disabled={busy} onClick={requestDomain}>Add</button></div>
        {domains.map(d=><div key={d.id} className={styles.domainInfo}><strong>{d.hostname}</strong><span>{d.status.replaceAll('_',' ')}</span>
          {d.status==='pending'&&<><p>DNS TXT host: <code>_realvolt.{d.hostname}</code></p><p>DNS TXT value: <code>realvolt-verification={d.ownership_token}</code></p><button disabled={busy} onClick={()=>verifyDomain(d.id)}>Verify ownership</button></>}
          {d.status==='ownership_verified'&&<p>Hosting still needs DNS + SSL setup. Verification alone does not activate the domain.</p>}
        </div>)}
      </section>
    </div><div className={styles.preview}>
      <div className={styles.previewTitle}>Website design preview <span>{site.template.toUpperCase()}</span></div>
      <div className={styles.pagePreviewNav} aria-label="Choose website page to preview">{SITE_PAGES.map(p=><button type="button" key={p} className={previewPage===p ? styles.pagePreviewActive : ''} onClick={()=>setPreviewPage(p)}>{p === 'home' ? 'Home' : p === 'listings' ? 'Properties' : p.charAt(0).toUpperCase()+p.slice(1)}</button>)}</div>
      <div className={styles.previewFrame}><AgentWebsite site={displayed} preview page={previewPage}/></div>
    </div></div>
  </div>;
}
