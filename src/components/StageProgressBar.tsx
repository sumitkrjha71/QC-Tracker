"use client";

import React from "react";

import { formatMinutes, formatPct } from "@/lib/format";
import type { StageAggregate } from "@/lib/types";

const COLORS: Record<string, string> = {
  tech: "#6366f1",
  ai: "#0ea5e9",
  qc: "#22c55e",
};

/**
 * The headline visual: a single bar split into stage segments whose WIDTHS are
 * proportional to each stage's average time. This is the "where does a VIN's
 * time go" picture, with the bottleneck visibly the widest segment.
 */
export default function StageProgressBar({
  stages,
  bottleneckKey,
}: {
  stages: StageAggregate[];
  bottleneckKey: string | null;
}) {
  const total = stages.reduce((sum, s) => sum + (s.stats.avg ?? 0), 0);

  return (
    <div className="card">
      <h2>
        Stage-wise journey
        <span className="hint">average time a VIN spends in each stage</span>
      </h2>

      <div className="progress">
        {stages.map((s) => {
          const avg = s.stats.avg ?? 0;
          const pct = total > 0 ? (avg / total) * 100 : 0;
          return (
            <div
              key={s.key}
              className="seg"
              style={{
                width: `${pct}%`,
                background: COLORS[s.key] ?? "#888",
              }}
              title={`${s.label}: ${formatMinutes(avg)} avg (${formatPct(
                s.contributionShare
              )} of journey)`}
            >
              {pct > 9 ? formatMinutes(avg) : ""}
            </div>
          );
        })}
      </div>

      <div className="legend">
        {stages.map((s) => (
          <div className="item" key={s.key}>
            <span
              className="dot"
              style={{ background: COLORS[s.key] ?? "#888" }}
            />
            <span>
              {s.label}{" "}
              <b>{formatMinutes(s.stats.avg)}</b>{" "}
              <span className="muted">({formatPct(s.contributionShare)})</span>
              {s.key === bottleneckKey ? (
                <span className="pill aging" style={{ marginLeft: 8 }}>
                  bottleneck
                </span>
              ) : null}
            </span>
          </div>
        ))}
      </div>

      <div className="bottleneck-banner">
        End-to-end average:&nbsp;<b style={{ color: "var(--text)" }}>
          {formatMinutes(total)}
        </b>
        &nbsp;· median P50 → P90 spread shown below
      </div>
    </div>
  );
}
