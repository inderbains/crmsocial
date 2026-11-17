'use client';

import {useEffect, useState, type FormEvent} from 'react';
import {
  ArrowRight, ArrowUpRight, BarChart3, Building2,
  Check, ChevronRight, Globe2, Home, LockKeyhole, Menu,
  PenLine, Sparkles, Users, X, Zap,
} from 'lucide-react';
import {getSupabase} from '@/lib/supabase';
import styles from './MarketingLanding.module.css';

type AuthMode = 'login' | 'signup' | 'reset';
type Plan = 'agent' | 'brokerage';

const features = [
  {icon: Users, name: 'Real estate CRM', description: 'Keep contacts, inquiries and your pipeline organized in one workspace.'},
  {icon: PenLine, name: 'SignVolt E-Sign', description: 'Prepare documents, request signatures and follow their progress.'},
  {icon: Home, name: 'Open Houses', description: 'QR registration, visitor details and a simpler follow-up workflow.'},
  {icon: Sparkles, name: 'Social Studio', description: 'Design listing posts, manage your content calendar and stay on brand.'},
  {icon: Globe2, name: 'Agent Websites', description: 'Launch a multi-page website with your own profile and colours.'},
  {icon: Building2, name: 'Brokerage operations', description: 'Manage agents, transactions, approvals and office workflows.'},
] as const;

const agentFeatures = ['CRM and lead pipeline', 'SignVolt e-signatures', 'Open Houses and QR registration', 'Social Studio and content calendar', 'Professional agent website'];
const brokerageFeatures = ['Everything in RealVolt Agent', 'Agent management and onboarding', 'Transactions and Back Office', 'Trust and commission workflows', 'Brokerage reporting and permissions'];

export default function MarketingLanding() {
  const [mode, setMode] = useState<AuthMode | null>(null);
  const [plan, setPlan] = useState<Plan>('agent');
  const [mobileOpen, setMobileOpen] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [seats, setSeats] = useState(10);

  useEffect(() => {
    const db = getSupabase();
    if (!db) return;
    let active = true;
    void db.auth.getSession().then(({data}) => {
      if (active) setSignedIn(Boolean(data.session));
    });
    const {data} = db.auth.onAuthStateChange((_event, session) => {
      if (active) setSignedIn(Boolean(session));
    });
    return () => {active = false; data.subscription.unsubscribe();};
  }, []);

  useEffect(() => {
    if (!mode) return;
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) setMode(null);
    };
    window.addEventListener('keydown', onEscape);
    return () => window.removeEventListener('keydown', onEscape);
  }, [mode, busy]);

  function openAuth(next: AuthMode, selected: Plan = 'agent') {
    setPlan(selected);
    setError('');
    setNotice('');
    setMode(next);
    setMobileOpen(false);
  }

  async function authenticate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const db = getSupabase();
    if (!db) {
      setError('Sign-in is not configured. Ask the RealVolt administrator to configure the Supabase public URL and publishable key.');
      return;
    }
    const form = new FormData(event.currentTarget);
    const email = String(form.get('email') ?? '').trim();
    const password = String(form.get('password') ?? '');
    if (mode !== 'reset' && password.length < 8) {
      setError('Enter a password containing at least 8 characters.');
      return;
    }
    setBusy(true); setError(''); setNotice('');
    try {
      if (mode === 'reset') {
        const {error: resetError} = await db.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/workspace`,
        });
        if (resetError) throw resetError;
        setNotice('If this email has an account, a reset link will be sent.');
        return;
      }
      if (mode === 'signup') {
        const {data, error: signupError} = await db.auth.signUp({
          email, password, options: {emailRedirectTo: `${window.location.origin}/workspace`},
        });
        if (signupError) throw signupError;
        if (data.session) {
          window.location.assign('/workspace');
          return;
        }
        setNotice('Check your email to confirm your account, then come back and log in. Plan activation and billing are not yet enabled.');
        return;
      }
      const {error: signinError} = await db.auth.signInWithPassword({email, password});
      if (signinError) throw signinError;
      window.location.assign('/workspace');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Authentication failed. Try again.');
    } finally {
      setBusy(false);
    }
  }

  const monthly = (seats * 69.99).toLocaleString('en-CA', {style: 'currency', currency: 'CAD'});

  return (
    <div className={styles.site}>
      <header className={styles.topbar}>
        <div className={styles.navInner}>
          <a className={styles.brand} href="#top" aria-label="RealVolt homepage">
            <span className={styles.brandIcon}><Zap size={21} fill="currentColor" strokeWidth={2.6}/></span>
            <span>real<span className={styles.brandVolt}>volt</span><span className={styles.brandDot}>.</span></span>
          </a>
          <nav className={styles.desktopNav} aria-label="Main navigation">
            <a href="#platform">Platform</a>
            <a href="#solutions">Solutions</a>
            <a href="#pricing">Pricing</a>
          </nav>
          <div className={styles.headerActions}>
            {signedIn ? (
              <a className={styles.signinBtn} href="/workspace">Open dashboard <ArrowUpRight size={16}/></a>
            ) : (
              <button className={styles.signinBtn} onClick={() => openAuth('login')}>Log in</button>
            )}
            <button className={styles.primaryBtn} onClick={() => openAuth('signup')}>
              Get started <ArrowUpRight size={16}/>
            </button>
          </div>
          <button className={styles.mobileToggle} aria-label="Toggle navigation" aria-expanded={mobileOpen} onClick={() => setMobileOpen(!mobileOpen)}>
            {mobileOpen ? <X size={22}/> : <Menu size={22}/>}
          </button>
        </div>
        {mobileOpen && (
          <nav className={styles.mobileNav} aria-label="Mobile navigation">
            <a href="#platform" onClick={() => setMobileOpen(false)}>Platform</a>
            <a href="#solutions" onClick={() => setMobileOpen(false)}>Solutions</a>
            <a href="#pricing" onClick={() => setMobileOpen(false)}>Pricing</a>
            <button onClick={() => signedIn ? window.location.assign('/workspace') : openAuth('login')}>{signedIn ? 'Open dashboard' : 'Log in'}</button>
            <button onClick={() => openAuth('signup')}>Get started</button>
          </nav>
        )}
      </header>

      <main className={styles.main} id="top">
        <section className={styles.hero}>
          <div className={styles.heroGlow}/>
          <div className={styles.maxWidth}>
            <div className={styles.heroGrid}>
              <div className={styles.heroContent}>
                <span className={styles.eyebrow}><span className={styles.eyebrowDot}/> ONE CONNECTED REAL ESTATE WORKSPACE</span>
                <h1>Build relationships.<br/><em>Close with confidence.</em></h1>
                <p>CRM, e-signatures, open houses, websites and brokerage operations — thoughtfully brought together in one place.</p>
                <div className={styles.heroButtons}>
                  <button className={styles.primaryBtn} onClick={() => openAuth('signup')}>
                    Explore RealVolt <ArrowRight size={18}/>
                  </button>
                  <a className={styles.secondaryBtn} href="#platform">See what’s inside <ChevronRight size={18}/></a>
                </div>
                <div className={styles.heroFoot}><span className={styles.miniCheck}><Check size={15}/></span> Made for individual agents and growing brokerages</div>
              </div>
              <div className={styles.heroVisual} aria-label="Illustrative RealVolt workspace preview">
                <div className={styles.orbitOne}/><div className={styles.orbitTwo}/>
                <div className={styles.floatBadge}><span className={styles.floatDot}/> One workspace. More momentum.</div>
                <div className={styles.demoWindow}>
                  <div className={styles.demoSidebar}>
                    <div className={styles.demoBrand}><Zap size={16} fill="currentColor"/> rv<span>.</span></div>
                    <div className={styles.demoSideActive}><BarChart3 size={15}/><span>Overview</span></div>
                    <div><Users size={15}/><span>CRM</span></div>
                    <div><Home size={15}/><span>Open Houses</span></div>
                    <div><PenLine size={15}/><span>SignVolt</span></div>
                    <div><Globe2 size={15}/><span>Website</span></div>
                    <div><Building2 size={15}/><span>Back Office</span></div>
                  </div>
                  <div className={styles.demoMain}>
                    <div className={styles.demoTop}><span>Dashboard <span className={styles.demoTopMuted}>/ Overview</span></span><span className={styles.demoAvatar}>RV</span></div>
                    <div className={styles.demoWelcome}><span>Welcome back</span><strong>Your business, at a glance.</strong></div>
                    <div className={styles.demoStats}>
                      <div><span>My contacts</span><b>128</b><small>CRM</small></div>
                      <div><span>Active deals</span><b>12</b><small>Transactions</small></div>
                      <div><span>Upcoming events</span><b>06</b><small>Open houses</small></div>
                    </div>
                    <div className={styles.demoChartWrap}>
                      <div className={styles.demoChartHeader}><span>Activity overview</span><span>Last 6 months</span></div>
                      <div className={styles.demoChart}>
                        {[37,57,46,80,64,92,72,88,63,95,79,100].map((height, index) => <span key={index} style={{height: `${height}%`}}/>)}
                      </div>
                    </div>
                    <div className={styles.demoBottom}><span className={styles.demoStatus}><span/> New inquiry received</span><span className={styles.demoMiniCta}>Open CRM <ArrowUpRight size={12}/></span></div>
                  </div>
                </div>
                <div className={styles.previewLabel}>Illustrative product preview</div>
              </div>
            </div>
          </div>
        </section>

        <section className={styles.statementStrip}>
          <div className={styles.maxWidth}>
            <span>ONE LOGIN</span><i/><span>CONNECTED TOOLS</span><i/><span>YOUR BRAND</span><i/><span>YOUR WORKSPACE</span>
          </div>
        </section>

        <section className={styles.featuresSection} id="platform">
          <div className={styles.maxWidth}>
            <div className={styles.sectionHeading}>
              <div><span className={styles.sectionKicker}>EVERYTHING WORKS BETTER TOGETHER</span><h2>Your real estate day,<br/>a lot more organized.</h2></div>
              <p>From your first conversation to the signed documents, use one connected place to manage the work that matters.</p>
            </div>
            <div className={styles.featureGrid}>
              {features.map((feature, index) => <article className={styles.featureCard} key={feature.name}>
                <span className={`${styles.featureIcon} ${index === 3 ? styles.featureOrange : ''}`}><feature.icon size={24}/></span>
                <h3>{feature.name}</h3><p>{feature.description}</p>
                <span className={styles.featureNumber}>0{index+1}</span>
              </article>)}
            </div>
          </div>
        </section>

        <section className={styles.solutionsSection} id="solutions">
          <div className={styles.maxWidth}>
            <div className={styles.solutionsIntro}><span className={styles.sectionKicker}>THE RIGHT FIT FOR YOUR BUSINESS</span><h2>One platform.<br/>Built for the way you work.</h2></div>
            <div className={styles.solutionsGrid}>
              <article className={styles.solutionCard}>
                <div className={styles.solutionTop}><span><Users size={21}/></span><span>01 / AGENTS</span></div>
                <h3>Everything you need to grow your own business.</h3>
                <p>Build your brand, capture leads and keep clients organized with tools that work together.</p>
                <a href="#pricing">Explore agent plan <ArrowUpRight size={16}/></a>
              </article>
              <article className={`${styles.solutionCard} ${styles.solutionDark}`}>
                <div className={styles.solutionTop}><span><Building2 size={21}/></span><span>02 / BROKERAGES</span></div>
                <h3>Bring your people and operations into one place.</h3>
                <p>Give agents their own workspaces while managing brokerage workflows and permissions.</p>
                <a href="#pricing">Explore brokerage plan <ArrowUpRight size={16}/></a>
              </article>
            </div>
          </div>
        </section>

        <section className={styles.pricingSection} id="pricing">
          <div className={styles.maxWidth}>
            <div className={styles.pricingHeading}><span className={styles.sectionKicker}>SIMPLE, CLEAR PRICING</span><h2>Find your RealVolt.</h2><p>Flexible software for individual real estate professionals and brokerage teams.</p></div>
            <div className={styles.pricingGrid}>
              <article className={styles.priceCard}>
                <div className={styles.planHeader}><span className={styles.planIcon}><Users size={19}/></span><span>FOR INDIVIDUAL AGENTS</span></div>
                <h3>RealVolt Agent</h3><p>Your essential tools, in one connected workspace.</p>
                <div className={styles.price}><strong>$49.99</strong><span>CAD / month</span></div>
                <div className={styles.priceRule}/>
                <div className={styles.priceFeatures}>{agentFeatures.map(item => <div key={item}><Check size={16}/><span>{item}</span></div>)}</div>
                <button className={styles.priceAction} onClick={() => openAuth('signup', 'agent')}>Create agent account <ArrowRight size={18}/></button>
              </article>
              <article className={`${styles.priceCard} ${styles.featuredPrice}`}>
                <span className={styles.mostPopular}>FULL PLATFORM</span>
                <div className={styles.planHeader}><span className={styles.planIcon}><Building2 size={19}/></span><span>FOR BROKERAGES</span></div>
                <h3>RealVolt Brokerage</h3><p>Your agents and brokerage operations, together.</p>
                <div className={styles.price}><strong>$69.99</strong><span>CAD / agent / month</span></div>
                <div className={styles.priceRule}/>
                <div className={styles.priceFeatures}>{brokerageFeatures.map(item => <div key={item}><Check size={16}/><span>{item}</span></div>)}</div>
                <button className={styles.priceAction} onClick={() => openAuth('signup', 'brokerage')}>Request brokerage access <ArrowRight size={18}/></button>
              </article>
            </div>
            <div className={styles.seatCalculator}>
              <div><span className={styles.calcEyebrow}>BROKERAGE ESTIMATOR</span><strong>Estimate your monthly cost</strong><p>Choose the number of agent seats. Pricing before applicable taxes.</p></div>
              <div className={styles.calcInputs}>
                <label htmlFor="rv-agent-seats">Agent seats</label>
                <input id="rv-agent-seats" type="number" min="1" max="500" value={seats} onChange={event => setSeats(Math.max(1,Math.min(500,Number(event.target.value)||1)))}/>
              </div>
              <div className={styles.calcTotal}><span>Estimated total / month</span><strong>{monthly}</strong></div>
            </div>
            <p className={styles.priceNote}>Prices are in CAD, plus applicable taxes. Subscription billing, seat provisioning and automatic plan activation are still being developed; creating an account does not purchase a plan.</p>
          </div>
        </section>

        <section className={styles.finalCta}>
          <div className={styles.maxWidth}>
            <div><span className={styles.sectionKicker}>WORK SMARTER, TOGETHER</span><h2>Make room for what<br/>moves you forward.</h2><p>One place for your relationships, your documents and your next opportunity.</p></div>
            <button className={styles.finalButton} onClick={() => openAuth('signup')}>Get started with RealVolt <ArrowUpRight size={19}/></button>
          </div>
        </section>
      </main>
      <footer className={styles.footer}>
        <div className={styles.maxWidth}>
          <div className={styles.footerBrand}><span className={styles.brandIcon}><Zap size={17} fill="currentColor"/></span><span>realvolt<span className={styles.brandDot}>.</span></span></div>
          <span>Real estate, thoughtfully connected.</span>
          <a href="#top">Back to top ↑</a>
        </div>
      </footer>

      {mode && <div className={styles.modalBackdrop} onMouseDown={event => {if (event.target === event.currentTarget && !busy) setMode(null);}}>
        <div className={styles.authDialog} role="dialog" aria-modal="true" aria-labelledby="rv-auth-heading">
          <div className={styles.authTop}><span className={styles.authLogo}><Zap size={18} fill="currentColor"/> realvolt.</span><button type="button" className={styles.closeBtn} onClick={() => !busy && setMode(null)} aria-label="Close"><X size={21}/></button></div>
          <div className={styles.authHeading}><span className={styles.sectionKicker}>{mode === 'login' ? 'WELCOME BACK' : mode === 'reset' ? 'ACCOUNT RECOVERY' : 'WELCOME TO REALVOLT'}</span><h2 id="rv-auth-heading">{mode === 'login' ? 'Log in to your workspace.' : mode === 'reset' ? 'Reset your password.' : 'Create your RealVolt account.'}</h2><p>{mode === 'signup' ? (plan === 'brokerage' ? 'Start with a login. Brokerage subscription setup will follow when billing is available.' : 'Create a login and explore RealVolt. Subscription activation will follow when available.') : mode === 'reset' ? 'We’ll send a password reset link to your email address.' : 'Pick up right where you left off.'}</p></div>
          <form className={styles.authForm} onSubmit={authenticate}>
            <label htmlFor="rv-auth-email">Email address</label>
            <input id="rv-auth-email" name="email" type="email" required autoComplete="email" placeholder="you@example.com"/>
            {mode !== 'reset' && <><label htmlFor="rv-auth-password">Password</label><input id="rv-auth-password" name="password" type="password" required minLength={8} autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} placeholder="At least 8 characters"/></>}
            {error && <p className={styles.authError} role="alert">{error}</p>}
            {notice && <p className={styles.authNotice} role="status">{notice}</p>}
            <button className={styles.authSubmit} disabled={busy} type="submit">{busy ? 'Please wait…' : mode === 'login' ? 'Log in' : mode === 'reset' ? 'Send reset link' : 'Create account'} <ArrowRight size={17}/></button>
          </form>
          <div className={styles.authFooter}>
            {mode === 'login' ? <><button onClick={() => openAuth('signup')}>Create an account</button><button onClick={() => openAuth('reset')}>Forgot password?</button></> : <button onClick={() => openAuth('login')}>Already have an account? Log in</button>}
          </div>
          <p className={styles.authSafety}><LockKeyhole size={13}/> Authentication uses your existing RealVolt account.</p>
        </div>
      </div>}
    </div>
  );
}
