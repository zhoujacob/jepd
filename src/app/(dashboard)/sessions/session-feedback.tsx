import type { SessionActionState } from "@/lib/sessions";
import { sessionStyles as styles } from "./session-styles";

export function SessionFeedback({ state }: { state: SessionActionState }) {
  return (
    <div aria-live="polite">
      {state.error && (
        <p className={styles.formError} role="alert">
          {state.error}
        </p>
      )}
      {state.success && <p className={styles.formSuccess}>{state.success}</p>}
    </div>
  );
}
