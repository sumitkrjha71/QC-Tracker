-- ============================================================================
--  VIN Delivery Tracker — COMBINED METABASE QUESTION   (ClickHouse dialect)
-- ----------------------------------------------------------------------------
--  Warehouse = ClickHouse (v26.x). Card refs bound to your questions:
--     {{#12382}} = DealerVinMapping   {{#12385}} = medias   {{#12383}} = Ai_sku
--
--  NO PARAMETERS. Window hardcoded to the ROLLING LAST 30 DAYS (auto-advances).
--
--  Stage timestamps (all 3 work-stage times come from Ai_sku, keyed by sku_id):
--     received  = DealerVinMapping.createdAt
--     tech done = Ai_sku.created_on
--     AI done   = Ai_sku.process_finish_time   (cadence_queue dropped: its
--                 sku_id is truncated + Process Finish Time was backfilled)
--     QC done   = Ai_sku.qc_time
--
--  Returns ONE ROW PER DELIVERABLE = (DealerVin x media type):
--     dealer_vin_id, vin, media_type, sku_id,
--     received_at, tech_done_at, ai_done_at, qc_done_at
--  (Alias names are the app's contract — see src/lib/schema-map.ts RESULT_COLS.)
-- ============================================================================

WITH
-- 1) RECEIVED: VINs received in the rolling last-30-days window.
recv AS (
  SELECT
    dvm.dealerVinId    AS dealer_vin_id,
    min(dvm.createdAt) AS received_at
  FROM {{#12382}} AS dvm
  WHERE toDate(parseDateTimeBestEffortOrNull(toString(dvm.createdAt))) >= today() - 30
    AND toDate(parseDateTimeBestEffortOrNull(toString(dvm.createdAt))) <  today() + 1
  GROUP BY dvm.dealerVinId
),

-- 2) BRIDGE + UNPIVOT: one row per (VIN x media type) from medias.
--    Each child-relation id IS the sku_id. FeatureVideo ids carry a 'sku-'
--    prefix -> strip it so it matches sku_id downstream.
deliv AS (
  SELECT m.dealerVinId AS dealer_vin_id, m.vin AS vin,
         'image' AS media_type, m.mediaChildRelations_catalog_id AS sku_id
  FROM {{#12385}} AS m
  WHERE m.mediaChildRelations_catalog_id IS NOT NULL AND m.mediaChildRelations_catalog_id != ''

  UNION ALL
  SELECT m.dealerVinId, m.vin, '360', m.mediaChildRelations_spin_id
  FROM {{#12385}} AS m
  WHERE m.mediaChildRelations_spin_id IS NOT NULL AND m.mediaChildRelations_spin_id != ''

  UNION ALL
  SELECT m.dealerVinId, m.vin, 'video',
         replaceRegexpOne(m.mediaChildRelations_featureVideo_id, '^sku-', '')
  FROM {{#12385}} AS m
  WHERE m.mediaChildRelations_featureVideo_id IS NOT NULL AND m.mediaChildRelations_featureVideo_id != ''
),

-- 3) TECH + AI + QC all from Ai_sku, keyed by sku_id (one clean join).
skuqc AS (
  SELECT
    s.sku_id                   AS sku_id,
    min(s.created_on)          AS tech_done_at,   -- tech done (= AI start)
    min(s.process_finish_time) AS ai_done_at,     -- AI processing done
    min(s.qc_time)             AS qc_done_at      -- QC done (= Delivered)
  FROM {{#12383}} AS s
  GROUP BY s.sku_id
)

SELECT
  d.dealer_vin_id,
  d.vin,
  d.media_type,
  d.sku_id,
  r.received_at,
  skuqc.tech_done_at,
  skuqc.ai_done_at,
  skuqc.qc_done_at
FROM deliv AS d
INNER JOIN recv  AS r ON r.dealer_vin_id = d.dealer_vin_id
LEFT  JOIN skuqc      ON skuqc.sku_id    = d.sku_id
ORDER BY r.received_at DESC
