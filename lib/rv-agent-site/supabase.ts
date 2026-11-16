import { createClient as createJsClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

function config() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
    || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Missing Supabase public environment variables');
  return { url, key };
}

export function publicDb() {
  const { url, key } = config();
  return createJsClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function userDb() {
  const { url, key } = config();
  const cookieStore = await cookies();
  return createServerClient(url, key, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: values => {
        // Server Components are read-only. Route handlers can persist refreshed cookies.
        try { values.forEach(({ name, value, options }) => cookieStore.set(name, value, options)); }
        catch { /* handled by your existing Supabase auth middleware/proxy */ }
      },
    },
  });
}

export function adminDb() {
  // Server-only! Never import this function in Client Components.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY');
  return createJsClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}


/**
 * Auth for the Agent Website Studio API routes.
 * The existing RealVolt app stores its session in the browser, not in
 * @supabase/ssr cookies. Verify a Bearer token with Supabase Auth, then send
 * all database queries using the same token so RLS is enforced.
 * Cookie sessions remain supported for other clients.
 */
export async function authenticatedRequestDb(request: Request) {
  const authorization = request.headers.get('authorization') || '';
  const bearer = /^Bearer\s+(.+)$/i.exec(authorization);
  if (!bearer) {
    const db = await userDb();
    const { data: { user } } = await db.auth.getUser();
    return { db, user };
  }
  const token = bearer[1];
  const { url, key } = config();
  const db = createJsClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  // getUser(token) validates the JWT against Supabase Auth; never trust a
  // decoded token or user ID provided by the caller.
  const { data: { user }, error } = await db.auth.getUser(token);
  return { db, user: error ? null : user };
}
