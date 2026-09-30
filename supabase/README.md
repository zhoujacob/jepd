# Database setup

The pre-launch development migrations have been consolidated into one baseline:

[`migrations/20260929000000_initial_schema.sql`](migrations/20260929000000_initial_schema.sql)

It creates the current tables, indexes, row-level security, checked functions, Discord connection/reminder logic, and owner diagnostics in one transaction. It contains no test data and does not create Auth accounts, configure secrets, schedule jobs, or send messages. Discord is optional to configure, but its schema is included.

## Start clean before launch

1. Create a **new Supabase project** for the clean database. The old hosted test project is separate from your local Next.js app; deleting local files or table rows does not reset its schema. Keep the old project until the new setup is verified. If its reminder job is enabled, stop that job before enabling reminders in the new project to avoid two senders.
2. Run the complete initial migration once as the project owner in **SQL Editor → New query**. Supabase already supplies the Auth schema and API roles. Record that you applied this file: SQL Editor execution does not automatically populate Supabase CLI migration history.
3. Follow [owner setup](../docs/SETUP.md) to configure Google login and preapprove your first admin email. New projects do not inherit approvals, Auth accounts, schedules, availability, Discord connections, Vault secrets, or Cron jobs.
4. Update `.env.local` and Vercel's production variables with the **new project's** URL and publishable key, plus its backend secret key if using Discord connections. Update Google's redirect URI to the new Supabase callback and set the app callback allowlist in the new project. Restart locally and redeploy Vercel after environment changes.
5. Reconnect Discord accounts as needed. Follow [Discord setup](../docs/DISCORD.md) to enable `pg_net`/`pg_cron`, configure Vault, test delivery, and explicitly activate the jobs. Existing Discord application credentials and app callback URLs can be reused if the app origin is unchanged; the Vault secret and jobs must be configured in the new project.

The baseline **refuses an existing app schema, even with empty tables**. It is not a reset script or an upgrade for the old test project. If you need to retain the same Supabase project, first plan a complete app-schema reset including its Cron jobs and migration tracking; do not run the baseline over the old schema or drop Supabase-managed Auth objects ad hoc. No reset is performed by this repository.

Once this baseline has been applied to the production project, keep it unchanged and add future numbered migrations for changes. Do not repeatedly squash deployed history.

## Operational scripts (separate from schema migrations)

Run these deliberately in SQL Editor after setup:

- [`setup/enable_discord_reminders.sql`](setup/enable_discord_reminders.sql): creates/updates the named reminder job. Requires `pg_cron`, `pg_net`, and the Vault webhook. Activates real messages; passes 18 for day-before checks at 6 p.m. Waterloo time.
- [`setup/enable_cron_history_cleanup.sql`](setup/enable_cron_history_cleanup.sql): requires `pg_cron`; schedules daily removal of completed Cron run history older than 30 days. Does not delete delivery records.
- [`setup/test_discord_session_ping.sql`](setup/test_discord_session_ping.sql): simulates the next session's day-before check. Sends real TEST RUN coverage messages for 0–1 Yes, including `@everyone`; otherwise sends nothing. Each eligible run can send another message.

## Verify the installation

As the project owner, run:

```sql
select * from private.discord_setup_health();
select private.preview_next_discord_reminder('day_before');
select private.preview_next_discord_reminder('same_day');
```

Diagnostics and previews send no messages. Missing extensions, webhook, or jobs are expected until you configure Discord. They do not prove delivery; see [Discord diagnostics](../docs/DISCORD.md#setup-health-and-message-previews) and live test instructions.

`npm test` applies the single baseline to fresh in-memory PostgreSQL fixtures and checks access controls, sessions, Discord, and rejection of accidental reapplication. Auth and network services are fake; tests do not contact your Supabase project or Discord.

## Troubleshooting

**The initial migration says a fresh project is required:** you selected an existing app database. Emptying its rows is insufficient. Use the new project, or arrange an explicit reset before applying this baseline.

**Session board fails or a table/function is missing:** check the Next.js log for `[sessions] get_session_week failed`, confirm environment variables point to the intended project, and confirm the complete baseline succeeded. Do not apply fragments or recreate old repair migrations. For a deployed baseline, repair unexpected schema changes with a new data-preserving migration.

**Cron succeeded but no Discord message:** success means SQL ran. Timing, Yes count, cancellation status, and delivery history must all permit a message. Inspect the delivery log in the Discord guide. Do not delete delivery history to force a test.
