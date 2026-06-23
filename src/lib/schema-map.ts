// ============================================================================
//  ⭐ LOGICAL MODEL + APP DATA CONTRACT ⭐
// ----------------------------------------------------------------------------
//  The physical join now lives in ONE Metabase question (see
//  `metabase/combined_query.sql`). The app calls that saved card by id and
//  receives one row per DELIVERABLE = (DealerVin x media type) with the four
//  juncture timestamps already resolved. This file documents the model and
//  pins the exact RESULT COLUMN NAMES the app parses.
//
//  Why a medias bridge (validated against real data):
//    - Ai_sku.DealerVinId / MediaId / Vin are EMPTY -> cannot join VIN->SKU
//      directly. The `medias` table is the only reliable bridge.
//    - medias gives the media split for free:
//        MediaChildRelations Catalog ID     -> image  sku_id
//        MediaChildRelations Spin ID        -> 360    sku_id
//        MediaChildRelations FeatureVideo ID-> video  sku_id
//
//  Journey (each step's END = next step's START), 4 stages, QC = Delivered:
//
//    [Received]            [Tech done]        [AI done]            [QC done]
//    DealerVinMapping      Ai_sku             cadence_queue        Ai_sku
//    .CreatedAt            ."Created On"      ."Process Finish     ."Qc Time"
//    (per DealerVinId)     (per sku_id)        Time" (per sku_id)  (per sku_id)
//
//  Join chain (authored in combined_query.sql):
//    DealerVinMapping.DealerVinId = medias.DealerVinId
//    medias.<child>_id            = Ai_sku."Sku ID"        (tech + qc)
//    medias.<child>_id            = cadence_queue."Sku ID" (ai done)
// ============================================================================

/**
 * The exact column names the combined Metabase question MUST output (these are
 * the aliases in combined_query.sql). metabase.ts maps these -> VinJunctures.
 * If you change an alias in the SQL, change it here too.
 */
export const RESULT_COLS = {
  dealerVinId: "dealer_vin_id",
  vin: "vin",
  mediaType: "media_type", // 'image' | '360' | 'video'
  skuId: "sku_id",
  receivedAt: "received_at",
  techDoneAt: "tech_done_at",
  aiDoneAt: "ai_done_at",
  qcDoneAt: "qc_done_at",
} as const;

/** Map a raw media-type string (from medias) to our canonical MediaType. */
export function canonicalMedia(v: unknown): "image" | "360" | "video" | "unknown" {
  const s = String(v ?? "").toLowerCase();
  if (s.includes("spin") || s.includes("360")) return "360";
  if (s.includes("video") || s.includes("feature")) return "video";
  if (s.includes("catalog") || s.includes("image") || s.includes("photo"))
    return "image";
  if (s === "image" || s === "360" || s === "video") return s as never;
  return "unknown";
}
