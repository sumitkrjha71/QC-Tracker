"use client";

import React, { useEffect, useMemo, useState } from "react";

import type { QcProduct, QcProductData, QcDailyPoint, QcTrackerData } from "@/lib/qc";

const TABS: { key: QcProduct; label: string }[] = [
  { key: "image", label: "Image" },
  { key: "360", label: "360 Spin" },
  { key: "video", label: "Video" },
];

const SEG_LABEL: Record<string, string> = {
  all: "All segments",
  ent: "Enterprise",
  enterprise: "Enterprise",
  mid: "Mid-Market",
  resellers: "Resellers",
  reseller: "Resellers",
  smb: "SMB",
  embed: "Embed",
  unknown: "Unknown",
};
const segLabel = (s: string) => SEG_LABEL[s.toLowerCase()] || s;

export default function QcTracker() {
  const [data, setData] = useState<QcTrackerData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<QcProduct>("image");
  const [segment, setSegment] = useState("all");
  const [theme, setTheme] = useState<"dark" | "light">("dark");

  // theme init + persistence
  useEffect(() => {
    const saved = (localStorage.getItem("qc-theme") as "dark" | "light") || "dark";
    setTheme(saved);
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("qc-theme", theme);
  }, [theme]);

  // fetch (refetch when segment changes)
  useEffect(() => {
    let alive = true;
    setLoading(true);
    (async () => {
      try {
        const res = await fetch(`/api/qc?segment=${encodeURIComponent(segment)}`, { cache: "no-store" });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || `Request failed (${res.status})`);
        if (alive) setError(null);
        if (alive) setData(json as QcTrackerData);
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : "Failed to load");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [segment]);

  const product = data?.products?.[tab];
  const segOptions = data?.availableSegments?.length
    ? data.availableSegments
    : ["all", "enterprise", "smb", "embed"];

  return (
    <div className="app qc">
      <div className="header">
        <div>
          <h1>
            QC Time Tracker
            {data && (
              <span className={`badge ${data.source === "metabase" ? "live" : "demo"}`}>
                {data.source === "metabase" ? "live" : "not configured"}
              </span>
            )}
          </h1>
          <div className="sub">
            Quality-control turnaround by product · last 7 days
            {data?.asOf && <> · as of {data.asOf}</>}
          </div>
        </div>
        <div className="qc-controls">
          <label className="qc-seg">
            <span>Segment</span>
            <select value={segment} onChange={(e) => setSegment(e.target.value)}>
              {segOptions.map((s) => (
                <option key={s} value={s}>{segLabel(s)}</option>
              ))}
            </select>
          </label>
          <button
            className="qc-theme-btn"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            aria-label="Toggle theme"
            title={theme === "dark" ? "Switch to light" : "Switch to dark"}
          >
            {theme === "dark" ? "☀" : "☾"}
          </button>
        </div>
      </div>

      {/* tabs */}
      <div className="qc-tabs">
        {TABS.map((t) => (
          <button
            key={t.key}
            className={`qc-tab ${tab === t.key ? "active" : ""}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
            {data && !data.products[t.key].configured && <span className="qc-tab-dot" title="not connected" />}
          </button>
        ))}
      </div>

      {data && !data.hasSegmentColumn && segment === "all" && (
        <div className="qc-hint-bar">
          Segment filter is ready — it activates once the questions emit a <code>segment</code> column
          (Enterprise / SMB / Embed). See the query change in the chat.
        </div>
      )}

      {loading && <div className="qc-loading">Loading {segLabel(segment)}…</div>}
      {error && <div className="qc-error">⚠ {error}</div>}

      {data && product && (
        product.configured && product.daily.length ? (
          <ProductView product={product} name={TABS.find((t) => t.key === tab)!.label} />
        ) : (
          <div className="qc-note">
            <b>{TABS.find((t) => t.key === tab)!.label}</b> QC question isn&apos;t connected yet.
            {tab === "video"
              ? " Share the video QC question's public link and I'll wire this tab."
              : " Check the question's public sharing / env UUID."}
          </div>
        )
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
function ProductView({ product, name }: { product: QcProductData; name: string }) {
  const impDay = improvement(product.improvementVsLastDayPct);
  const imp3 = improvement(product.improvementVs3DaysPct);
  return (
    <>
      <div className="grid qc-kpis">
        <Kpi label={`Avg QC time · ${name}`} value={fmtHrs(product.avgHrs)} sub={`median ${fmtHrs(product.medianHrs)}`} accent />
        <div className={`qc-kpi improve ${impDay.cls}`}>
          <span className="qc-kpi-label">vs last day</span>
          <div className="qc-kpi-value">{impDay.text}</div>
          <span className="qc-kpi-sub">{impDay.sub}</span>
        </div>
        <div className={`qc-kpi improve ${imp3.cls}`}>
          <span className="qc-kpi-label">vs last 3 days</span>
          <div className="qc-kpi-value">{imp3.text}</div>
          <span className="qc-kpi-sub">{imp3.sub}</span>
        </div>
        <Kpi label="Throughput / day" value={fmtInt(product.throughputPerDay)} sub="SKUs clearing QC" />
        <Kpi label="QC'd (7 days)" value={fmtInt(product.throughputTotal)} sub="total SKUs" />
      </div>

      <div className="card qc-chart-card">
        <div className="qc-chart-head">
          <h2>Average QC time — last 7 days</h2>
          <div className="qc-legend">
            <span className="qc-leg"><i style={{ background: "var(--accent)" }} />Avg</span>
            <span className="qc-leg"><i style={{ background: "var(--text-faint)" }} />Median</span>
          </div>
        </div>
        <QcLineChart daily={product.daily} />
      </div>

      <div className="card qc-chart-card">
        <div className="qc-chart-head">
          <h2>Resolution time by day</h2>
          <BucketSummary t={product.totalBuckets} />
        </div>
        <GroupedBuckets daily={product.daily} />
      </div>

      <div className="card">
        <div className="qc-chart-head">
          <h2>Daily throughput</h2>
          <span className="hint">SKUs clearing QC each day</span>
        </div>
        <ThroughputBars daily={product.daily} />
      </div>
    </>
  );
}

function BucketSummary({ t }: { t: { under6: number; h6_12: number; over12: number } }) {
  const total = t.under6 + t.h6_12 + t.over12 || 1;
  const pct = (n: number) => `${Math.round((n / total) * 100)}%`;
  return (
    <div className="qc-legend">
      <span className="qc-leg"><i style={{ background: "var(--good)" }} />&lt;6h <b className="qc-leg-b">{pct(t.under6)}</b></span>
      <span className="qc-leg"><i style={{ background: "var(--warn)" }} />6–12h <b className="qc-leg-b">{pct(t.h6_12)}</b></span>
      <span className="qc-leg"><i style={{ background: "var(--danger)" }} />&gt;12h <b className="qc-leg-b">{pct(t.over12)}</b></span>
    </div>
  );
}

function Kpi({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div className={`qc-kpi ${accent ? "accent" : ""}`}>
      <span className="qc-kpi-label">{label}</span>
      <div className="qc-kpi-value">{value}</div>
      {sub && <span className="qc-kpi-sub">{sub}</span>}
    </div>
  );
}

function improvement(pct: number | null): { text: string; sub: string; cls: string } {
  if (pct == null) return { text: "—", sub: "needs 2 days", cls: "" };
  const faster = pct >= 0;
  return {
    text: `${faster ? "▼" : "▲"} ${Math.abs(Math.round(pct * 100))}%`,
    sub: faster ? "faster" : "slower",
    cls: faster ? "good" : "bad",
  };
}

/* ----- line chart: avg (primary) + median (secondary), with data labels ----- */
function QcLineChart({ daily }: { daily: QcDailyPoint[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 860, H = 300, PADL = 54, PADR = 16, PADT = 22, PADB = 34;
  const iw = W - PADL - PADR, ih = H - PADT - PADB;
  const series = useMemo(
    () => [
      { key: "avgHrs" as const, color: "var(--accent)", width: 2.8, label: true },
      { key: "medianHrs" as const, color: "var(--text-faint)", width: 1.6, label: false },
    ],
    []
  );
  const yMax = useMemo(() => {
    const all = daily.flatMap((d) => [d.avgHrs, d.medianHrs]).filter((v): v is number => v != null);
    return niceMax(Math.max(0.1, ...all));
  }, [daily]);
  const n = daily.length;
  const x = (i: number) => PADL + (n <= 1 ? iw / 2 : (iw * i) / (n - 1));
  const y = (v: number) => PADT + ih - (ih * v) / yMax;
  const grid = [0, 0.25, 0.5, 0.75, 1].map((f) => yMax * f);

  return (
    <div className="qc-chart-wrap">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" className="qc-svg" onMouseLeave={() => setHover(null)}>
        {grid.map((v, i) => (
          <g key={i}>
            <line x1={PADL} y1={y(v)} x2={W - PADR} y2={y(v)} className="qc-grid" />
            <text x={PADL - 8} y={y(v) + 4} className="qc-axis" textAnchor="end">{fmtHrsShort(v)}</text>
          </g>
        ))}
        {daily.map((d, i) => (
          <text key={i} x={x(i)} y={H - 12} className="qc-axis" textAnchor="middle">{d.label}</text>
        ))}
        {series.map((s) => {
          const pts = daily.map((d, i) => ({ i, v: d[s.key] })).filter((p) => p.v != null) as { i: number; v: number }[];
          if (!pts.length) return null;
          const path = pts.map((p, k) => `${k ? "L" : "M"}${x(p.i).toFixed(1)},${y(p.v).toFixed(1)}`).join(" ");
          return (
            <g key={s.key}>
              <path d={path} fill="none" stroke={s.color} strokeWidth={s.width} strokeLinejoin="round" strokeLinecap="round" />
              {pts.map((p) => (
                <circle key={p.i} cx={x(p.i)} cy={y(p.v)} r={hover === p.i ? 4.5 : 2.8} fill={s.color} />
              ))}
              {s.label &&
                pts.map((p) => (
                  <text key={`l${p.i}`} x={x(p.i)} y={y(p.v) - 9} className="qc-dlabel" textAnchor="middle">{fmtHrs(p.v)}</text>
                ))}
            </g>
          );
        })}
        {hover != null && <line x1={x(hover)} y1={PADT} x2={x(hover)} y2={PADT + ih} className="qc-guide" />}
        {daily.map((d, i) => (
          <rect key={i} x={x(i) - iw / (2 * Math.max(1, n - 1))} y={PADT} width={iw / Math.max(1, n - 1)} height={ih} fill="transparent" onMouseEnter={() => setHover(i)} />
        ))}
      </svg>
      {hover != null && daily[hover] && (
        <div className="qc-tooltip" style={{ left: `${(x(hover) / W) * 100}%` }}>
          <div className="qc-tt-day">{daily[hover].label} · {daily[hover].date.slice(5)}</div>
          <div className="qc-tt-row"><span>Avg</span><b>{fmtHrs(daily[hover].avgHrs)}</b></div>
          <div className="qc-tt-row"><span>Median</span><b>{fmtHrs(daily[hover].medianHrs)}</b></div>
          <div className="qc-tt-row"><span>Throughput</span><b>{fmtInt(daily[hover].throughput)}</b></div>
        </div>
      )}
    </div>
  );
}

function GroupedBuckets({ daily }: { daily: QcDailyPoint[] }) {
  const W = 860, H = 300, PADL = 46, PADR = 12, PADT = 24, PADB = 34;
  const iw = W - PADL - PADR, ih = H - PADT - PADB;
  const series: { key: keyof QcDailyPoint["buckets"]; color: string }[] = [
    { key: "under6", color: "var(--good)" },
    { key: "h6_12", color: "var(--warn)" },
    { key: "over12", color: "var(--danger)" },
  ];
  const max = Math.max(1, ...daily.flatMap((d) => series.map((s) => d.buckets[s.key])));
  const yMax = niceMax(max);
  const n = daily.length;
  const groupW = iw / Math.max(1, n);
  const barW = Math.min(20, (groupW * 0.7) / 3);
  const gap = barW * 0.18;
  const y = (v: number) => PADT + ih - (ih * v) / yMax;
  const grid = [0, 0.25, 0.5, 0.75, 1].map((f) => yMax * f);
  const empty = daily.every((d) => d.buckets.under6 + d.buckets.h6_12 + d.buckets.over12 === 0);

  if (empty)
    return <div className="qc-empty">Buckets populate once the question includes <code>under_6h / h6_12 / over_12h</code>.</div>;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" className="qc-svg">
      {grid.map((v, i) => (
        <g key={i}>
          <line x1={PADL} y1={y(v)} x2={W - PADR} y2={y(v)} className="qc-grid" />
          <text x={PADL - 8} y={y(v) + 4} className="qc-axis" textAnchor="end">{fmtCompact(v)}</text>
        </g>
      ))}
      {daily.map((d, gi) => {
        const center = PADL + groupW * (gi + 0.5);
        const totalW = 3 * barW + 2 * gap;
        const start = center - totalW / 2;
        return (
          <g key={d.date}>
            {series.map((s, si) => {
              const val = d.buckets[s.key];
              const xx = start + si * (barW + gap);
              const top = y(val);
              return (
                <g key={s.key}>
                  <rect x={xx} y={top} width={barW} height={Math.max(0, PADT + ih - top)} rx={3} fill={s.color} className="qc-gbar">
                    <title>{`${d.label} · ${s.key}: ${val}`}</title>
                  </rect>
                  {val > 0 && <text x={xx + barW / 2} y={top - 4} className="qc-blabel" textAnchor="middle">{fmtCompact(val)}</text>}
                </g>
              );
            })}
            <text x={center} y={H - 12} className="qc-axis" textAnchor="middle">{d.label}</text>
          </g>
        );
      })}
    </svg>
  );
}

function ThroughputBars({ daily }: { daily: QcDailyPoint[] }) {
  const max = Math.max(1, ...daily.map((d) => d.throughput));
  return (
    <div className="qc-bars">
      {daily.map((d) => (
        <div className="qc-bar-col" key={d.date} title={`${d.label}: ${fmtInt(d.throughput)} SKUs`}>
          <div className="qc-bar-track">
            <div className="qc-bar-fill" style={{ height: `${(d.throughput / max) * 100}%` }} />
          </div>
          <div className="qc-bar-val">{fmtInt(d.throughput)}</div>
          <div className="qc-bar-label">{d.label}</div>
        </div>
      ))}
    </div>
  );
}

/* ----- format helpers ----- */
function fmtInt(n: number | null | undefined): string {
  return n == null ? "—" : Math.round(n).toLocaleString("en-US");
}
function fmtCompact(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`;
  return `${Math.round(n)}`;
}
function fmtHrs(h: number | null | undefined): string {
  if (h == null) return "—";
  if (h < 1) return `${Math.round(h * 60)}m`;
  const hr = Math.floor(h);
  const mn = Math.round((h - hr) * 60);
  return mn ? `${hr}h ${mn}m` : `${hr}h`;
}
function fmtHrsShort(h: number): string {
  if (h < 1) return `${Math.round(h * 60)}m`;
  return `${h % 1 === 0 ? h : h.toFixed(1)}h`;
}
function niceMax(v: number): number {
  if (v <= 0) return 1;
  const pow = Math.pow(10, Math.floor(Math.log10(v)));
  const nn = v / pow;
  const step = nn <= 1 ? 1 : nn <= 2 ? 2 : nn <= 5 ? 5 : 10;
  return step * pow;
}
