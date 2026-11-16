'use client';
import {useEffect,useState,type FormEvent} from 'react';
import {Camera,ImagePlus,Save} from 'lucide-react';
import {getSupabase} from '../lib/supabase';
import {AGENT_MEDIA_BUCKET,agentMediaUrl,emptyAgentMarketingProfile,safeWebsite,type AgentMarketingProfile} from '../lib/agent-profile';

type Field=keyof AgentMarketingProfile;
export default function AgentMarketingEditor({userId,notify}:{userId:string;notify:(s:string)=>void}){
 const [profile,setProfile]=useState<AgentMarketingProfile>(emptyAgentMarketingProfile);
 const [accountEmail,setAccountEmail]=useState('');
 const [brokerage,setBrokerage]=useState('');
 const [loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[uploading,setUploading]=useState<'headshot_path'|'logo_path'|null>(null);
 const [error,setError]=useState('');
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL||'';
 const patch=(key:Field,value:string)=>setProfile(p=>({...p,[key]:value}));
 useEffect(()=>{let active=true;const db=getSupabase();if(!db)return;
  (async()=>{
   const [p,u,b]=await Promise.all([
    db.from('agent_workspace_profiles').select('full_name,professional_title,biography,public_email,public_phone,license_number,website_url,headshot_path,logo_path').eq('user_id',userId).maybeSingle(),
    db.auth.getUser(),
    db.from('brokerage_members').select('brokerages(name)').eq('user_id',userId).maybeSingle()
   ]);
   if(!active)return;
   const email=u.data.user?.email||'';setAccountEmail(email);
   const office=b.data?.brokerages as unknown as {name?:string}|{name?:string}[]|null|undefined;
   setBrokerage((Array.isArray(office)?office[0]?.name:office?.name)||'');
   if(p.error){setError('Marketing profile requires Supabase migration 022. '+p.error.message);}
   else{
    const incoming=p.data||{};
    setProfile({...emptyAgentMarketingProfile,...incoming,
      full_name:incoming.full_name||u.data.user?.user_metadata?.full_name||'',
      public_email:incoming.public_email||email});
    setError('');
   }
   setLoading(false);
  })();return()=>{active=false}
 },[userId]);
 async function upload(kind:'headshot_path'|'logo_path',file:File|undefined){
  if(!file)return;
  if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>5_000_000){notify('Choose a JPG, PNG or WebP under 5 MB.');return;}
  const db=getSupabase();if(!db)return;setUploading(kind);
  try{
   const ext=file.type==='image/png'?'png':file.type==='image/webp'?'webp':'jpg';
   const path=`${userId}/${kind}/${crypto.randomUUID()}.${ext}`;
   const result=await db.storage.from(AGENT_MEDIA_BUCKET).upload(path,file,{upsert:false,contentType:file.type});
   if(result.error)throw result.error;
   patch(kind,path);notify('Image uploaded. Press Save marketing profile to use it in Open House posters.');
  }catch(e){notify('Could not upload image: '+(e as Error).message)}finally{setUploading(null)}
 }
 async function save(e:FormEvent<HTMLFormElement>){e.preventDefault();const db=getSupabase();if(!db)return;
  if(!profile.full_name.trim()){notify('Enter your public agent name.');return}
  if(!safeWebsite(profile.website_url)){notify('Website must begin with https:// or http://');return}
  if(profile.public_email.trim()&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(profile.public_email.trim())){notify('Enter a valid public contact email.');return}
  setSaving(true);
  const values={...profile,full_name:profile.full_name.trim(),public_email:profile.public_email.trim(),website_url:profile.website_url.trim(),user_id:userId};
  const {error:saveError}=await db.from('agent_workspace_profiles').upsert(values,{onConflict:'user_id'});
  if(saveError)notify('Could not save profile: '+saveError.message);
  else{notify('Marketing profile saved. Future open house posters will use your details.');window.dispatchEvent(new Event('realvolt:agent-marketing-profile-updated'))}
  setSaving(false);
 }
 return <section className="panel rv-agent-marketing" style={{marginTop:20}}>
  <div className="rv-agent-marketing-head"><div><p className="eyebrow">MY PROFILE · MARKETING IDENTITY</p><h2>Your public agent profile</h2><p className="hint">Save once; RealVolt will use this information automatically on future Open House QR posters and marketing designs.</p></div><span className="badge">Agent-managed</span></div>
  {loading?<p>Loading marketing profile…</p>:error?<div className="notice" role="alert">{error}</div>:<form onSubmit={save}>
   <div className="rv-agent-marketing-media">
    {([['headshot_path','Agent headshot',Camera],['logo_path','Approved branding logo',ImagePlus]] as const).map(([key,label,Icon])=><div className="rv-agent-media-card" key={key}>
     <div className={'rv-agent-image '+(key==='logo_path'?'rv-agent-logo':'')}>{profile[key]?<img src={agentMediaUrl(url,profile[key])} alt={label}/>:<Icon size={35}/>}</div>
     <label htmlFor={'rv-agent-upload-'+key}>{label}</label>
     <input id={'rv-agent-upload-'+key} type="file" accept="image/jpeg,image/png,image/webp" disabled={!!uploading||saving} onChange={e=>{void upload(key,e.target.files?.[0]);e.target.value=''}}/>
     <small>Public marketing image · JPG, PNG or WebP · 5 MB max</small>
    </div>)}
   </div>
   <div className="rv-agent-marketing-grid">
    <div className="field"><label htmlFor="rv-agent-full-name">Public agent name</label><input id="rv-agent-full-name" required maxLength={150} value={profile.full_name} onChange={e=>patch('full_name',e.target.value)}/></div>
    <div className="field"><label htmlFor="rv-agent-job">Professional title</label><input id="rv-agent-job" maxLength={100} value={profile.professional_title} onChange={e=>patch('professional_title',e.target.value)} placeholder="REALTOR®"/></div>
    <div className="field"><label htmlFor="rv-agent-email">Public contact email</label><input id="rv-agent-email" type="email" maxLength={240} value={profile.public_email} onChange={e=>patch('public_email',e.target.value)} placeholder={accountEmail}/></div>
    <div className="field"><label htmlFor="rv-agent-phone">Public phone number</label><input id="rv-agent-phone" type="tel" maxLength={40} value={profile.public_phone} onChange={e=>patch('public_phone',e.target.value)} placeholder="604-555-0123"/></div>
    <div className="field"><label htmlFor="rv-agent-licence">Licence number (optional)</label><input id="rv-agent-licence" maxLength={70} value={profile.license_number} onChange={e=>patch('license_number',e.target.value)}/></div>
    <div className="field"><label htmlFor="rv-agent-website">Agent website</label><input id="rv-agent-website" type="url" maxLength={300} value={profile.website_url} onChange={e=>patch('website_url',e.target.value)} placeholder="https://example.com"/></div>
    <div className="field rv-agent-bio"><label htmlFor="rv-agent-bio">Agent biography</label><textarea id="rv-agent-bio" maxLength={1800} rows={4} value={profile.biography} onChange={e=>patch('biography',e.target.value)} placeholder="Introduce yourself to buyers and sellers…"/><small>{profile.biography.length}/1800 characters</small></div>
   </div>
   <p className="hint">Brokerage: <b>{brokerage||'No brokerage linked'}</b>. Your office name and role come from your membership—not a self-edited field. Upload only a logo you are authorized to use. Your email, phone, headshot and bio are intended to be displayed publicly.</p>
   <button className="btn primary" type="submit" disabled={saving||!!uploading}><Save size={16}/> {saving?'Saving…':'Save marketing profile'}</button>
  </form>}
 </section>
}
