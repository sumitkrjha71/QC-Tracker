// ============================================================================
//  Synthetic data generator — lets the dashboard run with zero DB setup.
//  Mirrors the real grain: each received VIN (dealer_vin_id) fans out to 1-3
//  SKUs (sku_id), each its own media type, each running Tech -> AI -> QC and
//  sharing the VIN's received time. Produces in-progress + aging outliers and
//  a gentle "improvement over time" trend.
// ============================================================================

import type { MediaType, VinJunctures } from "./types";

const MEDIA: MediaType[] = ["image", "360", "video"];

/** A tiny seeded PRNG so the demo is stable across reloads within a window. */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function addMinutes(d: Date, m: number): Date {
  return new Date(d.getTime() + m * 60000);
}

/** Baseline minutes a stage takes for a given media type. */
const BASELINE: Record<MediaType, { tech: number; ai: number; qc: number }> = {
  image: { tech: 90, ai: 160, qc: 60 },
  "360": { tech: 140, ai: 320, qc: 110 },
  video: { tech: 200, ai: 520, qc: 150 },
  unknown: { tech: 120, ai: 240, qc: 90 },
};

/**
 * Generate synthetic per-SKU junctures for VINs received in [from, to).
 * @param now reference "current" time used to leave recent SKUs in-progress.
 */
export function generateMockJunctures(
  from: Date,
  to: Date,
  now: Date,
  seed = 1337
): VinJunctures[] {
  const rand = mulberry32(seed);
  const out: VinJunctures[] = [];
  const totalDays = Math.max(1, Math.ceil((to.getTime() - from.getTime()) / 86400000));
  const vinsPerDay = 14; // ~14 VINs/day, each -> 1..3 SKUs

  for (let day = 0; day < totalDays; day++) {
    const dayStart = addMinutes(from, day * 1440);
    if (dayStart >= to) break;

    // Improvement factor: efficiency rises ~0.7%/day -> later days are faster.
    const improve = Math.max(0.55, 1 - day * 0.007);

    const vinCount = vinsPerDay + Math.floor((rand() - 0.5) * 6);
    for (let v = 0; v < vinCount; v++) {
      const dealerVinId = `DVID-${day}-${v}`;
      const vinCode = makeVin(rand);
      const dealer = pickDealer(rand);

      // Received once per VIN; all its SKUs inherit this t0.
      const receivedAt = addMinutes(dayStart, Math.floor(rand() * 1440));
      if (receivedAt >= to) continue;

      // 1..3 distinct media SKUs under this VIN.
      const skuCount = 1 + Math.floor(rand() * 3);
      const media = shuffle(MEDIA, rand).slice(0, skuCount);

      media.forEach((mt, idx) => {
        const base = BASELINE[mt];
        const jitter = () => 0.6 + rand() * 0.9; // 0.6x .. 1.5x
        const techMin = base.tech * improve * jitter();
        const aiMin = base.ai * improve * jitter();
        const qcMin = base.qc * improve * jitter();

        // Occasional bottleneck spike in AI (simulates a stuck queue).
        const spike = rand() < 0.08 ? 3 + rand() * 4 : 1;

        const techDone = addMinutes(receivedAt, techMin);
        const aiDone = addMinutes(techDone, aiMin * spike);
        const qcDone = addMinutes(aiDone, qcMin);

        // Null out junctures still in the future relative to `now`
        // -> those SKUs are "in progress".
        out.push({
          vin: vinCode,
          dealerVinId,
          skuId: `SKU-${day}-${v}-${idx}`,
          dealer,
          mediaType: mt,
          receivedAt: receivedAt.toISOString(),
          techDoneAt: techDone <= now ? techDone.toISOString() : null,
          aiDoneAt: aiDone <= now ? aiDone.toISOString() : null,
          qcDoneAt: qcDone <= now ? qcDone.toISOString() : null,
        });
      });
    }
  }
  return out;
}

const DEALERS = [
  "AutoNation",
  "Penske",
  "Lithia",
  "Group 1",
  "Sonic",
  "Hendrick",
  "CarMax",
];

function pickDealer(rand: () => number): string {
  return DEALERS[Math.floor(rand() * DEALERS.length)];
}

const VIN_CHARS = "ABCDEFGHJKLMNPRSTUVWXYZ0123456789";
function makeVin(rand: () => number): string {
  let s = "";
  for (let i = 0; i < 17; i++) s += VIN_CHARS[Math.floor(rand() * VIN_CHARS.length)];
  return s;
}

function shuffle<T>(arr: T[], rand: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
