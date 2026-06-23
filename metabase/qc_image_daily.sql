-- ============================================================================
--  QC Daily · IMAGE   [ClickHouse]  — qc_time_hrs (turnaround) + buckets + segment
--  REPLACE THE WHOLE QUERY with this.
--  Output: day | segment | throughput | median_qc_hrs | avg_qc_hrs
--                        | under_6h | h6_12 | over_12h
--  Image has no enterprise_id, so we bridge to segment via medias:
--     image.vin = media_management.medias.mediaChildRelations_catalog_id
--     medias.enterpriseId -> eventila.enterprise_details.enterprise_id
-- ============================================================================
SELECT
  day,
  segment,
  count()                                        AS throughput,
  round(quantileExact(0.5)(qc_time_hrs), 3)      AS median_qc_hrs,
  round(avg(qc_time_hrs), 3)                     AS avg_qc_hrs,
  countIf(qc_time_hrs < 6)                       AS under_6h,
  countIf(qc_time_hrs >= 6 AND qc_time_hrs < 12) AS h6_12,
  countIf(qc_time_hrs >= 12)                     AS over_12h
FROM
(
  SELECT
    toDate(parseDateTimeBestEffortOrNull(toString(im.ts_qc_done))) AS day,
    im.qc_time_hrs                                                 AS qc_time_hrs,
    coalesce(ed.customer_segment, 'Unknown')                       AS segment
  FROM {{#12410}} AS im
  LEFT JOIN media_management.medias AS m
         ON m.mediaChildRelations_catalog_id = im.vin
  LEFT JOIN eventila.enterprise_details AS ed
         ON ed.enterprise_id = m.enterpriseId
  WHERE im.qc_time_hrs > 0 AND im.qc_time_hrs < 240
) t
GROUP BY day, segment
ORDER BY day DESC, segment
