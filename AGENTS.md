# UW Pickleball Club exec dashboard

Web app for University of Waterloo Pickleball Club execs: weekly session availability, exec/admin access, and Discord reminders. Tournaments is an empty placeholder. Students maintain this, so keep changes small and easy to follow. The stack is Next.js, TypeScript, Tailwind, and Supabase.

Read `docs/PROJECT.md` before implementing a feature. It explains the architecture; this file lists the rules that are easy to break.

## Commands

- `npm run check` runs tests, lint, type check, format check, and build. It must pass before you finish.
- `npm test` alone takes about 15 seconds. It applies the real migrations to an in-memory Postgres (PGlite) and never touches the network.
- If `npm test` goes quiet and never exits, that is a Node bug at process exit (nodejs/node#54918), not a failing test. It happens often on Node 23. Stop it and run it again. The README asks for Node 22 or 24.
- `npm run format` fixes formatting.
- `npm run dev` talks to the hosted Supabase project in `.env.local`. There is no local database, so anything you click writes real club data.

## Layout

Each feature is one folder under `src/app/(dashboard)/`:

| File                  | Job                                                                  |
| --------------------- | -------------------------------------------------------------------- |
| `page.tsx`            | Server Component. Checks access, loads data.                         |
| `actions.ts`          | Server actions. Check access, validate input, call one SQL function. |
| `*-forms.tsx`         | Client components for forms and interactive pieces.                  |
| `<feature>-styles.ts` | Tailwind class strings, imported as `styles`.                        |

Shared code is in `src/lib/` (`auth.ts` guards, `sessions.ts` types and date helpers, `supabase/server.ts` client) and `src/components/`. Business rules live in SQL functions in `supabase/migrations/`, not in TypeScript.

## Access checks

- Start every `page.tsx` and every exported server action with `await requireExec()` or `await requireAdmin()` from `src/lib/auth.ts`. The dashboard layout's check does not cover server actions.
- SQL functions check access again. Hiding a button is never the check.
- Use `createClient()` from `src/lib/supabase/server.ts` (user cookies, publishable key). `SUPABASE_SECRET_KEY` is used only in `src/app/auth/discord/callback/route.ts`. Do not use it anywhere else.

## Database

- Never edit `supabase/migrations/20260929000000_initial_schema.sql`. It is already applied to the live project. Add a new timestamped `.sql` file beside it.
- You cannot apply migrations. The project owner runs them by hand in the Supabase SQL Editor, so say in your summary which file needs applying.
- Writes go through SQL functions called with `supabase.rpc()`. Tables grant only `select` to `authenticated`. Do not add write grants or write policies.
- A new function needs all of these:
  - `security definer set search_path = ''`, with every name schema-qualified.
  - An access check first: `perform private.require_session_access();`, or the `private.is_club_admin()` pattern for admin-only work.
  - `perform pg_advisory_xact_lock(27401, 1);` before it changes session data.
  - Explicit privileges. Functions in `public` are the API: revoke from `public, anon` and grant to `authenticated`. Helpers go in `private` and are revoked from `authenticated` as well.
- A plain `raise exception 'message'` can be shown to the exec word for word, so write it for them. Use `errcode = '42501'` for access failures.
- Test every new function in `tests/`: an allowed role succeeds, and anonymous, unapproved, and removed users are rejected. `tests/initial-schema.test.ts` counts tables and functions on purpose. Update the counts when you add one.

## UI

- Keep complete Tailwind class names in the feature's `*-styles.ts`. Never build class names from pieces.
- Use the theme colours in `src/app/globals.css` (`ink`, `muted`, `line`, `gold`, `paper`, `green`) instead of new hex values, and reuse `.page-heading`, `.eyebrow`, and `.form-error`.
- Copy form patterns from `sessions/`: the `useSessionForm` hook (`{ error, success }` state, submitted from `onSubmit`), `SessionFeedback`, and the button and input styles in `session-styles.ts`. Do not use `<form action={...}>` for a form with fields: React resets it after every submit, including a rejected one.
- Dates are `YYYY-MM-DD` strings in Waterloo time. Use the helpers in `src/lib/sessions.ts`. Do not do arithmetic on local `Date` objects.

## Adding a page

1. Create `src/app/(dashboard)/<name>/page.tsx` with an access check.
2. Add `"/<name>/:path*"` to `matcher` in `src/proxy.ts`. That file is Next.js 16's middleware. It only refreshes session cookies.
3. Add the link to `navigationItems` in `src/components/sidebar.tsx`, and an icon in `src/components/icon.tsx` if needed. Home cards in `home/page.tsx` link to `/` plus their icon name.
4. Add the folder to the file table in `docs/PROJECT.md`.

## Never

- Commit credentials or real participant information (names, emails, Discord IDs). Tests use `@example.com` accounts.
- Collect or store student ID images.
- Run anything in `supabase/setup/`, or the `private.test_*` and `private.send_*` functions. They send real Discord messages, some with `@everyone`. Tell the maintainer what to run instead.
- Copy rows from the hosted database into code, tests, docs, or commits. If a Supabase MCP server is connected, it points at the real project. Use it to inspect the schema.
- Add a dependency without asking.

## Docs

Update docs in the same change: behaviour in `docs/PROJECT.md`; setup steps or environment variables in `README.md` and `.env.example`; Discord timing or operations in `docs/DISCORD.md`. Some facts are repeated across these files, so search for the old wording.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
