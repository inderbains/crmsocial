'use client';

import {useEffect, useState, type CSSProperties} from 'react';
import {Activity, CalendarDays, CheckCircle2, MousePointerClick, RefreshCw, Users, Eye} from 'lucide-react';
import type {SupabaseClient} from '@supabase/supabase-js';
import {getSupabase} from '../lib/supabase';
import {buildStageSnapshot, percent, STAGE_ORDER, type StageCounts} from '../lib/lead-funnel-analytics.mjs';
import styles from './lead-funnel.module.css';

type Range = 'all' | '30' | '90';
type Stats = {
  stages: StageCounts;
  propertyViews: number;
  contactClicks: number;
  showingRequests: number;
  confirmedShowings: number;
};

const LEAD_TYPES = ['Buyer', 'Seller', 'Buyer & seller', 'Other'];
const STAGES = [...STAGE_ORDER, 'Lost'] as const;
const numberFormat = new Intl.NumberFormat('en-CA');

/** Count on Supabase/PostgREST rather than downloading rows (the old UI capped at 5,000). */
async function countRecords(
  db: SupabaseClient,
  table: 'crm_contacts' | 'property_engagement' | 'property_showing_requests',
  ownerColumn: 'user_id' | 'owner_user_id',
  userId: string,
  since: string | null,
  options: {stage?: string; eventType?: string; statuses?: string[]; contactsOnly?: boolean} = {},
): Promise<number> {
  let query = db.from(table).select('id', {count: 'exact', head: true}).eq(ownerColumn, userId);
  if (since) query = query.gte('created_at', since);
  if (options.contactsOnly) query = query.in('contact_type', LEAD_TYPES);
  if (options.stage) query = query.eq('stage', options.stage);
  if (options.eventType) query = query.eq('event_type', options.eventType);
  if (options.statuses) query = query.in('status', options.statuses);
  const {count, error} = await query;
  if (error) throw new Error(`${table}: ${error.message}`);
  if (count === null || count === undefined) throw new Error(`${table}: Count not returned`);
  return count;
}

async function loadStats(db: SupabaseClient, userId: string, range: Range): Promise<Stats> {
  const since = range === 'all' ? null : new Date(Date.now() - Number(range) * 86400000).toISOString();
  const results = await Promise.all([
    ...STAGES.map(stage => countRecords(db, 'crm_contacts', 'user_id', userId, since, {stage, contactsOnly: true})),
    countRecords(db, 'property_engagement', 'owner_user_id', userId, since, {eventType: 'Page view'}),
    countRecords(db, 'property_engagement', 'owner_user_id', userId, since, {eventType: 'Contact click'}),
    countRecords(db, 'property_showing_requests', 'user_id', userId, since),
    countRecords(db, 'property_showing_requests', 'user_id', userId, since, {statuses: ['Confirmed', 'Completed']}),
  ]);
  const stages: StageCounts = {};
  STAGES.forEach((stage, index) => { stages[stage] = results[index]; });
  return {
    stages,
    propertyViews: results[STAGES.length],
    contactClicks: results[STAGES.length + 1],
    showingRequests: results[STAGES.length + 2],
    confirmedShowings: results[STAGES.length + 3],
  };
}

function pctLabel(value: number | null) {return value === null ? '—' : `${value.toFixed(1)}%`;}

export default function LeadFunnel({userId}: {userId: string}) {
  const [range, setRange] = useState<Range>('all');
  const [reload, setReload] = useState(0);
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  useEffect(() => {
    let cancelled = false;
    const db = getSupabase();
    setLoading(true);
    setStats(null);
    setError('');
    if (!db) {
      setLoading(false);
      setError('Supabase is not configured. Check your RealVolt environment variables.');
      return;
    }
    void loadStats(db, userId, range)
      .then(data => {if (!cancelled) {setStats(data); setUpdatedAt(new Date());}})
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'The funnel data could not be loaded.');
      })
      .finally(() => {if (!cancelled) setLoading(false);});
    return () => {cancelled = true;};
  }, [userId, range, reload]);

  const snapshot = stats ? buildStageSnapshot(stats.stages) : null;
  const show = (value: number | undefined) => loading ? '…' : numberFormat.format(value ?? 0);
  return <div className={styles.funnelPage}>
    <div className="headrow">
      <div><h1>Lead Funnel</h1><p>A clear view of your real CRM pipeline and property activity.</p></div>
      <div className={styles.actions}>
        <label className={styles.periodControl}>
          <CalendarDays size={15} aria-hidden="true"/>
          <span className={styles.srOnly}>Reporting period</span>
          <select value={range} onChange={e => setRange(e.target.value as Range)} aria-label="Reporting period">
            <option value="all">All time</option>
            <option value="30">Last 30 days</option>
            <option value="90">Last 90 days</option>
          </select>
        </label>
        <button type="button" className="btn" onClick={() => setReload(n => n + 1)} disabled={loading}>
          <RefreshCw size={16} aria-hidden="true"/> Refresh
        </button>
      </div>
    </div>

    {error && <div className="notice" role="alert"><b>Unable to load live funnel data.</b> {error}</div>}
    {!error && <>
      <div className={styles.statGrid} aria-busy={loading}>
        <div className={styles.stat}><span className={styles.statIcon}><Users size={19}/></span><div><p>CRM leads</p><strong>{show(snapshot?.total)}</strong><small>Buyer, seller and other leads</small></div></div>
        <div className={styles.stat}><span className={styles.statIcon}><Eye size={19}/></span><div><p>Property page views</p><strong>{show(stats?.propertyViews)}</strong><small>Recorded website events</small></div></div>
        <div className={styles.stat}><span className={styles.statIcon}><CalendarDays size={19}/></span><div><p>Showing requests</p><strong>{show(stats?.showingRequests)}</strong><small>{show(stats?.confirmedShowings)} confirmed or completed</small></div></div>
        <div className={styles.stat}><span className={styles.statIcon}><CheckCircle2 size={19}/></span><div><p>Closed CRM leads</p><strong>{show(snapshot?.closed)}</strong><small>{pctLabel(snapshot ? percent(snapshot.closed, snapshot.total) : null)} of captured leads</small></div></div>
      </div>

      <div className={styles.mainGrid}>
        <section className={styles.panel} aria-label="Visual CRM lead funnel" aria-busy={loading}>
          <div className={styles.panelHeading}><div><h2>CRM funnel</h2><p>Contacts currently at or beyond each stage</p></div><span className={styles.liveLabel}><span/>Supabase totals</span></div>
          <div className={styles.funnelGraphic}>
            {snapshot?.rows.map((row, index) => <div className={styles.funnelRow} key={row.stage}>
              <div className={styles.funnelBand} style={{width: `${100 - index * 8}%`, '--band-strength': `${20 + index * 16}%`} as CSSProperties}>
                <span>{index === 0 ? 'Captured leads' : index === 3 ? 'Active' : row.stage === 'Under contract' ? 'Under contract' : `${row.stage}${row.stage === 'Closed' ? '' : '+'}`}</span>
                <strong>{numberFormat.format(index === 0 ? snapshot.total : row.reached)}</strong>
              </div>
              <span className={styles.funnelPercent} title="Share of captured leads">{pctLabel(index === 0 ? percent(snapshot.total, snapshot.total) : row.reachPct)}</span>
            </div>)}
            {loading && <p className={styles.muted}>Loading actual funnel numbers…</p>}
            {!loading && snapshot?.total === 0 && <p className={styles.muted}>No CRM leads found in this period.</p>}
          </div>
          <p className={styles.hint}>The funnel shape shows stage order, not proportional area. Counts are exact snapshots of CRM records. Lost leads appear in Captured only.</p>
        </section>

        <section className={styles.panel} aria-label="Lead funnel stage breakdown" aria-busy={loading}>
          <div className={styles.panelHeading}><div><h2>Stage breakdown</h2><p>Current status, progress and share of leads</p></div></div>
          <div className={styles.tableScroll}>
            <table className={styles.stageTable}>
              <thead><tr><th scope="col">Stage</th><th scope="col">At stage</th><th scope="col">At or beyond</th><th scope="col">Share</th></tr></thead>
              <tbody>
                {snapshot?.rows.map((row, index) => <tr key={row.stage}>
                  <th scope="row"><span className={styles.stageDot} style={{opacity: 1 - index * 0.09}}/>{row.stage}</th>
                  <td>{numberFormat.format(row.count)}</td>
                  <td>{numberFormat.format(index === 0 ? snapshot.total : row.reached)}</td>
                  <td>{pctLabel(row.reachPct)}</td>
                </tr>)}
                {snapshot && <tr className={styles.lostRow}><th scope="row">Lost</th><td>{numberFormat.format(snapshot.lost)}</td><td>—</td><td>{pctLabel(percent(snapshot.lost, snapshot.total))}</td></tr>}
              </tbody>
            </table>
            {loading && <p className={styles.muted}>Reading CRM stages…</p>}
          </div>
          <p className={styles.hint}>Share = at or beyond this stage ÷ captured leads. These are current-stage snapshots, not historical conversion rates.</p>
        </section>
      </div>

      <section className={styles.activityCard} aria-label="Website and showing activity">
        <div className={styles.activityHeading}><Activity size={18}/><div><h2>Property website activity</h2><p>Recorded engagement events; not matched to individual CRM contacts</p></div></div>
        <div className={styles.activityItems}>
          <div><Eye size={17}/><span>Page views</span><strong>{show(stats?.propertyViews)}</strong></div>
          <div><MousePointerClick size={17}/><span>Contact clicks</span><strong>{show(stats?.contactClicks)}</strong></div>
          <div><CalendarDays size={17}/><span>Showing requests</span><strong>{show(stats?.showingRequests)}</strong></div>
          <div><CheckCircle2 size={17}/><span>Confirmed/completed</span><strong>{show(stats?.confirmedShowings)}</strong></div>
        </div>
      </section>
      <p className={styles.footerNote}>Includes only records visible to your signed-in RealVolt account. For a selected date range, CRM leads are grouped by contact creation date, but stages reflect their current status. Page views can include bots or repeat visits. No Meta ad metrics or inferred offers are included. {updatedAt && <span>Refreshed {updatedAt.toLocaleTimeString('en-CA', {hour: 'numeric', minute: '2-digit'})}.</span>}</p>
    </>}
  </div>;
}
