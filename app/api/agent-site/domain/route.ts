import { NextRequest, NextResponse } from 'next/server';
import { authenticatedRequestDb } from '@/lib/rv-agent-site/supabase';
import { normalizeCustomDomain } from '@/lib/rv-agent-site/validation';

export const runtime='nodejs';
export async function POST(request:NextRequest){
  try{
    const origin=request.headers.get('origin');
    if(origin && new URL(origin).host !== request.headers.get('host'))
      return NextResponse.json({error:'Request origin mismatch'},{status:403});
    const { db, user } = await authenticatedRequestDb(request);
    if(!user) return NextResponse.json({error:'Sign in required'},{status:401});
    const {hostname:raw}=await request.json();const hostname=normalizeCustomDomain(raw);
    const {data:site}=await db.from('rv_agent_sites').select('id').eq('owner_user_id',user.id).maybeSingle();
    if(!site) return NextResponse.json({error:'Save the website first'},{status:400});
    const {data,error}=await db.from('rv_agent_site_domains').insert({site_id:site.id,hostname})
      .select('id,hostname,ownership_token,status').single();
    if(error) return NextResponse.json({error:error.message},{status:400});
    return NextResponse.json({domain:data});
  }catch(e){return NextResponse.json({error:e instanceof Error?e.message:'Invalid request'},{status:400});}
}
