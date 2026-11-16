import { redirect } from 'next/navigation';
import { userDb } from '@/lib/rv-agent-site/supabase';
import { AgentSiteStudio } from '@/components/rv-agent-site/AgentSiteStudio';
import type { AgentSite, AgentSiteDomain } from '@/lib/rv-agent-site/types';

export const dynamic = 'force-dynamic';
export default async function AgentSiteStudioPage() {
  const db = await userDb();
  const { data: { user } } = await db.auth.getUser();
  if (!user) redirect('/login'); // change this if your RealVolt sign-in route differs
  const { data: site } = await db.from('rv_agent_sites').select('*').eq('owner_user_id', user.id).maybeSingle();
  const { data: domains } = site
    ? await db.from('rv_agent_site_domains').select('id,hostname,ownership_token,status').eq('site_id',site.id).order('created_at',{ascending:true})
    : {data: []};
  return <AgentSiteStudio initial={site as AgentSite | null} initialDomains={(domains || []) as AgentSiteDomain[]} />;
}
