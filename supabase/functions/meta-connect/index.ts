// RealVolt Meta connector. OAuth and asset discovery only; NO advertising or posting endpoints.
// Deploy with `supabase functions deploy meta-connect --no-verify-jwt`.
// Server-only secrets: META_APP_ID, META_APP_SECRET, META_GRAPH_VERSION, APP_URL,
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY. Never use service role or Meta secret in Next.js.
import {createClient} from 'npm:@supabase/supabase-js@2';

const apiVersion=Deno.env.get('META_GRAPH_VERSION')||'v27.0';
const appId=Deno.env.get('META_APP_ID')||'';
const appSecret=Deno.env.get('META_APP_SECRET')||'';
const appUrl=Deno.env.get('APP_URL')||'';
const supaUrl=Deno.env.get('SUPABASE_URL')||'';
const serviceKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'';
const db=createClient(supaUrl,serviceKey,{auth:{persistSession:false}});
const callbackUrl=`${supaUrl}/functions/v1/meta-connect`;
const permissions=['pages_show_list','pages_read_engagement','pages_manage_posts','pages_manage_metadata','instagram_basic','instagram_content_publish','ads_read','ads_management','business_management','leads_retrieval'];
const siteOrigin=()=>new URL(appUrl).origin;
const cors={
 'Access-Control-Allow-Origin':appUrl?siteOrigin():'null',
 'Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type',
 'Access-Control-Allow-Methods':'POST, OPTIONS',
 'Vary':'Origin',
 'Content-Type':'application/json',
 'Cache-Control':'no-store',
};
const json=(payload:unknown,status=200)=>new Response(JSON.stringify(payload),{status,headers:cors});
const safeUrl=(param:string)=>{const u=new URL(appUrl);u.searchParams.set('meta',param);return u.toString()};
const redirect=(status:string)=>Response.redirect(safeUrl(status),302);
const graphBase=`https://graph.facebook.com/${apiVersion}`;
async function graph(path:string,token:string,params:Record<string,string>={}){
 const u=new URL(`${graphBase}/${path.replace(/^\//,'')}`);
 Object.entries(params).forEach(([k,v])=>u.searchParams.set(k,v));
 const res=await fetch(u,{headers:{Authorization:`Bearer ${token}`}});
 const result=await res.json();
 if(!res.ok || result?.error)throw Error(`Meta Graph API request failed (${res.status}): ${result?.error?.message||'Unknown error'}`);
 return result;
}
async function graphList(path:string,token:string,fields:string){
 const output:any[]=[];let after='';
 // Bound pagination, never fetch URLs supplied by an external response.
 for(let i=0;i<5;i++){
  const data=await graph(path,token,{fields,limit:'100',...(after?{after}:{})});
  output.push(...(data.data||[]));
  const next=data.paging?.cursors?.after;
  if(!next||next===after)break;after=next;
 }
 return output;
}
async function sha256(value:string){const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));return [...new Uint8Array(hash)].map(n=>n.toString(16).padStart(2,'0')).join('')}
async function authUser(req:Request){const jwt=req.headers.get('authorization')?.match(/^Bearer (.+)$/i)?.[1];if(!jwt)throw Error('Login required');const {data,error}=await db.auth.getUser(jwt);if(error||!data.user)throw Error('Login required');return data.user}
async function officeAllowed(userId:string,brokerageId:string){
 const {data,error}=await db.from('brokerage_members').select('user_id').eq('user_id',userId).eq('brokerage_id',brokerageId).eq('role','admin').maybeSingle();
 if(error)throw error;return !!data;
}
async function canAccess(userId:string,connectionId:string){
 const {data,error}=await db.from('rv_meta_connections').select('id,owner_user_id,connection_scope,brokerage_id').eq('id',connectionId).maybeSingle();
 if(error)throw error;
 if(!data)return false;
 return data.connection_scope==='agent'?data.owner_user_id===userId:!!data.brokerage_id&&await officeAllowed(userId,data.brokerage_id);
}
async function post(req:Request){
 if(!appUrl||!supaUrl||!serviceKey)return json({error:'Connector environment is incomplete'},503);
 if(req.headers.get('origin')&&req.headers.get('origin')!==siteOrigin())return json({error:'Origin not allowed'},403);
 let user;try{user=await authUser(req)}catch{return json({error:'Sign in to RealVolt first'},401)}
 let body:any;try{body=await req.json()}catch{return json({error:'Invalid request'},400)}
 if(body?.action==='start'){
  if(!appId||!appSecret)return json({error:'Meta developer application is not configured yet'},503);
  const scope=body.scope==='brokerage'?'brokerage':'agent';
  const brokerageId=scope==='brokerage'?String(body.brokerage_id||''):null;
  if(scope==='brokerage'&&(!brokerageId||!await officeAllowed(user.id,brokerageId)))return json({error:'Brokerage admin permission required'},403);
  const bytes=crypto.getRandomValues(new Uint8Array(32));
  const state=Array.from(bytes).map(x=>x.toString(16).padStart(2,'0')).join('');
  const {error}=await db.from('rv_meta_oauth_states').insert({
   state_hash:await sha256(state),owner_user_id:user.id,connection_scope:scope,brokerage_id:brokerageId,
   expires_at:new Date(Date.now()+10*60_000).toISOString(),
  });
  if(error)throw error;
  const url=new URL('https://www.facebook.com/'+apiVersion+'/dialog/oauth');
  url.searchParams.set('client_id',appId);url.searchParams.set('redirect_uri',callbackUrl);
  url.searchParams.set('response_type','code');url.searchParams.set('scope',permissions.join(','));
  url.searchParams.set('state',state);url.searchParams.set('auth_type','rerequest');
  return json({authorization_url:url.toString()});
 }
 if(body?.action==='disconnect'){
  const id=String(body.connection_id||'');
  if(!id||!await canAccess(user.id,id))return json({error:'Connection unavailable'},403);
  const {error}=await db.from('rv_meta_connections').delete().eq('id',id);if(error)throw error;
  return json({ok:true});
 }
 if(body?.action==='default'){
  const id=String(body.connection_id||'');const assetId=String(body.asset_id||'');
  if(!id||!await canAccess(user.id,id))return json({error:'Connection unavailable'},403);
  const {data:asset,error}=await db.from('rv_meta_assets').select('id,asset_type').eq('id',assetId).eq('connection_id',id).eq('status','available').maybeSingle();
  if(error)throw error;if(!asset)return json({error:'Asset unavailable'},400);
  const {error:e1}=await db.from('rv_meta_assets').update({is_default:false}).eq('connection_id',id).eq('asset_type',asset.asset_type);
  if(e1)throw e1;
  const {error:e2}=await db.from('rv_meta_assets').update({is_default:true}).eq('id',assetId);if(e2)throw e2;
  return json({ok:true});
 }
 return json({error:'Unsupported action'},400);
}
async function callback(req:Request){
 if(!appUrl||!supaUrl||!serviceKey||!appId||!appSecret)return json({error:'Connector environment is incomplete'},503);
 const url=new URL(req.url);
 if(url.searchParams.get('error')||!url.searchParams.get('code')||!url.searchParams.get('state'))return redirect('cancelled');
 const stateHash=await sha256(url.searchParams.get('state')!);
 // Single-use state; consume before Meta exchange.
 const {data:state,error:stateErr}=await db.from('rv_meta_oauth_states').delete().eq('state_hash',stateHash).select('owner_user_id,connection_scope,brokerage_id,expires_at').maybeSingle();
 if(stateErr||!state||new Date(state.expires_at).getTime()<Date.now())return redirect('expired');
 if(state.connection_scope==='brokerage'&&(!state.brokerage_id||!await officeAllowed(state.owner_user_id,state.brokerage_id)))return redirect('unauthorized');
 try{
  const exchange=new URL(`${graphBase}/oauth/access_token`);
  exchange.search=new URLSearchParams({client_id:appId,client_secret:appSecret,redirect_uri:callbackUrl,code:url.searchParams.get('code')!}).toString();
  const raw=await fetch(exchange);const short=await raw.json();
  if(!raw.ok||!short.access_token)throw Error('Could not exchange Meta authorization code');
  let accessToken=String(short.access_token);let expires=Number(short.expires_in||3600);
  const long=new URL(`${graphBase}/oauth/access_token`);
  long.search=new URLSearchParams({grant_type:'fb_exchange_token',client_id:appId,client_secret:appSecret,fb_exchange_token:accessToken}).toString();
  const prolonged=await fetch(long);const longData=await prolonged.json();
  if(prolonged.ok&&longData.access_token){accessToken=String(longData.access_token);expires=Number(longData.expires_in||expires)}
  const profile=await graph('me',accessToken,{fields:'id,name'});
  let scopes:string[]=[];
  try{const perms=await graph('me/permissions',accessToken);scopes=(perms.data||[]).filter((p:any)=>p.status==='granted').map((p:any)=>p.permission)}catch{ /* review permissions from user details later */ }
  const row={owner_user_id:state.owner_user_id,connection_scope:state.connection_scope,brokerage_id:state.brokerage_id,
   meta_user_id:String(profile.id),meta_user_name:String(profile.name||''),granted_scopes:scopes,connection_status:'connected',updated_at:new Date().toISOString()};
  // Compare brokerage id without ever treating an office connection as an agent connection.
  const finder=db.from('rv_meta_connections').select('id').eq('owner_user_id',state.owner_user_id)
   .eq('connection_scope',state.connection_scope).eq('meta_user_id',row.meta_user_id);
  const {data:found,error:findErr}=state.brokerage_id
    ?await finder.eq('brokerage_id',state.brokerage_id).maybeSingle()
    :await finder.is('brokerage_id',null).maybeSingle();
  if(findErr)throw findErr;
  let id=found?.id;
  if(id){const {error}=await db.from('rv_meta_connections').update(row).eq('id',id);if(error)throw error}
  else{const {data:newConn,error}=await db.from('rv_meta_connections').insert(row).select('id').single();if(error)throw error;id=newConn.id}
  const {error:tokErr}=await db.from('rv_meta_secret_tokens').upsert({connection_id:id,user_access_token:accessToken,expires_at:new Date(Date.now()+expires*1000).toISOString(),updated_at:new Date().toISOString()},{onConflict:'connection_id'});
  if(tokErr)throw tokErr;
  let pages:any[]=[];let ads:any[]=[];
  try{pages=await graphList('me/accounts',accessToken,'id,name,access_token,instagram_business_account{id,username}') }catch(e){console.error('Meta pages unavailable',e)}
  try{ads=await graphList('me/adaccounts',accessToken,'id,name,account_status,currency')}catch(e){console.error('Meta ad accounts unavailable',e)}
  // Existing assets are marked unavailable before refreshing. Revoked assets cannot be used in new ads.
  await db.from('rv_meta_assets').update({status:'inactive'}).eq('connection_id',id);
  const assets=[
   ...pages.map(p=>({connection_id:id,asset_type:'facebook_page',meta_asset_id:String(p.id),asset_name:String(p.name||'Facebook Page'),status:'available',extra:{}})),
   ...pages.filter(p=>p.instagram_business_account?.id).map(p=>({connection_id:id,asset_type:'instagram_account',meta_asset_id:String(p.instagram_business_account.id),asset_name:String(p.instagram_business_account.username||'Instagram'),status:'available',extra:{facebook_page_id:String(p.id)}})),
   ...ads.map(a=>({connection_id:id,asset_type:'ad_account',meta_asset_id:String(a.id),asset_name:String(a.name||a.id),status:Number(a.account_status)===1?'available':'restricted',extra:{currency:String(a.currency||'')}})),
  ];
  if(assets.length){const {error}=await db.from('rv_meta_assets').upsert(assets,{onConflict:'connection_id,asset_type,meta_asset_id'});if(error)throw error}
  // Store page publishing tokens behind service-role-only permissions.
  for(const page of pages){if(!page.access_token)continue;
   const {data:asset}=await db.from('rv_meta_assets').select('id').eq('connection_id',id).eq('asset_type','facebook_page').eq('meta_asset_id',String(page.id)).maybeSingle();
   if(asset)await db.from('rv_meta_page_tokens').upsert({asset_id:asset.id,page_access_token:String(page.access_token),updated_at:new Date().toISOString()},{onConflict:'asset_id'});
  }
  return redirect('connected');
 }catch(e){console.error('Meta connection failed',e);return redirect('failed')}
}
Deno.serve(async req=>{
 try{
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
  if(req.method==='POST')return await post(req);
  if(req.method==='GET')return await callback(req);
  return json({error:'Method not allowed'},405);
 }catch(error){console.error('Meta connector error',error);return json({error:'Meta connection could not be completed'},500)}
});
