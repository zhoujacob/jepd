"use client";

import { useActionState } from "react";
import { saveSchedule, stopSchedule } from "./actions";
import {
  weekdays,
  scheduleLabel,
  type SessionSchedule,
  type SessionActionState,
} from "@/lib/sessions";
import { TimeFields } from "./time-fields";
import { SessionFeedback } from "./session-feedback";
import { sessionStyles as styles } from "./session-styles";

const initialState: SessionActionState = { error: "", success: "" };

export function ScheduleForm({ schedule }: { schedule?: SessionSchedule }) {
  const [state, action, pending] = useActionState(saveSchedule, initialState);
  return (
    <form
      action={action}
      className={styles.addForm}
      onSubmit={(event) => {
        if (
          schedule &&
          !window.confirm(
            "Change this weekly session from today onward? Upcoming dates at the old time will be cancelled, and execs will need to choose availability for the new time.",
          )
        )
          event.preventDefault();
      }}
    >
      <input type="hidden" name="schedule_id" value={schedule?.id ?? ""} />
      <fieldset disabled={pending} className={styles.fields}>
        <label className={styles.fieldLabel}>
          Day
          <select
            name="weekday"
            className={styles.input}
            defaultValue={schedule?.weekday ?? 1}
          >
            {weekdays.map((day, index) => (
              <option key={day} value={index + 1}>
                {day}
              </option>
            ))}
          </select>
        </label>
        <TimeFields
          start={schedule?.starts_at.slice(0, 5)}
          end={schedule?.ends_at.slice(0, 5)}
        />
        <button className={styles.addButton} disabled={pending}>
          {pending
            ? "Saving…"
            : schedule
              ? "Save changes"
              : "Add weekly session"}
        </button>
      </fieldset>
      <SessionFeedback state={state} />
    </form>
  );
}

export function StopScheduleForm({ schedule }: { schedule: SessionSchedule }) {
  const [state, action, pending] = useActionState(stopSchedule, initialState);
  return (
    <form
      action={action}
      onSubmit={(event) => {
        if (
          !window.confirm(
            `Stop repeating ${scheduleLabel(schedule)} from today onward? Past sessions will remain.`,
          )
        )
          event.preventDefault();
      }}
    >
      <input type="hidden" name="schedule_id" value={schedule.id} />
      <button className={styles.removeButton} disabled={pending}>
        {pending ? "Stopping…" : "Stop repeating"}
      </button>
      <SessionFeedback state={state} />
    </form>
  );
}
