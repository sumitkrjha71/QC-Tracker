"use client";

import React, { useEffect, useMemo, useState } from "react";

import type { QcProduct, QcProductData, QcDailyPoint, QcTrackerData } from "@/lib/qc";

const TABS: { key: QcProduct; label: string }[] = [
  { key: "image", label: "Image" },
  { key: "360", label: "360 Spin" },
  { key: "video", label: "Video" },
];

const SEG_LABEL: Record<string, string> = {
  all: "All segments", ent: "Enterprise", enterprise: "Enterprise", mid: "Mid-Market",
  resellers: "Resellers", reseller: "Resellers", smb: "SMB", embed: "Embed", unknown: "Unknown",
};
const segLabel = (s: string) => SEG_LABEL[s.toLowerCase()] || s;

type View = "7d" | "7dcmp" | "mtd";
const VIEW_OPTS: { key: View; label: string }[] = [
  { key: "7d", label: "Last 7 days" },
  { key: "7dcmp", label: "7d vs prev" },
  { key: "mtd", label: "Month-to-date" },
];

export default function QcTracker() {
  const [data, setData] = useState<QcTrackerData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<QcProduct>("image");
  const [segment, setSegment] = useState("all");
  const [theme, setTheme] = useState<"dark" | "light">("dark");

  useEffect(() => {
    setTheme((localStorage.getItem("qc-theme") as "dark" | "light") || "dark");
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("qc-theme", theme);
  }, [theme]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    (async () => {
      try {
        const res = await fetch(`/api/qc?segment=${encodeURIComponent(segment)}`, { cache: "no-store" });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || `Request failed (${res.status})`);
        if (alive) { setError(null); setData(json as QcTrackerData); }
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : "Failed to load");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [segment]);

  const product = data?.products?.[tab];
  const segOptions = data?.availableSegments?.length ? data.availableSegments : ["all"];

  return (
    <div className="app qc">
      <div className="header">
        <div>
          <h1>
            QC Time Tracker
            {data && <span className={`badge ${data.source === "metabase" ? "live" : "demo"}`}>{data.source === "metabase" ? "live" : "not configured"}</span>}
          </h1>
          <div className="sub">Quality-control turnaround by product{data?.asOf && <> · as of {data.asOf}</>}</div>
        </div>
        <div className="qc-controls">
          <label className="qc-seg">
            <span>Segment</span>
            <select value={segment} onChange={(e) => setSegment(e.target.value)}>
              {segOptions.map((s) => <option key={s} value={s}>{segLabel(s)}</option>)}
            </select>
          </label>
          <button className="qc-theme-btn" onClick={() => setTheme(theme === "dark" ? "light" : "dark")} aria-label="Toggle theme">
            {theme === "dark" ? "☀" : "☾"}
          </button>
        </div>
      </div>

      <div className="qc-tabs">
        {TABS.map((t) => (
          <button key={t.key} className={`qc-tab ${tab === t.key ? "active" : ""}`} onClick={() => setTab(t.key)}>
            {t.label}{data && !data.products[t.key].configured && <span className="qc-tab-dot" title="not connected" />}
          </button>
        ))}
      </div>

      {loading && <div className="qc-loading">Loading {segLabel(segment)}…</div>}
      {error && <div className="qc-error">⚠ {error}</div>}

      {data && product && (
        product.configured && product.daily.length ? (
          <ProductView product={product} asOf={data.asOf!} name={TABS.find((t) => t.key === tab)!.label} />
        ) : (
          <div className="qc-note">
            <b>{TABS.find((t) => t.key === tab)!.label}</b> QC question isn&apos;t connected yet.
            {tab === "video" ? " Share the video QC question's public link and I'll wire this tab." : " Check the question's public sharing / env UUID."}
          </div>
        )
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
function ProductView({ product, asOf, name }: { product: QcProductData; asOf: string; name: string }) {
  const daily = product.daily;
  // KPIs from the last 7 days + today/yesterday
  const k = useMemo(() => {
    const v = buildView(daily, "7d", asOf);
    const cur = v.current.filter(Boolean) as QcDailyPoint[];
    const wAvg = (sel: (p: QcDailyPoint) => number | null) => {
      let n = 0, d = 0;
      for (const p of cur) { const x = sel(p); if (x != null) { n += x * p.throughput; d += p.throughput; } }
      return d > 0 ? n / d : null;
    };
    const today = v.current[6];
    const yest = v.current[5];
    const tThr = today?.throughput ?? null;
    const yThr = yest?.throughput ?? null;
    const delta = tThr != null && yThr != null && yThr > 0 ? (tThr - yThr) / yThr : null;
    return {
      avgHrs: wAvg((p) => p.avgHrs),
      medianHrs: wAvg((p) => p.medianHrs),
      weeklyQcd: cur.reduce((a, p) => a + p.throughput, 0),
      todayThr: tThr,
      delta,
    };
  }, [daily, asOf]);

  return (
    <>
      <div className="grid qc-kpis">
        <Kpi label={`Avg QC time · ${name}`} value={fmtHrs(k.avgHrs)} sub="weighted, last 7 days" accent />
        <Kpi label="Median QC time" value={fmtHrs(k.medianHrs)} sub="last 7 days" />
        <ThroughputKpi today={k.todayThr} delta={k.delta} />
        <Kpi label="Weekly QC'd" value={fmtInt(k.weeklyQcd)} sub="SKUs · last 7 days" />
      </div>

      <ChartCard title={`Average QC time — ${name}`} daily={daily} asOf={asOf} kind="line" />
      <ChartCard title="Resolution time buckets" daily={daily} asOf={asOf} kind="buckets" />
      <ChartCard title="Throughput" daily={daily} asOf={asOf} kind="throughput" />
    </>
  );
}

function ThroughputKpi({ today, delta }: { today: number | null; delta: number | null }) {
  const up = delta != null && delta >= 0;
  return (
    <div className="qc-kpi">
      <span className="qc-kpi-label">Throughput · today</span>
      <div className="qc-kpi-value">{fmtInt(today)}</div>
      <span className="qc-kpi-sub">
        {delta == null ? "vs yesterday —" : (
          <span className={up ? "qc-up" : "qc-down"}>{up ? "▲" : "▼"} {Math.abs(Math.round(delta * 100))}% vs yesterday</span>
        )}
      </span>
    </div>
  );
}

/* ----- a chart card with its own view toggle ----- */
function ChartCard({ title, daily, asOf, kind }: { title: string; daily: QcDailyPoint[]; asOf: string; kind: "line" | "buckets" | "throughput" }) {
  const [view, setView] = useState<View>("7d");
  const v = useMemo(() => buildView(daily, view, asOf), [daily, view, asOf]);
  return (
    <div className="card qc-chart-card">
      <div className="qc-chart-head">
        <h2>{title}</h2>
        <div className="qc-viewtoggle">
          {VIEW_OPTS.map((o) => (
            <button key={o.key} className={`qc-vbtn ${view === o.key ? "active" : ""}`} onClick={() => setView(o.key)}>{o.label}</button>
          ))}
        </div>
      </div>
      {v.previous && (
        <div className="qc-legend qc-cmp-legend">
          <span className="qc-leg"><i style={{ background: "var(--accent)" }} />{v.curLabel}</span>
          <span className="qc-leg"><i style={{ background: "var(--text-faint)" }} />{v.prevLabel}</span>
        </div>
      )}
      {kind === "buckets" && !v.previous && (
        <div className="qc-legend" style={{ marginBottom: 8 }}>
          <span className="qc-leg"><i style={{ background: "var(--good)" }} />&lt;6h</span>
          <span className="qc-leg"><i style={{ background: "var(--warn)" }} />6–12h</span>
          <span className="qc-leg"><i style={{ background: "var(--danger)" }} />&gt;12h</span>
        </div>
      )}
      {kind === "line" && <LineView v={v} accessor={(p) => p.avgHrs} unit="hrs" />}
      {kind === "throughput" && <BarsView v={v} accessor={(p) => p.throughput} />}
      {kind === "buckets" && <BucketsView v={v} />}
    </div>
  );
}

/* ----- views model ----- */
interface ViewModel {
  slots: { key: string; label: string }[];
  current: (QcDailyPoint | null)[];
  previous: (QcDailyPoint | null)[] | null;
  curLabel: string;
  prevLabel: string | null;
}
const DAY = 86400000;
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const parseUTC = (d: string) => new Date(`${d}T00:00:00Z`).getTime();
const toDate = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const monShort = (ms: number) => new Date(ms).toLocaleString("en-US", { month: "short", timeZone: "UTC" });

function buildView(daily: QcDailyPoint[], view: View, asOf: string): ViewModel {
  const map = new Map(daily.map((p) => [p.date, p]));
  const anchor = parseUTC(asOf);
  if (view === "7d" || view === "7dcmp") {
    const slots: ViewModel["slots"] = [];
    const current: (QcDailyPoint | null)[] = [];
    const previous: (QcDailyPoint | null)[] = [];
    for (let i = 6; i >= 0; i--) {
      const ms = anchor - i * DAY;
      slots.push({ key: toDate(ms), label: DOW[new Date(ms).getUTCDay()] });
      current.push(map.get(toDate(ms)) || null);
      previous.push(map.get(toDate(ms - 7 * DAY)) || null);
    }
    return view === "7d"
      ? { slots, current, previous: null, curLabel: "Last 7 days", prevLabel: null }
      : { slots, current, previous, curLabel: "This week", prevLabel: "Prev week" };
  }
  // month-to-date vs last month
  const a = new Date(anchor);
  const y = a.getUTCFullYear(), m = a.getUTCMonth(), dom = a.getUTCDate();
  const slots: ViewModel["slots"] = [];
  const current: (QcDailyPoint | null)[] = [];
  const previous: (QcDailyPoint | null)[] = [];
  for (let day = 1; day <= dom; day++) {
    slots.push({ key: String(day), label: String(day) });
    current.push(map.get(toDate(Date.UTC(y, m, day))) || null);
    const pms = Date.UTC(y, m - 1, day);
    previous.push(new Date(pms).getUTCDate() === day ? map.get(toDate(pms)) || null : null);
  }
  return { slots, current, previous, curLabel: monShort(Date.UTC(y, m, 1)), prevLabel: monShort(Date.UTC(y, m - 1, 1)) };
}

/* ----- line view (avg QC) ----- */
function LineView({ v, accessor }: { v: ViewModel; accessor: (p: QcDailyPoint) => number | null; unit: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 860, H = 300, PADL = 54, PADR = 16, PADT = 22, PADB = 34;
  const iw = W - PADL - PADR, ih = H - PADT - PADB;
  const val = (p: QcDailyPoint | null) => (p ? accessor(p) : null);
  const allVals = [...v.current, ...(v.previous || [])].map(val).filter((x): x is number => x != null);
  const yMax = niceMax(Math.max(0.1, ...allVals));
  const n = v.slots.length;
  const x = (i: number) => PADL + (n <= 1 ? iw / 2 : (iw * i) / (n - 1));
  const y = (vv: number) => PADT + ih - (ih * vv) / yMax;
  const grid = [0, 0.25, 0.5, 0.75, 1].map((f) => yMax * f);
  const series = [
    { arr: v.current, color: "var(--accent)", width: 2.8, label: true },
    ...(v.previous ? [{ arr: v.previous, color: "var(--text-faint)", width: 1.6, label: false }] : []),
  ];
  const showXLabel = (i: number) => n <= 12 || i % Math.ceil(n / 12) === 0 || i === n - 1;

  return (
    <div className="qc-chart-wrap">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" className="qc-svg" onMouseLeave={() => setHover(null)}>
        {grid.map((g, i) => (
          <g key={i}><line x1={PADL} y1={y(g)} x2={W - PADR} y2={y(g)} className="qc-grid" />
            <text x={PADL - 8} y={y(g) + 4} className="qc-axis" textAnchor="end">{fmtHrsShort(g)}</text></g>
        ))}
        {v.slots.map((s, i) => showXLabel(i) && <text key={i} x={x(i)} y={H - 12} className="qc-axis" textAnchor="middle">{s.label}</text>)}
        {series.map((s, si) => {
          const pts = s.arr.map((p, i) => ({ i, vv: val(p) })).filter((p) => p.vv != null) as { i: number; vv: number }[];
          if (!pts.length) return null;
          const path = pts.map((p, k) => `${k ? "L" : "M"}${x(p.i).toFixed(1)},${y(p.vv).toFixed(1)}`).join(" ");
          return (
            <g key={si}>
              <path d={path} fill="none" stroke={s.color} strokeWidth={s.width} strokeLinejoin="round" strokeLinecap="round" />
              {pts.map((p) => <circle key={p.i} cx={x(p.i)} cy={y(p.vv)} r={hover === p.i ? 4.5 : 2.6} fill={s.color} />)}
              {s.label && n <= 14 && pts.map((p) => <text key={p.i} x={x(p.i)} y={y(p.vv) - 9} className="qc-dlabel" textAnchor="middle">{fmtHrs(p.vv)}</text>)}
            </g>
          );
        })}
        {hover != null && <line x1={x(hover)} y1={PADT} x2={x(hover)} y2={PADT + ih} className="qc-guide" />}
        {v.slots.map((_, i) => <rect key={i} x={x(i) - iw / (2 * Math.max(1, n - 1))} y={PADT} width={iw / Math.max(1, n - 1)} height={ih} fill="transparent" onMouseEnter={() => setHover(i)} />)}
      </svg>
      {hover != null && v.current[hover] && (
        <div className="qc-tooltip" style={{ left: `${(x(hover) / W) * 100}%` }}>
          <div className="qc-tt-day">{v.slots[hover].label}</div>
          <div className="qc-tt-row"><span>{v.curLabel}</span><b>{fmtHrs(val(v.current[hover]))}</b></div>
          {v.previous && <div className="qc-tt-row"><span>{v.prevLabel}</span><b>{fmtHrs(val(v.previous[hover]))}</b></div>}
        </div>
      )}
    </div>
  );
}

/* ----- bars view (throughput) ----- */
function BarsView({ v, accessor }: { v: ViewModel; accessor: (p: QcDailyPoint) => number }) {
  const W = 860, H = 280, PADL = 46, PADR = 12, PADT = 22, PADB = 34;
  const iw = W - PADL - PADR, ih = H - PADT - PADB;
  const cmp = !!v.previous;
  const val = (p: QcDailyPoint | null) => (p ? accessor(p) : 0);
  const allVals = [...v.current, ...(v.previous || [])].map(val);
  const yMax = niceMax(Math.max(1, ...allVals));
  const n = v.slots.length;
  const groupW = iw / Math.max(1, n);
  const barW = Math.min(cmp ? 14 : 26, (groupW * 0.72) / (cmp ? 2 : 1));
  const gap = cmp ? barW * 0.2 : 0;
  const y = (vv: number) => PADT + ih - (ih * vv) / yMax;
  const grid = [0, 0.5, 1].map((f) => yMax * f);
  const showXLabel = (i: number) => n <= 12 || i % Math.ceil(n / 12) === 0 || i === n - 1;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" className="qc-svg">
      {grid.map((g, i) => (
        <g key={i}><line x1={PADL} y1={y(g)} x2={W - PADR} y2={y(g)} className="qc-grid" />
          <text x={PADL - 8} y={y(g) + 4} className="qc-axis" textAnchor="end">{fmtCompact(g)}</text></g>
      ))}
      {v.slots.map((s, gi) => {
        const center = PADL + groupW * (gi + 0.5);
        const bars = cmp
          ? [{ vv: val(v.current[gi]), color: "var(--accent)" }, { vv: val(v.previous![gi]), color: "var(--text-faint)" }]
          : [{ vv: val(v.current[gi]), color: "var(--accent)" }];
        const totalW = bars.length * barW + (bars.length - 1) * gap;
        const start = center - totalW / 2;
        return (
          <g key={s.key}>
            {bars.map((b, bi) => {
              const xx = start + bi * (barW + gap), top = y(b.vv);
              return (
                <g key={bi}>
                  <rect x={xx} y={top} width={barW} height={Math.max(0, PADT + ih - top)} rx={3} fill={b.color} className="qc-gbar"><title>{`${s.label}: ${b.vv}`}</title></rect>
                  {!cmp && b.vv > 0 && <text x={xx + barW / 2} y={top - 4} className="qc-blabel" textAnchor="middle">{fmtCompact(b.vv)}</text>}
                </g>
              );
            })}
            {showXLabel(gi) && <text x={center} y={H - 12} className="qc-axis" textAnchor="middle">{s.label}</text>}
          </g>
        );
      })}
    </svg>
  );
}

/* ----- buckets view: per-day grouped (7d) OR period-total stacked (comparison) ----- */
function BucketsView({ v }: { v: ViewModel }) {
  const segs = [
    { key: "under6" as const, color: "var(--good)", label: "<6h" },
    { key: "h6_12" as const, color: "var(--warn)", label: "6–12h" },
    { key: "over12" as const, color: "var(--danger)", label: ">12h" },
  ];
  const sum = (arr: (QcDailyPoint | null)[]) =>
    arr.reduce((a, p) => ({
      under6: a.under6 + (p?.buckets.under6 ?? 0),
      h6_12: a.h6_12 + (p?.buckets.h6_12 ?? 0),
      over12: a.over12 + (p?.buckets.over12 ?? 0),
    }), { under6: 0, h6_12: 0, over12: 0 });

  const curTot = sum(v.current);
  const empty = curTot.under6 + curTot.h6_12 + curTot.over12 === 0;
  if (empty) return <div className="qc-empty">Buckets populate once the question includes <code>under_6h / h6_12 / over_12h</code>.</div>;

  // comparison views -> two horizontal stacked bars (period totals)
  if (v.previous) {
    const rows = [
      { name: v.curLabel, t: curTot },
      { name: v.prevLabel || "Prev", t: sum(v.previous) },
    ];
    return (
      <div className="qc-stacks">
        <div className="qc-legend" style={{ marginBottom: 10 }}>
          {segs.map((s) => <span key={s.key} className="qc-leg"><i style={{ background: s.color }} />{s.label}</span>)}
        </div>
        {rows.map((r) => {
          const total = r.t.under6 + r.t.h6_12 + r.t.over12 || 1;
          return (
            <div className="qc-stack-row" key={r.name}>
              <span className="qc-stack-label">{r.name}</span>
              <div className="qc-stack">
                {segs.map((s) => {
                  const val = r.t[s.key], pct = (val / total) * 100;
                  return pct > 0 ? (
                    <div key={s.key} className="qc-stack-seg" style={{ width: `${pct}%`, background: s.color }} title={`${s.label}: ${val}`}>
                      {pct > 7 ? `${Math.round(pct)}%` : ""}
                    </div>
                  ) : null;
                })}
              </div>
              <span className="qc-stack-tot">{fmtCompact(total)}</span>
            </div>
          );
        })}
      </div>
    );
  }

  // 7d -> per-day grouped bars
  const W = 860, H = 300, PADL = 46, PADR = 12, PADT = 24, PADB = 34;
  const iw = W - PADL - PADR, ih = H - PADT - PADB;
  const max = Math.max(1, ...v.current.flatMap((p) => segs.map((s) => p?.buckets[s.key] ?? 0)));
  const yMax = niceMax(max);
  const n = v.slots.length;
  const groupW = iw / Math.max(1, n);
  const barW = Math.min(20, (groupW * 0.7) / 3);
  const gap = barW * 0.18;
  const y = (vv: number) => PADT + ih - (ih * vv) / yMax;
  const grid = [0, 0.25, 0.5, 0.75, 1].map((f) => yMax * f);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" className="qc-svg">
      {grid.map((g, i) => (
        <g key={i}><line x1={PADL} y1={y(g)} x2={W - PADR} y2={y(g)} className="qc-grid" />
          <text x={PADL - 8} y={y(g) + 4} className="qc-axis" textAnchor="end">{fmtCompact(g)}</text></g>
      ))}
      {v.slots.map((s, gi) => {
        const center = PADL + groupW * (gi + 0.5);
        const totalW = 3 * barW + 2 * gap, start = center - totalW / 2;
        return (
          <g key={s.key}>
            {segs.map((sg, si) => {
              const val = v.current[gi]?.buckets[sg.key] ?? 0, xx = start + si * (barW + gap), top = y(val);
              return (
                <g key={sg.key}>
                  <rect x={xx} y={top} width={barW} height={Math.max(0, PADT + ih - top)} rx={3} fill={sg.color} className="qc-gbar"><title>{`${s.label} ${sg.label}: ${val}`}</title></rect>
                  {val > 0 && <text x={xx + barW / 2} y={top - 4} className="qc-blabel" textAnchor="middle">{fmtCompact(val)}</text>}
                </g>
              );
            })}
            <text x={center} y={H - 12} className="qc-axis" textAnchor="middle">{s.label}</text>
          </g>
        );
      })}
    </svg>
  );
}

/* ----- small KPI ----- */
function Kpi({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div className={`qc-kpi ${accent ? "accent" : ""}`}>
      <span className="qc-kpi-label">{label}</span>
      <div className="qc-kpi-value">{value}</div>
      {sub && <span className="qc-kpi-sub">{sub}</span>}
    </div>
  );
}

/* ----- format helpers ----- */
function fmtInt(n: number | null | undefined): string { return n == null ? "—" : Math.round(n).toLocaleString("en-US"); }
function fmtCompact(n: number): string { return n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : `${Math.round(n)}`; }
function fmtHrs(h: number | null | undefined): string {
  if (h == null) return "—";
  if (h < 1) return `${Math.round(h * 60)}m`;
  const hr = Math.floor(h), mn = Math.round((h - hr) * 60);
  return mn ? `${hr}h ${mn}m` : `${hr}h`;
}
function fmtHrsShort(h: number): string { return h < 1 ? `${Math.round(h * 60)}m` : `${h % 1 === 0 ? h : h.toFixed(1)}h`; }
function niceMax(v: number): number {
  if (v <= 0) return 1;
  const pow = Math.pow(10, Math.floor(Math.log10(v))), nn = v / pow;
  const step = nn <= 1 ? 1 : nn <= 2 ? 2 : nn <= 5 ? 5 : 10;
  return step * pow;
}
