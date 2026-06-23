-- ============================================================================
--  QC TIME TRACKER — daily QC time by category (V0)   [ClickHouse]
--  Returns ONE SMALL ROW PER (category, day): category | day | throughput
--                                             | median_qc_min | avg_qc_min
--  image -> {{#12410}} "Image_QC Time" (qc_time_hrs, HOURS)
--  360   -> {{#12411}} "Qc Activity Log" (total_qc_time)
--  No params. Paste -> Run -> Save -> share public link.
--  CONFIRM in preview: 360 cols total_qc_time/qc_done_time; total_qc_time unit
--  (assumed MINUTES — if seconds, use total_qc_time/60).
-- ============================================================================

WITH
img AS (
  SELECT
    'image' AS category,
    toDate(parseDateTimeBestEffortOrNull(toString(ts_qc_done))) AS day,
    qc_time_hrs * 60 AS qc_min
  FROM {{#12410}}
  WHERE qc_time_hrs > 0 AND qc_time_hrs < 240
),
s360 AS (
  SELECT
    '360' AS category,
    toDate(parseDateTimeBestEffortOrNull(toString(qc_done_time))) AS day,
    total_qc_time AS qc_min
  FROM {{#12411}}
  WHERE total_qc_time > 0 AND total_qc_time < 1440
),
u AS (
  SELECT category, day, qc_min FROM img
  UNION ALL
  SELECT category, day, qc_min FROM s360
)
SELECT
  category,
  day,
  count()                              AS throughput,
  round(quantileExact(0.5)(qc_min), 2) AS median_qc_min,
  round(avg(qc_min), 2)                AS avg_qc_min
FROM u
WHERE day IS NOT NULL
GROUP BY category, day
ORDER BY day DESC, category
