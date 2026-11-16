import { NextRequest, NextResponse } from 'next/server';
import { authenticatedRequestDb } from '@/lib/rv-agent-site/supabase';
import { validateDraft } from '@/lib/rv-agent-site/validation';
import { PROFILE_COLUMNS, publicMarketingIdentity } from '@/lib/rv-agent-site/profile';

export const runtime = 'nodejs';
export async function POST(request: NextRequest) {
  try {
    const origin = request.headers.get('origin');
    if (origin && new URL(origin).host !== request.headers.get('host'))
      return NextResponse.json({ error: 'Request origin mismatch' }, { status: 403 });
    const { db, user } = await authenticatedRequestDb(request);
    if (!user) return NextResponse.json({ error: 'Your session expired. Sign in again.' }, { status: 401 });
    const parsed = validateDraft(await request.json());
    if (parsed.use_profile_identity) {
      const { data, error } = await db.from('agent_workspace_profiles')
        .select(PROFILE_COLUMNS).eq('user_id',user.id).maybeSingle();
      if (error) return NextResponse.json({error: 'Cannot access My Profile. Apply migration 022 first: ' + error.message}, {status:400});
      const marketing = publicMarketingIdentity(data as Record<string,string|null> | null);
      if (!marketing.full_name) return NextResponse.json({error:'Complete your name under My Profile & Billing before publishing.'}, {status:400});
      parsed.display_name = marketing.full_name;
      parsed.professional_title = marketing.professional_title;
      parsed.biography = marketing.biography;
      parsed.public_email = marketing.public_email;
      parsed.public_phone = marketing.public_phone;
      parsed.license_number = marketing.license_number;
      parsed.headshot_path = marketing.headshot_path;
      parsed.logo_path = marketing.logo_path;
      // Use brokerage from actual verified membership where present.
      const {data:membership} = await db.from('brokerage_members')
        .select('brokerages(name)').eq('user_id',user.id).maybeSingle();
      const b = membership?.brokerages as unknown as {name?:string}|{name?:string}[]|null|undefined;
      const verified = (Array.isArray(b)?b[0]?.name:b?.name)||'';
      if (verified) parsed.brokerage_name = verified;
    }
    const { data, error } = await db.from('rv_agent_sites').upsert({
      ...parsed, owner_user_id:user.id, updated_at:new Date().toISOString(),
    },{onConflict:'owner_user_id'}).select('id,slug,published').single();
    if (error) return NextResponse.json({error:'Could not save website: '+error.message}, {status:400});
    return NextResponse.json({site:data, public_url: data.published ? `/site/${data.slug}` : null});
  } catch (e) {
    return NextResponse.json({error:e instanceof Error?e.message:'Invalid request'},{status:400});
  }
}
