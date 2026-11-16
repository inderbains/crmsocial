import { NextRequest, NextResponse } from 'next/server';
import { resolveTxt } from 'node:dns/promises';
import { userDb, adminDb } from '@/lib/rv-agent-site/supabase';

export const runtime='nodejs';
export async function POST(request:NextRequest){
  try{
    const origin=request.headers.get('origin');
    if(origin && new URL(origin).host !== request.headers.get('host'))
      return NextResponse.json({error:'Request origin mismatch'},{status:403});
    const db=await userDb();const {data:{user}}=await db.auth.getUser();
    if(!user) return NextResponse.json({error:'Sign in required'},{status:401});
    const body=await request.json();
    if(typeof body.id !== 'string' || !/^[a-f0-9-]{36}$/i.test(body.id))
      return NextResponse.json({error:'Invalid domain ID'},{status:400});
    const {data:site}=await db.from('rv_agent_sites').select('id').eq('owner_user_id',user.id).maybeSingle();
    if(!site) return NextResponse.json({error:'Site not found'},{status:404});
    const {data:domain}=await db.from('rv_agent_site_domains').select('*')
      .eq('id',body.id).eq('site_id',site.id).maybeSingle();
    if(!domain) return NextResponse.json({error:'Domain not found'},{status:404});
    if(domain.status === 'active') return NextResponse.json({status:'active'});
    // Look up a TXT record controlled by the domain owner; DNS lookup does not
    // connect the hostname to hosting or guarantee a TLS certificate.
    let values:string[][]=[];
    try{values=await resolveTxt(`_realvolt.${domain.hostname}`);}catch{
      return NextResponse.json({error:'TXT record not found yet'},{status:400});
    }
    const expected=`realvolt-verification=${domain.ownership_token}`;
    if(!values.some(chunks=>chunks.join('')===expected))
      return NextResponse.json({error:'TXT record does not match the ownership token'},{status:400});
    const {error}=await adminDb().from('rv_agent_site_domains').update({
      status:'ownership_verified',verified_at:new Date().toISOString()
    }).eq('id',domain.id).eq('site_id',site.id).eq('status','pending');
    if(error) return NextResponse.json({error:'Could not record verification'},{status:500});
    return NextResponse.json({status:'ownership_verified'});
  }catch(e){return NextResponse.json({error:e instanceof Error?e.message:'Invalid request'},{status:400});}
}
