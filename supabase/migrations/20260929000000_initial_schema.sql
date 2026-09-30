-- Initial schema for a fresh Supabase project. Run the complete file once.
-- This baseline replaces pre-launch development migrations; it is not an upgrade/reset.
-- Supabase provides auth.users, auth.identities, auth.uid(), and the API roles.
-- No accounts, webhook secrets, Cron jobs, or messages are created here.
begin;

-- Refuse existing application schemas before making any changes, even if empty.
do $$
begin
  if to_regclass('public.club_roles') is not null
    or to_regclass('public.club_sessions') is not null
    or to_regclass('public.session_schedules') is not null then
    raise exception 'Initial schema requires a fresh project. Do not run it on an existing app database.';
  end if;
end;
$$;

create schema if not exists private;

-- Tables and indexes. Session dates/times use America/Toronto wall time.
create table public.club_roles (
  id uuid primary key default gen_random_uuid(),
  email text not null unique check (
    email = lower(btrim(email))
    and length(email) <= 254
    and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  ),
  role text not null check (role in ('exec', 'admin')),
  user_id uuid unique references auth.users(id) on delete cascade,
  status text generated always as (
    case when user_id is null then 'pending' else 'active' end
  ) stored,
  created_at timestamptz not null default now()
);

create table public.session_schedules (
  id uuid primary key default gen_random_uuid(),
  weekday integer not null check (weekday between 1 and 7),
  starts_at time not null,
  ends_at time not null,
  starts_on date not null default (now() at time zone 'America/Toronto')::date,
  ends_on date,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  check (starts_at < ends_at and ends_at < time '24:00'),
  check (extract(second from starts_at) = 0 and extract(second from ends_at) = 0)
);

create table public.club_sessions (
  id uuid primary key default gen_random_uuid(),
  session_date date not null check (session_date between date '2000-01-03' and date '2099-12-27'),
  starts_at time not null,
  ends_at time not null,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  check (starts_at < ends_at and ends_at < time '24:00'),
  check (extract(second from starts_at) = 0 and extract(second from ends_at) = 0),
  schedule_id uuid references public.session_schedules(id),
  cancelled boolean not null default false,
  time_overridden boolean not null default false
);

create table public.session_availability (
  session_id uuid not null references public.club_sessions(id) on delete cascade,
  -- Removing an approval also removes its responses, including on reapproval.
  user_id uuid not null references public.club_roles(user_id) on delete cascade default auth.uid(),
  response text check (response in ('yes', 'maybe', 'no')),
  primary key (session_id, user_id)
);

create table public.session_defaults (
  schedule_id uuid not null references public.session_schedules(id) on delete cascade,
  user_id uuid not null references public.club_roles(user_id) on delete cascade default auth.uid(),
  response text not null check (response in ('yes', 'maybe', 'no')),
  primary key (schedule_id, user_id)
);

create table public.discord_connections (
  user_id uuid primary key references public.club_roles(user_id) on delete cascade,
  discord_user_id text not null unique check (discord_user_id ~ '^[0-9]{17,20}$'),
  discord_username text not null check (length(discord_username) between 1 and 100),
  connected_at timestamptz not null default now()
);

create table private.discord_session_deliveries (
  session_id uuid not null references public.club_sessions(id) on delete cascade,
  kind text not null check (kind in ('day_before', 'same_day')),
  request_id bigint not null,
  queued_at timestamptz not null,
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed', 'unknown')),
  http_status integer,
  primary key (session_id, kind)
);

-- NULL availability is an explicit blank and must survive default autofill.
create index session_availability_user_idx on public.session_availability(user_id);
create unique index session_schedules_active_slot on public.session_schedules(weekday, starts_at, ends_at) where ends_on is null;
create unique index club_sessions_active_slot on public.club_sessions(session_date, starts_at, ends_at) where not cancelled;
create unique index club_sessions_occurrence on public.club_sessions(schedule_id, session_date) where schedule_id is not null;
create index session_defaults_user_idx on public.session_defaults(user_id);

-- Access checks and account approvals.
create function private.google_email()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select lower(btrim(identity.identity_data ->> 'email'))
  from auth.identities as identity
  join auth.users as account on account.id = identity.user_id
  where account.id = (select auth.uid())
    and account.email_confirmed_at is not null
    and identity.provider = 'google'
    and identity.identity_data ->> 'email_verified' = 'true'
    and lower(btrim(identity.identity_data ->> 'email')) = lower(btrim(account.email))
  limit 1;
$$;

create function public.get_club_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select role from public.club_roles
  where user_id = (select auth.uid())
    and email = (select private.google_email());
$$;

create function private.is_club_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.get_club_role() = 'admin', false);
$$;

create function public.activate_club_access()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  verified_email text := private.google_email();
begin
  if verified_email is null then
    return null;
  end if;

  update public.club_roles set user_id = (select auth.uid())
  where email = verified_email and user_id is null;

  return public.get_club_role();
end;
$$;

create function public.list_club_roles()
returns table (id uuid, user_id uuid, email text, role text, status text, created_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_club_admin() then
    raise exception 'Admin access required.' using errcode = '42501';
  end if;

  return query
    select assignment.id, assignment.user_id, assignment.email,
      assignment.role, assignment.status, assignment.created_at
    from public.club_roles as assignment
    order by assignment.role, assignment.email;
end;
$$;

create function public.approve_club_account(account_email text, account_role text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_club_admin() then
    raise exception 'Admin access required.' using errcode = '42501';
  end if;
  if account_role is null or account_role not in ('exec', 'admin') then
    raise exception 'Choose Exec or Admin.';
  end if;
  if account_email is null or length(btrim(account_email)) > 254
    or btrim(account_email) !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'Enter a valid Google account email.';
  end if;

  insert into public.club_roles (email, role)
  values (lower(btrim(account_email)), account_role)
  on conflict (email) do nothing;

  if not found then
    raise exception 'This email already has pending or active access.';
  end if;
end;
$$;

create function public.remove_club_access(approval_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Serialize removals so two admins cannot simultaneously remove each other.
  lock table public.club_roles in share row exclusive mode;
  if not private.is_club_admin() then
    raise exception 'Admin access required.' using errcode = '42501';
  end if;
  if exists (
    select 1 from public.club_roles
    where id = approval_id and user_id = (select auth.uid())
  ) then
    raise exception 'You cannot remove your own admin access.';
  end if;

  delete from public.club_roles where id = approval_id;
  if not found then
    raise exception 'Access record not found. Refresh the page.';
  end if;
end;
$$;

create function public.list_session_execs()
returns table (user_id uuid, email text, display_name text)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if coalesce(public.get_club_role() in ('exec', 'admin'), false) = false then
    raise exception 'Club access required.' using errcode = '42501';
  end if;
  return query
    select assignment.user_id, assignment.email,
      coalesce(nullif(left(btrim(account.raw_user_meta_data ->> 'full_name'), 80), ''), assignment.email)
    from public.club_roles as assignment
    join auth.users as account on account.id = assignment.user_id
    order by assignment.email;
end;
$$;


-- Session writes are checked RPCs, coordinated by the same transaction lock.
create function private.require_session_access()
returns void language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(public.get_club_role() in ('exec', 'admin'), false) = false then
    raise exception 'Club access required.' using errcode = '42501';
  end if;
end;
$$;

create function public.save_session_schedule(day_number integer, start_time time, end_time time, replacing_id uuid default null)
returns void language plpgsql security definer set search_path = '' as $$
declare previous public.session_schedules; today date := (now() at time zone 'America/Toronto')::date;
begin
  perform private.require_session_access();
  perform pg_advisory_xact_lock(27401, 1);
  if replacing_id is not null then
    select * into previous from public.session_schedules where id = replacing_id and ends_on is null;
    if not found or (previous.created_by is distinct from auth.uid() and public.get_club_role() <> 'admin') then
      raise exception 'You can only change your own schedules.' using errcode = '42501';
    end if;
    if previous.weekday = day_number and previous.starts_at = start_time and previous.ends_at = end_time then return; end if;
    update public.session_schedules set ends_on = today - 1 where id = replacing_id;
    update public.club_sessions set cancelled = true where schedule_id = replacing_id and session_date >= today;
  end if;
  -- A replacement is a new series: old defaults and answers cannot follow new times.
  insert into public.session_schedules(weekday, starts_at, ends_at, created_by)
  values(day_number, start_time, end_time, auth.uid());
end;
$$;

create function public.stop_session_schedule(target_schedule uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare target public.session_schedules; today date := (now() at time zone 'America/Toronto')::date;
begin
  perform private.require_session_access();
  perform pg_advisory_xact_lock(27401, 1);
  select * into target from public.session_schedules where id = target_schedule and ends_on is null;
  if not found or (target.created_by is distinct from auth.uid() and public.get_club_role() <> 'admin') then
    raise exception 'You can only stop your own schedules.' using errcode = '42501';
  end if;
  update public.session_schedules set ends_on = today - 1 where id = target_schedule;
  update public.club_sessions set cancelled = true where schedule_id = target_schedule and session_date >= today;
end;
$$;

create function public.add_extra_session(target_date date, start_time time, end_time time)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_session_access();
  perform pg_advisory_xact_lock(27401, 1);
  insert into public.club_sessions(session_date, starts_at, ends_at, created_by)
  values(target_date, start_time, end_time, auth.uid());
end;
$$;

create function public.cancel_club_session(target_session uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare target public.club_sessions;
begin
  perform private.require_session_access();
  perform pg_advisory_xact_lock(27401, 1);
  select * into target from public.club_sessions where id = target_session and not cancelled;
  if not found or (target.created_by is distinct from auth.uid() and public.get_club_role() <> 'admin') then
    raise exception 'You can only cancel your own sessions.' using errcode = '42501';
  end if;
  update public.club_sessions set cancelled = true where id = target_session;
end;
$$;

create function public.save_session_defaults(choices jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare item jsonb; target uuid;
begin
  perform private.require_session_access();
  perform pg_advisory_xact_lock(27401, 1);
  if choices is null or jsonb_typeof(choices) <> 'array' or jsonb_array_length(choices) > 100 then
    raise exception 'Choose valid availability defaults.';
  end if;
  for item in select * from jsonb_array_elements(choices) loop
    target := (item ->> 'schedule_id')::uuid;
    if not exists(select 1 from public.session_schedules where id = target and ends_on is null) then
      raise exception 'The schedule changed. Refresh and try again.';
    end if;
    if item ->> 'response' = '' then
      delete from public.session_defaults where schedule_id = target and user_id = auth.uid();
    else
      insert into public.session_defaults(schedule_id, user_id, response)
      values(target, auth.uid(), item ->> 'response')
      on conflict(schedule_id, user_id) do update set response = excluded.response;
    end if;
  end loop;
end;
$$;

create function public.set_session_availability(target_session uuid, new_response text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_session_access();
  perform pg_advisory_xact_lock(27401, 1);
  if not exists(select 1 from public.club_sessions where id = target_session and not cancelled) then
    raise exception 'This session is cancelled or no longer exists. Refresh the board.';
  end if;
  insert into public.session_availability(session_id, user_id, response)
  values(target_session, auth.uid(), new_response)
  on conflict(session_id, user_id) do update set response = excluded.response;
end;
$$;

create function public.update_session_time(target_session uuid, start_time time, end_time time)
returns void language plpgsql security definer set search_path = '' as $$
declare target public.club_sessions;
begin
  perform private.require_session_access();
  perform pg_advisory_xact_lock(27401, 1);
  select * into target from public.club_sessions where id = target_session and not cancelled;
  if not found or (target.created_by is distinct from auth.uid() and public.get_club_role() <> 'admin') then
    raise exception 'You can only update your own sessions.' using errcode = '42501';
  end if;
  if target.starts_at = start_time and target.ends_at = end_time then return; end if;
  update public.club_sessions set starts_at = start_time, ends_at = end_time, time_overridden = true
    where id = target_session;
  delete from public.session_availability where session_id = target_session;
end;
$$;

create function private.materialize_session_dates(first_day date, last_day date, checked_at timestamptz default now())
returns void language plpgsql security definer set search_path = '' as $$
declare local_now timestamp := checked_at at time zone 'America/Toronto';
begin
  perform pg_advisory_xact_lock(27401, 1);
  insert into public.club_sessions(session_date, starts_at, ends_at, created_by, schedule_id)
    select week_start::date + schedule.weekday - 1, schedule.starts_at, schedule.ends_at, schedule.created_by, schedule.id
    from public.session_schedules schedule
    cross join generate_series(date_trunc('week', first_day::timestamp), date_trunc('week', last_day::timestamp), interval '7 days') week_start
    where week_start::date + schedule.weekday - 1 between first_day and last_day
      and week_start::date + schedule.weekday - 1 >= schedule.starts_on
      and (schedule.ends_on is null or week_start::date + schedule.weekday - 1 <= schedule.ends_on)
    on conflict do nothing;
  insert into public.session_availability(session_id, user_id, response)
    select session.id, defaults.user_id, defaults.response
    from public.club_sessions session
    join public.session_defaults defaults on defaults.schedule_id = session.schedule_id
    join public.club_roles account on account.user_id = defaults.user_id
    where session.session_date >= greatest(first_day, local_now::date)
      and session.session_date < last_day + 1 and not session.cancelled
      and not session.time_overridden
      and session.session_date + session.starts_at >= local_now
    on conflict(session_id, user_id) do nothing;
end;
$$;

create function public.get_session_week(target_week date)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare result jsonb;
begin
  perform private.require_session_access();
  if target_week is null or extract(isodow from target_week) <> 1
    or target_week < date '2000-01-03' or target_week > date '2099-12-21' then
    raise exception 'Choose a valid week.';
  end if;
  perform pg_advisory_xact_lock(27401, 1);
  perform private.materialize_session_dates(target_week, target_week + 6);
  select jsonb_build_object(
    'sessions', coalesce((select jsonb_agg(to_jsonb(s) order by s.session_date, s.starts_at, s.ends_at)
      from public.club_sessions s where s.session_date >= target_week and s.session_date < target_week + 7 and not s.cancelled), '[]'::jsonb),
    'responses', coalesce((select jsonb_agg(to_jsonb(a)) from public.session_availability a
      join public.club_sessions s on s.id = a.session_id
      where s.session_date >= target_week and s.session_date < target_week + 7 and not s.cancelled), '[]'::jsonb),
    'schedules', coalesce((select jsonb_agg(to_jsonb(s) order by s.weekday, s.starts_at) from public.session_schedules s where s.ends_on is null), '[]'::jsonb),
    'defaults', coalesce((select jsonb_agg(to_jsonb(d)) from public.session_defaults d where d.user_id = auth.uid()), '[]'::jsonb),
    'roster', (select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb) from public.list_session_execs() r)
  ) into result;
  return result;
end;
$$;


-- Discord connection RPCs; saving a verified identity is server-only.
create function public.save_discord_connection(account_id uuid, approval_id uuid, discord_id text, discord_name text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(27401, 1);
  perform 1 from public.club_roles where id = approval_id and user_id = account_id for share;
  if not found then raise exception 'Club approval changed.' using errcode = '42501'; end if;
  insert into public.discord_connections(user_id, discord_user_id, discord_username)
    values(account_id, discord_id, discord_name)
    on conflict(user_id) do update set discord_user_id = excluded.discord_user_id,
      discord_username = excluded.discord_username, connected_at = now();
end;
$$;

create function public.disconnect_discord()
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_session_access();
  perform pg_advisory_xact_lock(27401, 1);
  delete from public.discord_connections where user_id = auth.uid();
end;
$$;


-- Owner-only reminder worker, manual tests, and diagnostics.
create function private.run_discord_session_reminders(day_before_hour integer, checked_at timestamptz, test_session uuid, preview_only boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  local_now timestamp := checked_at at time zone 'America/Toronto';
  local_day date := local_now::date;
  webhook text;
  candidate record;
  message text;
  label text;
  request bigint;
  mention_ids text[];
  mentions text;
  attendee record;
  attendee_label text;
  display_name text;
  listed integer;
  previews jsonb := '[]'::jsonb;
  payload jsonb;
  queued integer := 0;
  request_ids bigint[] := array[]::bigint[];
begin
  if day_before_hour is null or day_before_hour not between 0 and 23 or checked_at is null then
    raise exception 'Choose a valid reminder hour and time.';
  end if;
  perform pg_advisory_xact_lock(27401, 1);

  if test_session is null and not preview_only then
    -- pg_net sends after commit; save confirmed HTTP results on the next tick.
    -- Never automatically retry an ambiguous failure: Discord may have received the ping.
    update private.discord_session_deliveries d
      set status = case
        when r.status_code between 200 and 299 then 'sent'
        when r.status_code between 400 and 499 then 'failed'
        else 'unknown' end,
        http_status = r.status_code
      from net._http_response r where r.id = d.request_id and d.status = 'pending';
    update private.discord_session_deliveries set status = 'unknown'
      where status = 'pending' and queued_at < checked_at - interval '15 minutes';

  end if;

  -- A one-hour window catches short outages without sending stale messages later that day.
  if extract(hour from local_now) not in (day_before_hour, 9) then return jsonb_build_object('queued', 0, 'request_ids', '[]'::jsonb); end if;
  if not preview_only then
  select decrypted_secret into webhook from vault.decrypted_secrets
    where name = 'discord_session_webhook';
  if webhook is null then raise exception 'Configure discord_session_webhook in Supabase Vault.'; end if;
  if webhook !~ '^https://discord[.]com/api/webhooks/[0-9]+/[A-Za-z0-9_-]+$' then
    raise exception 'Use the Discord channel webhook URL without query parameters.';
  end if;

  end if;

  perform private.materialize_session_dates(local_day, local_day + 1, checked_at);
  for candidate in
    select s.id, s.session_date, s.starts_at, s.ends_at,
      count(a.user_id) filter (where a.response = 'yes' and r.user_id is not null) as attending,
      case when s.session_date = local_day then 'same_day' else 'day_before' end as kind
    from public.club_sessions s
    left join public.session_availability a on a.session_id = s.id
    left join public.club_roles r on r.user_id = a.user_id
    where (test_session is null or s.id = test_session)
      and not s.cancelled and s.session_date between local_day and local_day + 1
      and s.session_date + s.starts_at > local_now
    group by s.id
    having (s.session_date = local_day + 1 and extract(hour from local_now) = day_before_hour
      and count(a.user_id) filter (where a.response = 'yes' and r.user_id is not null) < 2)
      or (s.session_date = local_day and extract(hour from local_now) = 9
      and count(a.user_id) filter (where a.response = 'yes' and r.user_id is not null) >= 2)
    order by s.session_date, s.starts_at
  loop
    if test_session is null and exists(select 1 from private.discord_session_deliveries where session_id = candidate.id and kind = candidate.kind) then
      continue;
    end if;
    label := to_char(candidate.session_date, 'Dy, Mon FMDD, YYYY') || ', '
      || to_char(candidate.starts_at, 'FMHH12:MI AM') || '–' || to_char(candidate.ends_at, 'FMHH12:MI AM') || ' (Waterloo time)';
    -- Include every Yes attendee: verified mentions where available, otherwise a name.
    -- Budget the list so long names cannot exceed Discord's 2,000-character limit.
    mention_ids := array[]::text[];
    mentions := '';
    listed := 0;
    for attendee in
      select d.discord_user_id, u.raw_user_meta_data ->> 'full_name' as full_name
      from public.session_availability a
      join public.club_roles r on r.user_id = a.user_id
      join auth.users u on u.id = a.user_id
      left join public.discord_connections d on d.user_id = a.user_id
      where a.session_id = candidate.id and a.response = 'yes'
      order by d.discord_user_id nulls last, r.user_id
      limit 50
    loop
      if attendee.discord_user_id is not null then
        attendee_label := '<@' || attendee.discord_user_id || '>';
      else
        -- Names are user-controlled: strip mention/Markdown syntax and newlines.
        -- Never substitute account email, even when a profile name contains an email.
        display_name := attendee.full_name;
        if display_name ~ '[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+' then
          display_name := null;
        end if;
        display_name := left(btrim(regexp_replace(
          translate(coalesce(display_name, ''), $chars$<>@*_~`\|[]()$chars$, repeat(' ', 13)),
          '[[:space:][:cntrl:]]+', ' ', 'g'
        )), 60);
        attendee_label := coalesce(nullif(display_name, ''), 'An exec');
      end if;
      if length(mentions) + length(attendee_label) + 2 > 1400 then exit; end if;
      mentions := mentions || case when listed > 0 then ', ' else '' end || attendee_label;
      listed := listed + 1;
      if attendee.discord_user_id is not null then
        mention_ids := array_append(mention_ids, attendee.discord_user_id);
      end if;
    end loop;
    if candidate.attending > listed then
      mentions := mentions || ' (and ' || (candidate.attending - listed) || ' more)';
    end if;
    message := case when candidate.kind = 'day_before' then '@everyone ' else '' end || case
      when candidate.attending = 0 then 'No execs have signed up for tomorrow''s session. Can someone cover it?'
      when candidate.attending = 1 then 'One exec has signed up for tomorrow''s session and could use some backup!'
      else 'Today''s session has ' || candidate.attending || ' execs attending. See you there!'
      end || E'\n' || label
      || case when mentions <> '' then E'\nAttending: ' || mentions else '' end
      || E'\nPlease check your availability in the club dashboard.';
    if test_session is not null and not preview_only then
      message := E'**TEST RUN — simulated Cron reminder**\n' || message
        || E'\n**This is a test using current availability, not the scheduled reminder.**';
    end if;
    payload := jsonb_build_object('content', message, 'allowed_mentions', jsonb_build_object(
      'parse', case when candidate.kind = 'day_before' then '["everyone"]'::jsonb else '[]'::jsonb end,
      'users', to_jsonb(mention_ids)));
    if preview_only then
      previews := previews || jsonb_build_array(jsonb_build_object(
        'payload', payload,
        'already_attempted', exists(select 1 from private.discord_session_deliveries
          where session_id = candidate.id and kind = candidate.kind)));
      continue;
    end if;
    request := net.http_post(
      url := webhook || '?wait=true', body := payload,
      headers := '{"Content-Type":"application/json"}'::jsonb,
      timeout_milliseconds := 10000
    );
    if test_session is null and not preview_only then
      insert into private.discord_session_deliveries(session_id, kind, request_id, queued_at)
        values(candidate.id, candidate.kind, request, checked_at);
    end if;
    request_ids := array_append(request_ids, request);
    queued := queued + 1;
  end loop;
  return jsonb_build_object('queued', queued, 'request_ids', to_jsonb(request_ids), 'previews', previews);
end;
$$;

create function private.run_discord_session_reminders(day_before_hour integer, checked_at timestamptz, test_session uuid)
returns jsonb language sql security definer set search_path = '' as $$
  select private.run_discord_session_reminders(day_before_hour, checked_at, test_session, false) - 'previews';
$$;

create function private.send_discord_session_reminders(day_before_hour integer default 9, checked_at timestamptz default now())
returns integer language sql security definer set search_path = '' as $$
  select (private.run_discord_session_reminders(day_before_hour, checked_at, null) ->> 'queued')::integer;
$$;

create function private.test_discord_session_reminder(target_date date, start_time time, end_time time, reminder_kind text default 'same_day')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  simulated_at timestamptz;
  selected_session uuid;
  yes_count integer;
  result jsonb;
begin
  if target_date is null or target_date < date '2000-01-03' or target_date > date '2099-12-27'
    or start_time is null or end_time is null or reminder_kind is null or reminder_kind not in ('same_day', 'day_before') then
    raise exception 'Choose a valid date, times, and same_day or day_before reminder.';
  end if;
  simulated_at := case when reminder_kind = 'same_day'
    then (target_date + time '09:00') at time zone 'America/Toronto'
    else (target_date - 1 + time '18:00') at time zone 'America/Toronto' end;
  perform pg_advisory_xact_lock(27401, 1);
  -- Same date/default generation as Cron, even when nobody has opened the week.
  perform private.materialize_session_dates(target_date, target_date, simulated_at);
  select id into selected_session from public.club_sessions
    where session_date = target_date and starts_at = start_time and ends_at = end_time and not cancelled;
  if selected_session is null then raise exception 'No active session matches that date and time.'; end if;
  select count(*) into yes_count from public.session_availability a
    join public.club_roles r on r.user_id = a.user_id
    where a.session_id = selected_session and a.response = 'yes';
  result := private.run_discord_session_reminders(18, simulated_at, selected_session);
  return result || jsonb_build_object(
    'test_run', true, 'reminder_kind', reminder_kind, 'yes_count', yes_count,
    'simulated_at', simulated_at,
    'result', case when (result ->> 'queued')::integer > 0 then 'TEST RUN queued.'
      else 'No message: same-day requires 2+ Yes and a start after 9 a.m.; day-before requires 0–1 Yes.' end
  );
end;
$$;

create function private.next_discord_session(reference_time timestamptz)
returns table(session_date date, starts_at time, ends_at time)
language sql stable security definer set search_path = '' as $$
  select * from (
    select session_date, starts_at, ends_at from public.club_sessions
      where not cancelled and session_date + starts_at > (reference_time at time zone 'America/Toronto')
    union
    select occurrence.session_date, schedule.starts_at, schedule.ends_at
    from public.session_schedules schedule
    cross join lateral (
      select greatest((reference_time at time zone 'America/Toronto')::date, schedule.starts_on) as first_day
    ) bounds
    cross join lateral (
      select dates.day::date as session_date
      from generate_series(
        (bounds.first_day + (schedule.weekday - extract(isodow from bounds.first_day)::integer + 7) % 7)::timestamp,
        least(coalesce(schedule.ends_on, date '2099-12-27'), date '2099-12-27')::timestamp,
        interval '7 days'
      ) dates(day)
      where dates.day::date + schedule.starts_at > (reference_time at time zone 'America/Toronto')
        and not exists (
          select 1 from public.club_sessions existing
          where existing.schedule_id = schedule.id and existing.session_date = dates.day::date
        )
      order by dates.day
      limit 1
    ) occurrence
  ) upcoming
  order by session_date, starts_at, ends_at
  limit 1;
$$;

create function private.test_next_discord_session(reference_time timestamptz default now())
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  selected record;
  result jsonb;
begin
  if reference_time is null then raise exception 'Choose a valid reference time.'; end if;
  perform pg_advisory_xact_lock(27401, 1);

  -- Include existing extra/edited dates and the next ungenerated occurrence of
  -- each series. Cancelled occurrences must never be regenerated or selected.
  select * into selected from private.next_discord_session(reference_time);

  if not found then
    return jsonb_build_object('test_run', true, 'queued', 0, 'request_ids', '[]'::jsonb,
      'result', 'No upcoming session found. Nothing sent.');
  end if;

  result := private.test_discord_session_reminder(
    selected.session_date, selected.starts_at, selected.ends_at, 'day_before'
  );
  return result || jsonb_build_object(
    'session_date', selected.session_date, 'starts_at', selected.starts_at, 'ends_at', selected.ends_at
  );
end;
$$;

create function private.preview_next_discord_reminder(reminder_kind text default 'day_before', reference_time timestamptz default now())
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  selected record;
  simulated_at timestamptz;
  selected_id uuid;
  yes_count integer;
  preview jsonb;
  result jsonb;
begin
  if reference_time is null or reminder_kind is null or reminder_kind not in ('day_before', 'same_day') then
    raise exception 'Choose day_before or same_day and a valid reference time.';
  end if;
  perform pg_advisory_xact_lock(27401, 1);
  select * into selected from private.next_discord_session(reference_time);
  if not found then
    return jsonb_build_object('preview', true, 'would_send', false, 'reason', 'No upcoming session found.');
  end if;
  simulated_at := case when reminder_kind = 'same_day'
    then (selected.session_date + time '09:00') at time zone 'America/Toronto'
    else (selected.session_date - 1 + time '18:00') at time zone 'America/Toronto' end;

  -- Use real generation/default rules in a subtransaction, then discard ALL writes.
  -- The shared worker's preview branch never calls pg_net or reads the webhook.
  begin
    perform private.materialize_session_dates(selected.session_date, selected.session_date, simulated_at);
    select id into selected_id from public.club_sessions
      where session_date = selected.session_date and starts_at = selected.starts_at
        and ends_at = selected.ends_at and not cancelled;
    select count(*) into yes_count from public.session_availability a
      join public.club_roles r on r.user_id = a.user_id
      where a.session_id = selected_id and a.response = 'yes';
    preview := private.run_discord_session_reminders(18, simulated_at, selected_id, true) -> 'previews' -> 0;
    result := jsonb_build_object(
      'preview', true, 'reminder_kind', reminder_kind, 'simulated_at', simulated_at,
      'session_date', selected.session_date, 'starts_at', selected.starts_at, 'ends_at', selected.ends_at,
      'yes_count', yes_count, 'payload', preview -> 'payload',
      'already_attempted', coalesce((preview ->> 'already_attempted')::boolean, false),
      'would_send', preview is not null and not coalesce((preview ->> 'already_attempted')::boolean, false),
      'reason', case
        when preview is null then 'Skipped: day-before requires 0–1 Yes; same-day requires 2+ Yes and a start after 9 a.m.'
        when (preview ->> 'already_attempted')::boolean then 'Skipped: a normal delivery attempt already exists.'
        else 'Eligible at the simulated time. Preview only; webhook configuration and delivery are not tested.' end);
    raise exception using errcode = 'PDP01', message = 'Discard preview materialization';
  exception when sqlstate 'PDP01' then
    -- Local variables survive, database changes inside this block do not.
    null;
  end;
  return result;
end;
$$;

create function private.discord_setup_health()
returns table(check_name text, status text, detail text)
language plpgsql security definer set search_path = '' as $$
declare
  item text;
  configured boolean;
  valid boolean;
  job record;
  last_run record;
begin
  foreach item in array array['pg_cron', 'pg_net', 'supabase_vault'] loop
    check_name := 'extension:' || item;
    configured := exists(select 1 from pg_catalog.pg_extension where extname = item);
    status := case when configured then 'ok' else 'missing' end;
    detail := case when configured then 'Installed.' else 'Enable this extension in Supabase.' end;
    return next;
  end loop;
  foreach item in array array[
    'public.get_session_week(date)',
    'public.update_session_time(uuid,time without time zone,time without time zone)',
    'private.materialize_session_dates(date,date,timestamp with time zone)',
    'private.send_discord_session_reminders(integer,timestamp with time zone)',
    'private.test_next_discord_session(timestamp with time zone)',
    'private.preview_next_discord_reminder(text,timestamp with time zone)'
  ] loop
    check_name := 'function:' || item;
    configured := pg_catalog.to_regprocedure(item) is not null;
    status := case when configured then 'ok' else 'missing' end;
    detail := case when configured then 'Installed.' else 'Apply the missing migration; see supabase/README.md.' end;
    return next;
  end loop;
  check_name := 'session_time_overrides';
  configured := exists(select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'club_sessions' and column_name = 'time_overridden');
  status := case when configured then 'ok' else 'missing' end;
  detail := case when configured then 'Column exists.' else 'Initial schema is incomplete; see supabase/README.md.' end;
  return next;

  check_name := 'webhook';
  if pg_catalog.to_regclass('vault.decrypted_secrets') is null then
    status := 'missing'; detail := 'Vault is not available.';
  else
    execute $query$select count(*) = 1,
      coalesce(bool_and(decrypted_secret ~ '^https://discord[.]com/api/webhooks/[0-9]+/[A-Za-z0-9_-]+$'), false)
      from vault.decrypted_secrets where name = 'discord_session_webhook'$query$
      into configured, valid;
    status := case when configured and valid then 'ok' else 'missing_or_invalid' end;
    detail := case when configured and valid then 'One correctly formatted secret exists; delivery has not been tested.'
      else 'Configure one discord_session_webhook secret with a Discord webhook URL without query parameters.' end;
  end if;
  return next;

  foreach item in array array['discord-session-reminders', 'club-cron-history-cleanup'] loop
    check_name := 'job:' || item;
    if pg_catalog.to_regclass('cron.job') is null then
      status := 'missing'; detail := 'Cron is not enabled.';
    else
      execute 'select jobid, active, schedule, command from cron.job where jobname = $1' into job using item;
      if job.jobid is null then
        status := 'missing'; detail := 'Run the reminder or history-cleanup setup script.';
      else
        status := case when job.active then 'ok' else 'disabled' end;
        detail := 'Schedule: ' || job.schedule || '. Verify the configured hour/retention in Cron.';
        if item = 'discord-session-reminders' and
          (job.schedule <> '*/5 * * * *' or job.command !~ 'private[.]send_discord_session_reminders') then
          status := 'review'; detail := 'Job differs from the supplied reminder setup script. Review its schedule and command.';
        end if;
      end if;
    end if;
    return next;
    if pg_catalog.to_regclass('cron.job_run_details') is not null and pg_catalog.to_regclass('cron.job') is not null then
      execute 'select r.status, r.start_time from cron.job_run_details r join cron.job j using (jobid)
        where j.jobname = $1 order by r.start_time desc limit 1' into last_run using item;
      check_name := 'last_run:' || item;
      status := case when last_run.status is null then 'not_run'
        when last_run.status not in ('succeeded', 'running', 'starting') then 'review'
        when last_run.start_time < now() - case when item = 'discord-session-reminders' then interval '15 minutes' else interval '26 hours' end then 'stale'
        else 'ok' end;
      detail := coalesce(last_run.status || ' at ' || last_run.start_time::text, 'No retained run history.');
      return next;
    end if;
  end loop;
end;
$$;

-- Row-level security and table privileges. Client writes use checked RPCs.
alter table public.club_roles enable row level security;
revoke all on public.club_roles from public, anon, authenticated;
grant select on public.club_roles to authenticated;
alter table public.session_schedules enable row level security;
revoke all on public.session_schedules from public, anon, authenticated;
grant select on public.session_schedules to authenticated;
alter table public.club_sessions enable row level security;
revoke all on public.club_sessions from public, anon, authenticated;
grant select on public.club_sessions to authenticated;
alter table public.session_availability enable row level security;
revoke all on public.session_availability from public, anon, authenticated;
grant select on public.session_availability to authenticated;
alter table public.session_defaults enable row level security;
revoke all on public.session_defaults from public, anon, authenticated;
grant select on public.session_defaults to authenticated;
alter table public.discord_connections enable row level security;
revoke all on public.discord_connections from public, anon, authenticated;
grant select on public.discord_connections to authenticated;
revoke all on private.discord_session_deliveries from public, anon, authenticated;

create policy "Execs and admins can read their role; admins can read all roles"
on public.club_roles for select to authenticated
using (
  (user_id = (select auth.uid()) and email = (select private.google_email()))
  or (select private.is_club_admin())
);

create policy "Active execs and admins read sessions"
on public.club_sessions for select to authenticated
using ((select public.get_club_role()) in ('exec', 'admin'));

create policy "Active execs and admins read availability"
on public.session_availability for select to authenticated
using ((select public.get_club_role()) in ('exec', 'admin'));

create policy "Active club accounts read schedules" on public.session_schedules for select to authenticated
using ((select public.get_club_role()) in ('exec', 'admin'));

create policy "Defaults are private to their owner" on public.session_defaults for select to authenticated
using ((select public.get_club_role()) in ('exec', 'admin') and user_id = (select auth.uid()));

create policy "Read own Discord connection" on public.discord_connections for select to authenticated
using (user_id = (select auth.uid()) and (select public.get_club_role()) in ('exec','admin'));

-- Function execution privileges are explicit, including both worker overloads.
revoke all on function private.google_email() from public, anon;
revoke all on function private.is_club_admin() from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.google_email() to authenticated;
grant execute on function private.is_club_admin() to authenticated;
revoke all on function public.get_club_role() from public, anon;
revoke all on function public.activate_club_access() from public, anon;
revoke all on function public.list_club_roles() from public, anon;
revoke all on function public.approve_club_account(text, text) from public, anon;
revoke all on function public.remove_club_access(uuid) from public, anon;
grant execute on function public.get_club_role() to authenticated;
grant execute on function public.activate_club_access() to authenticated;
grant execute on function public.list_club_roles() to authenticated;
grant execute on function public.approve_club_account(text, text) to authenticated;
grant execute on function public.remove_club_access(uuid) to authenticated;
revoke all on function public.list_session_execs() from public, anon;
revoke all on function public.set_session_availability(uuid, text) from public, anon;
grant execute on function public.list_session_execs() to authenticated;
grant execute on function public.set_session_availability(uuid, text) to authenticated;
revoke all on function private.require_session_access() from public, anon, authenticated;
revoke all on function public.save_session_schedule(integer, time, time, uuid) from public, anon;
revoke all on function public.stop_session_schedule(uuid) from public, anon;
revoke all on function public.add_extra_session(date, time, time) from public, anon;
revoke all on function public.cancel_club_session(uuid) from public, anon;
revoke all on function public.save_session_defaults(jsonb) from public, anon;
revoke all on function public.get_session_week(date) from public, anon;
grant execute on function public.save_session_schedule(integer, time, time, uuid) to authenticated;
grant execute on function public.stop_session_schedule(uuid) to authenticated;
grant execute on function public.add_extra_session(date, time, time) to authenticated;
grant execute on function public.cancel_club_session(uuid) to authenticated;
grant execute on function public.save_session_defaults(jsonb) to authenticated;
grant execute on function public.get_session_week(date) to authenticated;
revoke all on function public.update_session_time(uuid, time, time) from public, anon;
grant execute on function public.update_session_time(uuid, time, time) to authenticated;
revoke all on function private.materialize_session_dates(date, date, timestamptz) from public, anon, authenticated;
revoke all on function private.send_discord_session_reminders(integer, timestamptz) from public, anon, authenticated;
revoke all on function public.save_discord_connection(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.save_discord_connection(uuid, uuid, text, text) to service_role;
revoke all on function public.disconnect_discord() from public, anon;
grant execute on function public.disconnect_discord() to authenticated;
revoke all on function private.run_discord_session_reminders(integer, timestamptz, uuid) from public, anon, authenticated;
revoke all on function private.test_discord_session_reminder(date, time, time, text) from public, anon, authenticated;
revoke all on function private.test_next_discord_session(timestamptz) from public, anon, authenticated;
revoke all on function private.run_discord_session_reminders(integer, timestamptz, uuid, boolean) from public, anon, authenticated;
revoke all on function private.next_discord_session(timestamptz) from public, anon, authenticated;
revoke all on function private.preview_next_discord_reminder(text, timestamptz) from public, anon, authenticated;
revoke all on function private.discord_setup_health() from public, anon, authenticated;

commit;
