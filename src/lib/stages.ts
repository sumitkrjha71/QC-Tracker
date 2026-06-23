// ============================================================================
//  Stage definitions + per-VIN journey computation.
//  A "stage" is the interval between two consecutive junctures. Each stage's
//  END timestamp is the NEXT stage's START — exactly as specified.
// ============================================================================

import { diffMinutes } from "./format";
import type {
  JunctureKey,
  StageDuration,
  StageKey,
  VinJourney,
  VinJunctures,
  VinStatus,
} from "./types";

export interface StageDef {
  key: StageKey;
  label: string;
  /** Juncture that starts this stage. */
  from: JunctureKey;
  /** Juncture that ends this stage. */
  to: JunctureKey;
  /** Display color (also used by the progress bar + charts). */
  color: string;
}

/** Ordered stage definitions. Received is t0; QC end = Delivered. */
export const STAGES: StageDef[] = [
  { key: "tech", label: "Tech Processing", from: "receivedAt", to: "techDoneAt", color: "#6366f1" },
  { key: "ai", label: "AI Processing", from: "techDoneAt", to: "aiDoneAt", color: "#0ea5e9" },
  { key: "qc", label: "Quality Control", from: "aiDoneAt", to: "qcDoneAt", color: "#22c55e" },
];

export const STAGE_LABEL: Record<StageKey, string> = {
  tech: "Tech Processing",
  ai: "AI Processing",
  qc: "Quality Control",
};

/** Default aging thresholds (hours) per stage, overridable via env. */
export function agingThresholdsHours(): Record<StageKey, number> {
  const raw = (process.env.STAGE_AGING_THRESHOLDS_HOURS || "8,8,4")
    .split(",")
    .map((s) => Number(s.trim()));
  return {
    tech: Number.isFinite(raw[0]) ? raw[0] : 8,
    ai: Number.isFinite(raw[1]) ? raw[1] : 8,
    qc: Number.isFinite(raw[2]) ? raw[2] : 4,
  };
}

export function tatTargetHours(): number {
  const v = Number(process.env.TAT_TARGET_HOURS);
  return Number.isFinite(v) && v > 0 ? v : 24;
}

/**
 * Compute a full VinJourney (durations, status, aging, SLA) from raw junctures.
 * @param now reference time used to age in-progress VINs.
 */
export function computeJourney(
  j: VinJunctures,
  now: Date,
  thresholds: Record<StageKey, number>,
  tatTargetMin: number
): VinJourney {
  const nowIso = now.toISOString();
  const status = deriveStatus(j);

  const stages: StageDuration[] = STAGES.map((def) => {
    const start = j[def.from];
    const end = j[def.to];
    if (start && end) {
      return { key: def.key, label: def.label, minutes: diffMinutes(start, end), inProgress: false };
    }
    // Stage has started but not finished -> in progress (measure against now).
    if (start && !end && isCurrentStage(status, def.key)) {
      return {
        key: def.key,
        label: def.label,
        minutes: diffMinutes(start, nowIso),
        inProgress: true,
      };
    }
    return { key: def.key, label: def.label, minutes: null, inProgress: false };
  });

  const totalTatMinutes = diffMinutes(j.receivedAt, j.qcDoneAt);

  // Aging = time spent in the *current* in-progress stage.
  let ageInStageMinutes: number | null = null;
  let isAging = false;
  const currentStage = stages.find((s) => s.inProgress);
  if (currentStage && currentStage.minutes != null) {
    ageInStageMinutes = currentStage.minutes;
    const thresholdMin = thresholds[currentStage.key] * 60;
    isAging = ageInStageMinutes > thresholdMin;
  }

  const withinSla =
    totalTatMinutes == null ? null : totalTatMinutes <= tatTargetMin;

  return {
    ...j,
    status,
    currentStageLabel: statusLabel(status),
    stages,
    totalTatMinutes,
    ageInStageMinutes,
    isAging,
    withinSla,
  };
}

/** Lifecycle status from which junctures are present. */
export function deriveStatus(j: VinJunctures): VinStatus {
  if (j.qcDoneAt) return "delivered";
  if (j.aiDoneAt) return "in_qc";
  if (j.techDoneAt) return "in_ai";
  if (j.receivedAt) return "in_tech";
  return "unknown";
}

function isCurrentStage(status: VinStatus, key: StageKey): boolean {
  return (
    (status === "in_tech" && key === "tech") ||
    (status === "in_ai" && key === "ai") ||
    (status === "in_qc" && key === "qc")
  );
}

export function statusLabel(status: VinStatus): string {
  switch (status) {
    case "delivered":
      return "Delivered";
    case "in_qc":
      return "In QC";
    case "in_ai":
      return "In AI";
    case "in_tech":
      return "In Tech";
    default:
      return "Unknown";
  }
}
