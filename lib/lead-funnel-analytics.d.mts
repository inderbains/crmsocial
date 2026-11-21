export const STAGE_ORDER: readonly ['New', 'Contacted', 'Qualified', 'Active', 'Under contract', 'Closed'];
export type FunnelStage = typeof STAGE_ORDER[number];
export type StageCounts = Partial<Record<FunnelStage | 'Lost', number>>;
export function percent(numerator: number, denominator: number): number | null;
export function buildStageSnapshot(stageCounts?: StageCounts): {
  total: number;
  closed: number;
  qualifiedOrLater: number;
  lost: number;
  rows: Array<{
    stage: FunnelStage;
    count: number;
    reached: number;
    reachPct: number | null;
    fromPriorPct: number | null;
  }>;
};
