'use client';

import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { getSupabase } from '@/lib/supabase';
import { AgentSiteStudio } from './AgentSiteStudio';
import type { AgentSite, AgentSiteDomain } from '@/lib/rv-agent-site/types';

type ScreenState =
  | { state: 'loading' }
  | { state: 'signin' }
  | { state: 'error'; message: string }
  | { state: 'ready'; userId: string; site: AgentSite | null; domains: AgentSiteDomain[] };

// RealVolt's current sign-in lives on '/', and its Supabase session is saved
// in the browser by lib/supabase.ts. A server cookie-only check cannot see it.
export function AgentSiteStudioGate() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [screen, setScreen] = useState<ScreenState>({ state: 'loading' });

  useEffect(() => {
    const db = getSupabase();
    if (!db) {
      setScreen({ state: 'error', message: 'Supabase public environment variables are missing.' });
      return;
    }
    let active = true;
    void db.auth.getSession().then(({ data, error }) => {
      if (!active) return;
      if (error) setScreen({ state: 'error', message: error.message });
      else setSession(data.session);
    });
    const { data } = db.auth.onAuthStateChange((_event, nextSession) => {
      if (active) setSession(nextSession);
    });
    return () => { active = false; data.subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    if (session === undefined) return;
    if (!session) {
      setScreen({ state: 'signin' });
      return;
    }
    const db = getSupabase();
    if (!db) return;
    let active = true;
    setScreen({ state: 'loading' });
    void (async () => {
      try {
        const { data: site, error: siteError } = await db
          .from('rv_agent_sites').select('*')
          .eq('owner_user_id', session.user.id).maybeSingle();
        if (siteError) throw siteError;
        let domains: AgentSiteDomain[] = [];
        if (site) {
          const result = await db.from('rv_agent_site_domains')
            .select('id,hostname,ownership_token,status')
            .eq('site_id', site.id).order('created_at', { ascending: true });
          if (result.error) throw result.error;
          domains = (result.data ?? []) as AgentSiteDomain[];
        }
        if (active) setScreen({ state: 'ready', userId: session.user.id, site: site as AgentSite | null, domains });
      } catch (e) {
        if (active) setScreen({ state: 'error', message: e instanceof Error ? e.message : 'Could not load your website.' });
      }
    })();
    return () => { active = false; };
  }, [session]);

  if (screen.state === 'ready') return (
    <AgentSiteStudio key={screen.userId} initial={screen.site} initialDomains={screen.domains} />
  );

  return (
    <main style={{ maxWidth: 560, margin: '8vh auto', padding: 32, fontFamily: 'Arial, sans-serif', lineHeight: 1.6 }}>
      <h1>RealVolt Agent Website Studio</h1>
      {screen.state === 'loading' && <p>Loading your website…</p>}
      {screen.state === 'signin' && (
        <>
          <p>Please sign in to your RealVolt workspace first. Your sign-in screen is on the homepage.</p>
          <a href="/" style={{ display: 'inline-block', padding: '10px 16px', background: '#147D64', color: '#fff', borderRadius: 8, textDecoration: 'none' }}>Open RealVolt sign-in</a>
          <p>After signing in, return to <code>/agent-site-studio</code>.</p>
        </>
      )}
      {screen.state === 'error' && (
        <>
          <p role="alert" style={{ color: '#a12424' }}>{screen.message}</p>
          <p>Check that the Supabase migration <code>024_rv_agent_website_studio.sql</code> has been applied, and confirm your environment variables.</p>
          <a href="/">Return to RealVolt</a>
        </>
      )}
    </main>
  );
}
