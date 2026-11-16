import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { rewriteAgentWebsite } from './lib/rv-agent-site/routing';

// Next.js 16 proxy. Leaves all CRM/Open House routes unchanged by default.
export function proxy(request: NextRequest) {
  return rewriteAgentWebsite(request) || NextResponse.next();
}
export const config={matcher:['/((?!_next/static|_next/image|favicon.ico).*)']};
