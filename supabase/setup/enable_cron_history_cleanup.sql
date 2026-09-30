-- Requires pg_cron to be enabled. Run as the project owner in SQL Editor.
-- Keep 30 days of completed run history for all Cron jobs in this project.
-- Registering the same named job again updates it instead of adding another.
select cron.schedule(
  'club-cron-history-cleanup',
  '15 4 * * *', -- Daily at 04:15 UTC with Supabase's default Cron timezone.
  $$
    delete from cron.job_run_details
    where end_time < now() - interval '30 days';
  $$
);
