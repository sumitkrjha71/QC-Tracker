// ============================================================================
//  QC Time Tracker data layer (V2 — full daily history for multi-view charts).
//  Each product (image / 360 / video) is its own daily question:
//     day, throughput, median_qc_hrs, avg_qc_hrs, under_6h, h6_12, over_12h [, segment]
//  We return the COMPLETE daily series per product (ascending). The client
//  derives the views: last 7 days, 7d-vs-prev-7d, and month-to-date-vs-last-month.
// ============================================================================

export type QcProduct = "image" | "360" | "video";
export const QC_PRODUCTS: QcProduct[] = ["image", "360", "video"];

export interface QcBuckets {
  under6: number;
  h6_12: number;
  over12: number;
}

export interface QcDailyPoint {
  date: string; // yyyy-mm-dd
  label: string; // weekday (Mon..Sun)
  throughput: number;
  medianHrs: number | null;
  avgHrs: number | null;
  buckets: QcBuckets;
}

/** One (date, QC user, count) row for the per-user productivity chart. */
export interface UserDayRow {
  date: string;
  userId: string;
  count: number;
  segment: string | null;
}

export interface QcProductData {
  configured: boolean;
  daily: QcDailyPoint[]; // ALL days, ascending (filtered to selected segment)
  userDaily: UserDayRow[]; // per-user processed counts (filtered to selected segment)
  /** Per-segment daily series — present only when segment = "all" (for overlay). */
  dailyBySegment?: { segment: string; daily: QcDailyPoint[] }[];
}

export interface QcTrackerData {
  source: "metabase" | "unconfigured";
  asOf: string | null;
  segment: string;
  availableSegments: string[];
  hasSegmentColumn: boolean;
  products: Record<QcProduct, QcProductData>;
}

interface RawDaily {
  date: string;
  throughput: number;
  medianHrs: number | null;
  avgHrs: number | null;
  under6: number;
  h6_12: number;
  over12: number;
  segment: string | null;
}

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function uuidFor(p: QcProduct): string | undefined {
  if (p === "image") return process.env.METABASE_QC_IMAGE_UUID;
  if (p === "360") return process.env.METABASE_QC_360_UUID;
  return process.env.METABASE_QC_VIDEO_UUID;
}

function userUuidFor(p: QcProduct): string | undefined {
  if (p === "image") return process.env.METABASE_QC_USER_IMAGE_UUID;
  if (p === "360") return process.env.METABASE_QC_USER_360_UUID;
  return process.env.METABASE_QC_USER_VIDEO_UUID;
}

export async function buildQcTracker(now: Date, segment = "all"): Promise<QcTrackerData> {
  const results = await Promise.all(
    QC_PRODUCTS.map(async (p) => {
      const uuid = uuidFor(p);
      const userUuid = userUuidFor(p);
      const [rows, userRows] = await Promise.all([
        uuid ? fetchDaily(uuid).catch(() => null) : Promise.resolve(null as RawDaily[] | null),
        userUuid ? fetchUserDaily(userUuid).catch(() => [] as UserDayRow[]) : Promise.resolve([] as UserDayRow[]),
      ]);
      return { p, rows, userRows };
    })
  );

  const segs = new Set<string>();
  let hasSegmentColumn = false;
  for (const r of results)
    if (r.rows)
      for (const row of r.rows)
        if (row.segment) {
          segs.add(row.segment);
          hasSegmentColumn = true;
        }

  const products = {} as Record<QcProduct, QcProductData>;
  let asOf: string | null = null;
  for (const { p, rows, userRows } of results) {
    // user rows: filter by segment when the user question carries a segment column
    const userHasSeg = userRows.some((r) => r.segment);
    const userDaily =
      segment !== "all" && userHasSeg
        ? userRows.filter((r) => (r.segment || "").toLowerCase() === segment.toLowerCase())
        : userRows;

    if (!rows || !rows.length) {
      products[p] = { configured: false, daily: [], userDaily };
      continue;
    }
    const filtered =
      segment !== "all" && hasSegmentColumn
        ? rows.filter((r) => (r.segment || "").toLowerCase() === segment.toLowerCase())
        : rows;
    const daily = toSeries(filtered);

    // per-segment daily series for the "all segments" overlay on the first graph
    let dailyBySegment: { segment: string; daily: QcDailyPoint[] }[] | undefined;
    if (segment === "all" && hasSegmentColumn) {
      const present = Array.from(new Set(rows.map((r) => r.segment).filter(Boolean))) as string[];
      dailyBySegment = present.sort().map((sg) => ({ segment: sg, daily: toSeries(rows.filter((r) => r.segment === sg)) }));
    }

    products[p] = { configured: true, daily, userDaily, dailyBySegment };
    if (daily.length) {
      const last = daily[daily.length - 1].date;
      if (!asOf || last > asOf) asOf = last;
    }
  }

  const anyConfigured = results.some((r) => r.rows);
  return {
    source: anyConfigured ? "metabase" : "unconfigured",
    asOf,
    segment,
    availableSegments: ["all", ...Array.from(segs).sort()],
    hasSegmentColumn,
    products,
  };
}

// ----------------------------------------------------------------------------

async function fetchDaily(uuid: string): Promise<RawDaily[]> {
  const base = (process.env.METABASE_URL || "https://metabase.spyne.ai").replace(/\/$/, "");
  const res = await fetch(`${base}/public/question/${encodeURIComponent(uuid)}.csv`, {
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`QC fetch failed: ${res.status}`);
  return parseDaily(await res.text());
}

function parseDaily(text: string): RawDaily[] {
  const lines = text.split("\n").filter((l) => l.trim().length);
  if (lines.length < 2) return [];
  const header = lines[0].split(",").map((h) => h.trim().toLowerCase());
  const find = (...pred: ((h: string) => boolean)[]) =>
    header.findIndex((h) => pred.some((p) => p(h)));
  const iDay = find((h) => h === "day", (h) => h.includes("day"), (h) => h.includes("date"));
  const iThr = find((h) => h.includes("throughput"), (h) => h.includes("count"));
  const iMed = find((h) => h.includes("median"));
  const iAvg = find((h) => h.includes("avg"), (h) => h.includes("mean"));
  const iU6 = find((h) => h.includes("under"), (h) => h.includes("lt6"));
  const i612 = find((h) => h.includes("6_12"), (h) => h.includes("6to12"));
  const iO12 = find((h) => h.includes("over"), (h) => h.includes("gt12"));
  const iSeg = find((h) => h.includes("segment"), (h) => h.includes("tier"), (h) => h === "type");
  const minUnit = iMed >= 0 && header[iMed].includes("min");
  const avgUnit = iAvg >= 0 && header[iAvg].includes("min");

  const out: RawDaily[] = [];
  for (let i = 1; i < lines.length; i++) {
    const f = lines[i].split(",");
    const date = (f[iDay] || "").trim().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    const num = (idx: number) => {
      const v = parseFloat((f[idx] || "").trim());
      return Number.isFinite(v) ? v : null;
    };
    const cnt = (idx: number) => (idx >= 0 ? Math.round(num(idx) ?? 0) : 0);
    const med = iMed >= 0 ? num(iMed) : null;
    const avg = iAvg >= 0 ? num(iAvg) : null;
    out.push({
      date,
      throughput: iThr >= 0 ? Math.round(num(iThr) ?? 0) : 0,
      medianHrs: med == null ? null : minUnit ? med / 60 : med,
      avgHrs: avg == null ? null : avgUnit ? avg / 60 : avg,
      under6: cnt(iU6),
      h6_12: cnt(i612),
      over12: cnt(iO12),
      segment: iSeg >= 0 ? (f[iSeg] || "").trim() || null : null,
    });
  }
  return out;
}

async function fetchUserDaily(uuid: string): Promise<UserDayRow[]> {
  const base = (process.env.METABASE_URL || "https://metabase.spyne.ai").replace(/\/$/, "");
  const res = await fetch(`${base}/public/question/${encodeURIComponent(uuid)}.csv`, { cache: "no-store" });
  if (!res.ok) throw new Error(`QC user fetch failed: ${res.status}`);
  const lines = (await res.text()).split("\n").filter((l) => l.trim().length);
  if (lines.length < 2) return [];
  const header = lines[0].split(",").map((h) => h.trim().toLowerCase());
  const find = (...pred: ((h: string) => boolean)[]) => header.findIndex((h) => pred.some((p) => p(h)));
  const iDay = find((h) => h === "day", (h) => h.includes("day"), (h) => h.includes("date"));
  const iUser = find((h) => h.includes("user"));
  const iCnt = find((h) => h.includes("processed"), (h) => h.includes("count"), (h) => h.includes("cnt"));
  const iSeg = find((h) => h.includes("segment"), (h) => h.includes("tier"), (h) => h === "type");
  const out: UserDayRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const f = lines[i].split(",");
    const date = (f[iDay] || "").trim().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    const userId = (f[iUser] || "").trim() || "unknown";
    const count = Math.round(parseFloat((f[iCnt] || "").trim()) || 0);
    const segment = iSeg >= 0 ? (f[iSeg] || "").trim() || null : null;
    if (count > 0) out.push({ date, userId, count, segment });
  }
  return out;
}

/** Merge raw rows -> ascending QcDailyPoint series (collapses dupes per date). */
function toSeries(rows: RawDaily[]): QcDailyPoint[] {
  return mergeByDate(rows)
    .sort((a, b) => (a.date < b.date ? -1 : 1))
    .map<QcDailyPoint>((r) => ({
      date: r.date,
      label: DOW[new Date(`${r.date}T00:00:00Z`).getUTCDay()],
      throughput: r.throughput,
      medianHrs: r.medianHrs,
      avgHrs: r.avgHrs,
      buckets: { under6: r.under6, h6_12: r.h6_12, over12: r.over12 },
    }));
}

/** Collapse multiple rows per date (e.g. several segments under "all"). */
function mergeByDate(rows: RawDaily[]): RawDaily[] {
  const byDate = new Map<string, RawDaily[]>();
  for (const r of rows) {
    const a = byDate.get(r.date);
    if (a) a.push(r);
    else byDate.set(r.date, [r]);
  }
  const out: RawDaily[] = [];
  for (const [date, group] of byDate) {
    if (group.length === 1) {
      out.push(group[0]);
      continue;
    }
    let thr = 0,
      num = 0,
      mnum = 0;
    const b = { under6: 0, h6_12: 0, over12: 0 };
    for (const g of group) {
      thr += g.throughput;
      if (g.avgHrs != null) num += g.avgHrs * g.throughput;
      if (g.medianHrs != null) mnum += g.medianHrs * g.throughput;
      b.under6 += g.under6;
      b.h6_12 += g.h6_12;
      b.over12 += g.over12;
    }
    out.push({
      date,
      throughput: thr,
      avgHrs: thr > 0 ? num / thr : null,
      medianHrs: thr > 0 ? mnum / thr : null,
      under6: b.under6,
      h6_12: b.h6_12,
      over12: b.over12,
      segment: null,
    });
  }
  return out;
}
