'use client';

import {useCallback,useEffect,useMemo,useState} from 'react';
import {RefreshCw,UsersRound} from 'lucide-react';
import {getSupabase} from '../lib/supabase';
import styles from './agent-leaderboard.module.css';

type Period = 'month' | 'year';
type Ranking = 'volume' | 'sales';
type LeaderboardRow = {
  rank: number;
  agent_id: string;
  agent_name: string;
  sales_count: number;
  sales_volume: number;
};

const money = new Intl.NumberFormat('en-CA', {
  style: 'currency',currency: 'CAD',maximumFractionDigits: 0,
});
function initials(value:string){return value.trim().split(/\s+/).slice(0,2).map(x=>x[0]||'').join('').toUpperCase();}

/** Only brokerage-aggregate sales data is returned. Never loads commissions or client records. */
export default function AgentLeaderboard({userId}:{userId:string}){
  const [period,setPeriod] = useState<Period>('month');
  const [ranking,setRanking] = useState<Ranking>('volume');
  const [refreshCount,setRefreshCount] = useState(0);
  const [rows,setRows] = useState<LeaderboardRow[]>([]);
  const [loading,setLoading] = useState(true);
  const [error,setError] = useState('');
  const [showAll,setShowAll] = useState(false);
  const [independent,setIndependent] = useState(false);

  const reload = useCallback(()=>setRefreshCount(v=>v+1),[]);
  useEffect(()=>{
    let active=true;
    async function fetchLeaderboard(){
      const db=getSupabase();
      if(!db){if(active){setError('Supabase is not configured.');setLoading(false);}return;}
      setLoading(true);setError('');
      const result=await db.rpc('rv_brokerage_sales_leaderboard',{
        p_period:period,p_sort:ranking,
      });
      if(!active)return;
      if(result.error){
        // An independent agent has no office leaderboard.
        if(result.error.message.includes('No brokerage membership')){setRows([]);setError('');setIndependent(true);}
        else{setError(result.error.message);setIndependent(false);}
      }else{
        setIndependent(false);
        const values = Array.isArray(result.data) ? result.data : [];
        setRows(values.map((r:Record<string,unknown>)=>({
          rank:Number(r.rank),
          agent_id:String(r.agent_id||''),
          agent_name:String(r.agent_name||'Agent'),
          sales_count:Number(r.sales_count||0),
          sales_volume:Number(r.sales_volume||0),
        })));
      }
      setLoading(false);
    }
    void fetchLeaderboard();
    return()=>{active=false;};
  },[userId,period,ranking,refreshCount]);

  const qualifiedRows=useMemo(()=>rows.filter(r=>r.sales_count>0),[rows]);
  const visible=showAll?qualifiedRows:qualifiedRows.slice(0,5);
  const own=qualifiedRows.find(r=>r.agent_id===userId);
  const monthLabel=new Intl.DateTimeFormat('en-CA',{
    month: period==='month'?'long':undefined,
    year:'numeric',timeZone:'America/Vancouver',
  }).format(new Date());
  const hasRanking=qualifiedRows.length>0;
  if(independent)return null;

  return <section className={styles.shell} aria-label="Brokerage agent sales leaderboard">
    <div className={styles.header}>
      <div>
        <div className={styles.eyebrow}>BROKERAGE PERFORMANCE</div>
        <h2 className={styles.heading}>Top Agents</h2>
        <p className={styles.subtitle}>Completed sales · {monthLabel} · CAD</p>
      </div>
      <div className={styles.tools}>
        <div className={styles.segment} role="group" aria-label="Leaderboard period">
          <button type="button" aria-pressed={period==='month'} onClick={()=>{setPeriod('month');setShowAll(false);}}>Monthly</button>
          <button type="button" aria-pressed={period==='year'} onClick={()=>{setPeriod('year');setShowAll(false);}}>Yearly</button>
        </div>
        <div className={styles.segment} role="group" aria-label="Rank agents by">
          <button type="button" aria-pressed={ranking==='volume'} onClick={()=>setRanking('volume')}>Volume</button>
          <button type="button" aria-pressed={ranking==='sales'} onClick={()=>setRanking('sales')}>Sales</button>
        </div>
        <button type="button" className={styles.refresh} onClick={reload} aria-label="Refresh leaderboard" title="Refresh leaderboard" disabled={loading}><RefreshCw size={16}/></button>
      </div>
    </div>
    {error?<div className={styles.error} role="alert">Could not load leaderboard: {error}. Ensure SQL 033 is installed.</div>
      :loading?<div className={styles.empty} role="status">Loading completed sales…</div>
      :!hasRanking?<div className={styles.empty}><UsersRound size={22} style={{marginBottom:10}}/><div>No agent-confirmed completed sales recorded for {monthLabel}.</div></div>
      :<>
        <table className={styles.table}>
          <thead><tr><th scope="col">Rank</th><th scope="col">Agent</th><th scope="col">Sales</th><th scope="col">Volume</th></tr></thead>
          <tbody>
          {visible.map((r)=><tr key={r.agent_id} className={r.rank===1?styles.first:''}>
            <td><span className={styles.number}>{r.rank}</span></td>
            <td><div className={styles.agent}><span className={styles.avatar} aria-hidden="true">{initials(r.agent_name)}</span><span className={styles.agentName} title={r.agent_name}>{r.agent_name}{r.agent_id===userId&&<span className={styles.you}>(you)</span>}</span></div></td>
            <td>{r.sales_count}</td>
            <td className={styles.volume}>{money.format(r.sales_volume)}</td>
          </tr>)}
          </tbody>
        </table>
        <div className={styles.footer}>
          <span className={styles.note}>{own?`Your rank: #${own.rank} · ${own.sales_count} sale${own.sales_count===1?'':'s'}`:'Your account has no confirmed completed sales this period.'}</span>
          {qualifiedRows.length>5&&<button type="button" aria-expanded={showAll} onClick={()=>setShowAll(v=>!v)}>{showAll?'Show top 5':'View all agents'} →</button>}
        </div>
      </>}
    <p className={styles.note}>Based on agent-confirmed completions in RealVolt Transactions, using the recorded sale price and actual completion date. Counts only sales recorded for this brokerage. No commissions are shown.</p>
  </section>;
}
