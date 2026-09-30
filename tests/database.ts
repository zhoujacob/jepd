import { readFile } from "node:fs/promises";
import type { PGlite } from "@electric-sql/pglite";

export function readInitialSchema() {
  return readFile(
    new URL(
      "../supabase/migrations/20260929000000_initial_schema.sql",
      import.meta.url,
    ),
    "utf8",
  );
}

export async function initializeDatabase(db: PGlite, network = true) {
  // Supabase-owned services are fixtures, never real accounts or network calls.
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth;
    create table auth.users (id uuid primary key, email text, email_confirmed_at timestamptz, raw_user_meta_data jsonb default '{}'::jsonb);
    create table auth.identities (user_id uuid references auth.users(id) on delete cascade, provider text, identity_data jsonb);
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
    $$;
    grant usage on schema auth, public to authenticated, anon;
    grant execute on function auth.uid() to authenticated, anon;
    -- Hosted projects may grant API roles access by default; the baseline must revoke it.
    alter default privileges in schema public grant all on tables to anon, authenticated;
    alter default privileges in schema public grant execute on functions to anon, authenticated;
  `);
  if (network)
    await db.exec(`
    create schema net; create schema vault;
    create table vault.decrypted_secrets(name text primary key, decrypted_secret text);
    create table net.requests(id bigserial primary key, url text, body jsonb);
    create table net._http_response(id bigint, status_code integer);
    create function net.http_post(url text, body jsonb, headers jsonb, timeout_milliseconds integer)
    returns bigint language sql as $$
      insert into net.requests(url,body) values(url,body) returning id;
    $$;
  `);
  await db.exec(await readInitialSchema());
}
