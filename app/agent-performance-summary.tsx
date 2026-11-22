'use client';
import {useMemo, useState} from 'react';
import {brokerageDay} from '../lib/listing-status';
import {calculateAgentPerformance, type PerformanceDeal, type PerformanceAllocation, type PerformancePayout, type PerformancePeriod} from '../lib/agent-performance';
import styles from './agent-performance-summary.module.css';

function money(cents: number) {
  return new Intl.NumberFormat('en-CA',{style:'currency',currency:'CAD',maximumFractionDigits:2}).format(cents / 100);
}

export default function AgentPerformanceSummary({deals,allocations,payouts,linked=true}: {
  deals: PerformanceDeal[];
  allocations: PerformanceAllocation[];
  payouts: PerformancePayout[];
  linked?: boolean;
}) {
  const [period,setPeriod] = useState<PerformancePeriod>('year');
  const today = brokerageDay();
  const data = useMemo(()=>calculateAgentPerformance(deals,allocations,payouts,period,today),[deals,allocations,payouts,period,today]);
  const cards = [
    {label:'Listings taken',value:String(data.listings),tip:'Listings created in the selected period'},
    {label:'Firm sales',value:String(data.firmSales),tip:'Counted on the actual subject-removal / firm date'},
    {label:'Firm sales volume',value:money(data.volumeCents),tip:'Accepted prices of firm sales, not commission'},
    {label:'Commission earned',value:money(data.earnedCents),tip:'Agent allocation before GST on approved, legally completed sales'},
    {label:'Commission paid',value:money(data.paidCents),tip:'Net amounts marked Paid, including applicable GST, after deductions'},
    {label:'Authorized, unpaid',value:money(data.authorizedUnpaidCents),tip:'Authorized net payouts, not yet recorded as Paid'},
  ];
  return <section className={styles.panel} aria-label="Agent performance summary">
    <div className={styles.header}>
      <div><p className={styles.kicker}>AGENT PERFORMANCE</p><h2>Listings, sales & earnings</h2></div>
      <div className={styles.period} role="group" aria-label="Performance reporting period">
        {([['month','This month'],['year','This year'],['all','Lifetime']] as const).map(([key,label])=>
          <button key={key} type="button" className={period===key?styles.active:''} aria-pressed={period===key} onClick={()=>setPeriod(key)}>{label}</button>
        )}
      </div>
    </div>
    {!linked && <p className={styles.notice}>This agent's invitation is not linked to a login yet. Transactions cannot be reliably attributed until the account is linked.</p>}
    <div className={styles.metrics}>{cards.map(c=><div className={styles.metric} key={c.label} title={c.tip}>
      <span>{c.label}</span><strong>{c.value}</strong>
    </div>)}</div>
    <p className={styles.footnote}>{data.completedSales} legally completed sale(s) in this period. Firm sales count after subject removal; commission and payouts are reported separately by their actual dates.</p>
    {data.missingAllocations>0&&<p className={styles.notice}>{data.missingAllocations} completed sale(s) have no confirmed agent allocation and are excluded from commission earned.</p>}
  </section>;
}
