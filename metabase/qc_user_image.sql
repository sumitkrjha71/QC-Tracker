-- ============================================================================
--  QC User Productivity · IMAGE  [ClickHouse]
--  Per QC user, images PROCESSED (qc_done) per day, last 60 days.
--  Source: {{#12429}} "Sku Activity Log"  (a status-transition log)
--  Output: day | user_id | processed
--  Create as a NEW Native query -> Run -> Save -> public link.
-- ============================================================================
SELECT
  toDate(parseDateTimeBestEffortOrNull(toString(created_on))) AS day,
  qc_user_id                                                  AS user_id,
  count()                                                     AS processed
FROM {{#12429}}
WHERE updated_status = 'qc_done'
  AND qc_user_id != ''
  AND toDate(parseDateTimeBestEffortOrNull(toString(created_on))) >= today() - 60
GROUP BY day, user_id
ORDER BY day DESC, processed DESC
