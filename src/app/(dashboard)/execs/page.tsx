import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { ClubAccount } from "@/lib/roles";
import { AddAccountForm, RemoveAccessForm } from "./exec-forms";
import { execStyles as styles } from "./exec-styles";

export const metadata = { title: "Manage access" };

export default async function ExecsPage() {
  const user = await requireAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_club_roles");
  const accounts = (data ?? []) as ClubAccount[];

  return (
    <>
      <div className="page-heading">
        <p className="eyebrow">ADMIN</p>
        <h1>Manage access</h1>
        <p>Approve Google accounts for exec or admin access.</p>
      </div>
      <section className={styles.panel} aria-labelledby="add-exec-title">
        <h2 id="add-exec-title">Add an exec or admin</h2>
        <AddAccountForm />
      </section>
      <section className={styles.panel} aria-labelledby="accounts-title">
        <h2 id="accounts-title">Club execs and admins</h2>
        <p className={styles.help}>
          Removing access blocks future dashboard requests, including for
          signed-in users.
        </p>
        {error ? (
          <p className="form-error" role="alert">
            Unable to load club execs and admins. Check the Supabase setup and
            refresh this page.
          </p>
        ) : (
          <ul className={styles.accountList}>
            {accounts.map((account) => (
              <li key={account.id}>
                <div className={styles.accountDetails}>
                  <strong>{account.email}</strong>
                  <span>
                    {account.role === "admin" ? "Club admin" : "Club exec"}
                    {" · "}
                    {account.status === "pending"
                      ? "Pending first sign-in"
                      : "Active"}
                  </span>
                </div>
                {account.user_id !== user.id ? (
                  <RemoveAccessForm
                    approvalId={account.id}
                    email={account.email}
                  />
                ) : (
                  <span className={styles.help}>Your account</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
