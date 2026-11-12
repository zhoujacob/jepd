-- Changing or stopping a weekly session no longer cancels a session that has
-- already started (Waterloo time), and a new series never adds a session in the
-- past. Run the complete file once in SQL Editor after the initial schema. Safe
-- for existing data; nothing is rewritten.
-- "create or replace" keeps each function's existing execute privileges.
begin;

create or replace function public.save_session_schedule(day_number integer, start_time time, end_time time, replacing_id uuid default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  previous public.session_schedules;
  local_now timestamp := now() at time zone 'America/Toronto';
  today date := local_now::date;
begin
  perform private.require_session_access();
  perform pg_advisory_xact_lock(27401, 1);
  if replacing_id is not null then
    select * into previous from public.session_schedules where id = replacing_id and ends_on is null;
    if not found or (previous.created_by is distinct from auth.uid() and public.get_club_role() <> 'admin') then
      raise exception 'You can only change your own schedules.' using errcode = '42501';
    end if;
    if previous.weekday = day_number and previous.starts_at = start_time and previous.ends_at = end_time then return; end if;
    -- Today's session stays in the old series once it has started.
    update public.session_schedules set ends_on = case
        when previous.weekday = extract(isodow from today) and previous.starts_at <= local_now::time then today
        else today - 1 end
      where id = replacing_id;
    update public.club_sessions set cancelled = true
      where schedule_id = replacing_id and session_date + starts_at > local_now;
  end if;
  -- A replacement is a new series: old defaults and answers cannot follow new times.
  -- If today's slot has already started, the series begins tomorrow.
  insert into public.session_schedules(weekday, starts_at, ends_at, created_by, starts_on)
  values(day_number, start_time, end_time, auth.uid(), case
    when day_number = extract(isodow from today) and start_time <= local_now::time then today + 1
    else today end);
end;
$$;

create or replace function public.stop_session_schedule(target_schedule uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  target public.session_schedules;
  local_now timestamp := now() at time zone 'America/Toronto';
  today date := local_now::date;
begin
  perform private.require_session_access();
  perform pg_advisory_xact_lock(27401, 1);
  select * into target from public.session_schedules where id = target_schedule and ends_on is null;
  if not found or (target.created_by is distinct from auth.uid() and public.get_club_role() <> 'admin') then
    raise exception 'You can only stop your own schedules.' using errcode = '42501';
  end if;
  -- Today's session stays in the series once it has started.
  update public.session_schedules set ends_on = case
      when target.weekday = extract(isodow from today) and target.starts_at <= local_now::time then today
      else today - 1 end
    where id = target_schedule;
  update public.club_sessions set cancelled = true
    where schedule_id = target_schedule and session_date + starts_at > local_now;
end;
$$;

commit;
