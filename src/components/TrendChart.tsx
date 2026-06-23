"use client";

import React from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { formatMinutes } from "@/lib/format";
import type { TrendPoint } from "@/lib/types";

/**
 * Daily trend of end-to-end TAT and per-stage averages. A downward slope is
 * the "improvement over time" signal the dashboard is meant to surface.
 */
export default function TrendChart({ trend }: { trend: TrendPoint[] }) {
  const data = trend.map((t) => ({
    date: t.date.slice(5), // mm-dd
    TAT: round(t.avgTatMinutes),
    Tech: round(t.techAvgMinutes),
    AI: round(t.aiAvgMinutes),
    QC: round(t.qcAvgMinutes),
    delivered: t.deliveredCount,
  }));

  return (
    <div className="card">
      <h2>
        Delivery TAT over time
        <span className="hint">avg minutes per day — lower is better</span>
      </h2>
      {data.length === 0 ? (
        <div className="muted center" style={{ padding: 40 }}>
          No delivered VINs in this window.
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#243150" />
            <XAxis dataKey="date" tick={{ fill: "#9aa6c7", fontSize: 12 }} />
            <YAxis tick={{ fill: "#9aa6c7", fontSize: 12 }} />
            <Tooltip
              formatter={(v: number) => formatMinutes(v)}
              contentStyle={{ background: "#1b2540", border: "1px solid #243150" }}
              labelStyle={{ color: "#e6ecff" }}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Line
              type="monotone"
              dataKey="TAT"
              stroke="#e6ecff"
              strokeWidth={2.5}
              dot={false}
            />
            <Line type="monotone" dataKey="Tech" stroke="#6366f1" strokeWidth={1.5} dot={false} />
            <Line type="monotone" dataKey="AI" stroke="#0ea5e9" strokeWidth={1.5} dot={false} />
            <Line type="monotone" dataKey="QC" stroke="#22c55e" strokeWidth={1.5} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

function round(v: number | null): number | null {
  return v == null ? null : Math.round(v);
}
