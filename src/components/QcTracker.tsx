"use client";

import React, { useEffect, useMemo, useState } from "react";

import type { QcProduct, QcProductData, QcDailyPoint, QcTrackerData, UserDayRow } from "@/lib/qc";

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

type View = "7d" | "7dcmp" | "last30" | "last60";
const VIEW_OPTS: { key: View; label: string }[] = [
  { key: "7d", label: "Last 7 days" },
  { key: "7dcmp", label: "7d vs prev" },
  { key: "last30", label: "Last 30 days" },
  { key: "last60", label: "Last 60 days" },
];
type ChartType = "line" | "bar";

interface DayValue { date: string; value: number | null }

export default function QcTracker() {
  const [data, setData] = useState<QcTrackerData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<QcProduct>("image");
  const [segment, setSegment] = useState("all");
  const [theme, setTheme] = useState<"dark" | "light">("dark");

  useEffect(() => { setTheme((localStorage.getItem("qc-theme") as "dark" | "light") || "dark"); }, []);
  useEffect(() => { document.documentElement.dataset.theme = theme; localStorage.setItem("qc-theme", theme); }, [theme]);

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
          <h1>QC Time Tracker{data && <span className={`badge ${data.source === "metabase" ? "live" : "demo"}`}>{data.source === "metabase" ? "live" : "not configured"}</span>}</h1>
          <div className="sub">Quality-control turnaround by product{data?.asOf && <> · as of {data.asOf}</>}</div>
        </div>
        <div className="qc-controls">
          <label className="qc-seg"><span>Segment</span>
            <select value={segment} onChange={(e) => setSegment(e.target.value)}>
              {segOptions.map((s) => <option key={s} value={s}>{segLabel(s)}</option>)}
            </select>
          </label>
          <button className="qc-theme-btn" onClick={() => setTheme(theme === "dark" ? "light" : "dark")} aria-label="Toggle theme">{theme === "dark" ? "☀" : "☾"}</button>
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
        product.configured && product.daily.length
          ? <ProductView product={product} asOf={data.asOf!} segment={data.segment} />
          : <div className="qc-note"><b>{TABS.find((t) => t.key === tab)!.label}</b> QC question isn&apos;t connected yet.{tab === "video" ? " Share the video QC question's public link and I'll wire this tab." : " Check the question's public sharing / env UUID."}</div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
const SEG_PALETTE = ["#0ea5e9", "#22c55e", "#f59e0b", "#ef4444", "#a855f7", "#14b8a6", "#eab308"];

function ProductView({ product, asOf, segment }: { product: QcProductData; asOf: string; segment: string }) {
  const daily = product.daily;
  const [view, setView] = useState<View>("7d");

  const k = useMemo(() => {
    const v = buildView(daily, "7d", asOf);
    const cur = v.current.filter(Boolean) as QcDailyPoint[];
    const wAvg = (sel: (p: QcDailyPoint) => number | null) => {
      let n = 0, d = 0;
      for (const p of cur) { const x = sel(p); if (x != null) { n += x * p.throughput; d += p.throughput; } }
      return d > 0 ? n / d : null;
    };
    const today = v.current[6], yest = v.current[5];
    const tThr = today?.throughput ?? null, yThr = yest?.throughput ?? null;
    const delta = tThr != null && yThr != null && yThr > 0 ? (tThr - yThr) / yThr : null;
    return { avgHrs: wAvg((p) => p.avgHrs), medianHrs: wAvg((p) => p.medianHrs), weeklyQcd: cur.reduce((a, p) => a + p.throughput, 0), todayThr: tThr, delta };
  }, [daily, asOf]);

  const avgPerUserDays: DayValue[] = useMemo(() => {
    const byDate = new Map<string, { total: number; users: Set<string> }>();
    for (const r of product.userDaily) {
      const e = byDate.get(r.date) || { total: 0, users: new Set<string>() };
      e.total += r.count; e.users.add(r.userId); byDate.set(r.date, e);
    }
    return [...byDate.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))
      .map(([date, e]) => ({ date, value: e.users.size ? e.total / e.users.size : null }));
  }, [product.userDaily]);

  const tatDays: DayValue[] = useMemo(() => daily.map((d) => ({ date: d.date, value: d.avgHrs })), [daily]);
  const thrDays: DayValue[] = useMemo(() => daily.map((d) => ({ date: d.date, value: d.throughput })), [daily]);

  // when "All segments" is selected, overlay each segment's avg-QC line on the first graph
  const segOverlays = useMemo(() => {
    if (segment !== "all" || view === "7dcmp" || !product.dailyBySegment) return undefined;
    return product.dailyBySegment.map((s, i) => ({
      label: segLabel(s.segment),
      color: SEG_PALETTE[i % SEG_PALETTE.length],
      days: s.daily.map((d) => ({ date: d.date, value: d.avgHrs })),
    }));
  }, [segment, view, product.dailyBySegment]);

  return (
    <>
      <div className="grid qc-kpis">
        <Kpi label="Avg QC time" value={fmtHrs(k.avgHrs)} sub={`median ${fmtHrs(k.medianHrs)} · 7 days`} accent />
        <Kpi label="Median QC time" value={fmtHrs(k.medianHrs)} sub="last 7 days" />
        <ThroughputKpi today={k.todayThr} delta={k.delta} />
        <Kpi label="Weekly QC'd" value={fmtInt(k.weeklyQcd)} sub="SKUs · last 7 days" />
      </div>

      <div className="qc-periodbar">
        <span className="qc-period-label">Period</span>
        <div className="qc-viewtoggle">
          {VIEW_OPTS.map((o) => <button key={o.key} className={`qc-vbtn ${view === o.key ? "active" : ""}`} onClick={() => setView(o.key)}>{o.label}</button>)}
        </div>
      </div>

      <div className="qc-grid2">
        <MetricChart title="Average QC time" days={tatDays} asOf={asOf} view={view} fmt={fmtHrs} labelFmt={fmtHrsShort} defaultType="line" overlays={segOverlays} overlayMainLabel="All (total)" yMaxCap={24} />
        <BucketsCard daily={daily} asOf={asOf} view={view} />
        <MetricChart title="Throughput per day" days={thrDays} asOf={asOf} view={view} fmt={fmtInt} labelFmt={fmtCompact} defaultType="bar" />
        <MetricChart
          title="Avg number of SKUs processed per QC user"
          hint={product.userDaily.length ? undefined : "Connect the per-user productivity question (see chat)"}
          days={avgPerUserDays} asOf={asOf} view={view} fmt={fmtInt} labelFmt={fmtCompact} defaultType="line"
        />
      </div>
    </>
  );
}

function ThroughputKpi({ today, delta }: { today: number | null; delta: number | null }) {
  const up = delta != null && delta >= 0;
  return (
    <div className="qc-kpi">
      <span className="qc-kpi-label">Throughput · today</span>
      <div className="qc-kpi-value">{fmtInt(today)}</div>
      <span className="qc-kpi-sub">{delta == null ? "vs yesterday —" : <span className={up ? "qc-up" : "qc-down"}>{up ? "▲" : "▼"} {Math.abs(Math.round(delta * 100))}% vs yesterday</span>}</span>
    </div>
  );
}

/* ----- unified metric chart: line<->bar toggle, 4 views, trendline, labels ----- */
function MetricChart({ title, hint, days, asOf, view, fmt, labelFmt, defaultType, overlays, overlayMainLabel, yMaxCap }: {
  title: string; hint?: string; days: DayValue[]; asOf: string; view: View;
  fmt: (n: number | null) => string; labelFmt: (n: number) => string; defaultType: ChartType;
  overlays?: { label: string; color: string; days: DayValue[] }[]; overlayMainLabel?: string; yMaxCap?: number;
}) {
  const [type, setType] = useState<ChartType>(defaultType);
  const v = useMemo(() => buildView(days, view, asOf), [days, view, asOf]);
  const overlayViews = useMemo(
    () => overlays?.map((o) => ({ label: o.label, color: o.color, v: buildView(o.days, view, asOf) })),
    [overlays, view, asOf]
  );
  const showOverlays = !!overlayViews && type === "line";
  const hasData = v.current.some((p) => p && p.value != null);

  return (
    <div className="card qc-chart-card">
      <div className="qc-chart-head">
        <h2>{title}</h2>
        <div className="qc-chart-controls">
          <div className="qc-typetoggle">
            <button className={type === "line" ? "active" : ""} onClick={() => setType("line")} title="Line view"><LineIcon /></button>
            <button className={type === "bar" ? "active" : ""} onClick={() => setType("bar")} title="Bar view"><BarIcon /></button>
          </div>
        </div>
      </div>
      {showOverlays ? (
        <div className="qc-legend qc-cmp-legend">
          <span className="qc-leg"><i style={{ background: "var(--accent)", height: 5 }} />{overlayMainLabel || "Total"}</span>
          {overlayViews!.map((o) => <span key={o.label} className="qc-leg"><i style={{ background: o.color }} />{o.label}</span>)}
          <span className="qc-leg"><i style={{ background: "var(--warn)" }} />Trend</span>
        </div>
      ) : v.previous ? (
        <div className="qc-legend qc-cmp-legend">
          <span className="qc-leg"><i style={{ background: "var(--accent)" }} />{v.curLabel}</span>
          <span className="qc-leg"><i style={{ background: "var(--text-faint)" }} />{v.prevLabel}</span>
          <span className="qc-leg"><i style={{ background: "var(--warn)" }} />Trend</span>
        </div>
      ) : null}
      {hint && !hasData ? <div className="qc-empty">{hint}</div> : <SeriesPlot v={v} type={type} fmt={fmt} labelFmt={labelFmt} overlays={showOverlays ? overlayViews : undefined} mainLabel={overlayMainLabel} yMaxCap={yMaxCap} />}
    </div>
  );
}

function SeriesPlot({ v, type, fmt, labelFmt, overlays, mainLabel, yMaxCap }: { v: DayView<DayValue>; type: ChartType; fmt: (n: number | null) => string; labelFmt: (n: number) => string; overlays?: { label: string; color: string; v: DayView<DayValue> }[]; mainLabel?: string; yMaxCap?: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const [gid] = useState(() => "qcg" + Math.random().toString(36).slice(2, 8));
  const W = 860, H = 300, PADL = 50, PADR = 16, PADT = 22, PADB = 34;
  const iw = W - PADL - PADR, ih = H - PADT - PADB;
  const val = (p: DayValue | null) => (p ? p.value : null);
  const cmp = !!v.previous;
  const all = [...v.current, ...(v.previous || []), ...(overlays?.flatMap((o) => o.v.current) || [])].map(val).filter((x): x is number => x != null);
  const rawMax = niceMax(Math.max(0.0001, ...all));
  const yMax = yMaxCap != null ? Math.min(rawMax, yMaxCap) : rawMax; // cap axis (e.g. 24h)
  const n = v.slots.length;
  const x = (i: number) => PADL + (n <= 1 ? iw / 2 : (iw * i) / (n - 1));
  const y = (vv: number) => PADT + ih - (ih * Math.min(vv, yMax)) / yMax; // clamp to cap
  const grid = [0, 0.25, 0.5, 0.75, 1].map((f) => yMax * f);
  const showX = (i: number) => n <= 14 || i % Math.ceil(n / 14) === 0 || i === n - 1;
  const dense = n > 20;

  const tl = trend(v.current.map(val));

  const linePath = (arr: (DayValue | null)[]) => {
    const pts = arr.map((p, i) => ({ i, vv: val(p) })).filter((p) => p.vv != null) as { i: number; vv: number }[];
    return pts.length ? pts.map((p, k) => `${k ? "L" : "M"}${x(p.i).toFixed(1)},${y(p.vv).toFixed(1)}`).join(" ") : "";
  };

  return (
    <div className="qc-chart-wrap">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" className="qc-svg" onMouseLeave={() => setHover(null)}>
        <defs><linearGradient id={gid} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--accent)" stopOpacity="0.22" /><stop offset="100%" stopColor="var(--accent)" stopOpacity="0" /></linearGradient></defs>
        {grid.map((g, i) => (
          <g key={i}><line x1={PADL} y1={y(g)} x2={W - PADR} y2={y(g)} className="qc-grid" />
            <text x={PADL - 8} y={y(g) + 4} className="qc-axis" textAnchor="end">{labelFmt(g)}</text></g>
        ))}
        {v.slots.map((s, i) => showX(i) && <text key={i} x={x(i)} y={H - 12} className="qc-axis" textAnchor="middle">{s.label}</text>)}

        {type === "bar" ? (
          v.slots.map((s, i) => {
            const groupW = iw / Math.max(1, n);
            const bw = Math.min(cmp ? 13 : 24, (groupW * 0.74) / (cmp ? 2 : 1));
            const gap = cmp ? bw * 0.2 : 0;
            const center = x(i);
            const bars = cmp
              ? [{ vv: val(v.current[i]), c: "var(--accent)", lbl: true }, { vv: val(v.previous![i]), c: "var(--text-faint)", lbl: false }]
              : [{ vv: val(v.current[i]), c: "var(--accent)", lbl: true }];
            const totalW = bars.length * bw + (bars.length - 1) * gap, start = center - totalW / 2;
            return (
              <g key={s.key}>
                {bars.map((b, bi) => b.vv == null ? null : (
                  <g key={bi}>
                    <rect x={start + bi * (bw + gap)} y={y(b.vv)} width={bw} height={Math.max(0, PADT + ih - y(b.vv))} rx={3} fill={b.c} className="qc-gbar"><title>{`${s.label}: ${fmt(b.vv)}`}</title></rect>
                    {b.lbl && <text x={start + bi * (bw + gap) + bw / 2} y={y(b.vv) - 4} className="qc-dlabel" textAnchor="middle">{labelFmt(b.vv)}</text>}
                  </g>
                ))}
              </g>
            );
          })
        ) : (
          <>
            {!cmp && !overlays && <path d={`${linePath(v.current)} L${x(n - 1).toFixed(1)},${(PADT + ih).toFixed(1)} L${x(v.current.findIndex((p) => val(p) != null)).toFixed(1)},${(PADT + ih).toFixed(1)} Z`} fill={`url(#${gid})`} />}
            {overlays?.map((o) => <path key={o.label} d={linePath(o.v.current)} fill="none" stroke={o.color} strokeWidth={1.5} opacity={0.6} strokeLinejoin="round" strokeLinecap="round" />)}
            {v.previous && <path d={linePath(v.previous)} fill="none" stroke="var(--text-faint)" strokeWidth={1.6} strokeLinejoin="round" strokeLinecap="round" />}
            <path d={linePath(v.current)} fill="none" stroke="var(--accent)" strokeWidth={overlays ? 3.6 : 2.6} strokeLinejoin="round" strokeLinecap="round" />
            {v.current.map((p, i) => val(p) != null && <circle key={i} cx={x(i)} cy={y(val(p)!)} r={hover === i ? 4.5 : 2.4} fill="var(--accent)" />)}
          </>
        )}

        {/* trendline */}
        {tl && <line x1={x(0)} y1={y(Math.max(0, Math.min(yMax, tl.b)))} x2={x(n - 1)} y2={y(Math.max(0, Math.min(yMax, tl.b + tl.m * (n - 1))))} stroke="var(--warn)" strokeWidth={overlays ? 3 : 2} strokeDasharray="6 4" opacity={1} />}

        {hover != null && <line x1={x(hover)} y1={PADT} x2={x(hover)} y2={PADT + ih} className="qc-guide" />}
        {v.slots.map((_, i) => <rect key={i} x={x(i) - iw / (2 * Math.max(1, n - 1))} y={PADT} width={iw / Math.max(1, n - 1)} height={ih} fill="transparent" onMouseEnter={() => setHover(i)} />)}
      </svg>
      {hover != null && (
        <div className="qc-tooltip" style={{ left: `${(x(hover) / W) * 100}%` }}>
          <div className="qc-tt-day">{v.slots[hover].label}</div>
          <div className="qc-tt-row"><span>{overlays ? (mainLabel || "Total") : v.curLabel}</span><b>{fmt(val(v.current[hover]))}</b></div>
          {v.previous && <div className="qc-tt-row"><span>{v.prevLabel}</span><b>{fmt(val(v.previous[hover]))}</b></div>}
          {overlays?.map((o) => <div key={o.label} className="qc-tt-row"><span style={{ color: o.color }}>{o.label}</span><b>{fmt(val(o.v.current[hover]))}</b></div>)}
        </div>
      )}
      {dense && <div className="qc-densenote">Tip: many points — switch view to “Last 7 days” for clearer labels.</div>}
    </div>
  );
}

const LineIcon = () => <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden><polyline points="1,11 5,6 9,9 15,2" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" strokeLinecap="round" /></svg>;
const BarIcon = () => <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden><rect x="1" y="8" width="3.2" height="7" fill="currentColor" /><rect x="6.4" y="3" width="3.2" height="12" fill="currentColor" /><rect x="11.8" y="10" width="3.2" height="5" fill="currentColor" /></svg>;

function trend(values: (number | null)[]): { m: number; b: number } | null {
  const pts = values.map((v, i) => ({ i, v })).filter((p) => p.v != null) as { i: number; v: number }[];
  if (pts.length < 2) return null;
  const n = pts.length;
  let sx = 0, sy = 0, sxx = 0, sxy = 0;
  for (const p of pts) { sx += p.i; sy += p.v; sxx += p.i * p.i; sxy += p.i * p.v; }
  const d = n * sxx - sx * sx;
  if (d === 0) return null;
  const m = (n * sxy - sx * sy) / d;
  return { m, b: (sy - m * sx) / n };
}

/* ----- buckets card: bar<->line toggle (line = 3 bucket lines), 4 views ----- */
function BucketsCard({ daily, asOf, view }: { daily: QcDailyPoint[]; asOf: string; view: View }) {
  const [type, setType] = useState<ChartType>("bar");
  const v = useMemo(() => buildView(daily, view, asOf), [daily, view, asOf]);
  return (
    <div className="card qc-chart-card">
      <div className="qc-chart-head">
        <h2>Resolution time buckets</h2>
        <div className="qc-chart-controls">
          <div className="qc-typetoggle">
            <button className={type === "line" ? "active" : ""} onClick={() => setType("line")} title="Line view"><LineIcon /></button>
            <button className={type === "bar" ? "active" : ""} onClick={() => setType("bar")} title="Bar view"><BarIcon /></button>
          </div>
        </div>
      </div>
      <div className="qc-legend" style={{ marginBottom: 8 }}>
        <span className="qc-leg"><i style={{ background: "var(--good)" }} />&lt;6h</span>
        <span className="qc-leg"><i style={{ background: "var(--warn)" }} />6–12h</span>
        <span className="qc-leg"><i style={{ background: "var(--danger)" }} />&gt;12h</span>
      </div>
      <BucketsView v={v} type={type} />
    </div>
  );
}

function BucketsView({ v, type }: { v: DayView<QcDailyPoint>; type: ChartType }) {
  const [hover, setHover] = useState<number | null>(null);
  const segs = [
    { key: "under6" as const, color: "var(--good)", label: "<6h" },
    { key: "h6_12" as const, color: "var(--warn)", label: "6–12h" },
    { key: "over12" as const, color: "var(--danger)", label: ">12h" },
  ];
  const get = (p: QcDailyPoint | null, key: "under6" | "h6_12" | "over12") => (p ? p.buckets[key] : 0);
  const sumAll = (arr: (QcDailyPoint | null)[]) => arr.reduce((a, p) => ({ under6: a.under6 + get(p, "under6"), h6_12: a.h6_12 + get(p, "h6_12"), over12: a.over12 + get(p, "over12") }), { under6: 0, h6_12: 0, over12: 0 });
  const curTot = sumAll(v.current);
  if (curTot.under6 + curTot.h6_12 + curTot.over12 === 0)
    return <div className="qc-empty">Buckets populate once the question includes <code>under_6h / h6_12 / over_12h</code>.</div>;

  // comparison view -> stacked period totals (type ignored)
  if (v.previous) {
    const rows = [{ name: v.curLabel, t: curTot }, { name: v.prevLabel || "Prev", t: sumAll(v.previous) }];
    return (
      <div className="qc-stacks">
        {rows.map((r) => {
          const total = r.t.under6 + r.t.h6_12 + r.t.over12 || 1;
          return (
            <div className="qc-stack-row" key={r.name}>
              <span className="qc-stack-label">{r.name}</span>
              <div className="qc-stack">{segs.map((s) => { const val = r.t[s.key], pct = (val / total) * 100; return pct > 0 ? <div key={s.key} className="qc-stack-seg" style={{ width: `${pct}%`, background: s.color }} title={`${s.label}: ${val}`}>{pct > 7 ? `${Math.round(pct)}%` : ""}</div> : null; })}</div>
              <span className="qc-stack-tot">{fmtCompact(total)}</span>
            </div>
          );
        })}
      </div>
    );
  }

  const W = 860, H = 300, PADL = 46, PADR = 12, PADT = 24, PADB = 34;
  const iw = W - PADL - PADR, ih = H - PADT - PADB;
  const n = v.slots.length;
  const yMax = niceMax(Math.max(1, ...v.current.flatMap((p) => segs.map((s) => get(p, s.key)))));
  const y = (vv: number) => PADT + ih - (ih * vv) / yMax;
  const grid = [0, 0.25, 0.5, 0.75, 1].map((f) => yMax * f);
  const showX = (i: number) => n <= 14 || i % Math.ceil(n / 14) === 0 || i === n - 1;

  // line view -> three bucket lines (no inline labels; tooltip shows all three)
  if (type === "line") {
    const x = (i: number) => PADL + (n <= 1 ? iw / 2 : (iw * i) / (n - 1));
    const linePath = (key: "under6" | "h6_12" | "over12") => v.current.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(get(p, key)).toFixed(1)}`).join(" ");
    return (
      <div className="qc-chart-wrap">
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" className="qc-svg" onMouseLeave={() => setHover(null)}>
          {grid.map((g, i) => (<g key={i}><line x1={PADL} y1={y(g)} x2={W - PADR} y2={y(g)} className="qc-grid" /><text x={PADL - 8} y={y(g) + 4} className="qc-axis" textAnchor="end">{fmtCompact(g)}</text></g>))}
          {v.slots.map((s, i) => showX(i) && <text key={i} x={x(i)} y={H - 12} className="qc-axis" textAnchor="middle">{s.label}</text>)}
          {segs.map((sg) => <path key={sg.key} d={linePath(sg.key)} fill="none" stroke={sg.color} strokeWidth={2.4} strokeLinejoin="round" strokeLinecap="round" />)}
          {segs.map((sg) => {
            const tl = trend(v.current.map((p) => get(p, sg.key)));
            if (!tl) return null;
            const cl = (vv: number) => Math.max(0, Math.min(yMax, vv));
            return <line key={`t${sg.key}`} x1={x(0)} y1={y(cl(tl.b))} x2={x(n - 1)} y2={y(cl(tl.b + tl.m * (n - 1)))} stroke={sg.color} strokeWidth={1.6} strokeDasharray="6 4" opacity={0.85} />;
          })}
          {segs.map((sg) => v.current.map((p, i) => <circle key={sg.key + i} cx={x(i)} cy={y(get(p, sg.key))} r={hover === i ? 3.6 : 2} fill={sg.color} />))}
          {hover != null && <line x1={x(hover)} y1={PADT} x2={x(hover)} y2={PADT + ih} className="qc-guide" />}
          {v.slots.map((_, i) => <rect key={i} x={x(i) - iw / (2 * Math.max(1, n - 1))} y={PADT} width={iw / Math.max(1, n - 1)} height={ih} fill="transparent" onMouseEnter={() => setHover(i)} />)}
        </svg>
        {hover != null && (
          <div className="qc-tooltip" style={{ left: `${(x(hover) / W) * 100}%` }}>
            <div className="qc-tt-day">{v.slots[hover].label}</div>
            {segs.map((sg) => <div key={sg.key} className="qc-tt-row"><span style={{ color: sg.color }}>{sg.label}</span><b>{fmtInt(get(v.current[hover], sg.key))}</b></div>)}
          </div>
        )}
      </div>
    );
  }

  // bar view -> grouped 3 columns; LABEL = % of day total; TOOLTIP = counts
  const groupW = iw / Math.max(1, n);
  const barW = Math.min(20, (groupW * 0.74) / 3);
  const gap = barW * 0.18;
  const showLbl = n <= 14;
  const cx = (i: number) => PADL + groupW * (i + 0.5);
  const dayTot = (p: QcDailyPoint | null) => get(p, "under6") + get(p, "h6_12") + get(p, "over12");
  return (
    <div className="qc-chart-wrap">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" className="qc-svg" onMouseLeave={() => setHover(null)}>
        {grid.map((g, i) => (<g key={i}><line x1={PADL} y1={y(g)} x2={W - PADR} y2={y(g)} className="qc-grid" /><text x={PADL - 8} y={y(g) + 4} className="qc-axis" textAnchor="end">{fmtCompact(g)}</text></g>))}
        {v.slots.map((s, gi) => {
          const p = v.current[gi], tot = dayTot(p);
          const center = cx(gi), totalW = 3 * barW + 2 * gap, start = center - totalW / 2;
          return (
            <g key={s.key}>
              {segs.map((sg, si) => {
                const val = get(p, sg.key), xx = start + si * (barW + gap), top = y(val);
                return (
                  <g key={sg.key}>
                    <rect x={xx} y={top} width={barW} height={Math.max(0, PADT + ih - top)} rx={3} fill={sg.color} className="qc-gbar" />
                    {showLbl && val > 0 && tot > 0 && <text x={xx + barW / 2} y={top - 4} className="qc-blabel" textAnchor="middle">{Math.round((val / tot) * 100)}%</text>}
                  </g>
                );
              })}
              {showX(gi) && <text x={center} y={H - 12} className="qc-axis" textAnchor="middle">{s.label}</text>}
            </g>
          );
        })}
        {hover != null && <line x1={cx(hover)} y1={PADT} x2={cx(hover)} y2={PADT + ih} className="qc-guide" />}
        {v.slots.map((_, i) => <rect key={i} x={PADL + groupW * i} y={PADT} width={groupW} height={ih} fill="transparent" onMouseEnter={() => setHover(i)} />)}
      </svg>
      {hover != null && (() => {
        const p = v.current[hover], tot = dayTot(p);
        return (
          <div className="qc-tooltip" style={{ left: `${(cx(hover) / W) * 100}%` }}>
            <div className="qc-tt-day">{v.slots[hover].label}</div>
            {segs.map((sg) => <div key={sg.key} className="qc-tt-row"><span style={{ color: sg.color }}>{sg.label}</span><b>{fmtInt(get(p, sg.key))}</b></div>)}
            <div className="qc-tt-row" style={{ borderTop: "1px solid var(--border)", marginTop: 4, paddingTop: 4 }}><span>Total</span><b>{fmtInt(tot)}</b></div>
          </div>
        );
      })()}
    </div>
  );
}

/* ----- views model (generic over anything with a date) ----- */
interface DayView<T> {
  slots: { key: string; label: string }[];
  current: (T | null)[];
  previous: (T | null)[] | null;
  curLabel: string;
  prevLabel: string | null;
}
const DAY = 86400000;
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const parseUTC = (d: string) => new Date(`${d}T00:00:00Z`).getTime();
const toDate = (ms: number) => new Date(ms).toISOString().slice(0, 10);

function buildView<T extends { date: string }>(days: T[], view: View, asOf: string): DayView<T> {
  const map = new Map(days.map((p) => [p.date, p]));
  const anchor = parseUTC(asOf);
  if (view === "7d" || view === "7dcmp") {
    const slots: { key: string; label: string }[] = [];
    const current: (T | null)[] = [];
    const previous: (T | null)[] = [];
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
  const days_ = view === "last60" ? 60 : 30;
  const slots: { key: string; label: string }[] = [];
  const current: (T | null)[] = [];
  for (let i = days_ - 1; i >= 0; i--) {
    const ms = anchor - i * DAY;
    slots.push({ key: toDate(ms), label: toDate(ms).slice(5) });
    current.push(map.get(toDate(ms)) || null);
  }
  return { slots, current, previous: null, curLabel: `Last ${days_} days`, prevLabel: null };
}

/* ----- KPI + format helpers ----- */
function Kpi({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (<div className={`qc-kpi ${accent ? "accent" : ""}`}><span className="qc-kpi-label">{label}</span><div className="qc-kpi-value">{value}</div>{sub && <span className="qc-kpi-sub">{sub}</span>}</div>);
}
function fmtInt(n: number | null | undefined): string { return n == null ? "—" : Math.round(n).toLocaleString("en-US"); }
function fmtCompact(n: number): string { return n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : `${Math.round(n)}`; }
function fmtHrs(h: number | null | undefined): string { if (h == null) return "—"; if (h < 1) return `${Math.round(h * 60)}m`; const hr = Math.floor(h), mn = Math.round((h - hr) * 60); return mn ? `${hr}h ${mn}m` : `${hr}h`; }
function fmtHrsShort(h: number): string { return h < 1 ? `${Math.round(h * 60)}m` : `${h % 1 === 0 ? h : h.toFixed(1)}h`; }
function niceMax(v: number): number { if (v <= 0) return 1; const pow = Math.pow(10, Math.floor(Math.log10(v))), nn = v / pow; const step = nn <= 1 ? 1 : nn <= 2 ? 2 : nn <= 5 ? 5 : 10; return step * pow; }
