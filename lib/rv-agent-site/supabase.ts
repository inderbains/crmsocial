import { createClient } from '@supabase/supabase-js';

// Public client: only anon/publishable key, and RLS still applies.
function config() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY in Hostinger.');
  return { url, key };
}

export function publicDb() {
  const {url,key} = config();
  return createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
}

// RealVolt signs in on the homepage and keeps the session in the browser.
// Every mutating request supplies its Supabase access token to this API.
// The Supabase client sends the validated token to PostgREST, enforcing RLS.
export async function authenticatedRequestDb(request: Request) {
  const authorization = request.headers.get('authorization') || '';
  const match = /^Bearer\s+(.+)$/i.exec(authorization);
  if (!match) return {db:publicDb(),user:null};
  const token=match[1];
  const {url,key}=config();
  const db=createClient(url,key,{
    auth:{persistSession:false,autoRefreshToken:false},
    global:{headers:{Authorization:`Bearer ${token}`}}
  });
  const {data:{user},error}=await db.auth.getUser(token);
  return {db,user:error?null:user};
}

export function adminDb() {
  // Server-only. NEVER prefix the service role key with NEXT_PUBLIC_.
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is required on the server to verify domains.');
  return createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
}
