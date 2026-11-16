import { NextRequest, NextResponse } from 'next/server';
import { publicDb } from '@/lib/rv-agent-site/supabase';
export const runtime = 'nodejs';
export async function GET(request: NextRequest) {
  const slug = request.nextUrl.searchParams.get('slug') || '';
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug))
    return NextResponse.json({ready:false, reason:'Invalid website URL'}, {status:400});
  try {
    const {data,error} = await publicDb().from('rv_agent_sites')
      .select('slug').eq('slug',slug).eq('published',true).maybeSingle();
    if (error) return NextResponse.json({ready:false,reason:'Site database unavailable: '+error.message},{status:503});
    return NextResponse.json({ready:!!data,url:data?`/site/${slug}`:null},{headers:{'Cache-Control':'no-store'}});
  } catch(e) {
    return NextResponse.json({ready:false,reason:e instanceof Error?e.message:'Could not check website'},{status:503});
  }
}
