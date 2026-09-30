"use client";

import { useActionState } from "react";
import { addSession, cancelSession, updateSessionTime } from "./actions";
import {
  addDays,
  type ClubSession,
  type SessionActionState,
} from "@/lib/sessions";

import { TimeFields } from "./time-fields";
import { SessionFeedback } from "./session-feedback";
import { sessionStyles as styles } from "./session-styles";

const initialState: SessionActionState = { error: "", success: "" };

export function AddSessionForm({
  week,
  defaultDate,
}: {
  week: string;
  defaultDate: string;
}) {
  const [state, action, pending] = useActionState(addSession, initialState);
  return (
    <details className={styles.addPanel}>
      <summary className={styles.addSummary}>
        Add an extra session this week
      </summary>
      <form action={action} className={styles.addForm}>
        <input type="hidden" name="week" value={week} />
        <fieldset disabled={pending} className={styles.fields}>
          <label className={styles.fieldLabel}>
            Date
            <input
              className={styles.input}
              name="date"
              type="date"
              min={week}
              max={addDays(week, 6)}
              defaultValue={defaultDate}
              required
            />
          </label>
          <TimeFields />
          <button className={styles.addButton} disabled={pending}>
            {pending ? "Adding…" : "Add session"}
          </button>
        </fieldset>
        <SessionFeedback state={state} />
      </form>
    </details>
  );
}

export function CancelSessionForm({
  id,
  label,
}: {
  id: string;
  label: string;
}) {
  const [state, action, pending] = useActionState(cancelSession, initialState);
  return (
    <form
      action={action}
      onSubmit={(event) => {
        if (
          !window.confirm(
            `Cancel ${label} for this date only? Other weeks will stay unchanged.`,
          )
        )
          event.preventDefault();
      }}
    >
      <input type="hidden" name="session_id" value={id} />
      <button
        className={styles.removeButton}
        disabled={pending}
        aria-label={`Cancel ${label}`}
      >
        {pending ? "Cancelling…" : "Cancel this date"}
      </button>
      <SessionFeedback state={state} />
    </form>
  );
}

export function UpdateSessionTimeForm({
  session,
  label,
}: {
  session: ClubSession;
  label: string;
}) {
  const [state, action, pending] = useActionState(
    updateSessionTime,
    initialState,
  );
  return (
    <details>
      <summary
        className={styles.updateSummary}
        aria-label={`Update time for ${label}`}
      >
        Update time
      </summary>
      <p className={styles.help}>
        Only this date changes. Availability answers will be cleared; execs must
        answer again.
      </p>
      <form action={action} className={styles.addForm}>
        <input type="hidden" name="session_id" value={session.id} />
        <fieldset disabled={pending} className={styles.timeFields}>
          <TimeFields
            start={session.starts_at.slice(0, 5)}
            end={session.ends_at.slice(0, 5)}
          />
          <button className={styles.addButton} disabled={pending}>
            {pending ? "Saving…" : "Save time"}
          </button>
        </fieldset>
        <SessionFeedback state={state} />
      </form>
    </details>
  );
}
