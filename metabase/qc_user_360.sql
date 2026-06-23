-- ============================================================================
--  QC User Productivity · 360  [ClickHouse]
--  Per QC user, 360 spins PROCESSED (qc_done_time set) per day, last 60 days.
--  Source: {{#12411}} "Qc Activity Log"
--  Output: day | user_id | processed
--  Create as a NEW Native query -> Run -> Save -> public link.
-- ============================================================================
SELECT
  toDate(parseDateTimeBestEffortOrNull(toString(qc_done_time))) AS day,
  qc_user_id                                                    AS user_id,
  count()                                                       AS processed
FROM {{#12411}}
WHERE qc_done_time != ''
  AND qc_user_id != ''
  AND toDate(parseDateTimeBestEffortOrNull(toString(qc_done_time))) >= today() - 60
GROUP BY day, user_id
ORDER BY day DESC, processed DESC
