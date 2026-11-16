'use client';
import { useEffect, useState } from 'react';
import { getSupabase } from '@/lib/supabase';
/** Simple direct shortcut on the logged-in RealVolt workspace. Doesn't alter CRM navigation. */
export function WebsiteQuickLink(){
  const [show,setShow]=useState(false);
  useEffect(()=>{
    if(window.location.pathname!=='/')return;
    const db=getSupabase();if(!db)return;
    let active=true;
    void db.auth.getSession().then(({data})=>{if(active)setShow(!!data.session)});
    const {data}=db.auth.onAuthStateChange((_event,session)=>{if(active)setShow(!!session)});
    return ()=>{active=false;data.subscription.unsubscribe()};
  },[]);
  if(!show)return null;
  return <a href="/agent-site-studio" title="Design and publish your agent website"
    style={{position:'fixed',right:22,bottom:20,zIndex:1500,background:'#147D64',color:'#fff',textDecoration:'none',padding:'12px 19px',borderRadius:14,boxShadow:'0 9px 25px #0b2d1a55',fontFamily:'Arial,sans-serif',fontSize:14,fontWeight:800}}>
    🌐 My Agent Website
  </a>;
}
