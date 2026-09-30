"use client";

import { useActionState } from "react";
import { approveAccount, removeAccess } from "./actions";
import { execStyles as styles } from "./exec-styles";

const initialState = { error: "", success: "" };

export function AddAccountForm() {
  const [state, action, pending] = useActionState(approveAccount, initialState);
  return (
    <form action={action} className={styles.addForm}>
      <div className={styles.fields}>
        <div className={styles.emailField}>
          <label htmlFor="account-email">Exact Google account email</label>
          <input
            className={styles.input}
            id="account-email"
            name="email"
            type="email"
            autoComplete="off"
            placeholder="name@gmail.com"
            maxLength={254}
            required
            disabled={pending}
            aria-describedby="add-account-help"
          />
        </div>
        <div>
          <label htmlFor="account-role">Role</label>
          <select
            className={styles.input}
            id="account-role"
            name="role"
            defaultValue="exec"
            disabled={pending}
          >
            <option value="exec">Exec</option>
            <option value="admin">Admin</option>
          </select>
        </div>
        <button className={styles.addButton} disabled={pending}>
          {pending ? "Adding…" : "Add access"}
        </button>
      </div>
      <p id="add-account-help" className={styles.help}>
        Access stays pending until they sign in with that Google account. Share
        the website link yourself; we don’t send emails. Admins can add and
        remove other execs and admins.
      </p>
      <div aria-live="polite">
        {state.error && (
          <p className="form-error" role="alert">
            {state.error}
          </p>
        )}
        {state.success && <p className={styles.success}>{state.success}</p>}
      </div>
    </form>
  );
}

export function RemoveAccessForm({
  approvalId,
  email,
}: {
  approvalId: string;
  email: string;
}) {
  const [state, action, pending] = useActionState(removeAccess, initialState);
  return (
    <form action={action} className={styles.removeForm}>
      <input type="hidden" name="approval_id" value={approvalId} />
      <button
        className={styles.removeButton}
        disabled={pending}
        aria-label={`Remove access for ${email}`}
      >
        {pending ? "Removing…" : "Remove access"}
      </button>
      <div aria-live="polite">
        {state.error && (
          <p className="form-error" role="alert">
            {state.error}
          </p>
        )}
      </div>
    </form>
  );
}
