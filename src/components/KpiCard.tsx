"use client";

import React from "react";

export type KpiTone = "default" | "good" | "warn" | "danger";

export default function KpiCard({
  label,
  value,
  sub,
  tone = "default",
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: KpiTone;
}) {
  const toneClass = tone === "default" ? "" : tone;
  return (
    <div className="card kpi">
      <span className="label">{label}</span>
      <span className={`value ${toneClass}`}>{value}</span>
      {sub ? <span className="delta">{sub}</span> : null}
    </div>
  );
}
