// COPY the import and the two lines into YOUR existing middleware.ts (Next 15)
// or proxy.ts (Next 16). Do NOT replace your existing auth middleware.
//
// import { rewriteAgentWebsite } from '@/lib/rv-agent-site/routing';
//
// export async function middleware(request: NextRequest) { // Next 15
//   const siteRewrite = rewriteAgentWebsite(request);
//   if (siteRewrite) return siteRewrite;
//   ... your existing RealVolt auth / cookie refresh logic ...
// }
//
// Next 16: use `export async function proxy(request: NextRequest)`.
