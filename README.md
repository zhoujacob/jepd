# UW Pickleball Club dashboard

Licensed under the [MIT License](LICENSE).

A small executive workspace built with Next.js App Router, TypeScript, Tailwind CSS, and Supabase. Google is the only login method. The only roles are **club exec** and **club admin**; there is no general member account or automated invitation email.

## Documentation

| Task                                                | Guide                                      |
| --------------------------------------------------- | ------------------------------------------ |
| Use the app                                         | Exec/admin instructions below              |
| Run the app locally                                 | Local development below                    |
| Set up the shared project                           | [Owner setup](docs/SETUP.md)               |
| Apply or troubleshoot SQL migrations                | [Database guide](supabase/README.md)       |
| Connect Discord, schedule reminders, or send a test | [Discord guide](docs/DISCORD.md)           |
| Deploy to Vercel                                    | [Deployment checklist](docs/DEPLOYMENT.md) |
| Understand the code and access checks               | [Project architecture](docs/PROJECT.md)    |

For the first deployment, follow the [Vercel checklist](docs/DEPLOYMENT.md) in order. It covers the production environment, Google/Supabase redirects, Discord connections and reminders, and launch checks. A custom domain is optional.

## Execs and admins: use the dashboard

1. Give a club admin the exact email of the Google account you will use.
2. The admin adds it with your role, then shares the website link through club chat or another channel. You will not receive an automated invitation.
3. Open the website and select **Continue with Google**. Choose the approved account. Your pending access becomes active on this first successful sign-in.

No local setup, Supabase console account, or separate dashboard password is needed. Use the hosted website URL; another person's `localhost:3000` is not a shared URL. If access is denied, check which Google account you selected and ask an admin to verify the approved email.

## Admins: manage access

Open **Manage access** in the sidebar:

- Enter the exact Google account email, select **Exec** or **Admin**, and choose **Add access**. The record is saved as **Pending first sign-in**, even if an Auth account already exists.
- Tell the person yourself: “You've been added; sign in with the Google account associated with this address.” The app does not send anything.
- After they sign in, the record shows **Active**. Admins have all exec permissions and can approve or remove other execs and admins.
- **Remove access** revokes pending or active access. Future protected server requests are denied, including for signed-in users. Previously rendered browser content cannot be recalled. Their availability, saved defaults, and Discord connection are removed. Their Supabase Auth account and Discord server membership are retained.
- You cannot remove your own admin access. Another active admin can remove it; removals are serialized in the database to prevent two admins from removing each other at the same time.
- Duplicate emails are rejected without changing their role. To correct an email or change someone else's role, remove their approval and add it again. They must sign in again to activate the new approval.

Matching ignores case and surrounding whitespace but does not merge Gmail dot variants, `+aliases`, or `googlemail.com` addresses. Enter the email Google actually reports for their account. Google Workspace addresses are supported too; there is no domain-wide allowlist.

## Local development

The database starts with one [initial migration](supabase/migrations/20260929000000_initial_schema.sql) for a fresh Supabase project. It includes all app features; Discord sending and history cleanup are activated separately. To replace the old test project, follow [the clean-start guide](supabase/README.md#start-clean-before-launch).

After the project owner completes [shared setup](docs/SETUP.md):

1. Use Node.js 22 or 24 LTS and run `npm ci`.
2. Copy `.env.example` to `.env.local` and set the three core variables:

   | Variable                               | Value                         |
   | -------------------------------------- | ----------------------------- |
   | `NEXT_PUBLIC_SUPABASE_URL`             | Existing Supabase project URL |
   | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Project publishable key       |
   | `SITE_URL`                             | `http://localhost:3000`       |

3. Ask an admin to approve your exact Google email.
4. Run `npm run dev`, then open [localhost:3000](http://localhost:3000).

The owner must allow `http://localhost:3000/auth/callback` in Supabase. Restart the dev server after environment changes. Local development uses the configured database, so changes affect that project. Do not rerun migrations that are already applied.

Optional Discord account connections also require `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, and `SUPABASE_SECRET_KEY` on the Next.js server. They are not needed to develop the core dashboard. The Google client secret stays in Supabase; the Discord channel webhook stays in Vault. See [Discord account setup](docs/DISCORD.md#optional-discord-account-connections). Never expose secret keys with a `NEXT_PUBLIC_` prefix.

## Sessions: repeating schedules and availability

Open **Sessions** for the Monday–Sunday board. All times use Waterloo local time (`America/Toronto`), including daylight-saving changes. Tabs above the week heading separate **This week** (the availability board and one-off changes) from **Weekly schedule** (repeating sessions) and **My usual availability** (personal defaults). Previous / This week / Next changes the displayed week.

- In **Weekly schedule**, add a weekday and start/end times once. The session repeats from today onward. Each week is generated automatically when opened; there is no copy button, calendar integration, or email. Optional Discord reminders also generate upcoming dates automatically.
- Each active exec/admin can set **My usual availability** for each recurring session: Yes, Maybe, No, or Don't autofill. Defaults fill unanswered upcoming sessions when their week is opened, including a week that was opened before the defaults were saved. They never change existing answers (including answers previously filled by a default), past sessions, or explicitly cleared dates. Extra one-off sessions remain unanswered.
- Change a cell in your row for a date-specific exception. **Not answered** explicitly leaves that date blank so autofill cannot undo it. This does not change your weekly defaults. Responses save automatically, counts update after confirmation, and failures restore the previous selection. Only you can change your responses and defaults, even if another user is an admin.
- **This week → Manage this week** lets you add an extra session, update its time, or cancel a single date. Changing a date’s time clears its answers and disables autofill for that date; saving unchanged times preserves answers. Cancelling one date does not stop the recurring series, and opening the week again will not recreate the cancelled date.
- Expand an existing weekly session to change its day/time or **Stop repeating**. Creators manage their own schedules/sessions; admins can manage any. Changes take effect from today, preserving earlier dates. A time/day change starts a new series: old defaults and future answers do not transfer. Execs must set their usual availability for the new time. A no-op edit preserves answers.
- The roster includes execs/admins after first sign-in. Pending approvals do not appear. Removing club access clears that person's responses and defaults while keeping the schedule.
- The board keeps the spreadsheet colors and pinned names. Scroll sideways on mobile. Refresh to see other people's latest changes; there is no live subscription.

## Discord

The sidebar's **Discord account** page lets an exec connect or disconnect their account. Google remains the login method. Removing club access also removes this app connection, but does not remove Discord server membership or Discord roles.

Supabase Cron checks coverage through a channel webhook, even when the local app is off. The setup script schedules day-before warnings at **6 p.m. Waterloo time** for zero/one Yes responses, and same-day reminders at **9 a.m.** for two or more. Coverage requests tag `@everyone`; same-day messages tag connected Yes attendees and list unconnected attendees by profile name.

See the [Discord guide](docs/DISCORD.md) for setup, timing, delivery checks, retention, and the manual **TEST RUN** query. Scheduled checks do not send a message every five minutes: eligibility and saved delivery records prevent repeated notifications.

## Development checks

```sh
npm test
npm run lint
npm run typecheck
npm run build
npm run format:check
```

Tests run against in-memory PostgreSQL/Auth fixtures and fake Discord HTTP responses; they do not send real messages. `npm run format` formats project files. `npm start` serves the production build. After configuring a real project, test Google sign-in, role activation/removal, session updates, Discord connection, and mobile navigation.

Pages load data, client forms manage interactions, and `actions.ts` files validate protected writes. Longer Tailwind class lists live in adjacent `*-styles.ts` files, so components can use readable names such as `styles.input` or `styles.panel`. `globals.css` contains theme tokens and shared base styles. See [UI organization and styling](docs/PROJECT.md#ui-organization-and-styling) for the conventions and [Sessions](docs/PROJECT.md#sessions) for its file map.

Keep changes small; avoid adding abstractions for one-off markup. Applied SQL migrations are history: add a new migration instead of rewriting or deleting old ones.
