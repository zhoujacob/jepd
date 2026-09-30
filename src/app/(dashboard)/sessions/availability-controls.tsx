"use client";

import { useState, useTransition } from "react";
import type { Availability, SessionActionState } from "@/lib/sessions";
import { saveAvailability } from "./actions";
import { sessionStyles as styles, responseStyles } from "./session-styles";

const initialState: SessionActionState = { error: "", success: "" };

const responseLabel = {
  yes: "Yes",
  maybe: "Maybe",
  no: "No",
  "": "Not answered",
};

export function AvailabilityLegend() {
  return (
    <ul aria-label="Availability legend" className={styles.legend}>
      {(["yes", "maybe", "no", ""] as const).map((response) => (
        <li key={response} className={styles.legendItem}>
          <span
            aria-hidden="true"
            className={`${styles.legendSwatch} ${responseStyles[response]}`}
          />
          {responseLabel[response]}
        </li>
      ))}
    </ul>
  );
}

export function AvailabilityCell({
  sessionId,
  response,
  editable,
  label,
  onSaved,
}: {
  sessionId: string;
  response: Availability | "";
  editable: boolean;
  label: string;
  onSaved: (sessionId: string, response: Availability | "") => void;
}) {
  const [value, setValue] = useState(response);
  const [message, setMessage] = useState(initialState);
  const [pending, startTransition] = useTransition();

  if (!editable)
    return (
      <span
        className={`${styles.readOnlyResponse} ${responseStyles[response]}`}
        title={responseLabel[response]}
      >
        {response ? (
          responseLabel[response]
        ) : (
          <span className={styles.srOnly}>Not answered</span>
        )}
      </span>
    );

  return (
    <div>
      <select
        value={value}
        disabled={pending}
        aria-label={`Your availability for ${label}`}
        className={`${styles.responseSelect} ${responseStyles[value]}`}
        onChange={(event) => {
          const next = event.target.value as Availability | "";
          const previous = value;
          setValue(next);
          setMessage(initialState);
          startTransition(async () => {
            const data = new FormData();
            data.set("session_id", sessionId);
            data.set("response", next);
            try {
              const result = await saveAvailability(data);
              setMessage(result);
              if (result.error) setValue(previous);
              else onSaved(sessionId, next);
            } catch {
              setValue(previous);
              setMessage({
                error: "Unable to save. Please try again.",
                success: "",
              });
            }
          });
        }}
      >
        <option className={styles.option} value="">
          Not answered
        </option>
        <option className={styles.option} value="yes">
          Yes
        </option>
        <option className={styles.option} value="maybe">
          Maybe
        </option>
        <option className={styles.option} value="no">
          No
        </option>
      </select>
      <div
        aria-live="polite"
        className={message.error ? styles.cellError : styles.srOnly}
      >
        {pending ? (
          <span className={styles.pending}>Saving…</span>
        ) : message.error ? (
          <span role="alert" className={styles.saveError}>
            {message.error}
          </span>
        ) : (
          <span className={styles.saved}>{message.success}</span>
        )}
      </div>
    </div>
  );
}
