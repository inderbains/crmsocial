import type { CSSProperties } from 'react';
import type { AgentSite, AgentSiteDraft } from '@/lib/rv-agent-site/types';
import { agentMediaUrl } from '@/lib/agent-profile';
import styles from './AgentWebsite.module.css';
const variants = { modern: styles.modern, classic: styles.classic, luxury: styles.luxury };
export function AgentWebsite({ site, preview = false }: {site: AgentSite | AgentSiteDraft; preview?: boolean}) {
  const css = {'--rv-primary': site.primary_color, '--rv-accent': site.accent_color,
    '--rv-background': site.background_color} as CSSProperties;
  const emailLink = site.public_email ? `mailto:${site.public_email}` : undefined;
  const phoneLink = site.public_phone ? `tel:${site.public_phone.replace(/[^+\d]/g, '')}` : undefined;
  const storageUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const headshot = site.use_profile_identity && site.headshot_path
    ? agentMediaUrl(storageUrl,site.headshot_path) : site.headshot_url;
  const logo = site.use_profile_identity && site.logo_path
    ? agentMediaUrl(storageUrl,site.logo_path) : '';
  const title = site.professional_title || 'REALTOR®';
  return <main className={`${styles.website} ${variants[site.template]}`} style={css}>
    <nav className={styles.nav}>
      <div className={styles.logoMark}>{logo && <img className={styles.brandLogo} src={logo} alt="Agent branding logo"/>}{site.display_name || 'Your Name'}<small>{site.brokerage_name || 'Real Estate'}</small></div>
      <a href={emailLink || '#contact'} className={styles.navContact}>Contact</a>
    </nav>
    <section className={styles.hero}>
      <div className={styles.heroText}>
        <span className={styles.eyebrow}>LOCAL EXPERTISE · PERSONAL SERVICE</span>
        <h1>{site.tagline || 'Your next chapter starts here.'}</h1>
        <p>Work with {site.display_name || 'your local real estate advisor'} to make confident buying and selling decisions.</p>
        <a className={styles.button} href={emailLink || '#contact'}>Start a conversation</a>
      </div>
      <div className={styles.heroVisual}>
        {site.hero_image_url ? <img src={site.hero_image_url} alt="Featured home"/> : <div className={styles.placeholder}><span>HOME</span><b>Find your place.</b></div>}
      </div>
    </section>
    <section className={styles.about}>
      {headshot ? <img className={styles.headshot} src={headshot} alt={`${site.display_name || 'Agent'} portrait`} /> : <div className={styles.initials}>{(site.display_name || 'A').slice(0,1)}</div>}
      <div><span className={styles.eyebrow}>{title.toUpperCase()}</span>
        <h2>Meet {site.display_name || 'Your Agent'}</h2>
        <p>{site.biography || 'Local market insight, clear communication, and guidance from your first question to your closing day.'}</p>
        {site.license_number && <p className={styles.licence}>Licence: {site.license_number}</p>}
      </div>
    </section>
    <section className={styles.contact} id="contact"><h2>Let’s talk real estate.</h2>
      <p>Have questions about buying, selling, or your next move?</p>
      <div className={styles.actions}>
        {emailLink && <a className={styles.button} href={emailLink}>Email me</a>}
        {phoneLink && <a className={styles.phone} href={phoneLink}>{site.public_phone}</a>}
        {!emailLink && !phoneLink && <span>Contact details will appear here.</span>}
      </div>
    </section>
    <footer className={styles.footer}><span>© {new Date().getFullYear()} {site.display_name || 'Agent Website'}</span>
      <span>{site.brokerage_name || 'Real Estate'}</span></footer>
    {preview && <div className={styles.previewTag}>DESIGN PREVIEW</div>}
  </main>;
}
