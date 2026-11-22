/** RealVolt agent production: counts actual firm sales, not accepted offers or scheduled closings. */
export type PerformancePeriod = 'month' | 'year' | 'all';
export type PerformanceDeal = {
  id: string;
  user_id?: string | null;
  brokerage_id?: string | null;
  kind?: string | null;
  review_status?: string | null;
  rv_stage?: string | null;
  rv_firm_date?: string | null;
  rv_completed_date?: string | null;
  listing_date?: string | null;
  created_at?: string | null;
  sale_price?: number | string | null;
};
export type PerformanceAllocation = {
  deal_id: string;
  commission_before_gst?: number | string | null;
};
export type PerformancePayout = {
  id?: string;
  deal_id: string;
  profile_id?: string | null;
  status?: string | null;
  net?: number | string | null;
  paid_date?: string | null;
  created_at?: string | null;
};
export type AgentPerformance = {
  listings: number;
  firmSales: number;
  completedSales: number;
  volumeCents: number;
  earnedCents: number;
  paidCents: number;
  authorizedUnpaidCents: number;
  missingAllocations: number;
};

function inWindow(value: string | null | undefined, period: PerformancePeriod, today: string): boolean {
  if (!value || value.slice(0, 10) > today) return false;
  if (period === 'month') return value.slice(0, 7) === today.slice(0, 7);
  if (period === 'year') return value.slice(0, 4) === today.slice(0, 4);
  return true;
}
function cashCents(value: unknown): number {
  const n = Number(value || 0);
  return Number.isFinite(n) ? Math.round((n + Number.EPSILON) * 100) : 0;
}
/** All rows are already restricted to the agent and brokerage by the calling view/RLS. */
export function calculateAgentPerformance(
  deals: PerformanceDeal[],
  allocations: PerformanceAllocation[],
  payouts: PerformancePayout[],
  period: PerformancePeriod,
  today: string,
): AgentPerformance {
  const unique = [...new Map(deals.map(d => [d.id, d])).values()];
  const ownDealIds = new Set(unique.map(d => d.id));
  const allocationsByDeal = new Map(allocations.filter(a => ownDealIds.has(a.deal_id)).map(a => [a.deal_id, a]));
  const listings = unique.filter(d => d.kind === 'Listing' && inWindow(d.listing_date || d.created_at, period, today));
  const firm = unique.filter(d =>
    d.kind === 'Sale' && ['Sold', 'Completed', 'Archived'].includes(d.rv_stage || '') &&
    inWindow(d.rv_firm_date, period, today)
  );
  // Earned means legally completed, approved and an agent allocation exists. It does NOT imply funds received.
  const completed = unique.filter(d =>
    d.kind === 'Sale' && d.review_status === 'Approved' &&
    ['Completed', 'Archived'].includes(d.rv_stage || '') &&
    inWindow(d.rv_completed_date, period, today)
  );
  const validPayouts = payouts.filter(p => ownDealIds.has(p.deal_id));
  return {
    listings: listings.length,
    firmSales: firm.length,
    completedSales: completed.length,
    volumeCents: firm.reduce((v, d) => v + cashCents(d.sale_price), 0),
    earnedCents: completed.reduce((v, d) => v + cashCents(allocationsByDeal.get(d.id)?.commission_before_gst), 0),
    missingAllocations: completed.filter(d => !allocationsByDeal.has(d.id)).length,
    paidCents: validPayouts.filter(p => p.status === 'Paid' && inWindow(p.paid_date || p.created_at, period, today)).reduce((v, p) => v + cashCents(p.net), 0),
    authorizedUnpaidCents: validPayouts.filter(p => p.status === 'Authorized' && inWindow(p.created_at, period, today)).reduce((v, p) => v + cashCents(p.net), 0),
  };
}
