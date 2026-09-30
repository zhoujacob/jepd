# Deploy to Vercel

Follow this checklist in order for the current app, including Google login, Discord account connections, and scheduled reminders. Replace `https://YOUR-APP.vercel.app` with the stable production domain shown in Vercel. A custom domain is optional. Unchecked items require verification in your accounts; a successful local build does not verify hosted configuration.

## 1. Prepare the source and hosting project

- [ ] Publish the project to a GitHub repository if it is not already in one. Include `package-lock.json`, migrations, and docs. Review the files before committing; `.gitignore` excludes `.env*` except `.env.example`. Never commit credentials or participant data.
- [ ] In Vercel, choose **Add New → Project** and import that repository. Use **Next.js**, repository root `./`, install command `npm ci`, build command `npm run build`, and the default Next.js output directory. Do not configure a static export or an `npm start` server.
- [ ] Select Node.js **24.x** (or 22.x) and use the same supported major locally. Select the intended production branch, normally `main`.
- [ ] Review [Hobby eligibility](https://vercel.com/docs/limits/fair-use-guidelines) and [repository restrictions](https://vercel.com/docs/limits). Hobby is for personal, non-commercial use and cannot connect organization-owned Git repositories. Confirm the club's eligibility with Vercel if unclear; use Pro when required.
- [ ] Choose one stable production origin, such as `https://YOUR-APP.vercel.app`. If the assigned URL is only known after the first deployment, update the settings below and redeploy before testing login. Do not use a per-deployment hash URL.
- [ ] If using a custom domain, add it in Vercel, configure the supplied DNS records, and wait for HTTPS. Redirect other production domain variants to the chosen origin. OAuth must begin and finish on the same origin for cookies to work.

## 2. Prepare the production Supabase project

- [ ] For a clean launch from the old test setup, create a **new Supabase project** using [Start clean before launch](../supabase/README.md#start-clean-before-launch). Stop reminders in the old test project before activating the new sender. Deleting rows alone does not clear an existing schema.
- [ ] Run the complete [`20260929000000_initial_schema.sql`](../supabase/migrations/20260929000000_initial_schema.sql) once in the fresh project. It includes the dashboard and all Discord functions but creates no jobs or test data. SQL Editor does not automatically record CLI migration history; record the applied filename. **Do not apply this baseline over the old test schema.** If already using this baseline, apply only later missing migrations and preserve accounts/data.
- [ ] For a new project, preapprove the first admin's exact Google email using [owner setup](SETUP.md#3-preapprove-yourself-as-the-first-admin). Existing projects should retain their current admin approvals.
- [ ] Decide how production data will be backed up and who can restore it. Use a separate Supabase project for development/preview work when possible; local changes against the production project affect real users and reminders.

## 3. Set Vercel production environment variables

Add these in the project's **Environment Variables**, scoped to **Production**. Local `.env.local` is not uploaded as production configuration.

| Variable                               | Value / source                                                                                                            |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`             | Production Supabase project URL                                                                                           |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Publishable key from that same project                                                                                    |
| `SITE_URL`                             | Exact production HTTPS origin, e.g. `https://YOUR-APP.vercel.app`, with no path                                           |
| `DISCORD_CLIENT_ID`                    | Discord application client ID, for account connections                                                                    |
| `DISCORD_CLIENT_SECRET`                | Discord application client secret, for account connections                                                                |
| `SUPABASE_SECRET_KEY`                  | Backend secret key (`sb_secret_...`) or legacy `service_role` key from the same Supabase project, for account connections |

- [ ] Set the first three variables for the dashboard; set all six to enable Discord account connections. Never prefix the backend secret or Discord secret with `NEXT_PUBLIC_`.
- [ ] Keep Google's client secret in **Supabase's Google provider settings**. Keep the channel webhook in **Supabase Vault**, named `discord_session_webhook`. Neither belongs in Vercel environment variables.
- [ ] Redeploy after setting or changing variables, including `NEXT_PUBLIC_` values embedded during build. Leaving `SITE_URL` as localhost sends production sign-ins back to localhost. Keep local development's `SITE_URL=http://localhost:3000` in its own `.env.local`.

## 4. Configure Google and Supabase Auth

- [ ] In Google Auth Platform, create/select the club's **Web application** OAuth client. Add the production origin under **Authorized JavaScript origins**.
- [ ] In Google **Authorized redirect URIs**, use the exact callback shown in Supabase's Google provider settings, normally `https://YOUR-PROJECT.supabase.co/auth/v1/callback`. This is different from the app callback and changes only if the Supabase project/Auth domain changes.
- [ ] Enable Google in Supabase and configure that client's ID and secret. Disable Email and other unused providers. Keep **Allow new users to sign up** enabled: approved execs need an Auth account on their first Google sign-in. An Auth account alone grants no dashboard access.
- [ ] In Supabase **Authentication → URL Configuration**, set **Site URL** to `https://YOUR-APP.vercel.app` and add `https://YOUR-APP.vercel.app/auth/callback` to the redirect allowlist.
- [ ] Review Google **Audience**: use External if accounts outside your Google organization, including personal Gmail accounts, need access. Publish for production use and complete any branding/domain verification Google requests. Keep only basic `openid`, email, and profile scopes. Google test-user entries do not grant club roles.
- [ ] Update Google branding, support contacts, and any website/privacy/terms links. Retain localhost callback/origin entries only for intentional development; remove obsolete URLs and avoid broad production redirect wildcards.

| Setting                                                        | Correct URL                                         |
| -------------------------------------------------------------- | --------------------------------------------------- |
| Vercel `SITE_URL`, Supabase Site URL, Google JavaScript origin | `https://YOUR-APP.vercel.app`                       |
| Supabase allowed app redirect                                  | `https://YOUR-APP.vercel.app/auth/callback`         |
| Google authorized redirect URI                                 | `https://YOUR-PROJECT.supabase.co/auth/v1/callback` |
| Discord OAuth2 redirect                                        | `https://YOUR-APP.vercel.app/auth/discord/callback` |

Google returns to Supabase, Supabase returns to the app's `/auth/callback`, and the app activates the approved role before opening `/home`. No SMTP, invitation email, or manual creation of Auth users is required.

## 5. Configure Discord account connections

Skip this section only if execs will not connect their Discord accounts. Channel reminders are configured separately in the next section.

- [ ] In the [Discord Developer Portal](https://discord.com/developers/applications), create/select the club application. Under **OAuth2 → Redirects**, add the exact production `https://YOUR-APP.vercel.app/auth/discord/callback`.
- [ ] Confirm its client ID and secret match the Vercel variables and that the initial schema has been applied. Keep localhost redirects only if developing that integration locally.
- [ ] Use the app's **Connect Discord** button, which requests only `identify`. Do not enable Discord as a Supabase login provider or enable identity linking. No bot installation or bot token is needed.
- [ ] After deployment, sign in with Google, connect Discord, confirm the displayed username, and test disconnect/reconnect. Connecting does not add users to a Discord server or grant channel access.

## 6. Configure and verify Discord reminders

Full SQL and operational details are in [Discord setup](DISCORD.md). Deploying the Next.js app does not activate reminders; these run in **Supabase Cron**, independently of Vercel.

- [ ] Confirm `pg_cron`, `pg_net`, Vault, and the initial schema are installed. If reusing a configured project, retain its jobs and delivery history; do not create a second sender in Vercel.
- [ ] Create a webhook in the intended Discord text channel. Store its URL without query parameters as the single Vault secret named `discord_session_webhook`. Use a private test channel for initial delivery tests. If an existing production job is active, do not temporarily repoint its webhook without accounting for scheduled messages.
- [ ] Run these owner-only diagnostics in Supabase SQL Editor after applying the initial schema:

  ```sql
  select * from private.discord_setup_health();
  select private.preview_next_discord_reminder('day_before');
  select private.preview_next_discord_reminder('same_day');
  ```

  Health checks do not send messages or expose the webhook. Previews simulate the next session using current availability, discard temporary database changes, and do not contact Discord. A missing reminder job is expected before activation; previews do not prove webhook delivery.

- [ ] Verify a real delivery in the test channel using [the manual test instructions](DISCORD.md#test-the-next-session-automatically). `private.test_next_discord_session()` really sends an `@everyone` TEST RUN for 0–1 Yes; it intentionally sends nothing for 2+ Yes or no upcoming session. Use the documented explicit same-day test for 2+ Yes. Confirm HTTP success and the actual message/mentions. Each eligible test can send again.
- [ ] Set Vault to the intended live channel webhook. When ready for scheduled real notifications, run [`enable_discord_reminders.sql`](../supabase/setup/enable_discord_reminders.sql). It creates/updates `discord-session-reminders` every five minutes, with day-before warnings at **6 p.m. Waterloo time** and same-day reminders at **9 a.m.** Verify an existing job's hour rather than accidentally changing it.
- [ ] Check health again and inspect Cron run history after the next tick. A new job may report `not_run` initially. Inspect the [delivery log](DISCORD.md#checking-delivery-and-stopping-the-job) after an eligible reminder: Cron success alone does not mean Discord accepted a message. Failed or uncertain attempts are not automatically retried.
- [ ] Run [`enable_cron_history_cleanup.sql`](../supabase/setup/enable_cron_history_cleanup.sql) after enabling `pg_cron` and confirm `club-cron-history-cleanup` is scheduled. It retains 30 days of completed Cron history and preserves delivery records. Avoid a second cleanup policy with a conflicting retention period.

To stop future reminders, run `select cron.unschedule('discord-session-reminders');`. Already queued requests may complete. Do not clear delivery records to force a test; they prevent duplicate messages.

## 7. Deploy and check the real production URL

- [ ] Run the release checks on the version being deployed:

  ```sh
  npm ci
  npm test
  npm run lint
  npm run typecheck
  npm run build
  npm run format:check
  ```

- [ ] Deploy the production branch after configuring its variables. Confirm the build succeeds in Vercel. Database migrations are a separate step; the build does not apply them.
- [ ] In Vercel **Settings → Deployment Protection**, keep previews protected while allowing the production domain to reach the app's own login. **Standard Protection** supports this. Confirm in a fresh browser that execs do not need a Vercel account to open the production URL.
- [ ] Test Google login as admin and exec, pending approval activation, unapproved-account denial, logout, and access removal. Confirm callbacks return to the production origin, never localhost or a preview URL.
- [ ] Test the weekly board, saving availability and reloading it, recurring schedules/defaults, changing one session's time, and cancellation using deliberate test data. Check mobile navigation. Remove test sessions before activating reminders if they should not generate notifications.
- [ ] Complete Discord connection and live-message checks above. Ensure intended recipients can see the channel; Discord notification settings may suppress push notifications even when mentions are correct.
- [ ] Share the stable production link with approved execs once these checks pass.

## 8. Future deployments and ownership

- [ ] Keep production credentials scoped to Production. Configure previews with a separate Supabase project and test webhook. To test OAuth on a preview, choose a stable test origin and register its exact Google/Supabase/Discord settings with matching `SITE_URL`; arbitrary preview hostnames with production `SITE_URL` break the cookie flow.
- [ ] Record the repository, Vercel project, Supabase project, Google Cloud project, Discord application/channel, and responsible owners in the club's private handover notes. Keep secrets in the services or a password manager.
- [ ] Monitor Vercel usage, Supabase availability, and Cron/delivery results. Supabase Free projects can pause after seven days of low activity, interrupting login/data access and scheduled reminders; do not assume Cron guarantees exemption. See [project pausing](https://supabase.com/docs/guides/platform/free-project-pausing).
- [ ] If a release fails, redeploy a known-good compatible app version. A Vercel rollback does not undo database migrations, data changes, or Discord messages. Use data-preserving follow-up migrations for database fixes.
- [ ] When changing the production domain, update `SITE_URL`, Supabase Site URL/redirect allowlist, Google origins/branding, and Discord redirects together, then redeploy and repeat OAuth checks.

References: [Next.js on Vercel](https://vercel.com/docs/frameworks/full-stack/nextjs), [Vercel deployment protection](https://vercel.com/docs/deployment-protection), [Supabase Google setup](https://supabase.com/docs/guides/auth/social-login/auth-google), [Supabase redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls), and [Discord OAuth2](https://docs.discord.com/developers/topics/oauth2).
