import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let client: SupabaseClient | null = null;

/** Browser Supabase client shared by existing RealVolt modules.
 * Uses only the publishable (anon) key, never the service-role key.
 */
export function getSupabase(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key || url.includes('YOUR-PROJECT') || key.includes('YOUR-PUBLIC')) {
    return null;
  }
  if (!client) client = createClient(url, key);
  return client;
}
