import { NextRequest, NextResponse } from 'next/server';

/**
 * Call this at the beginning of your EXISTING middleware.ts (Next 15),
 * or proxy.ts (Next 16). Do not overwrite your RealVolt auth code.
 * Provision wildcard DNS and TLS with your hosting provider separately.
 */
export function rewriteAgentWebsite(req: NextRequest): NextResponse | null {
  const raw = req.headers.get('host') || '';
  const host = raw.toLowerCase().replace(/:\d+$/, '').replace(/\.$/, '');
  const path = req.nextUrl.pathname;
  if (!host || path.startsWith('/api/') || path.startsWith('/_next/') ||
      path.startsWith('/site/') || path.startsWith('/site-domain/') ||
      /\.[a-zA-Z0-9]{1,8}$/.test(path)) return null;

  const base = (process.env.AGENT_SITE_BASE_DOMAIN || 'realvolt.ca').toLowerCase();
  const appHosts = new Set((process.env.AGENT_SITE_APP_HOSTS || `realvolt.ca,www.realvolt.ca,app.realvolt.ca,localhost,127.0.0.1`)
    .split(',').map(s => s.trim().toLowerCase()));
  if (appHosts.has(host) || host.endsWith('.vercel.app') || host.endsWith('.hostingersite.com')) return null;

  let destination: string;
  if (host.endsWith(`.${base}`)) {
    const slug = host.slice(0, -(base.length+1));
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return null;
    destination = `/site/${slug}`;
  } else {
    if (!/^(?:[a-z0-9-]+\.)+[a-z]{2,63}$/.test(host)) return null;
    destination = `/site-domain/${host}`;
  }

  const url = req.nextUrl.clone();
  // The public website is a single landing page in this starter patch.
  // Other paths remain inside the public landing page until new site routes exist.
  url.pathname = destination;
  return NextResponse.rewrite(url);
}
