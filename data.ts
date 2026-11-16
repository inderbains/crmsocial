import { publicDb } from './supabase';
import { AgentSite } from './types';

export async function siteBySlug(slug: string): Promise<AgentSite | null> {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return null;
  const { data } = await publicDb().from('rv_agent_sites')
    .select('*').eq('slug', slug).eq('published', true).maybeSingle();
  return data as AgentSite | null;
}

export async function siteByDomain(hostname: string): Promise<AgentSite | null> {
  if (!/^[a-z0-9.-]+$/.test(hostname)) return null;
  const db = publicDb();
  const { data: domain } = await db.from('rv_agent_site_domains')
    .select('site_id').eq('hostname', hostname).eq('status','active').maybeSingle();
  if (!domain) return null;
  const { data: site } = await db.from('rv_agent_sites')
    .select('*').eq('id', domain.site_id).eq('published', true).maybeSingle();
  return site as AgentSite | null;
}
