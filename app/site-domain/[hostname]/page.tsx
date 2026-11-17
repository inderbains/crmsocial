import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { AgentWebsite } from '@/components/rv-agent-site/AgentWebsite';
import { siteByDomain } from '@/lib/rv-agent-site/data';

export const dynamic = 'force-dynamic';
export async function generateMetadata({params}:{params:Promise<{hostname:string}>}):Promise<Metadata>{
  const {hostname}=await params;const site=await siteByDomain(hostname);
  return {title:site?`${site.display_name} | Real Estate`:'Agent Website',description:site?.tagline||'Agent Website'};
}
export default async function DomainSitePage({params}:{params:Promise<{hostname:string}>}){
  const {hostname}=await params;const site=await siteByDomain(hostname);
  if(!site) notFound();
  return <AgentWebsite site={site} basePath=""/>;
}
