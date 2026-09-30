# Discord session reminders

The project owner sets this up once in Supabase. Execs can optionally connect Discord from the workspace sidebar to receive personal session mentions. Supabase runs the job even when the Next.js app is only running locally or your laptop is off. The Supabase project must remain running.

## When messages are sent

All times are **Waterloo time (`America/Toronto`)**, including daylight-saving changes. Only **Yes** counts as attending; Maybe, No, and unanswered do not.

| Check                                  | Yes responses | Message                                                 |
| -------------------------------------- | ------------- | ------------------------------------------------------- |
| Day before, 6 p.m. in the setup script | 0             | `@everyone` — no execs signed up; ask for coverage      |
| Day before, 6 p.m. in the setup script | 1             | `@everyone` — one exec could use backup                 |
| Day before                             | 2+            | No message                                              |
| Session day, 9 a.m.                    | 2+            | Linked attendees — session reminder with attendee count |
| Session day                            | 0–1           | No additional message under these rules                 |

Each message includes the date and start/end times. Day-before coverage requests still tag `@everyone`, plus the linked attendee when there is one. Same-day reminders mention only connected execs who answered Yes, using their verified Discord user IDs. Execs without a connection are listed by their dashboard profile name as plain text. Missing names appear as “An exec”; account emails are never used as a fallback. Names cannot trigger mentions. The attendee list includes up to 50 people within a message-length budget, with “and N more” for any remaining attendees.

Discord notification settings can suppress push notifications. Connections do not grant channel access, and no account emails are posted.

Counts are checked when the job runs, not frozen the day before. A session that gains coverage after a day-before warning can also get its same-day reminder. Sessions starting at or before the same-day check are skipped. There are no change/cancellation announcements after a message has already been sent.

The job checks every five minutes during the relevant hour (18:00–18:59 for day-before warnings in the setup script; 09:00–09:59 for same-day reminders). This allows short delays without sending reminders hours late. It creates recurring dates and fills eligible usual availability even if nobody opens the board. Explicit blanks, time overrides, cancellations, stopped schedules, and removed execs are respected.

## Owner setup

1. In Discord, open your target **text channel → Edit Channel → Integrations → Webhooks**, create a webhook, and copy its URL. Use a regular text channel; this implementation does not configure forum threads. You need permission to manage webhooks. For the first test, use a private test channel because the real messages mention `@everyone`. See [Discord's webhook guide](https://support.discord.com/hc/en-us/articles/228383668-Intro-to-Webhooks).
2. In Supabase **Database → Extensions**, enable **pg_net** and **pg_cron** (Cron may also appear under Integrations). Confirm **Vault** is available. Sending reminders requires no Edge Function or bot token. Optional account connections have additional server setup below.
3. In **Supabase Vault**, create a secret named **`discord_session_webhook`** and paste the copied webhook URL as its value. Keep the URL out of source code and browser environment variables. Use `https://discord.com/api/webhooks/.../...` without query parameters.
4. Confirm the [initial schema](../supabase/migrations/20260929000000_initial_schema.sql) was applied to the fresh project. It already includes reminder functions, delivery logs, connections, tests, and diagnostics. Do not rerun it on an existing schema. It does not start sending messages.
5. When ready to enable real notifications, run [`supabase/setup/enable_discord_reminders.sql`](../supabase/setup/enable_discord_reminders.sql) in SQL Editor. It creates the named `discord-session-reminders` job. Running the setup file again updates that job rather than adding another one. The setup script passes `18` for day-before warnings at 6 p.m.; change that argument to `9` for 9 a.m. warnings. Same-day reminders remain at 9 a.m.
6. Check **Supabase Cron → discord-session-reminders → run history**. At the next eligible check, confirm the message in Discord and inspect delivery status below. The first live test is still necessary: repository tests fake HTTP requests and cannot validate your channel permissions or webhook.

The underlying services are documented in [Supabase Cron](https://supabase.com/docs/guides/cron), [pg_net](https://supabase.com/docs/guides/database/extensions/pg_net), and [Vault](https://supabase.com/docs/guides/database/vault). Messages use Discord's [`wait=true` webhook option](https://docs.discord.com/developers/resources/webhook#execute-webhook) for delivery confirmation.

## Checking delivery and stopping the job

Run this as the project owner in Supabase SQL Editor:

```sql
select s.session_date, s.starts_at, d.kind, d.status, d.http_status, d.queued_at
from private.discord_session_deliveries d
join public.club_sessions s on s.id = d.session_id
order by d.queued_at desc;
```

`pending` means queued, not yet confirmed. The next five-minute tick records `sent` after HTTP success, `failed` for a rejected request (including Discord rate limits), or `unknown` when delivery cannot be confirmed. A Cron success means the SQL ran; check the delivery log to verify Discord accepted the request.

Each session has at most one queued attempt per reminder type. Failures/timeouts are **not automatically retried**, since an uncertain result could already have posted an `@everyone` message. Check the channel and Cron errors before taking corrective action. This simple integration does not guarantee delivery through outages; monitor it during initial rollout. Do not clear the delivery log casually, as doing so allows duplicate notifications.

To disable future notifications:

```sql
select cron.unschedule('discord-session-reminders');
```

Already queued HTTP requests may still complete. To switch channels, replace the Vault secret value with the new channel's webhook URL; existing delivery records remain intact.

Local verification: `npm test` covers recipient counts, timing, daylight-saving changes, unopened weeks, cancelled sessions, deduplication, delivery states, and permission checks using fake network/Vault tables. It sends no real messages.

## Automatically clean up Cron history

Run [`enable_cron_history_cleanup.sql`](../supabase/setup/enable_cron_history_cleanup.sql) once in Supabase SQL Editor as the project owner, after enabling `pg_cron`. This schedules **club-cron-history-cleanup** daily at **04:15 UTC** (with Supabase's default Cron timezone).

It deletes completed run-history entries older than **30 days** for all Cron jobs in this project, including its own history. Running jobs and entries without an end time are preserved. The first cleanup happens at the next scheduled run; registering the job does not immediately delete history. Change `30 days` in the setup script and rerun it to adjust retention.

This cleans only `cron.job_run_details`. It keeps the Cron jobs, sessions, availability, accounts, and Discord delivery records. Delivery records prevent duplicate reminders. Supabase documents this cleanup approach in its [Cron guide](https://supabase.com/docs/guides/cron/quickstart#clean-up-job-run-history).

If you already enabled history cleanup using Supabase's **Enable cleanup** button, check that job's retention first: another cleanup job with a shorter retention can still remove recent history. Use one cleanup policy.

To stop this cleanup job:

```sql
select cron.unschedule('club-cron-history-cleanup');
```

## Optional Discord account connections

Google remains the only dashboard login. Discord is connected separately using the `identify` OAuth scope, which verifies the account without requesting its email, server access, or bot permissions. See [Discord OAuth2](https://docs.discord.com/developers/topics/oauth2).

### Owner setup

1. Confirm the initial schema is installed. It includes private-to-owner Discord connection records and personal mentions. Account connections do not require an additional migration or reminder job.
2. In the [Discord Developer Portal](https://discord.com/developers/applications), create an application for the club dashboard. Under **OAuth2 → Redirects**, add the exact callback for each app environment:
   - `http://localhost:3000/auth/discord/callback`
   - `https://YOUR-DOMAIN/auth/discord/callback` when deploying.
3. Copy the application's **Client ID** and **Client Secret** into the Next.js server's environment (locally, `.env.local`):

   ```dotenv
   DISCORD_CLIENT_ID=your-discord-application-client-id
   DISCORD_CLIENT_SECRET=your-discord-application-client-secret
   SUPABASE_SECRET_KEY=your-supabase-secret-key
   ```

   Get a backend secret key (`sb_secret_...`) from your Supabase project's API Keys settings, or use the legacy `service_role` key. This privileged key is used only by the verified Discord callback to save the connection. Keep it server-side, without a `NEXT_PUBLIC_` prefix. Normal Google sign-in, session management, and the Cron job still use their existing configuration. See [Supabase API keys](https://supabase.com/docs/guides/getting-started/api-keys).

4. Set `SITE_URL` to the exact origin where the exec starts connecting and restart the app. Do not enable Discord as a Supabase Auth provider or turn on Supabase identity linking: this is a separate account connection, not another login method. No Discord bot installation is required. Keep the existing channel webhook in Vault.
5. While signed in with Google, open **Discord account** in the sidebar, select **Connect Discord**, and approve the Discord authorization. The page should show the connected username. Each Discord account may be connected to only one active club account. To change accounts, disconnect and reconnect.
6. Test using your test channel: mark linked execs Yes and confirm the next eligible reminder mentions them. Maybe/No/unanswered users should not be mentioned. The test suite uses fake OAuth/network responses; a live connection and channel-permission check is still needed after configuration.

### Removal and privacy

Removing club role access automatically deletes the account's Discord connection through a database foreign key. Reapproving the same Google account requires a fresh Discord connection. Expired requests, requests for another signed-in user, and callbacks tied to the old approval cannot restore it. Execs can also disconnect themselves from the Discord account page.

This removes the link **in this app**. It does not remove anyone from the Discord server, change their Discord roles, or revoke the application's authorization in Discord's settings. Users can revoke that authorization under Discord's Authorized Apps. Messages already posted or queued cannot be recalled by removing access.

Only the verified Discord ID and username are stored; OAuth access and refresh tokens are not persisted. Other execs/admins cannot read another user's connection through the app's database API. The attendee list reveals connected Discord accounts and unlinked attendees’ profile names to people in the configured channel.

## Names for attendees without Discord

The initial schema includes name fallbacks: reminders list linked attendees as mentions and unlinked attendees by profile name, for example `Attending: @Alex, Taylor Example`. No extra migration is needed.

## Test the next session automatically

The initial schema includes these owner-only test functions. The real Cron job and these tests use the same reminder worker; tests do not change its schedule.

Run [`test_discord_session_ping.sql`](../supabase/setup/test_discord_session_ping.sql), or simply:

```sql
select private.test_next_discord_session();
```

No email, date, time, or Discord ID is needed. The test finds the earliest upcoming session that has not started (including recurring dates nobody has opened yet), then simulates **6 p.m. Waterloo time the day before that session** using current availability and eligible defaults.

For example, at 11:27 a.m. Monday it selects Monday's 7–9 p.m. session and checks it as if the day-before job ran Sunday at 6 p.m. This is not a reconstruction of Sunday's historical responses.

- **Zero Yes:** asks for coverage.
- **One Yes:** asks for backup, mentioning that attendee if connected.
- **Two or more Yes:** sends nothing, matching the real day-before rule. It does not move on to a later session to find one needing coverage.
- **No upcoming session:** sends nothing and returns an explanation.

Messages are labeled **TEST RUN**, and coverage messages really mention `@everyone`. Connected Yes attendees use their Discord IDs; others use profile names. Dates/defaults may be materialized as in normal Cron execution. Normal delivery history remains untouched; every eligible test execution can send another real message, even for a session already reminded.

The returned JSON includes the selected date/time, `yes_count`, `queued`, `request_ids`, and a result message. After the transaction commits, wait a few seconds and check an ID from `request_ids`:

```sql
select status_code, error_msg
from net._http_response
where id = 123; -- replace with a returned request ID
```

HTTP 200 confirms Discord accepted it. No row yet means pending. The test does not appear in normal reminder delivery history. Supabase Cron's run history separately confirms whether the scheduler fires.

### Optional: test a specific session or same-day reminder

The explicit-date entry point remains available:

```sql
select private.test_discord_session_reminder(
  date '2026-09-28', time '19:00', time '21:00', 'same_day'
);
```

`same_day` simulates 9 a.m. on that date and requires two or more Yes responses and a later start time. Use `day_before` for the zero/one coverage rule. Both modes label messages TEST RUN and preserve normal delivery history.

## Setup health and message previews

The initial schema includes these owner-only diagnostics. They do not change Cron schedules or send test messages.

Run as the project owner in Supabase SQL Editor:

```sql
select * from private.discord_setup_health();
select private.preview_next_discord_reminder('day_before');
select private.preview_next_discord_reminder('same_day');
```

The health report checks extensions, required functions, the time-override column, webhook configuration, named jobs, and recent Cron runs. It never returns the webhook URL or sends a message. A missing reminder job is expected before activation, and a newly scheduled job may report `not_run` until its first execution.

Previews select the next upcoming session and simulate 6 p.m. the day before or 9 a.m. the same day using current availability. They return the candidate payload and eligibility, including whether a normal delivery attempt already exists. Temporary date/default generation is rolled back; no message or delivery record is created. These checks do not validate the webhook with Discord or prove channel access. Use the real TEST RUN procedure above for delivery verification.
