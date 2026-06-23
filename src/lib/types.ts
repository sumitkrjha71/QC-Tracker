// ============================================================================
//  Shared domain types for the VIN delivery-time tracking framework.
// ============================================================================

/** Media category of a VIN's assets. Parked for now (kept for extensibility). */
export type MediaType = "image" | "360" | "video" | "unknown";

/** The four ordered junctures that bound a VIN's journey. */
export type JunctureKey = "receivedAt" | "techDoneAt" | "aiDoneAt" | "qcDoneAt";

/** A processing stage = the interval between two consecutive junctures. */
export type StageKey = "tech" | "ai" | "qc";

/** Lifecycle status derived from which junctures are present. */
export type VinStatus =
  | "in_tech"
  | "in_ai"
  | "in_qc"
  | "delivered"
  | "unknown";

/**
 * Raw per-VIN junctures exactly as pulled from the data source.
 * Every timestamp is an ISO-8601 string (UTC) or null if not yet reached.
 *
 * Juncture -> source column (see schema-map.ts):
 *   receivedAt  = inventory.CreatedAt        (VIN received)
 *   techDoneAt  = Ai_sku."Created On"        (tech processing done / AI start)
 *   aiDoneAt    = cadence_queue."Hotspot end"(AI processing done)
 *   qcDoneAt    = Ai_sku."Qc Time"           (QC done = Delivered)
 */
export interface VinJunctures {
  /** Human VIN string (medias.Vin) — falls back to dealerVinId if absent. */
  vin: string;
  /** The DealerVinMapping identity (UUID) this deliverable belongs to. */
  dealerVinId?: string | null;
  /** The media-type sku_id (deliverable identity). */
  skuId?: string | null;
  dealer?: string | null;
  mediaType: MediaType;
  receivedAt: string | null;
  techDoneAt: string | null;
  aiDoneAt: string | null;
  qcDoneAt: string | null;
}

/** Duration of a single stage for a single VIN (minutes), null if N/A. */
export interface StageDuration {
  key: StageKey;
  label: string;
  /** Minutes spent in this stage, or null if the stage hasn't completed. */
  minutes: number | null;
  /** True when the VIN is *currently* sitting in this stage (not finished). */
  inProgress: boolean;
}

/** A VIN with its computed per-stage durations and lifecycle state. */
export interface VinJourney extends VinJunctures {
  status: VinStatus;
  /** Human label for the stage the VIN is currently in (or "Delivered"). */
  currentStageLabel: string;
  stages: StageDuration[];
  /** End-to-end TAT in minutes (received -> qc). Null until delivered. */
  totalTatMinutes: number | null;
  /** For in-progress VINs: minutes since the last completed juncture. */
  ageInStageMinutes: number | null;
  /** True if the in-stage age exceeds that stage's aging threshold. */
  isAging: boolean;
  /** True if delivered within the TAT target. Null if not delivered. */
  withinSla: boolean | null;
}

/** Summary statistics over a set of numbers (minutes). */
export interface Stats {
  count: number;
  avg: number | null;
  median: number | null;
  p90: number | null;
  p95: number | null;
  min: number | null;
  max: number | null;
}

/** Aggregated metrics for one stage across many VINs. */
export interface StageAggregate {
  key: StageKey;
  label: string;
  /** Stats over completed instances of this stage. */
  stats: Stats;
  /** How many VINs are currently sitting in this stage. */
  inProgressCount: number;
  /** How many of those have aged past the threshold. */
  agingCount: number;
  /** Share of total end-to-end time attributable to this stage (0-1). */
  contributionShare: number;
}

/** One point on the daily trend line. */
export interface TrendPoint {
  /** ISO date (yyyy-mm-dd). */
  date: string;
  deliveredCount: number;
  avgTatMinutes: number | null;
  techAvgMinutes: number | null;
  aiAvgMinutes: number | null;
  qcAvgMinutes: number | null;
}

/** One day in the QC Time Tracker's 7-day series. */
export interface QcDailyPoint {
  date: string; // yyyy-mm-dd
  label: string; // weekday, e.g. "Mon"
  medianMinutes: number | null;
  avgMinutes: number | null;
  throughput: number; // SKUs that completed QC that day
}

/**
 * QC Time Tracker block. NOTE: in the live data the QC *step* (ai->qc) is ~0
 * (auto-QC), so the tracked "QC time" is the turnaround received -> QC done.
 */
export interface QcTracker {
  metricLabel: string;
  totalSkus: number; // all deliverables in window
  throughputTotal: number; // SKUs that have completed QC
  throughputPerDay: number; // avg over the 7-day series
  avgMinutes: number | null;
  medianMinutes: number | null;
  totalQcMinutes: number; // sum of the tracked metric
  qcStepAvgMinutes: number | null; // the ai->qc step (≈0) for transparency
  daily: QcDailyPoint[]; // last 7 days
  improvementVsLastDayPct: number | null; // + = faster (metric dropped)
  improvementVs3DaysPct: number | null;
}

/** Per-media-type comparison row (for the improvement-over-time view). */
export interface MediaBreakdown {
  mediaType: MediaType;
  deliveredCount: number;
  avgTatMinutes: number | null;
  techAvgMinutes: number | null;
  aiAvgMinutes: number | null;
  qcAvgMinutes: number | null;
}

/** Top-level KPI headline numbers. */
export interface KpiSummary {
  /** Total SKUs (work units) in the window. */
  totalSkus: number;
  /** Distinct parent VINs (dealer_vin_id) in the window. */
  distinctVins: number;
  deliveredCount: number;
  inProgressCount: number;
  agingCount: number;
  tat: Stats;
  slaCompliancePct: number | null;
  /** The stage that contributes the most average time. */
  bottleneckStageKey: StageKey | null;
  bottleneckStageLabel: string | null;
  /** Avg end-to-end TAT (minutes) for deliveries in the last 7 days. */
  tatThisWeekAvg: number | null;
  /** Avg end-to-end TAT (minutes) for deliveries in the prior 7 days. */
  tatLastWeekAvg: number | null;
  /** Fractional improvement vs last week: positive = faster (TAT dropped). */
  tatImprovementPct: number | null;
  deliveredThisWeek: number;
  deliveredLastWeek: number;
  /** Per-stage avg minutes for this week vs last week (for WoW deltas). */
  stageThisWeekAvg: Record<StageKey, number | null>;
  stageLastWeekAvg: Record<StageKey, number | null>;
}

/** The complete payload returned by /api/metrics. */
export interface MetricsPayload {
  generatedAt: string;
  source: "mock" | "metabase";
  range: { from: string; to: string };
  config: {
    tatTargetHours: number;
    stageAgingThresholdsHours: Record<StageKey, number>;
  };
  kpis: KpiSummary;
  /** QC Time Tracker block (the focused first-version view). */
  qc: QcTracker;
  stages: StageAggregate[];
  trend: TrendPoint[];
  mediaBreakdown: MediaBreakdown[];
  /** VINs currently aging/stuck, worst first. */
  aging: VinJourney[];
  /** Recently delivered VINs (sample), newest first. */
  recent: VinJourney[];
}
