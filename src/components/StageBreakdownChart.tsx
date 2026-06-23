"use client";

import React from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { formatMinutes } from "@/lib/format";
import type { StageAggregate } from "@/lib/types";

const COLORS: Record<string, string> = {
  tech: "#6366f1",
  ai: "#0ea5e9",
  qc: "#22c55e",
};

export default function StageBreakdownChart({
  stages,
}: {
  stages: StageAggregate[];
}) {
  const data = stages.map((s) => ({
    name: s.label,
    key: s.key,
    avg: round(s.stats.avg),
    median: round(s.stats.median),
    p90: round(s.stats.p90),
  }));

  return (
    <div className="card">
      <h2>
        Per-stage turnaround
        <span className="hint">avg · median · P90 (minutes)</span>
      </h2>
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#243150" />
          <XAxis dataKey="name" tick={{ fill: "#9aa6c7", fontSize: 12 }} />
          <YAxis tick={{ fill: "#9aa6c7", fontSize: 12 }} />
          <Tooltip
            formatter={(v: number) => formatMinutes(v)}
            contentStyle={{ background: "#1b2540", border: "1px solid #243150" }}
            labelStyle={{ color: "#e6ecff" }}
          />
          <Legend wrapperStyle={{ fontSize: 12, color: "#9aa6c7" }} />
          <Bar dataKey="avg" name="Average" radius={[4, 4, 0, 0]}>
            {data.map((d) => (
              <Cell key={d.key} fill={COLORS[d.key] ?? "#888"} />
            ))}
          </Bar>
          <Bar dataKey="p90" name="P90" radius={[4, 4, 0, 0]} fillOpacity={0.45}>
            {data.map((d) => (
              <Cell key={d.key} fill={COLORS[d.key] ?? "#888"} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function round(v: number | null): number {
  return v == null ? 0 : Math.round(v);
}
