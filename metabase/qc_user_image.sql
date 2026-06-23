-- ============================================================================
--  QC User Productivity · IMAGE  [ClickHouse]   (now segment-aware)
--  Per QC user, SKUs PROCESSED (qc_done) per day + customer_segment, last 60 days.
--  Source: {{#12429}} "Sku Activity Log" (has enterprise_id) joined to segment.
--  Output: day | user_id | segment | processed
--  RE-SAVE this over the existing question (same public link) so the avg-per-user
--  chart can filter by segment.
-- ============================================================================
SELECT
  toDate(parseDateTimeBestEffortOrNull(toString(a.created_on))) AS day,
  a.qc_user_id                                                  AS user_id,
  coalesce(ed.customer_segment, 'Unknown')                      AS segment,
  count()                                                       AS processed
FROM {{#12429}} AS a
LEFT JOIN eventila.enterprise_details AS ed ON ed.enterprise_id = a.enterprise_id
WHERE a.updated_status = 'qc_done'
  AND a.qc_user_id != ''
  AND toDate(parseDateTimeBestEffortOrNull(toString(a.created_on))) >= today() - 60
GROUP BY day, user_id, segment
ORDER BY day DESC, processed DESC
