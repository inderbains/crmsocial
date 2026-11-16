import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { AgentWebsite } from '@/components/rv-agent-site/AgentWebsite';
import { siteBySlug } from '@/lib/rv-agent-site/data';

export const dynamic='force-dynamic';
export async function generateMetadata({params}:{params:Promise<{slug:string}>}):Promise<Metadata>{
  const {slug}=await params;const site=await siteBySlug(slug);
  return {title:site?`${site.display_name} | Real Estate`:'Agent Website',description:site?.tagline||'Agent Website'};
}
export default async function SitePage({params}:{params:Promise<{slug:string}>}){
  const {slug}=await params;const site=await siteBySlug(slug);
  if(!site) notFound();
  return <AgentWebsite site={site}/>;
}
