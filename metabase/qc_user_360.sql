-- ============================================================================
--  QC User Productivity · 360  [ClickHouse]   (now segment-aware)
--  Per QC user, spins PROCESSED per day + customer_segment, last 60 days.
--  Source: {{#12411}} "Qc Activity Log" (has enterprise_id) joined to segment.
--  Output: day | user_id | segment | processed
--  RE-SAVE this over the existing question (same public link).
-- ============================================================================
SELECT
  toDate(parseDateTimeBestEffortOrNull(toString(q.qc_done_time))) AS day,
  q.qc_user_id                                                    AS user_id,
  coalesce(ed.customer_segment, 'Unknown')                        AS segment,
  count()                                                         AS processed
FROM {{#12411}} AS q
LEFT JOIN eventila.enterprise_details AS ed ON ed.enterprise_id = q.enterprise_id
WHERE q.qc_done_time != ''
  AND q.qc_user_id != ''
  AND toDate(parseDateTimeBestEffortOrNull(toString(q.qc_done_time))) >= today() - 60
GROUP BY day, user_id, segment
ORDER BY day DESC, processed DESC
