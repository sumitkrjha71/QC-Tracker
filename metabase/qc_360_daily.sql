-- ============================================================================
--  QC Daily · 360   [ClickHouse]  — turnaround (Assigned->Done) + buckets + segment
--  REPLACE THE WHOLE QUERY with this (do not paste snippets into the old one).
--  Output: day | segment | throughput | median_qc_hrs | avg_qc_hrs
--                        | under_6h | h6_12 | over_12h
--  Segment from eventila.enterprise_details.customer_segment (SMB/Enterprise/Embed).
-- ============================================================================
SELECT
  day,
  segment,
  count()                                  AS throughput,
  round(quantileExact(0.5)(turn_hrs), 3)   AS median_qc_hrs,
  round(avg(turn_hrs), 3)                  AS avg_qc_hrs,
  countIf(turn_hrs < 6)                    AS under_6h,
  countIf(turn_hrs >= 6 AND turn_hrs < 12) AS h6_12,
  countIf(turn_hrs >= 12)                  AS over_12h
FROM
(
  SELECT
    toDate(parseDateTimeBestEffortOrNull(toString(q.qc_done_time)))   AS day,
    dateDiff('second',
      parseDateTimeBestEffortOrNull(toString(q.qc_assigned_time)),
      parseDateTimeBestEffortOrNull(toString(q.qc_done_time))) / 3600.0 AS turn_hrs,
    coalesce(ed.customer_segment, 'Unknown')                          AS segment
  FROM {{#12411}} AS q
  LEFT JOIN eventila.enterprise_details AS ed
         ON ed.enterprise_id = q.enterprise_id
  WHERE q.qc_assigned_time != '' AND q.qc_done_time != ''
) t
WHERE turn_hrs > 0 AND turn_hrs < 240
GROUP BY day, segment
ORDER BY day DESC, segment
