// ============================================================================
//  Metabase data-source client.
//  - DATA_SOURCE=mock      -> synthetic data (no network)
//  - DATA_SOURCE=metabase  -> downloads the COMBINED question's CSV export and
//                             maps rows -> VinJunctures.
//
//  Why CSV (not /query JSON): the JSON query endpoint caps at ~2000 rows; the
//  CSV export returns the FULL result (the live 30-day window is ~200k rows).
//  Columns are mapped by POSITION, so display-name humanization and the
//  `d.`/`skuqc.` table prefixes on join-key columns don't matter.
//
//  A short in-memory TTL cache avoids re-downloading the export every request.
//
//  Auth (only for the numeric-card path): API key (x-api-key) or a session
//  token from username/password. The public-UUID path needs no auth.
// ============================================================================

import { canonicalMedia } from "./schema-map";
import { generateMockJunctures } from "./mock";
import type { VinJunctures } from "./types";

export type DataSource = "mock" | "metabase";

// Fixed column order produced by metabase/combined_query.sql:
//   0 dealer_vin_id | 1 vin | 2 media_type | 3 sku_id
//   4 received_at   | 5 tech_done_at | 6 ai_done_at | 7 qc_done_at
const COL = {
  dealerVinId: 0,
  vin: 1,
  mediaType: 2,
  skuId: 3,
  receivedAt: 4,
  techDoneAt: 5,
  aiDoneAt: 6,
  qcDoneAt: 7,
} as const;

export function getDataSource(): DataSource {
  return (process.env.DATA_SOURCE || "").toLowerCase() === "metabase"
    ? "metabase"
    : "mock";
}

const CACHE_TTL_MS =
  (Number(process.env.METABASE_CACHE_TTL_SECONDS) || 300) * 1000;
let cache: { key: string; at: number; rows: VinJunctures[] } | null = null;

/** Fetch per-deliverable junctures for the window, from the active source. */
export async function fetchJunctures(
  from: Date,
  to: Date,
  now: Date
): Promise<{ rows: VinJunctures[]; source: DataSource }> {
  const source = getDataSource();
  if (source === "mock") {
    return { rows: generateMockJunctures(from, to, now), source };
  }

  // The combined card self-filters to the rolling last 30 days; the route then
  // narrows to [from, to). Cache the parsed export to avoid repeat downloads.
  const key = process.env.METABASE_PUBLIC_UUID || process.env.METABASE_CARD_ID || "";
  if (cache && cache.key === key && Date.now() - cache.at < CACHE_TTL_MS) {
    return { rows: cache.rows, source };
  }
  const csv = process.env.METABASE_PUBLIC_UUID
    ? await fetchPublicCsv()
    : await fetchCardCsv();
  const rows = csvToJunctures(csv);
  cache = { key, at: Date.now(), rows };
  return { rows, source };
}

// ----------------------------------------------------------------------------
//  CSV download paths
// ----------------------------------------------------------------------------

/** Public-sharing path: GET /public/question/:uuid.csv (no auth). */
async function fetchPublicCsv(): Promise<string> {
  const base = baseUrl();
  const uuid = requireEnv("METABASE_PUBLIC_UUID");
  const res = await fetch(`${base}/public/question/${encodeURIComponent(uuid)}.csv`);
  if (!res.ok)
    throw new Error(`Metabase public CSV failed: ${res.status} ${await safeText(res)}`);
  return res.text();
}

/** Authenticated path: POST /api/card/:id/query/csv (full export, not capped). */
async function fetchCardCsv(): Promise<string> {
  const base = baseUrl();
  const cardId = requireEnv("METABASE_CARD_ID");
  const run = async () =>
    fetch(`${base}/api/card/${encodeURIComponent(cardId)}/query/csv`, {
      method: "POST",
      headers: await getAuthHeaders(),
    });
  let res = await run();
  if (res.status === 401 && !process.env.METABASE_API_KEY) {
    cachedSessionToken = null; // expired session — retry once
    res = await run();
  }
  if (!res.ok)
    throw new Error(`Metabase card CSV failed: ${res.status} ${await safeText(res)}`);
  return res.text();
}

// ----------------------------------------------------------------------------
//  CSV parsing -> VinJunctures (mapped by position)
// ----------------------------------------------------------------------------

function csvToJunctures(text: string): VinJunctures[] {
  const rows = parseCsv(text);
  const out: VinJunctures[] = [];
  for (let i = 1; i < rows.length; i++) {
    // skip header (row 0)
    const f = rows[i];
    if (f.length < 8) continue;
    const dealerVinId = f[COL.dealerVinId]?.trim() || "";
    const vin = f[COL.vin]?.trim() || "";
    out.push({
      vin: vin || dealerVinId,
      dealerVinId: dealerVinId || null,
      skuId: f[COL.skuId]?.trim() || null,
      dealer: null,
      mediaType: canonicalMedia(f[COL.mediaType]),
      receivedAt: toIso(f[COL.receivedAt]),
      techDoneAt: toIso(f[COL.techDoneAt]),
      aiDoneAt: toIso(f[COL.aiDoneAt]),
      qcDoneAt: toIso(f[COL.qcDoneAt]),
    });
  }
  return out;
}

/** Minimal RFC-4180 CSV parser (handles quotes, escaped quotes, CRLF). */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (c !== "\r") field += c;
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function toIso(v: unknown): string | null {
  if (v == null || v === "") return null;
  const d = new Date(v as string);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

// ----------------------------------------------------------------------------
//  Auth + helpers
// ----------------------------------------------------------------------------

let cachedSessionToken: string | null = null;

async function getAuthHeaders(): Promise<Record<string, string>> {
  const apiKey = process.env.METABASE_API_KEY;
  if (apiKey) return { "x-api-key": apiKey };
  if (!cachedSessionToken) cachedSessionToken = await login();
  return { "X-Metabase-Session": cachedSessionToken };
}

async function login(): Promise<string> {
  const base = baseUrl();
  const username = requireEnv("METABASE_USERNAME");
  const password = requireEnv("METABASE_PASSWORD");
  const res = await fetch(`${base}/api/session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok)
    throw new Error(`Metabase login failed: ${res.status} ${await safeText(res)}`);
  const json = (await res.json()) as { id?: string };
  if (!json.id) throw new Error("Metabase login returned no session id");
  return json.id;
}

function baseUrl(): string {
  return requireEnv("METABASE_URL").replace(/\/$/, "");
}

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

async function safeText(res: Response): Promise<string> {
  try {
    return (await res.text()).slice(0, 300);
  } catch {
    return "";
  }
}
