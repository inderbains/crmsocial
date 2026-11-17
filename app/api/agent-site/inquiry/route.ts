import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/rv-agent-site/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const INTERESTS = new Set([
  'Buying a home', 'Selling a home', 'Property valuation', 'General question',
]);
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function fail(error: string, status: number) {
  return NextResponse.json({ ok: false, error }, { status, headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: NextRequest) {
  // Website inquiries are public, but CRM ownership is decided exclusively by the server.
  // This route relies on the service role key being configured on Hostinger (server-only).
  try {
    if (!request.headers.get('content-type')?.toLowerCase().includes('application/json'))
      return fail('Invalid request format.', 415);
    const size = Number(request.headers.get('content-length') || 0);
    if (size > 8000) return fail('Message is too long.', 413);
    const raw = await request.text();
    if (Buffer.byteLength(raw, 'utf8') > 8000) return fail('Message is too long.', 413);
    let input: Record<string, unknown>;
    try { input = JSON.parse(raw) as Record<string, unknown>; }
    catch { return fail('Invalid request data.', 400); }
    if (!input || typeof input !== 'object' || Array.isArray(input))
      return fail('Invalid request data.', 400);

    // Honeypot: return an uninformative success to avoid signaling to simple bots.
    if (typeof input.website === 'string' && input.website.trim())
      return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
    const slug = typeof input.slug === 'string' ? input.slug.trim() : '';
    const requestId = typeof input.request_id === 'string' ? input.request_id : '';
    const name = typeof input.name === 'string' ? input.name.trim() : '';
    const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : '';
    const phone = typeof input.phone === 'string' ? input.phone.trim() : '';
    const interest = typeof input.interest === 'string' ? input.interest : '';
    const message = typeof input.message === 'string' ? input.message.trim() : '';

    if (slug.length > 45 || !SLUG.test(slug) || !UUID.test(requestId) ||
        !name || name.length > 120 || !EMAIL.test(email) || email.length > 200 ||
        phone.length > 50 || !INTERESTS.has(interest) || !message || message.length > 4000)
      return fail('Please check your name, email and message.', 400);

    // A service-role-only, transactional database function:
    // 1. Finds the published agent site from the slug.
    // 2. Assigns the lead to the site's owner_user_id (never visitor-supplied).
    // 3. Creates/reuses that owner's CRM contact and adds a CRM note.
    // 4. Applies basic rate limiting and request-id deduplication.
    const { error } = await adminDb().rpc('rv_capture_agent_site_inquiry', {
      p_slug: slug,
      p_request_id: requestId,
      p_name: name,
      p_email: email,
      p_phone: phone,
      p_interest: interest,
      p_message: message,
    });
    if (error) {
      if (error.message.includes('RATE_LIMIT')) return fail('Too many messages right now. Please try again later.', 429);
      if (error.message.includes('WEBSITE_NOT_AVAILABLE')) return fail('This website is not accepting inquiries.', 404);
      if (error.message.includes('INVALID_INQUIRY')) return fail('Please check your contact details.', 400);
      console.error('Agent inquiry database failure:', error.code); // No PII in server logs.
      return fail('The inquiry could not be saved. Please try again later.', 503);
    }
    return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    console.error('Agent inquiry server failure:', e instanceof Error ? e.name : 'Unknown');
    return fail('The inquiry service is temporarily unavailable. Please try again later.', 503);
  }
}
