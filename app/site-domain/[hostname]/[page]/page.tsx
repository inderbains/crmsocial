import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { AgentWebsite, validSitePage, type SitePage } from '@/components/rv-agent-site/AgentWebsite';
import { siteByDomain } from '@/lib/rv-agent-site/data';

export const dynamic = 'force-dynamic';
type Params = Promise<{hostname: string; page: string}>;
const headings: Record<SitePage, string> = {home: 'Home', listings: 'Properties', about: 'About', buyers: 'Buyers', sellers: 'Sellers', contact: 'Contact'};
export async function generateMetadata({params}: {params: Params}): Promise<Metadata> {
  const {hostname, page} = await params;
  if (!validSitePage(page) || page === 'home') return {title: 'Agent website'};
  const site = await siteByDomain(hostname);
  if (!site) return {title: 'Agent website'};
  return {title: `${headings[page]} | ${site.display_name}`, description: `${headings[page]} — ${site.display_name}, ${site.brokerage_name || 'real estate advisor'}`};
}
export default async function DomainAgentPublicPage({params}: {params: Params}) {
  const {hostname, page} = await params;
  if (!validSitePage(page) || page === 'home') notFound();
  const site = await siteByDomain(hostname);
  if (!site) notFound();
  return <AgentWebsite site={site} page={page} basePath="" />;
}
