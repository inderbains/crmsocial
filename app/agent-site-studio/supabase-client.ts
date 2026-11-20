'use client';
import {createClient, type SupabaseClient} from '@supabase/supabase-js';

// Isolated helper for the CRM add-on: it does not overwrite other RealVolt modules.
// Uses the same URL, public key and default Supabase Auth storage as the existing app.
let cachedClient: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient | null {
  if (typeof window === 'undefined') return null;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publicKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
    || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !publicKey) return null;
  if (!cachedClient) {
    cachedClient = createClient(url, publicKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
  }
  return cachedClient;
}
