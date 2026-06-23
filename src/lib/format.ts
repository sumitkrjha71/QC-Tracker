// ============================================================================
//  Small, dependency-free formatting + math helpers.
// ============================================================================

/** Format a duration given in minutes as a compact human string. */
export function formatMinutes(min: number | null | undefined): string {
  if (min === null || min === undefined || Number.isNaN(min)) return "—";
  if (min < 0) return "—";
  if (min < 1) return "<1m";
  const totalMinutes = Math.round(min);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;
  const parts: string[] = [];
  if (days) parts.push(`${days}d`);
  if (hours) parts.push(`${hours}h`);
  if (minutes && parts.length < 2) parts.push(`${minutes}m`);
  return parts.length ? parts.join(" ") : "0m";
}

/** Format minutes as decimal hours (e.g. "5.4h"). */
export function formatHours(min: number | null | undefined): string {
  if (min === null || min === undefined || Number.isNaN(min)) return "—";
  return `${(min / 60).toFixed(1)}h`;
}

/** Format an ISO timestamp for display. Returns "—" for null. */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Whole-number percent string, e.g. 0.83 -> "83%". */
export function formatPct(frac: number | null | undefined): string {
  if (frac === null || frac === undefined || Number.isNaN(frac)) return "—";
  return `${Math.round(frac * 100)}%`;
}

/** Mean of a numeric array, or null if empty. */
export function mean(xs: number[]): number | null {
  if (!xs.length) return null;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

/**
 * Linear-interpolated percentile (0..100) of a numeric array.
 * Returns null for an empty array.
 */
export function percentile(xs: number[], p: number): number | null {
  if (!xs.length) return null;
  const sorted = [...xs].sort((a, b) => a - b);
  if (sorted.length === 1) return sorted[0];
  const rank = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  if (lo === hi) return sorted[lo];
  const frac = rank - lo;
  return sorted[lo] + (sorted[hi] - sorted[lo]) * frac;
}

/** ISO date (yyyy-mm-dd) in UTC from an ISO timestamp. */
export function isoDate(iso: string): string {
  return new Date(iso).toISOString().slice(0, 10);
}

/** Minutes between two ISO timestamps (b - a). Null if either missing/invalid. */
export function diffMinutes(a: string | null, b: string | null): number | null {
  if (!a || !b) return null;
  const ta = new Date(a).getTime();
  const tb = new Date(b).getTime();
  if (Number.isNaN(ta) || Number.isNaN(tb)) return null;
  return (tb - ta) / 60000;
}
