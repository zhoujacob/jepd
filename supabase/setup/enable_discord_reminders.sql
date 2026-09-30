-- Run only after the initial schema, enabling pg_net/pg_cron, and adding the Vault secret.
-- This activates real @everyone messages. The named job is updated if run again.
select cron.schedule(
  'discord-session-reminders',
  '*/5 * * * *',
  'select private.send_discord_session_reminders(18);'
);
-- The argument is the day-before hour in Waterloo time (0–23).
-- Same-day reminders always use 9 a.m.; the function handles daylight-saving time.
-- To stop: select cron.unschedule('discord-session-reminders');
