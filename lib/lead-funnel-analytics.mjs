/** Pure calculations for the RealVolt CRM funnel snapshot.
 * Counts represent current CRM stages, not audited stage-transition history.
 */
export const STAGE_ORDER = Object.freeze(['New', 'Contacted', 'Qualified', 'Active', 'Under contract', 'Closed']);

export function percent(numerator, denominator) {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) return null;
  return Math.round((numerator / denominator) * 1000) / 10;
}

export function buildStageSnapshot(stageCounts = {}) {
  const values = Object.fromEntries([...STAGE_ORDER, 'Lost'].map(stage => [stage, Math.max(0, Math.trunc(Number(stageCounts[stage] || 0)))]));
  const total = Object.values(values).reduce((sum, n) => sum + n, 0);
  const rows = STAGE_ORDER.map((stage, index) => {
    const reached = index === 0 ? total : STAGE_ORDER.slice(index).reduce((sum, key) => sum + values[key], 0);
    const previous = index <= 1 ? total : STAGE_ORDER.slice(index - 1).reduce((sum, key) => sum + values[key], 0);
    return {
      stage,
      count: values[stage],
      reached,
      reachPct: percent(reached, total),
      fromPriorPct: index === 0 ? null : percent(reached, previous),
    };
  });
  return {
    total,
    closed: values.Closed,
    qualifiedOrLater: rows.find(r => r.stage === 'Qualified')?.reached ?? 0,
    lost: values.Lost,
    rows,
  };
}
