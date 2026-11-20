'use client';
import {useEffect,useState} from 'react';
import type {AuthChangeEvent, Session} from '@supabase/supabase-js';
import {getSupabase} from './supabase-client';
import RealEstateCRM from './real-estate-crm';
import styles from './real-estate-crm.module.css';

export default function RealEstateCRMPage(){
  const [userId,setUserId]=useState<string|null>(null);
  const [loaded,setLoaded]=useState(false);
  useEffect(()=>{
    const db=getSupabase();
    if(!db){setLoaded(true);return;}
    let active=true;
    void db.auth.getUser().then((result)=>{if(active){setUserId(result.data.user?.id||null);setLoaded(true)}}).catch(()=>{if(active){setLoaded(true)}});
    const {data:sub}=db.auth.onAuthStateChange((_event: AuthChangeEvent, session: Session | null)=>{
      if(active){setUserId(session?.user.id||null);setLoaded(true)}
    });
    return()=>{active=false;sub.subscription.unsubscribe()};
  },[]);
  if(!loaded)return <main className={styles.loading}>Opening RealVolt CRM…</main>;
  if(!userId)return <main className={styles.login}><h1>RealVolt CRM</h1><p>Sign in to your RealVolt workspace to open your contacts.</p><a href="/">Return to sign in</a></main>;
  return <RealEstateCRM userId={userId}/>;
}
