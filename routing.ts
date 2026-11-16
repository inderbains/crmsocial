import { NextRequest, NextResponse } from 'next/server';

/**
 * Host-based website routing is OFF by default. Enable ONLY after DNS and TLS
 * are configured and the real CRM hostname is excluded. Direct /site/slug
 * links work without this routing.
 */
export function rewriteAgentWebsite(req: NextRequest): NextResponse | null {
  const host=(req.headers.get('host') || '').toLowerCase().replace(/:\d+$/, '').replace(/\.$/, '');
  const pathname=req.nextUrl.pathname;
  if (!host || pathname.startsWith('/api/') || pathname.startsWith('/_next/') ||
      pathname.startsWith('/site/') || pathname.startsWith('/site-domain/') ||
      /\.[a-z0-9]{1,8}$/i.test(pathname)) return null;

  const base=(process.env.AGENT_SITE_BASE_DOMAIN || 'realvolt.ca').toLowerCase();
  const crmHosts=new Set((process.env.AGENT_SITE_APP_HOSTS || 'realvolt.ca,www.realvolt.ca,app.realvolt.ca,localhost,127.0.0.1')
    .toLowerCase().split(',').map(v=>v.trim()).filter(Boolean));
  if (crmHosts.has(host) || host.endsWith('.hostingersite.com') || host.endsWith('.vercel.app')) return null;

  let destination:string | null=null;
  if (process.env.AGENT_SITE_SUBDOMAINS_ENABLED === 'true' && host.endsWith(`.${base}`)) {
    const slug=host.slice(0,-base.length-1);
    if (/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) destination=`/site/${slug}`;
  } else {
    // Only route custom domains explicitly attached to this hosting project.
    const approved=(process.env.AGENT_SITE_CUSTOM_HOSTS || '').toLowerCase().split(',').map(v=>v.trim());
    if (approved.includes(host) && /^(?:[a-z0-9-]+\.)+[a-z]{2,63}$/.test(host)) destination=`/site-domain/${host}`;
  }
  if (!destination) return null;
  const url=req.nextUrl.clone();url.pathname=destination;
  return NextResponse.rewrite(url);
}
