'use client';
import {useEffect,useState} from 'react';
import MarketingLanding from '@/components/rv-marketing/MarketingLanding';
import BrokerageActivation from '@/components/rv-marketing/BrokerageActivation';
export default function HomePage(){
 const [route,setRoute]=useState<'home'|'register'|'activate'|null>(null);
 useEffect(()=>{const mode=new URLSearchParams(window.location.search).get('rv_brokerage');setRoute(mode==='activate'?'activate':mode==='register'?'register':'home');},[]);
 // Do not initialize the normal auth client before choosing the isolated activation route.
 if(!route)return <main aria-busy="true" style={{padding:32,color:'#193e32'}}>Opening RealVolt…</main>;
 return route==='home'?<MarketingLanding/>:<BrokerageActivation mode={route}/>;
}
