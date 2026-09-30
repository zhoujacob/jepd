"use client";

import { useActionState } from "react";
import { loginWithGoogle } from "@/app/actions";
import { loginStyles as styles } from "./login-styles";

export function LoginForm({ configured }: { configured: boolean }) {
  const [state, action, pending] = useActionState(loginWithGoogle, {
    error: "",
  });

  return (
    <form action={action} className={styles.form}>
      <div aria-live="polite">
        {state.error && (
          <p className="form-error" role="alert">
            {state.error}
          </p>
        )}
        {!configured && (
          <p className="form-error">
            Sign-in is not configured yet. Contact your club administrator.
          </p>
        )}
      </div>
      <button className={styles.googleButton} disabled={pending || !configured}>
        {pending ? "Connecting to Google…" : "Continue with Google"}
      </button>
      <p className={styles.help}>
        Use the exact Google account email approved by your club admin.
      </p>
    </form>
  );
}
