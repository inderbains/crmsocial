'use client';
import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { getSupabase } from '@/lib/supabase';
import { PROFILE_COLUMNS, publicMarketingIdentity } from '@/lib/rv-agent-site/profile';
import { AgentSiteStudio } from './AgentSiteStudio';
import type { AgentSite, AgentSiteDomain, LinkedAgentProfile } from '@/lib/rv-agent-site/types';

type ReadyState = {state:'ready';userId:string;site:AgentSite|null;domains:AgentSiteDomain[];profile:LinkedAgentProfile};
type ScreenState = {state:'loading'|'signin'} | {state:'error';message:string} | ReadyState;

export function AgentSiteStudioGate() {
  const [session,setSession] = useState<Session | null | undefined>(undefined);
  const [screen,setScreen] = useState<ScreenState>({state:'loading'});
  useEffect(() => {
    const db=getSupabase();
    if(!db){setScreen({state:'error',message:'RealVolt Supabase configuration is missing.'});return;}
    let active=true;
    void db.auth.getSession().then(({data,error})=>{
      if(!active)return;
      if(error)setScreen({state:'error',message:error.message});else setSession(data.session);
    });
    const {data}=db.auth.onAuthStateChange((_event,nextSession)=>{if(active)setSession(nextSession)});
    return ()=>{active=false;data.subscription.unsubscribe()};
  },[]);
  useEffect(()=>{
    if(session===undefined)return;
    if(!session){setScreen({state:'signin'});return;}
    const db=getSupabase();if(!db)return;
    let active=true;setScreen({state:'loading'});
    void (async()=>{
      try {
        const userId=session.user.id;
        const [siteResult,profileResult,brokerResult]=await Promise.all([
          db.from('rv_agent_sites').select('*').eq('owner_user_id',userId).maybeSingle(),
          db.from('agent_workspace_profiles').select(PROFILE_COLUMNS).eq('user_id',userId).maybeSingle(),
          db.from('brokerage_members').select('brokerages(name)').eq('user_id',userId).maybeSingle(),
        ]);
        if(siteResult.error)throw new Error('Website records unavailable. Run migration 024: '+siteResult.error.message);
        if(profileResult.error)throw new Error('Agent profile unavailable. Run migration 022: '+profileResult.error.message);
        const b=brokerResult.data?.brokerages as unknown as {name?:string}|{name?:string}[]|null|undefined;
        const brokerage=(Array.isArray(b)?b[0]?.name:b?.name)||'';
        const profile=publicMarketingIdentity(profileResult.data as Record<string,string|null>|null,brokerage);
        if(!profile.full_name) profile.full_name=String(session.user.user_metadata?.full_name || '');
        const site=siteResult.data as AgentSite|null;
        let domains:AgentSiteDomain[]=[];
        if(site){
          const result=await db.from('rv_agent_site_domains').select('id,hostname,ownership_token,status')
            .eq('site_id',site.id).order('created_at',{ascending:true});
          if(result.error)throw result.error;
          domains=(result.data || []) as AgentSiteDomain[];
        }
        if(active)setScreen({state:'ready',userId,site,domains,profile});
      } catch(e) {
        if(active)setScreen({state:'error',message:e instanceof Error?e.message:'Could not load website'});
      }
    })();
    return ()=>{active=false};
  },[session]);
  if(screen.state==='ready')return <AgentSiteStudio key={screen.userId} initial={screen.site} initialDomains={screen.domains} profile={screen.profile}/>;
  return <main style={{maxWidth:600,margin:'8vh auto',padding:32,fontFamily:'Arial,sans-serif',lineHeight:1.6}}>
    <p><a href="/">← Back to RealVolt</a></p><h1>My Website Studio</h1>
    {screen.state==='loading'&&<p>Loading your website and public agent profile…</p>}
    {screen.state==='signin'&&<><p>Sign in to RealVolt on the homepage, then return here.</p><a href="/">Open RealVolt sign-in</a></>}
    {screen.state==='error'&&<><p role="alert" style={{color:'#a12424'}}>{screen.message}</p><p>Check migrations 022, 024 and 025, then reload.</p></>}
  </main>;
}
