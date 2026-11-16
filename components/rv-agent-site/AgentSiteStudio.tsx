'use client';
import { useState } from 'react';
import { AgentWebsite } from './AgentWebsite';
import { getSupabase } from '@/lib/supabase';
import type { AgentSite, AgentSiteDomain, AgentSiteDraft } from '@/lib/rv-agent-site/types';
import { defaultSite, palettes } from '@/lib/rv-agent-site/types';
import styles from './AgentSiteStudio.module.css';

export function AgentSiteStudio({ initial, initialDomains }: { initial: AgentSite | null; initialDomains: AgentSiteDomain[] }) {
  const [site,setSite] = useState<AgentSiteDraft>(initial ? {
    slug:initial.slug,display_name:initial.display_name,brokerage_name:initial.brokerage_name,
    tagline:initial.tagline,biography:initial.biography,public_email:initial.public_email,
    public_phone:initial.public_phone,headshot_url:initial.headshot_url,hero_image_url:initial.hero_image_url,
    template:initial.template,primary_color:initial.primary_color,accent_color:initial.accent_color,
    background_color:initial.background_color,published:initial.published,
  } : defaultSite);
  const [domains,setDomains]=useState(initialDomains);
  const [domain,setDomain]=useState('');
  const [message,setMessage]=useState('');
  const [busy,setBusy]=useState(false);
  const baseDomain = process.env.NEXT_PUBLIC_AGENT_SITE_BASE_DOMAIN || 'realvolt.ca';
  const set = (key:keyof AgentSiteDraft, value:string|boolean) => setSite(p=>({...p,[key]:value}));
  async function signedInHeaders(): Promise<Record<string, string>> {
    const db = getSupabase();
    if (!db) throw new Error('Supabase is not configured.');
    const { data, error } = await db.auth.getSession();
    if (error || !data.session?.access_token) throw new Error('Session expired. Sign in to RealVolt again.');
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${data.session.access_token}`,
    };
  }
  async function save() {
    setBusy(true);setMessage('');
    try {
      const r=await fetch('/api/agent-site',{method:'POST',headers:await signedInHeaders(),body:JSON.stringify(site)});
      const data=await r.json();if(!r.ok)throw new Error(data.error||'Save failed');
      setMessage('Saved. '+(site.published?'Website is published when hosting DNS is configured.':'Website remains private.'));
    } catch(e) {setMessage(e instanceof Error?e.message:'Could not save');}
    finally{setBusy(false)}
  }
  async function requestDomain() {
    setBusy(true);setMessage('');
    try {
      const r=await fetch('/api/agent-site/domain',{method:'POST',headers:await signedInHeaders(),body:JSON.stringify({hostname:domain})});
      const data=await r.json();if(!r.ok)throw new Error(data.error||'Domain request failed');
      setDomains(p=>[...p,data.domain]);setDomain('');setMessage('Domain requested. Add the TXT record shown below.');
    }catch(e){setMessage(e instanceof Error?e.message:'Could not request domain')}
    finally{setBusy(false)}
  }
  async function verifyDomain(id:string) {
    setBusy(true);setMessage('');
    try {
      const r=await fetch('/api/agent-site/domain/verify',{method:'POST',headers:await signedInHeaders(),body:JSON.stringify({id})});
      const data=await r.json();if(!r.ok)throw new Error(data.error||'Verification failed');
      setDomains(p=>p.map(x=>x.id===id?{...x,status:'ownership_verified'}:x));
      setMessage('Ownership verified. Hosting administrator must now connect DNS and SSL before activation.');
    }catch(e){setMessage(e instanceof Error?e.message:'Could not verify domain')}
    finally{setBusy(false)}
  }
  const field=(label:string,key:keyof AgentSiteDraft,placeholder='',multiline=false)=>
    <label className={styles.field}><span>{label}</span>{multiline?
      <textarea value={String(site[key])} placeholder={placeholder} onChange={e=>set(key,e.target.value)} rows={4}/>:
      <input value={String(site[key])} placeholder={placeholder} onChange={e=>set(key,e.target.value)}/>}</label>;
  return <div className={styles.shell}>
    <header className={styles.header}><div><span className={styles.kicker}>REALVOLT · AGENT WEBSITE</span><h1>My Website Studio</h1><p>Choose a template, customize colours, publish your site, then connect a domain.</p></div>
      <button className={styles.save} onClick={save} disabled={busy}>{busy?'Working…':'Save website'}</button></header>
    {message && <p className={styles.notice} role="status">{message}</p>}
    <div className={styles.layout}><div className={styles.controls}>
      <section className={styles.card}><h2>1. Choose a template</h2><div className={styles.templates}>
        {(['modern','classic','luxury'] as const).map(name=><button key={name} className={`${styles.template} ${site.template===name?styles.active:''}`} onClick={()=>set('template',name)}>
          <span className={styles.templateMini} data-template={name}><i/><i/><i/></span><b>{name[0].toUpperCase()+name.slice(1)}</b></button>)}</div></section>
      <section className={styles.card}><h2>2. Brand colours</h2><div className={styles.palettes}>
        {palettes.map(p=><button key={p.label} className={styles.palette} title={p.label} onClick={()=>setSite(s=>({...s,...p}))}>
          <i style={{background:p.primary_color}}/><i style={{background:p.accent_color}}/><span>{p.label}</span></button>)}</div>
        <div className={styles.colours}>{([['Main','primary_color'],['Accent','accent_color'],['Background','background_color']] as const).map(([label,key])=><label key={key}>{label}<input type="color" value={site[key]} onChange={e=>set(key,e.target.value)} /></label>)}</div>
      </section>
      <section className={styles.card}><h2>3. Agent details</h2>
        {field('Agent display name','display_name','Inder Bains')}
        {field('Brokerage name','brokerage_name','Zen One Realty')}
        {field('Website headline','tagline','Surrey real estate made simple')}
        {field('About me','biography','A short introduction about your experience',true)}
        {field('Public email','public_email','agent@example.com')}
        {field('Public phone','public_phone','604-555-0000')}
        {field('Headshot HTTPS URL','headshot_url','https://...')}
        {field('Hero photo HTTPS URL','hero_image_url','https://...')}
      </section>
      <section className={styles.card}><h2>4. Publish & URL</h2>
        {field('Unique subdomain name','slug','inder-bains')}
        <p className={styles.subdomain}>Your public address: <strong>{site.slug||'your-name'}.{baseDomain}</strong></p>
        <label className={styles.toggle}><input type="checkbox" checked={site.published} onChange={e=>set('published',e.target.checked)}/> Publish website</label>
        {site.published && site.slug && <a href={`/site/${site.slug}`} target="_blank" rel="noreferrer">Open website preview URL</a>}
      </section>
      <section className={styles.card}><h2>5. Connect your own domain</h2>
        <p>Save your website first. Request a domain, prove ownership with a DNS TXT record, then connect hosting and SSL.</p>
        <div className={styles.domainRow}><input value={domain} onChange={e=>setDomain(e.target.value)} placeholder="www.yourdomain.ca"/><button disabled={busy} onClick={requestDomain}>Add</button></div>
        {domains.map(d=><div key={d.id} className={styles.domainInfo}><strong>{d.hostname}</strong><span>{d.status.replaceAll('_',' ')}</span>
          {d.status==='pending' && <><p>DNS TXT host: <code>_realvolt.{d.hostname}</code></p><p>DNS TXT value: <code>realvolt-verification={d.ownership_token}</code></p><button disabled={busy} onClick={()=>verifyDomain(d.id)}>Verify ownership</button></>}
          {d.status==='ownership_verified' && <p>Next: connect domain in your host, configure DNS + SSL, then administrator marks it active.</p>}
        </div>)}
      </section>
    </div><div className={styles.preview}><div className={styles.previewTitle}>Live website preview <span>{site.template.toUpperCase()}</span></div><div className={styles.previewFrame}><AgentWebsite site={site} preview/></div></div></div>
  </div>;
}
