"use client";

import { useActionState } from "react";
import {
  scheduleLabel,
  type SessionSchedule,
  type SessionDefault,
  type SessionActionState,
} from "@/lib/sessions";
import { saveDefaults } from "./actions";
import { SessionFeedback } from "./session-feedback";
import { sessionStyles as styles } from "./session-styles";

const initialState: SessionActionState = { error: "", success: "" };

export function UsualAvailabilityForm({
  schedules,
  defaults,
}: {
  schedules: SessionSchedule[];
  defaults: SessionDefault[];
}) {
  const [state, action, pending] = useActionState(saveDefaults, initialState);
  return (
    <form action={action}>
      <p className={styles.help}>
        Choose your usual response once. It fills unanswered upcoming dates
        only; existing answers and dates you clear stay unchanged.
      </p>
      {!schedules.length ? (
        <p className={styles.help}>
          Set the weekly schedule first, then choose your usual availability
          here.
        </p>
      ) : (
        <>
          <fieldset disabled={pending} className={styles.defaultFields}>
            {schedules.map((schedule) => (
              <label key={schedule.id} className={styles.defaultField}>
                <span>{scheduleLabel(schedule)}</span>
                <select
                  className={styles.input}
                  name={`schedule:${schedule.id}`}
                  defaultValue={
                    defaults.find((item) => item.schedule_id === schedule.id)
                      ?.response ?? ""
                  }
                >
                  <option value="">Don’t autofill</option>
                  <option value="yes">Yes</option>
                  <option value="maybe">Maybe</option>
                  <option value="no">No</option>
                </select>
              </label>
            ))}
          </fieldset>
          <button className={styles.addButton} disabled={pending}>
            {pending ? "Saving…" : "Save my defaults"}
          </button>
        </>
      )}
      <SessionFeedback state={state} />
    </form>
  );
}
