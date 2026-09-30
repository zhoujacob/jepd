import type { ClubRole } from "@/lib/roles";
import {
  addDays,
  scheduleLabel,
  sessionLabel,
  type ClubSession,
  type SessionSchedule,
} from "@/lib/sessions";
import { ScheduleForm, StopScheduleForm } from "./schedule-forms";
import {
  AddSessionForm,
  CancelSessionForm,
  UpdateSessionTimeForm,
} from "./session-forms";
import { sessionStyles as styles } from "./session-styles";

type ScheduleUser = { id: string; role: ClubRole };

// These checks control visible controls. Actions and SQL independently enforce access.
export function WeeklySchedule({
  schedules,
  user,
}: {
  schedules: SessionSchedule[];
  user: ScheduleUser;
}) {
  return (
    <section
      className={styles.managementSection}
      aria-labelledby="recurring-title"
    >
      <h3 id="recurring-title">Repeating sessions</h3>
      <p className={styles.help}>
        Repeats every week from today onward. Changing a day or time starts a
        new series with unanswered availability.
      </p>
      {schedules.map((schedule) => (
        <div className={styles.scheduleItem} key={schedule.id}>
          {user.role === "admin" || schedule.created_by === user.id ? (
            <details>
              <summary className={styles.managementSummary}>
                {scheduleLabel(schedule)}
              </summary>
              <ScheduleForm schedule={schedule} />
              <StopScheduleForm schedule={schedule} />
            </details>
          ) : (
            <p>{scheduleLabel(schedule)}</p>
          )}
        </div>
      ))}
      <ScheduleForm />
    </section>
  );
}

export function WeekManagement({
  sessions,
  user,
  week,
  today,
}: {
  sessions: ClubSession[];
  user: ScheduleUser;
  week: string;
  today: string;
}) {
  const end = addDays(week, 6);
  return (
    <details className={styles.controlPanel}>
      <summary className={styles.addSummary}>Manage this week</summary>
      <section
        className={styles.managementSection}
        aria-labelledby="week-changes-title"
      >
        <h3 id="week-changes-title">Changes for this week</h3>
        <AddSessionForm
          key={week}
          week={week}
          defaultDate={today >= week && today <= end ? today : week}
        />
        <ul className={styles.managementList}>
          {sessions
            .filter(
              (session) =>
                user.role === "admin" || session.created_by === user.id,
            )
            .map((session) => {
              const label = sessionLabel(session);
              return (
                <li key={session.id} className={styles.managementItem}>
                  <span>{label}</span>
                  <div className={styles.sessionActions}>
                    <UpdateSessionTimeForm session={session} label={label} />
                    <CancelSessionForm id={session.id} label={label} />
                  </div>
                </li>
              );
            })}
        </ul>
      </section>
    </details>
  );
}
