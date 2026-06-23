// ============================================================================
//  GET /api/metrics?from=ISO&to=ISO
//  Single round-trip: fetch per-VIN junctures -> compute everything -> payload.
// ============================================================================

import { NextRequest, NextResponse } from "next/server";

import { fetchJunctures } from "@/lib/metabase";
import {
  computeAging,
  computeKpis,
  computeMediaBreakdown,
  computeQcTracker,
  computeRecent,
  computeStageAggregates,
  computeTrend,
} from "@/lib/kpi";
import {
  agingThresholdsHours,
  computeJourney,
  tatTargetHours,
} from "@/lib/stages";
import type { MetricsPayload } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const now = new Date();
    const { from, to } = parseRange(req, now);

    const { rows, source } = await fetchJunctures(from, to, now);

    // The Metabase card returns the rolling 30-day window; narrow to the
    // requested [from, to) here so the dashboard's date pickers still work.
    const fromMs = from.getTime();
    const toMs = to.getTime();
    const windowed = rows.filter((r) => {
      if (!r.receivedAt) return false;
      const x = new Date(r.receivedAt).getTime();
      return !Number.isNaN(x) && x >= fromMs && x < toMs;
    });

    const thresholds = agingThresholdsHours();
    const tatTargetMin = tatTargetHours() * 60;
    const journeys = windowed.map((r) =>
      computeJourney(r, now, thresholds, tatTargetMin)
    );

    const stages = computeStageAggregates(journeys);
    const kpis = computeKpis(journeys, stages, now);
    const qc = computeQcTracker(journeys, now);

    const payload: MetricsPayload = {
      generatedAt: now.toISOString(),
      source,
      range: { from: from.toISOString(), to: to.toISOString() },
      config: {
        tatTargetHours: tatTargetHours(),
        stageAgingThresholdsHours: thresholds,
      },
      kpis,
      qc,
      stages,
      trend: computeTrend(journeys),
      mediaBreakdown: computeMediaBreakdown(journeys),
      aging: computeAging(journeys),
      recent: computeRecent(journeys),
    };

    return NextResponse.json(payload);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}

/** Parse from/to query params; default to the last 14 days. */
function parseRange(req: NextRequest, now: Date): { from: Date; to: Date } {
  const sp = req.nextUrl.searchParams;
  const toParam = sp.get("to");
  const fromParam = sp.get("from");

  // Default window = rolling last 30 days (auto-advances each day it's fetched).
  const to = toParam ? new Date(toParam) : new Date(now.getTime() + 86_400_000);
  const defaultFrom = new Date(to.getTime() - 30 * 86400000);
  const from = fromParam ? new Date(fromParam) : defaultFrom;

  // Guard against invalid input.
  const safeTo = Number.isNaN(to.getTime()) ? new Date(now) : to;
  const safeFrom = Number.isNaN(from.getTime()) ? defaultFrom : from;
  return { from: safeFrom, to: safeTo };
}
