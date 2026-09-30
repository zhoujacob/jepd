# Project architecture

## Purpose and scope

Help University of Waterloo Pickleball Club execs organize sessions and tournaments. This does not replace the university's membership system. The only app roles are exec and admin. Tournaments remains an empty placeholder; sessions provides the weekly availability board. No student ID images are collected.

## File structure

| Location                                    | Responsibility                                                                  |
| ------------------------------------------- | ------------------------------------------------------------------------------- |
| `src/app/layout.tsx`, `globals.css`         | Root document, metadata, Tailwind theme/base styles                             |
| `src/app/login/`                            | Server-rendered login page and client Google sign-in form                       |
| `src/app/auth/callback/`                    | Supabase Google code exchange and club-access activation                        |
| `src/app/(dashboard)/layout.tsx`            | Protected workspace shell and shared sidebar                                    |
| `src/app/(dashboard)/home/`, `tournaments/` | Home links and tournament empty state                                           |
| `src/app/(dashboard)/sessions/`             | Weekly board, repeating schedule, personal defaults, checked server actions     |
| `src/app/(dashboard)/execs/`                | Admin-only approvals/removal                                                    |
| `src/app/(dashboard)/discord/`              | Optional Discord account connection and disconnection                           |
| `src/app/auth/discord/callback/`            | Verified Discord OAuth callback; the only privileged Supabase client            |
| `src/components/`                           | Shared sidebar, brand, icons, empty state                                       |
| `src/lib/`                                  | Access guards, types/date helpers, OAuth helpers, server Supabase configuration |
| `src/proxy.ts`                              | Refreshes Supabase session cookies; authorization still happens on the server   |
| `supabase/migrations/`                      | Initial schema and future versioned database changes                            |
| `supabase/setup/`                           | Explicit operational scripts, including real-message tests                      |
| `tests/`                                    | SQL/Auth fixtures and OAuth tests; no external requests                         |

Next.js route groups such as `(dashboard)` organize layouts without adding a URL segment. Pages/layouts are Server Components by default. Client components are used for form pending state, tabs, and interactive availability cells. `login-form.tsx` is still used by the login page.

## Authentication and permissions

Google is the only login provider. An admin preapproves an exact Google email as Exec/Admin and shares the app URL separately. Supabase creates the Auth account on Google sign-in; `activate_club_access` links a verified provider-owned Google identity to the approval. A Supabase Auth account alone is insufficient for club access.

`requireExec`/`requireAdmin` validate the current user and database role on protected pages/actions. Request-local React caching avoids duplicate checks without caching authorization between requests. SQL functions and RLS enforce permissions independently of visible buttons. User-editable metadata is used for display names, never authorization.

Normal app requests use the publishable key plus the user's cookies. Only the Discord connection callback uses `SUPABASE_SECRET_KEY` to save a provider-verified ID. It validates a signed, expiring OAuth state bound to the signed-in user and their approval ID. Removing/recreating an approval invalidates old callbacks.

Removing club access deletes that account's responses, defaults, and Discord connection. Auth accounts and Discord server roles/membership are retained. No automated emails are sent.

## Sessions

`page.tsx` loads one `get_session_week` snapshot and composes the three tabs. The files inside `src/app/(dashboard)/sessions/` separate these responsibilities:

| File                                      | Responsibility                                                                   |
| ----------------------------------------- | -------------------------------------------------------------------------------- |
| `schedule-tabs.tsx`                       | Tab selection and keyboard navigation                                            |
| `schedule-management.tsx`                 | Repeating and one-date management sections, including visible ownership controls |
| `schedule-forms.tsx`                      | Add/change a repeating session or stop repeating                                 |
| `session-forms.tsx`                       | Add an extra date, update its time, or cancel it                                 |
| `usual-availability-form.tsx`             | Save the current exec's weekly defaults                                          |
| `sessions-board.tsx`                      | Spreadsheet layout and local saved responses/counts                              |
| `availability-controls.tsx`               | Availability legend and cells, including saving and error recovery               |
| `time-fields.tsx`, `session-feedback.tsx` | Reused time inputs and form feedback                                             |
| `session-styles.ts`                       | Named Tailwind styles for this feature                                           |
| `actions.ts`                              | Server access checks, validation, and database writes                            |

The board keeps successful saves local; there is no live subscription. Refresh to see others' latest changes.

Dates are Monday–Sunday in Waterloo time. Recurring sessions/defaults materialize on board reads and scheduled reminder checks. Only unanswered upcoming dates are autofilled; existing answers and explicit blanks survive. Changing a repeating day/time creates a new series without inherited defaults. Changing one date's time clears its answers and disables autofill for that occurrence. Cancellation retains the occurrence so generation cannot recreate it.

Execs manage their own schedules/sessions and their own availability. Admins can manage anyone's schedule/session but cannot answer on someone else's behalf. Database writes share a transaction lock to coordinate generation and changes.

## Discord

Two separate integrations cooperate through saved Discord IDs:

1. Discord OAuth (`identify` scope) connects a verified account to the current exec. Only ID and username are persisted, not OAuth tokens.
2. Supabase Cron calls a private SQL function, which posts to a channel webhook from Vault through `pg_net`.

The setup script checks every five minutes. Day-before warnings use 6 p.m. Waterloo time (the script passes 18; the function default is 9). Zero/one Yes responses trigger a coverage request with `@everyone`. Same-day checks at 9 a.m. notify two-or-more Yes attendees through their connected IDs; unlinked attendees appear as plain profile names. Names are sanitized and never replaced with emails.

Delivery records prevent repeat attempts. HTTP results are recorded on later checks; uncertain results are not automatically retried. The initial schema does not activate sending; reminders and Cron history cleanup have separate setup scripts. Cron history cleanup preserves delivery records. Live and owner-triggered TEST RUN reminders share `private.run_discord_session_reminders`; tests use a simulated clock and selected session without changing normal delivery records. See [Discord operations](DISCORD.md).

## Maintenance

### UI organization and styling

Keep page loading and access checks in `page.tsx`, interactive form state in client components, and protected mutations in `actions.ts`. Split a component when it has a separate responsibility or contains markup reused by other forms; small components do not need their own folder.

Feature-specific Tailwind utilities live alongside the components in `*-styles.ts`: `login-styles.ts`, `exec-styles.ts`, `discord-styles.ts`, `home-styles.ts`, and `session-styles.ts`. The workspace shell uses `dashboard-styles.ts`, and the shared sidebar uses `components/sidebar-styles.ts`. Import the relevant object as `styles` and use names such as `className={styles.input}` to keep form markup readable.

These are ordinary TypeScript objects containing complete Tailwind class strings, not CSS Modules or HTML inline styles. Tailwind scans them as part of `src`. Keep full class names in the strings (including responsive, hover, and focus variants); do not construct partial class names dynamically. For a form's appearance, start with its adjacent style file. For behavior, start with its component and action.

`globals.css` holds theme tokens, base rules, and a few shared classes (`page-heading`, `eyebrow`, `form-error`). Short, self-contained components may keep their utility classes directly in JSX. Avoid moving all styles into a single global file or introducing a generic component for every HTML element.

Use [the database guide](../supabase/README.md) to apply missing migrations. Do not rewrite applied history. Keep server checks when extracting UI components. Never commit credentials or real participant data. Run the checks in [README](../README.md#development-checks) before finishing changes.

Future work may add tournament registration, review, teams, brackets, and results. Registration requirements and publication permissions still need decisions; they are not implemented.
