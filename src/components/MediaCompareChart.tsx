"use client";

import React from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { formatMinutes } from "@/lib/format";
import type { MediaBreakdown } from "@/lib/types";

const LABEL: Record<string, string> = {
  image: "Image",
  "360": "360",
  video: "Video",
  unknown: "Unspecified",
};

/**
 * Per-media-type comparison (image / 360 / video). Parked on real data until
 * the media column is wired in schema-map; fully populated in demo mode.
 */
export default function MediaCompareChart({
  media,
}: {
  media: MediaBreakdown[];
}) {
  const data = media.map((m) => ({
    name: LABEL[m.mediaType] ?? m.mediaType,
    Tech: round(m.techAvgMinutes),
    AI: round(m.aiAvgMinutes),
    QC: round(m.qcAvgMinutes),
    count: m.deliveredCount,
  }));

  const onlyUnknown =
    media.length === 1 && media[0].mediaType === "unknown";

  return (
    <div className="card">
      <h2>
        Image · 360 · Video
        <span className="hint">avg stage time by media type (stacked)</span>
      </h2>
      {data.length === 0 ? (
        <div className="muted center" style={{ padding: 40 }}>
          No delivered VINs to compare.
        </div>
      ) : (
        <>
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
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="Tech" stackId="a" fill="#6366f1" />
              <Bar dataKey="AI" stackId="a" fill="#0ea5e9" />
              <Bar dataKey="QC" stackId="a" fill="#22c55e" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
          {onlyUnknown ? (
            <div className="muted" style={{ marginTop: 10 }}>
              Media type not yet wired — set <code>mediaTypeColumn</code> in
              schema-map.ts to split Image / 360 / Video on real data.
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

function round(v: number | null): number {
  return v == null ? 0 : Math.round(v);
}
