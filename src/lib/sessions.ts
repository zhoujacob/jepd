// Date-only arithmetic avoids moving sessions by an hour across DST changes.
export const MIN_WEEK = "2000-01-03";
export const MAX_WEEK = "2099-12-21";
export const MAX_SESSION_DATE = "2099-12-27";
export const CLUB_TIME_ZONE = "America/Toronto";

export type ClubSession = {
  id: string;
  session_date: string;
  starts_at: string;
  ends_at: string;
  created_by: string | null;
  schedule_id?: string | null;
};
export type SessionExec = {
  user_id: string;
  email: string;
  display_name: string;
};
export type Availability = "yes" | "maybe" | "no";
export type SessionResponse = {
  session_id: string;
  user_id: string;
  response: Availability | null;
};
export type SessionActionState = { error: string; success: string };

export type SessionSchedule = {
  id: string;
  weekday: number;
  starts_at: string;
  ends_at: string;
  created_by: string | null;
};
export type SessionDefault = { schedule_id: string; response: Availability };
export type SessionWeek = {
  sessions: ClubSession[];
  responses: SessionResponse[];
  roster: SessionExec[];
  schedules: SessionSchedule[];
  defaults: SessionDefault[];
};

export function isDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return (
    Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}

export function addDays(value: string, days: number): string {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function weekStart(value: string): string {
  const day = new Date(`${value}T12:00:00Z`).getUTCDay();
  return addDays(value, -((day + 6) % 7));
}

export function clubToday(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: CLUB_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const part = (type: string) =>
    parts.find((item) => item.type === type)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function isWeek(value: string): boolean {
  return (
    isDate(value) &&
    value >= MIN_WEEK &&
    value <= MAX_WEEK &&
    weekStart(value) === value
  );
}

export function formatDate(value: string, weekday = false): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
    ...(weekday ? { weekday: "short" as const } : { year: "numeric" as const }),
  }).format(new Date(`${value}T12:00:00Z`));
}

export function formatWeekRange(week: string): string {
  const end = addDays(week, 6);
  const sameYear = week.slice(0, 4) === end.slice(0, 4);
  const startLabel = new Intl.DateTimeFormat("en-CA", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" as const }),
  }).format(new Date(`${week}T12:00:00Z`));

  return `${startLabel} – ${formatDate(end)}`;
}

export function formatTime(value: string): string {
  const [hours, minutes] = value.split(":").map(Number);
  return `${hours % 12 || 12}:${String(minutes).padStart(2, "0")} ${hours >= 12 ? "PM" : "AM"}`;
}

export function sessionInputError(
  date: string,
  start: string,
  end: string,
): string | null {
  if (!isDate(date) || date < MIN_WEEK || date > MAX_SESSION_DATE)
    return "Choose a valid session date.";
  return sessionTimeError(start, end);
}

export function sessionTimeError(start: string, end: string): string | null {
  if (![start, end].every((time) => /^([01]\d|2[0-3]):[0-5]\d$/.test(time)))
    return "Enter valid start and end times.";
  if (end <= start)
    return "The end time must be after the start time on the same day.";
  return null;
}

export const weekdays = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];
export function scheduleLabel(schedule: SessionSchedule) {
  return `${weekdays[schedule.weekday - 1]}, ${formatTime(schedule.starts_at)}–${formatTime(schedule.ends_at)}`;
}

export function sessionLabel(session: ClubSession): string {
  return `${formatDate(session.session_date, true)}, ${formatTime(session.starts_at)}–${formatTime(session.ends_at)}`;
}
