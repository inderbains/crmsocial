import { NextRequest, NextResponse } from 'next/server';
import { authenticatedRequestDb } from '@/lib/rv-agent-site/supabase';
import { validateDraft } from '@/lib/rv-agent-site/validation';

export const runtime = 'nodejs';
export async function POST(request: NextRequest) {
  try {
    const origin=request.headers.get('origin');
    if (origin && new URL(origin).host !== request.headers.get('host'))
      return NextResponse.json({error:'Request origin mismatch'},{status:403});
    const { db, user } = await authenticatedRequestDb(request);
    if(!user) return NextResponse.json({error:'Sign in required'},{status:401});
    const parsed=validateDraft(await request.json());
    const {data,error}=await db.from('rv_agent_sites').upsert({
      ...parsed, owner_user_id:user.id, updated_at:new Date().toISOString(),
    },{onConflict:'owner_user_id'}).select('id,slug').single();
    if(error) return NextResponse.json({error:error.message},{status:400});
    return NextResponse.json({site:data});
  }catch(e){return NextResponse.json({error:e instanceof Error?e.message:'Invalid request'},{status:400});}
}
