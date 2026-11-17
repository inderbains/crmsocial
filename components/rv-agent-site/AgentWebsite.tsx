import type { CSSProperties, ReactNode } from 'react';
import type { AgentSite, AgentSiteDraft } from '@/lib/rv-agent-site/types';
import { agentMediaUrl } from '@/lib/agent-profile';
import { ContactForm } from './ContactForm';
import styles from './AgentWebsite.module.css';

export const SITE_PAGES = ['home', 'listings', 'about', 'buyers', 'sellers', 'contact'] as const;
export type SitePage = (typeof SITE_PAGES)[number];
const NAV: {id: SitePage; title: string}[] = [
  { id: 'home', title: 'Home' }, { id: 'listings', title: 'Properties' },
  { id: 'about', title: 'About' }, { id: 'buyers', title: 'Buyers' },
  { id: 'sellers', title: 'Sellers' }, { id: 'contact', title: 'Contact' },
];
export function validSitePage(v: string): v is SitePage {
  return (SITE_PAGES as readonly string[]).includes(v);
}
const variants = {modern: styles.modern, classic: styles.classic, luxury: styles.luxury};

export function AgentWebsite({site, preview = false, page = 'home', basePath}: {
  site: AgentSite | AgentSiteDraft; preview?: boolean; page?: SitePage; basePath?: string;
}) {
  const css = {
    '--rv-primary': site.primary_color || '#147D64',
    '--rv-accent': site.accent_color || '#F3972C',
    '--rv-background': site.background_color || '#F6FAF7',
  } as CSSProperties;
  const storageUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const headshot = site.use_profile_identity && site.headshot_path
    ? agentMediaUrl(storageUrl, site.headshot_path) : site.headshot_url;
  const logo = site.use_profile_identity && site.logo_path
    ? agentMediaUrl(storageUrl, site.logo_path) : '';
  const name = site.display_name || 'Your Real Estate Advisor';
  const professionalTitle = site.professional_title || 'REALTOR®';
  const email = site.public_email || '';
  const phone = site.public_phone || '';
  const tel = phone ? `tel:${phone.replace(/[^+\d]/g, '')}` : '';
  const root = basePath === undefined ? `/site/${site.slug || 'your-name'}` : basePath.replace(/\/$/, '');
  const href = (id: SitePage) => preview ? '#' : (id === 'home' ? (root || '/') : `${root}/${id}`);
  const pill = (title: string) => <span className={styles.kicker}>{title}</span>;
  const link = (id: SitePage, title: string, alt = false) =>
    <a className={alt ? styles.secondaryButton : styles.primaryButton} href={href(id)}>{title}<span aria-hidden="true">↗</span></a>;
  const contactBox = <section className={styles.contactBanner}>
    <div>{pill('TAKE THE NEXT STEP')}<h2>Let’s make your next move a good one.</h2>
      <p>Buying, selling or simply exploring? Start with a straightforward conversation.</p></div>
    {link('contact', 'Get in touch')}
  </section>;

  return <div className={`${styles.website} ${variants[site.template] || styles.modern}`} style={css}>
    <a className={styles.skipLink} href="#main-content">Skip to content</a>
    <header className={styles.siteHeader}>
      <div className={styles.headerInner}>
        <a href={href('home')} className={styles.brand} aria-label={`${name} homepage`}>
          {logo ? <img className={styles.brandLogo} src={logo} alt=""/> : <span className={styles.monogram}>{name.trim().slice(0, 1).toUpperCase()}</span>}
          <span className={styles.brandName}><strong>{name}</strong><small>{site.brokerage_name || professionalTitle}</small></span>
        </a>
        <nav className={styles.desktopNav} aria-label="Main navigation">
          {NAV.map(n => <a key={n.id} href={href(n.id)} className={page === n.id ? styles.navActive : ''} aria-current={page === n.id ? 'page' : undefined}>{n.title}</a>)}
        </nav>
        <a className={styles.headerCta} href={href('contact')}>Let’s talk <span aria-hidden="true">↗</span></a>
        <details className={styles.mobileMenu}><summary aria-label="Open navigation menu">Menu <span aria-hidden="true">☰</span></summary>
          <nav aria-label="Mobile navigation">{NAV.map(n => <a key={n.id} href={href(n.id)} aria-current={page === n.id ? 'page' : undefined}>{n.title}</a>)}</nav>
        </details>
      </div>
    </header>

    <main id="main-content">
      {page === 'home' && <>
        <section className={styles.hero}>
          <div className={styles.heroCopy}>
            {pill('YOUR PROPERTY. YOUR NEXT CHAPTER.')}
            <h1>{site.tagline || 'A better way to make your next move.'}</h1>
            <p>Thoughtful real estate guidance, local perspective and clear advice — from your first question to your next set of keys.</p>
            <div className={styles.buttonRow}>{link('listings', 'Explore properties')}{link('contact', 'Talk to me', true)}</div>
            <div className={styles.heroFoot}><span className={styles.heroLine}/><span>REAL ESTATE, MADE PERSONAL</span></div>
          </div>
          <div className={styles.heroArt}>
            {site.hero_image_url
              ? <img className={styles.heroPhoto} src={site.hero_image_url} alt="Real estate website featured property" />
              : <HouseIllustration />}
            <div className={styles.heroOverlay}><span>WELCOME HOME</span><strong>A new perspective on real estate.</strong></div>
          </div>
        </section>
        <div className={styles.trustStrip}><span>PERSONAL ATTENTION</span><i aria-hidden="true"/><span>THOUGHTFUL GUIDANCE</span><i aria-hidden="true"/><span>CONFIDENT DECISIONS</span></div>
        <section className={styles.section}>
          <div className={styles.sectionIntro}>{pill('HOW CAN I HELP?')}<h2>Real estate, centered on you.</h2><p>Every move is different. Choose the path that fits where you are today.</p></div>
          <div className={styles.serviceGrid}>
            <ServiceCard number="01" title="Find your home" description="Explore what matters, understand your options and move with confidence." href={href('buyers')} action="Buying a home" />
            <ServiceCard number="02" title="Sell with purpose" description="Thoughtful positioning, preparation and guidance for your next sale." href={href('sellers')} action="Selling a home" />
            <ServiceCard number="03" title="Explore properties" description="Start the conversation about available homes and what you're looking for." href={href('listings')} action="View properties" />
          </div>
        </section>
        <section className={styles.feature}>
          <div className={styles.featureVisual}>
            {headshot ? <img src={headshot} alt={`Portrait of ${name}`} className={styles.featurePortrait} /> : <div className={styles.portraitFallback}>{name.slice(0,1).toUpperCase()}</div>}
          </div>
          <div className={styles.featureCopy}>{pill('YOUR REAL ESTATE PARTNER')}<h2>Guidance you can feel good about.</h2><p>{site.biography ? site.biography.slice(0, 390) + (site.biography.length > 390 ? '…' : '') : `Hi, I'm ${name}. My approach is personal: I listen first, explain your options clearly and help you make informed decisions.`}</p>
            {link('about', `Meet ${name.split(' ')[0] || 'your agent'}`)}</div>
        </section>
        <section className={styles.section}>
          <div className={styles.splitHeading}>{pill('YOUR NEXT MOVE')}<h2>More than a transaction.<br/>A place to call home.</h2></div>
          <div className={styles.twoColumns}>
            <p>Whether you're buying your first home, preparing to sell, or thinking about the future, the right guidance makes the process feel simpler.</p>
            <div>{link('contact', 'Start with a conversation')}
            <p className={styles.mutedSmall}>No pressure. Just a good place to start.</p></div>
          </div>
        </section>
        {contactBox}
      </>}

      {page === 'listings' && <>
        <PageHero kicker="DISCOVER YOUR POSSIBILITIES" heading="Your next home begins with the right search." description="Explore what matters most — location, lifestyle, space and the details that make a house feel like home." />
        <section className={styles.section}>
          <div className={styles.listingEmpty}>
            <div className={styles.listingArt}><HouseIllustration /></div>
            <div>{pill('PROPERTY SEARCH')}<h2>Looking for something specific?</h2><p>Tell me your preferred location, budget and must-haves. I can help you explore the opportunities that fit.</p>
              <p className={styles.smallDisclosure}>Live MLS listings are not displayed here until this agent's authorized listing feed is connected.</p>
              {link('contact', 'Request matching properties')}</div>
          </div>
        </section>
        <section className={styles.sectionAlt}><div className={styles.sectionInner}>
          <div className={styles.sectionIntro}>{pill('A MORE PERSONAL SEARCH')}<h2>Make the search about your life.</h2></div>
          <div className={styles.serviceGrid}>
            <InfoCard number="01" title="Your priorities" text="Identify the essentials, the nice-to-haves and what matters most." />
            <InfoCard number="02" title="Market perspective" text="Discuss value, timing and the details worth examining." />
            <InfoCard number="03" title="Your next step" text="Explore showings, financing considerations and the offer process." />
          </div>
        </div></section>{contactBox}
      </>}

      {page === 'about' && <>
        <PageHero kicker="MEET YOUR REAL ESTATE ADVISOR" heading={`A personal approach, with ${name}.`} description={site.brokerage_name ? `${professionalTitle} · ${site.brokerage_name}` : professionalTitle}/>
        <section className={`${styles.section} ${styles.aboutGrid}`}>
          <div className={styles.aboutPortrait}>{headshot ? <img src={headshot} alt={`Portrait of ${name}`} /> : <div className={styles.portraitFallback}>{name.slice(0, 1).toUpperCase()}</div>}</div>
          <div>{pill('MY STORY')}<h2>Let's get to know each other.</h2>
            <div className={styles.bio}>{site.biography || `I'm ${name}, a real estate advisor who believes every great client experience begins by listening. My focus is helping you understand your options and move forward with clarity.`}</div>
            {site.license_number && <p className={styles.smallDisclosure}>Licence number: {site.license_number}</p>}
            {link('contact','Work with me')}</div>
        </section>
        <section className={styles.sectionAlt}><div className={styles.sectionInner}>
          <div className={styles.sectionIntro}>{pill('WHAT I VALUE')}<h2>Good decisions start with good conversations.</h2></div>
          <div className={styles.serviceGrid}><InfoCard number="01" title="Listen first" text="Understanding your goals before recommending the next step."/><InfoCard number="02" title="Stay transparent" text="Clear explanations and practical guidance along the way."/><InfoCard number="03" title="Keep it personal" text="A considered approach rather than a one-size-fits-all process."/></div>
        </div></section>{contactBox}
      </>}

      {page === 'buyers' && <>
        <PageHero kicker="FOR BUYERS" heading="Find the right place for your next chapter." description="From the first search to the final walkthrough, know what comes next and why it matters." />
        <section className={styles.section}><div className={styles.sectionIntro}>{pill('THE BUYER JOURNEY')}<h2>Considered guidance, every step of the way.</h2></div>
          <div className={styles.steps}><InfoCard number="01" title="Plan your move" text="Review your goals, timing, budget and financing preparations."/><InfoCard number="02" title="Explore your options" text="Narrow your search and evaluate homes against what matters to you."/><InfoCard number="03" title="Make an informed offer" text="Discuss comparable properties, terms, subjects and negotiations."/><InfoCard number="04" title="Close with clarity" text="Keep track of important dates, inspections, documents and possession."/></div>
        </section>
        <section className={styles.pullquote}><p>“Finding a home is about more than an address. It's about finding the right fit.”</p></section>{contactBox}
      </>}

      {page === 'sellers' && <>
        <PageHero kicker="FOR SELLERS" heading="A thoughtful strategy for your next sale." description="Your property deserves a clear plan. From preparation to pricing and presentation, every detail matters." />
        <section className={styles.section}><div className={styles.sectionIntro}>{pill('THE SELLER JOURNEY')}<h2>Prepare well. Present beautifully. Move forward.</h2></div>
          <div className={styles.steps}><InfoCard number="01" title="Understand the market" text="Review relevant comparable sales, competing properties and positioning."/><InfoCard number="02" title="Prepare your property" text="Identify improvements, presentation opportunities and photography needs."/><InfoCard number="03" title="Launch your listing" text="Discuss a tailored marketing approach and how inquiries are managed."/><InfoCard number="04" title="Negotiate and close" text="Review offers, subjects, dates and the details leading to completion."/></div>
        </section>
        <section className={styles.featureNarrow}><div>{pill('START WITH A PLAN')}<h2>Wondering what your home could sell for?</h2><p>Let's look at your property, your timing and the current market before deciding on the right strategy.</p>{link('contact','Request a home valuation')}</div></section>{contactBox}
      </>}

      {page === 'contact' && <>
        <PageHero kicker="START A CONVERSATION" heading="Let's talk about what's next." description="Questions about buying, selling or the market? I'd be happy to hear from you." />
        <section className={`${styles.section} ${styles.contactGrid}`}>
          <div className={styles.contactDetails}>{pill('CONTACT INFORMATION')}<h2>Reach out, anytime.</h2><p>Whether you're ready to move or just starting to explore, you can reach me directly.</p>
            {email && <a className={styles.contactDetail} href={`mailto:${email}`}><span>Email</span><strong>{email}</strong></a>}
            {tel && <a className={styles.contactDetail} href={tel}><span>Call</span><strong>{phone}</strong></a>}
            {site.brokerage_name && <div className={styles.contactDetail}><span>Brokerage</span><strong>{site.brokerage_name}</strong></div>}
          </div>
          <ContactForm siteSlug={site.slug} preview={preview} />
        </section>
      </>}
    </main>

    <footer className={styles.footer}>
      <div className={styles.footerTop}><div><div className={styles.footerName}>{name}</div><p>{site.brokerage_name || professionalTitle}</p><p>Real estate guidance with a personal touch.</p></div>
        <nav aria-label="Footer navigation">{NAV.map(n => <a key={n.id} href={href(n.id)}>{n.title}</a>)}</nav></div>
      <div className={styles.footerBottom}><span>© {new Date().getFullYear()} {name}. All rights reserved.</span><span>{site.license_number ? `Licence: ${site.license_number} · ` : ''}{site.brokerage_name || professionalTitle}</span></div>
    </footer>
    {preview && <span className={styles.previewTag}>DESIGN PREVIEW</span>}
  </div>;
}

function PageHero({kicker, heading, description}: {kicker: string; heading: string; description: string}) {
  return <section className={styles.pageHero}><span className={styles.kicker}>{kicker}</span><h1>{heading}</h1><p>{description}</p><div className={styles.pageHeroLine} /></section>;
}
function ServiceCard({number, title, description, href, action}: {number:string; title:string; description:string; href:string; action:string}) {
  return <a className={styles.serviceCard} href={href}><span className={styles.cardNumber}>{number} / SERVICES</span><h3>{title}</h3><p>{description}</p><span className={styles.cardLink}>{action} <span aria-hidden="true">↗</span></span></a>;
}
function InfoCard({number, title, text}: {number:string; title:string; text:string}) {
  return <div className={styles.infoCard}><span className={styles.cardNumber}>{number}</span><h3>{title}</h3><p>{text}</p></div>;
}
function HouseIllustration(): ReactNode {
  // Original vector fallback. Not an MLS listing or a photograph.
  return <svg className={styles.houseIllustration} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 760 680" role="img" aria-label="Modern residential architecture illustration">
    <defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop stopColor="#668c80"/><stop offset="1" stopColor="#d2dcd2"/></linearGradient><linearGradient id="walls" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#f1ede5"/><stop offset="1" stopColor="#c8c8ba"/></linearGradient><linearGradient id="glass" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#618480"/><stop offset="1" stopColor="#193e3b"/></linearGradient></defs>
    <rect width="760" height="680" fill="url(#sky)"/><circle cx="607" cy="126" r="70" fill="#ffffff" opacity=".23"/>
    <path d="M0 498 C190 442 320 471 760 445 V680 H0Z" fill="#6e927d"/><path d="M0 572 C226 524 494 535 760 509 V680 H0Z" fill="#466f5c"/>
    <path d="M79 322 H674 V559 H79Z" fill="url(#walls)"/><path d="M63 324 L220 212 H606 L696 324Z" fill="#354e46"/>
    <path d="M247 219 H609 V325 H247Z" fill="#e2dfd2"/><path d="M226 190 H633 V235 H226Z" fill="#304e48"/>
    <rect x="294" y="260" width="268" height="65" fill="url(#glass)"/><path d="M382 260V325 M472 260V325" stroke="#c6d4cb" strokeWidth="7"/>
    <rect x="112" y="359" width="249" height="188" fill="url(#glass)"/><path d="M235 359V547" stroke="#d6ddd2" strokeWidth="8"/>
    <rect x="410" y="348" width="197" height="204" fill="#b1b6a9"/><rect x="433" y="368" width="139" height="184" fill="url(#glass)"/><path d="M503 368V552" stroke="#b8cdc2" strokeWidth="8"/>
    <path d="M0 600H760V680H0Z" fill="#b9b9aa"/><path d="M149 552H639L748 600H45Z" fill="#d7d7c8"/>
    <path d="M0 548L89 450 111 548 M644 550L716 445 760 546" fill="#345a48" opacity=".8"/>
    <g fill="#2e5745"><circle cx="56" cy="440" r="65"/><circle cx="728" cy="441" r="75"/><circle cx="32" cy="518" r="46"/><circle cx="747" cy="514" r="53"/></g>
    <path d="M0 638 C248 624 499 644 760 614" stroke="#edede3" strokeWidth="10" opacity=".45" fill="none"/>
  </svg>;
}
