import { redirect } from "next/navigation";
import { getExec } from "@/lib/auth";
import { getSupabaseConfig } from "@/lib/supabase/config";
import { getSiteOrigin } from "@/lib/site-url";
import { Brand } from "@/components/brand";
import { LoginForm } from "./login-form";
import { loginStyles as styles } from "./login-styles";

export const metadata = { title: "Sign in" };
export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  if (await getExec()) redirect("/home");
  const { error } = await searchParams;
  return (
    <main className={styles.page}>
      <div className={styles.brand}>
        <Brand />
      </div>
      <section className={styles.card}>
        <p className="eyebrow">EXEC WORKSPACE</p>

        {error && ["oauth", "access", "setup"].includes(error) && (
          <p className="form-error" role="alert">
            {error === "access"
              ? "This Google account does not have club access. Ask an admin to approve its exact email, or choose another Google account."
              : error === "setup"
                ? "Unable to check club access. Ask the site maintainer to check the Supabase setup."
                : "Google sign-in was cancelled or could not be completed. Please try again."}
          </p>
        )}
        <LoginForm configured={!!getSupabaseConfig() && !!getSiteOrigin()} />
        <p className={styles.help}>
          For club executives only.
          <br />
          Need access?
          <br />
          Contact your club administrator.
        </p>
      </section>
      <p className={styles.footer}>
        Built and operated by the UW Pickleball Club student team. This is not
        an official University of Waterloo website.
      </p>
    </main>
  );
}
