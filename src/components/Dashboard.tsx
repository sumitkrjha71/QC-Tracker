"use client";

import React, { useCallback, useEffect, useState } from "react";

import { formatMinutes, formatPct } from "@/lib/format";
import type { MetricsPayload } from "@/lib/types";
import AgingTable from "./AgingTable";
import Filters, { RangeState } from "./Filters";
import KpiCard from "./KpiCard";
import MediaCompareChart from "./MediaCompareChart";
import StageBreakdownChart from "./StageBreakdownChart";
import StageProgressBar from "./StageProgressBar";
import TrendChart from "./TrendChart";
import VinTable from "./VinTable";

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Rolling last-30-days window, recomputed on every load (auto-advances daily). */
const WINDOW_DAYS = 30;
function defaultRange(): RangeState {
  const to = new Date();
  const from = new Date(to.getTime() - WINDOW_DAYS * 86400000);
  return { from: ymd(from), to: ymd(to) };
}

export default function Dashboard() {
  const [range, setRange] = useState<RangeState>(defaultRange);
  const [data, setData] = useState<MetricsPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (r: RangeState) => {
    setLoading(true);
    setError(null);
    try {
      // `to` is inclusive of the chosen day -> add a day for the half-open range.
      const toExclusive = new Date(new Date(r.to).getTime() + 86400000);
      const qs = new URLSearchParams({
        from: new Date(r.from).toISOString(),
        to: toExclusive.toISOString(),
      });
      const res = await fetch(`/api/metrics?${qs.toString()}`, {
        cache: "no-store",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `Request failed (${res.status})`);
      setData(json as MetricsPayload);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load metrics");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(range);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const kpis = data?.kpis;

  return (
    <div className="app">
      <div className="header">
        <div>
          <h1>VIN Delivery Tracker</h1>
          <div className="sub">
            Received → Tech → AI → QC · turnaround, aging &amp; bottleneck
            visibility
            {data ? (
              <span
                className={`badge ${data.source}`}
                style={{ marginLeft: 10 }}
              >
                {data.source === "mock" ? "demo data" : "metabase"}
              </span>
            ) : null}
          </div>
        </div>
        <Filters
          range={range}
          onChange={setRange}
          onRefresh={() => load(range)}
          loading={loading}
        />
      </div>

      {error ? (
        <div className="card error">
          Failed to load: {error}
          <div className="muted" style={{ marginTop: 8 }}>
            If you&apos;re on the Metabase source, confirm the table/column names
            in <code>src/lib/schema-map.ts</code> and your <code>.env.local</code>.
          </div>
        </div>
      ) : null}

      {!data && loading ? (
        <div className="card loading">Loading metrics…</div>
      ) : null}

      {data && kpis ? (
        <>
          {/* KPI row */}
          {(() => {
            const imp = improvement(kpis.tatImprovementPct);
            const bn = data.stages.find((s) => s.key === kpis.bottleneckStageKey);
            return (
              <div className="grid kpi-grid" style={{ marginBottom: 16 }}>
                <KpiCard
                  label="Avg TAT · this week"
                  value={formatMinutes(kpis.tatThisWeekAvg)}
                  sub={`last week ${formatMinutes(kpis.tatLastWeekAvg)} · 30-day ${formatMinutes(
                    kpis.tat.avg
                  )}`}
                />
                <KpiCard
                  label="Improvement vs last week"
                  value={imp.value}
                  sub={imp.sub}
                  tone={imp.tone}
                />
                <KpiCard
                  label={`Bottleneck · ${kpis.bottleneckStageLabel ?? "—"}`}
                  value={formatMinutes(bn?.stats.avg)}
                  sub={`${formatPct(bn?.contributionShare)} of journey time`}
                  tone="warn"
                />
                <KpiCard
                  label="SLA compliance"
                  value={formatPct(kpis.slaCompliancePct)}
                  sub={`target ${data.config.tatTargetHours}h`}
                  tone={slaTone(kpis.slaCompliancePct)}
                />
                <KpiCard
                  label="Aging / stuck"
                  value={String(kpis.agingCount)}
                  sub="past stage threshold"
                  tone={kpis.agingCount > 0 ? "danger" : "good"}
                />
                <KpiCard
                  label="Volume"
                  value={`${kpis.totalSkus}`}
                  sub={`${kpis.distinctVins} VINs · ${kpis.deliveredCount} delivered · ${kpis.deliveredThisWeek} this wk`}
                />
              </div>
            );
          })()}

          {/* Headline progress bar */}
          <div style={{ marginBottom: 16 }}>
            <StageProgressBar
              stages={data.stages}
              bottleneckKey={kpis.bottleneckStageKey}
            />
          </div>

          {/* Stage breakdown + trend */}
          <div className="grid cols-2" style={{ marginBottom: 16 }}>
            <TrendChart trend={data.trend} />
            <StageBreakdownChart stages={data.stages} />
          </div>

          <div className="grid cols-2" style={{ marginBottom: 16 }}>
            <MediaCompareChart media={data.mediaBreakdown} />
            <AgingTable rows={data.aging} />
          </div>

          <div className="section-title">Delivered VINs</div>
          <VinTable rows={data.recent} />

          <div className="muted" style={{ marginTop: 18 }}>
            Generated {new Date(data.generatedAt).toLocaleString()} · TAT target{" "}
            {data.config.tatTargetHours}h · aging thresholds (h) — tech{" "}
            {data.config.stageAgingThresholdsHours.tech}, ai{" "}
            {data.config.stageAgingThresholdsHours.ai}, qc{" "}
            {data.config.stageAgingThresholdsHours.qc}
          </div>
        </>
      ) : null}
    </div>
  );
}

function slaTone(pct: number | null): "good" | "warn" | "danger" | "default" {
  if (pct == null) return "default";
  if (pct >= 0.9) return "good";
  if (pct >= 0.7) return "warn";
  return "danger";
}

/** Format the week-over-week improvement: ▼ = faster (good), ▲ = slower (bad). */
function improvement(pct: number | null): {
  value: string;
  sub: string;
  tone: "good" | "danger" | "default";
} {
  if (pct == null)
    return { value: "—", sub: "needs 2 weeks of data", tone: "default" };
  const faster = pct >= 0;
  const mag = Math.abs(Math.round(pct * 100));
  return {
    value: `${faster ? "▼" : "▲"} ${mag}%`,
    sub: faster ? "faster than last week" : "slower than last week",
    tone: faster ? "good" : "danger",
  };
}
