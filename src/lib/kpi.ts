// ============================================================================
//  Aggregation engine: turns a list of VinJourney into the full MetricsPayload
//  (KPIs, per-stage aggregates, daily trend, media breakdown, aging list).
// ============================================================================

import { isoDate, mean, percentile } from "./format";
import { STAGES, STAGE_LABEL } from "./stages";
import type {
  KpiSummary,
  MediaBreakdown,
  MediaType,
  QcDailyPoint,
  QcTracker,
  StageAggregate,
  StageKey,
  Stats,
  TrendPoint,
  VinJourney,
} from "./types";

export function computeStats(values: number[]): Stats {
  const xs = values.filter((v) => v != null && Number.isFinite(v) && v >= 0);
  return {
    count: xs.length,
    avg: mean(xs),
    median: percentile(xs, 50),
    p90: percentile(xs, 90),
    p95: percentile(xs, 95),
    min: xs.length ? Math.min(...xs) : null,
    max: xs.length ? Math.max(...xs) : null,
  };
}

/** Completed-stage minutes for a stage across all journeys. */
function completedStageMinutes(journeys: VinJourney[], key: StageKey): number[] {
  const out: number[] = [];
  for (const j of journeys) {
    const s = j.stages.find((x) => x.key === key);
    if (s && !s.inProgress && s.minutes != null) out.push(s.minutes);
  }
  return out;
}

export function computeStageAggregates(journeys: VinJourney[]): StageAggregate[] {
  // Average per stage used to compute contribution share.
  const avgByStage: Record<StageKey, number> = { tech: 0, ai: 0, qc: 0 };
  const partial: Record<StageKey, Stats> = {} as Record<StageKey, Stats>;

  for (const def of STAGES) {
    const stats = computeStats(completedStageMinutes(journeys, def.key));
    partial[def.key] = stats;
    avgByStage[def.key] = stats.avg ?? 0;
  }
  const totalAvg = STAGES.reduce((sum, d) => sum + (avgByStage[d.key] || 0), 0);

  return STAGES.map((def) => {
    const inProgress = journeys.filter(
      (j) => j.stages.find((s) => s.key === def.key)?.inProgress
    );
    return {
      key: def.key,
      label: def.label,
      stats: partial[def.key],
      inProgressCount: inProgress.length,
      agingCount: inProgress.filter((j) => j.isAging).length,
      contributionShare: totalAvg > 0 ? (avgByStage[def.key] || 0) / totalAvg : 0,
    };
  });
}

export function computeKpis(
  journeys: VinJourney[],
  stageAggs: StageAggregate[],
  now: Date
): KpiSummary {
  const delivered = journeys.filter((j) => j.status === "delivered");
  const inProgress = journeys.filter(
    (j) => j.status !== "delivered" && j.status !== "unknown"
  );
  const aging = journeys.filter((j) => j.isAging);

  const tat = computeStats(
    delivered.map((j) => j.totalTatMinutes).filter((v): v is number => v != null)
  );

  const slaEligible = delivered.filter((j) => j.withinSla != null);
  const slaCompliancePct = slaEligible.length
    ? slaEligible.filter((j) => j.withinSla).length / slaEligible.length
    : null;

  // Bottleneck = stage with the largest average contribution.
  let bottleneck: StageAggregate | null = null;
  for (const s of stageAggs) {
    if (!bottleneck || (s.stats.avg ?? 0) > (bottleneck.stats.avg ?? 0)) {
      bottleneck = s;
    }
  }

  const distinctVins = new Set(journeys.map((j) => j.vin)).size;
  const wow = weekOverWeek(delivered, now);

  return {
    totalSkus: journeys.length,
    distinctVins,
    deliveredCount: delivered.length,
    inProgressCount: inProgress.length,
    agingCount: aging.length,
    tat,
    slaCompliancePct,
    bottleneckStageKey: bottleneck ? bottleneck.key : null,
    bottleneckStageLabel: bottleneck ? bottleneck.label : null,
    ...wow,
  };
}

/**
 * QC Time Tracker (focused v1 view). Tracks QC turnaround (received -> QC done)
 * because the QC step itself (ai -> qc) is ~0 in the data. Median-led (the
 * mean is skewed by a stale-receive tail). 7-day daily series + improvement.
 */
export function computeQcTracker(journeys: VinJourney[], now: Date): QcTracker {
  const delivered = journeys.filter(
    (j) => j.status === "delivered" && j.totalTatMinutes != null && j.qcDoneAt
  );
  const metric = (j: VinJourney) => j.totalTatMinutes as number;
  const all = delivered.map(metric);

  const qcStep = delivered
    .map((j) => j.stages.find((s) => s.key === "qc" && !s.inProgress)?.minutes)
    .filter((v): v is number => v != null);

  // Bucket delivered SKUs by QC-completion date.
  const byDay = new Map<string, number[]>();
  for (const j of delivered) {
    const k = (j.qcDoneAt as string).slice(0, 10);
    const arr = byDay.get(k);
    if (arr) arr.push(metric(j));
    else byDay.set(k, [metric(j)]);
  }
  const dayVals = (k: string) => byDay.get(k) ?? [];

  // Last 7 calendar days ending today (UTC).
  const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const daily: QcDailyPoint[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today - i * 86400000);
    const k = d.toISOString().slice(0, 10);
    const xs = dayVals(k);
    daily.push({
      date: k,
      label: DOW[d.getUTCDay()],
      medianMinutes: percentile(xs, 50),
      avgMinutes: mean(xs),
      throughput: xs.length,
    });
  }

  const improvement = (lastVals: number[], prevVals: number[]) => {
    const a = percentile(lastVals, 50);
    const b = percentile(prevVals, 50);
    return a != null && b != null && b > 0 ? (b - a) / b : null;
  };
  const last = daily[daily.length - 1];
  const prev = daily[daily.length - 2];
  const improvementVsLastDayPct =
    last && prev ? improvement(dayVals(last.date), dayVals(prev.date)) : null;
  const last3 = daily.slice(-3).flatMap((p) => dayVals(p.date));
  const prior3 = daily.slice(-6, -3).flatMap((p) => dayVals(p.date));
  const improvementVs3DaysPct = improvement(last3, prior3);

  return {
    metricLabel: "QC turnaround (received → QC done)",
    totalSkus: journeys.length,
    throughputTotal: delivered.length,
    throughputPerDay: Math.round(
      daily.reduce((a, p) => a + p.throughput, 0) / (daily.length || 1)
    ),
    avgMinutes: mean(all),
    medianMinutes: percentile(all, 50),
    totalQcMinutes: all.reduce((a, b) => a + b, 0),
    qcStepAvgMinutes: mean(qcStep),
    daily,
    improvementVsLastDayPct,
    improvementVs3DaysPct,
  };
}

/** This-week vs last-week TAT + per-stage averages, relative to `now`. */
function weekOverWeek(delivered: VinJourney[], now: Date) {
  const t = now.getTime();
  const WK = 7 * 86400000;
  const stageMin = (j: VinJourney, key: StageKey) =>
    j.stages.find((s) => s.key === key && !s.inProgress)?.minutes ?? null;

  const inWindow = (j: VinJourney, lo: number, hi: number) => {
    if (!j.qcDoneAt) return false;
    const x = new Date(j.qcDoneAt).getTime();
    return x >= lo && x < hi;
  };

  const thisWeek = delivered.filter((j) => inWindow(j, t - WK, t + 86400000));
  const lastWeek = delivered.filter((j) => inWindow(j, t - 2 * WK, t - WK));

  const tatThisWeekAvg = mean(
    thisWeek.map((j) => j.totalTatMinutes).filter((v): v is number => v != null)
  );
  const tatLastWeekAvg = mean(
    lastWeek.map((j) => j.totalTatMinutes).filter((v): v is number => v != null)
  );
  const tatImprovementPct =
    tatThisWeekAvg != null && tatLastWeekAvg != null && tatLastWeekAvg > 0
      ? (tatLastWeekAvg - tatThisWeekAvg) / tatLastWeekAvg
      : null;

  const perStage = (list: VinJourney[]) =>
    ({
      tech: mean(list.map((j) => stageMin(j, "tech")).filter((v): v is number => v != null)),
      ai: mean(list.map((j) => stageMin(j, "ai")).filter((v): v is number => v != null)),
      qc: mean(list.map((j) => stageMin(j, "qc")).filter((v): v is number => v != null)),
    }) as Record<StageKey, number | null>;

  return {
    tatThisWeekAvg,
    tatLastWeekAvg,
    tatImprovementPct,
    deliveredThisWeek: thisWeek.length,
    deliveredLastWeek: lastWeek.length,
    stageThisWeekAvg: perStage(thisWeek),
    stageLastWeekAvg: perStage(lastWeek),
  };
}

export function computeTrend(journeys: VinJourney[]): TrendPoint[] {
  // Group delivered VINs by their delivery (qc) date.
  const byDate = new Map<string, VinJourney[]>();
  for (const j of journeys) {
    if (j.status !== "delivered" || !j.qcDoneAt) continue;
    const d = isoDate(j.qcDoneAt);
    const arr = byDate.get(d) ?? [];
    arr.push(j);
    byDate.set(d, arr);
  }

  const stageMin = (j: VinJourney, key: StageKey) =>
    j.stages.find((s) => s.key === key && !s.inProgress)?.minutes ?? null;

  return [...byDate.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([date, list]) => ({
      date,
      deliveredCount: list.length,
      avgTatMinutes: mean(
        list.map((j) => j.totalTatMinutes).filter((v): v is number => v != null)
      ),
      techAvgMinutes: mean(
        list.map((j) => stageMin(j, "tech")).filter((v): v is number => v != null)
      ),
      aiAvgMinutes: mean(
        list.map((j) => stageMin(j, "ai")).filter((v): v is number => v != null)
      ),
      qcAvgMinutes: mean(
        list.map((j) => stageMin(j, "qc")).filter((v): v is number => v != null)
      ),
    }));
}

export function computeMediaBreakdown(journeys: VinJourney[]): MediaBreakdown[] {
  const types: MediaType[] = ["image", "360", "video", "unknown"];
  const stageMin = (j: VinJourney, key: StageKey) =>
    j.stages.find((s) => s.key === key && !s.inProgress)?.minutes ?? null;

  return types
    .map((mt) => {
      const delivered = journeys.filter(
        (j) => j.mediaType === mt && j.status === "delivered"
      );
      return {
        mediaType: mt,
        deliveredCount: delivered.length,
        avgTatMinutes: mean(
          delivered.map((j) => j.totalTatMinutes).filter((v): v is number => v != null)
        ),
        techAvgMinutes: mean(
          delivered.map((j) => stageMin(j, "tech")).filter((v): v is number => v != null)
        ),
        aiAvgMinutes: mean(
          delivered.map((j) => stageMin(j, "ai")).filter((v): v is number => v != null)
        ),
        qcAvgMinutes: mean(
          delivered.map((j) => stageMin(j, "qc")).filter((v): v is number => v != null)
        ),
      };
    })
    .filter((m) => m.deliveredCount > 0);
}

/** In-progress VINs that have aged past threshold, worst (oldest) first. */
export function computeAging(journeys: VinJourney[], limit = 25): VinJourney[] {
  return journeys
    .filter((j) => j.isAging && j.ageInStageMinutes != null)
    .sort((a, b) => (b.ageInStageMinutes ?? 0) - (a.ageInStageMinutes ?? 0))
    .slice(0, limit);
}

/** Most recently delivered VINs, newest first. */
export function computeRecent(journeys: VinJourney[], limit = 25): VinJourney[] {
  return journeys
    .filter((j) => j.status === "delivered" && j.qcDoneAt)
    .sort((a, b) => (a.qcDoneAt! < b.qcDoneAt! ? 1 : -1))
    .slice(0, limit);
}

export { STAGE_LABEL };
