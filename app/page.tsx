'use client';
import {useEffect,useState} from 'react';
import MarketingLanding from '@/components/rv-marketing/MarketingLanding';
import BrokerageActivation from '@/components/rv-marketing/BrokerageActivation';
import AcceptInvitation from './accept-invitation/page';
export default function HomePage(){
 const [route,setRoute]=useState<'home'|'register'|'activate'|'agent'|'blocked'|null>(null);
 useEffect(()=>{const u=new URL(window.location.href),h=new URLSearchParams(u.hash.slice(1)),q=u.searchParams;const mode=q.get('rv_brokerage');
 if(q.get('rv_agent')==='activate'){setRoute('agent');return;}
 if(q.has('onboard')||q.has('invite')||q.has('token_hash')||(h.has('token_hash')&&mode!=='activate')||['invite','magiclink'].includes(q.get('type')||h.get('type')||'')&&mode!=='activate'){window.history.replaceState(null,'',u.pathname);setRoute('blocked');return;}
 setRoute(mode==='activate'?'activate':mode==='register'?'register':'home');},[]);
 if(!route)return <main aria-busy="true" style={{padding:32,color:'#193e32'}}>Opening RealVolt…</main>;
 if(route==='blocked')return <main style={{padding:32,color:'#193e32'}}><h1>Invitation unavailable</h1><p>This is an old invitation. Ask your brokerage administrator to send a fresh activation link.</p></main>;
 if(route==='agent')return <AcceptInvitation/>;
 return route==='home'?<MarketingLanding/>:<BrokerageActivation mode={route}/>;
}
