# Project owner setup

## 1. Prepare Supabase

For a fresh Supabase project, run the complete [`20260929000000_initial_schema.sql`](../supabase/migrations/20260929000000_initial_schema.sql) once in **SQL Editor → New query**. It installs all app features, including Discord tables/functions, in one transaction. It does not add data, secrets, or scheduled jobs.

The pre-launch migration history has been consolidated. This baseline requires a fresh app schema and refuses existing app tables even when empty. To replace the old test setup, follow [Start clean before launch](../supabase/README.md#start-clean-before-launch); creating a new Supabase project is the recommended route. After production setup, add new migrations for future changes rather than rerunning or editing the baseline.

The resulting `club_roles` table holds an approved email, an `exec` or `admin` role, and an optional Auth user ID. Status is derived automatically: no user ID means **pending**, and a linked user ID means **active**. Only these two application roles exist; no separate PostgreSQL exec/admin roles are needed.

## 2. Configure Google in Google Cloud and Supabase

1. Create or select a **Google Cloud project**. In **Google Auth Platform**, configure the app's branding, audience, and consent screen. For personal Gmail accounts, use an external audience. Test-user entries are optional for the basic `openid`, email, and profile scopes used here; they do not grant app roles. Configure the audience appropriately before sharing the app more widely.
2. Create an **OAuth client ID** with application type **Web application**. Use the standard `openid`, email, and profile scopes. The app does not request Gmail access.
3. Add your app origins under **Authorized JavaScript origins**, such as `http://localhost:3000` and your production HTTPS origin.
4. In Supabase **Authentication → Sign In / Providers → Google**, find the provider's callback URL. It normally looks like `https://YOUR-PROJECT.supabase.co/auth/v1/callback`. Copy that exact URL into Google's **Authorized redirect URIs**.
5. Enable the Google provider in Supabase and paste the Google OAuth **Client ID** and **Client Secret** there.
6. Disable the **Email** provider and any other unused login providers. **Allow new users to sign up must remain enabled** so Google can create Auth accounts on first sign-in. An Auth account alone does not grant dashboard access: only an approved email can activate a role.
7. Under Supabase **Authentication → URL Configuration**, set **Site URL** to the app origin. Add the exact app callback URLs to the redirect allowlist:
   - `http://localhost:3000/auth/callback`
   - `https://YOUR-APP-DOMAIN/auth/callback`

There are two different redirects: Google returns to **Supabase's `/auth/v1/callback`**, then Supabase returns to **your app's `/auth/callback`**. The app exchanges the OAuth code for a cookie session and activates the matching pending approval.

Follow the official [Supabase Google sign-in guide](https://supabase.com/docs/guides/auth/social-login/auth-google) for provider-console details. No SMTP setup, invitation email template, or app-sent email is involved.

## 3. Preapprove yourself as the first admin

Before signing in, run this in Supabase SQL Editor, replacing the example email with your exact Google account email:

```sql
insert into public.club_roles (email, role)
values (lower(trim('your-google-email@gmail.com')), 'admin');
```

Leave `user_id` and `status` alone. You do not need to create a user manually in Authentication. Start the app, select **Continue with Google**, and choose that account. The database links your verified identity and activates your admin role. The sidebar then shows **Club Admin** and **Manage access**.

## 4. Run or host the app

Follow the [local setup](../README.md#local-development) to test. For shared use, host the Next.js app and configure the three core environment variables, plus optional Discord connection credentials. Set `SITE_URL` to the production HTTPS origin and ensure the corresponding callbacks are configured. Supabase hosts Auth and the database; the Next.js app needs its own hosting. Share the website link with your club team after approving their emails.

If you used the previous password/invitation version, remove `EXEC_EMAIL_ALLOWLIST`. Keep `SUPABASE_SECRET_KEY` if using Discord account connections; only that callback needs it. Remove obsolete `/auth/confirm` redirect URLs and disable the Email provider. The password and invitation routes have been removed.

## 5. Optional Discord features

Follow [Discord setup](DISCORD.md) for the channel webhook, account connections, daily reminders, history retention, and manual tests. The webhook (message sender) and OAuth application (account verification) are separate integrations. Do not enable Discord as a Supabase login provider.

Before sharing a real domain, follow the [deployment checklist](DEPLOYMENT.md).
