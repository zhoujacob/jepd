import { sessionStyles as styles } from "./session-styles";

// Used inside the parent form's fieldset, which handles its disabled state.
export function TimeFields({
  start = "19:00",
  end = "21:00",
}: {
  start?: string;
  end?: string;
}) {
  return (
    <>
      <label className={styles.fieldLabel}>
        Start time
        <input
          className={styles.input}
          name="start"
          type="time"
          defaultValue={start}
          step="60"
          required
        />
      </label>
      <label className={styles.fieldLabel}>
        End time
        <input
          className={styles.input}
          name="end"
          type="time"
          defaultValue={end}
          step="60"
          required
        />
      </label>
    </>
  );
}
