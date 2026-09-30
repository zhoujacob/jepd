import Link from "next/link";
import { requireExec } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  addDays,
  clubToday,
  formatWeekRange,
  isDate,
  isWeek,
  MAX_WEEK,
  MIN_WEEK,
  weekStart,
  type SessionWeek,
} from "@/lib/sessions";
import { UsualAvailabilityForm } from "./usual-availability-form";
import { WeeklySchedule, WeekManagement } from "./schedule-management";
import { SessionsBoard } from "./sessions-board";
import { ScheduleTabs } from "./schedule-tabs";
import { sessionStyles as styles } from "./session-styles";

export const metadata = { title: "Sessions" };

export default async function SessionsPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  const user = await requireExec();
  const params = await searchParams;
  const today = clubToday();
  const requestedWeek =
    typeof params.week === "string" && isDate(params.week)
      ? weekStart(params.week)
      : "";
  const week = isWeek(requestedWeek) ? requestedWeek : weekStart(today);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_session_week", {
    target_week: week,
  });
  if (error) {
    // Keep database diagnostics in the server terminal, not in the exec-facing UI.
    console.error(
      "[sessions] get_session_week failed",
      JSON.stringify({ code: error.code, message: error.message }),
    );
  }
  const snapshot = data as SessionWeek | null;
  const {
    sessions = [],
    responses = [],
    schedules = [],
    defaults = [],
    roster: accounts = [],
  } = snapshot ?? {};
  const failed = error || !snapshot;
  const roster = [...accounts].sort((a, b) => {
    if (a.user_id === user.id) return -1;
    if (b.user_id === user.id) return 1;
    return a.display_name.localeCompare(b.display_name);
  });

  return (
    <>
      <div className={styles.pageHeading}>
        <p className={styles.eyebrow}>CLUB WORKSPACE</p>
        <h1>Sessions</h1>
        <p>Choose Yes, Maybe, or No in your row.</p>
      </div>
      <ScheduleTabs
        availability={
          <div className={styles.controlPanel}>
            <h2 className={styles.weekTitle}>My usual availability</h2>
            {failed ? (
              <p role="alert" className={styles.error}>
                Unable to load your usual availability. Try refreshing.
              </p>
            ) : (
              <UsualAvailabilityForm
                key={JSON.stringify(schedules)}
                schedules={schedules}
                defaults={defaults}
              />
            )}
          </div>
        }
        weekly={
          <div className={styles.section}>
            <h2 className={styles.weekTitle}>Weekly schedule</h2>
            <p className={styles.help}>
              Set repeating sessions here. For a one-off change, use This week.
            </p>
            {failed ? (
              <p className={styles.error} role="alert">
                Unable to load the weekly schedule. Try refreshing.
              </p>
            ) : (
              <WeeklySchedule schedules={schedules} user={user} />
            )}
          </div>
        }
      >
        <section aria-labelledby="week-title" className={styles.section}>
          <div className={styles.weekToolbar}>
            <div>
              <h2 id="week-title" className={styles.weekTitle}>
                {formatWeekRange(week)}
              </h2>
              <p className={styles.help}>
                Monday–Sunday · All times in Waterloo (Eastern time)
              </p>
            </div>
            <nav aria-label="Session weeks" className={styles.weekNavigation}>
              {week > MIN_WEEK && (
                <Link
                  className={styles.navigationLink}
                  href={`/sessions?week=${addDays(week, -7)}`}
                >
                  ← Previous
                </Link>
              )}
              <Link className={styles.navigationLink} href="/sessions">
                This week
              </Link>
              {week < MAX_WEEK && (
                <Link
                  className={styles.navigationLink}
                  href={`/sessions?week=${addDays(week, 7)}`}
                >
                  Next →
                </Link>
              )}
            </nav>
          </div>
          {failed ? (
            <p className={styles.error} role="alert">
              Unable to load the session board. Try refreshing. If it keeps
              happening, contact the site maintainer to check the server logs.
            </p>
          ) : (
            <>
              <WeekManagement
                sessions={sessions}
                user={user}
                week={week}
                today={today}
              />
              {sessions.length === 0 ? (
                <div className={styles.emptyState}>
                  <h2 className={styles.emptyTitle}>No sessions this week</h2>
                  <p className={styles.emptyDescription}>
                    Use Weekly schedule to set repeating sessions, or open
                    Manage this week to add a session just for these dates.
                  </p>
                </div>
              ) : (
                <>
                  {/* Reset local responses when a fresh server snapshot arrives. */}
                  <SessionsBoard
                    key={JSON.stringify([
                      user.id,
                      week,
                      sessions.map((session) => session.id),
                      responses,
                    ])}
                    week={week}
                    sessions={sessions}
                    roster={roster}
                    initialResponses={responses}
                    userId={user.id}
                  />
                </>
              )}
            </>
          )}
        </section>
      </ScheduleTabs>
    </>
  );
}
