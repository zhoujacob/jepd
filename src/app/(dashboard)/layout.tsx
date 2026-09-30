import { requireExec } from "@/lib/auth";
import { Sidebar } from "@/components/sidebar";
import { dashboardStyles as styles } from "./dashboard-styles";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireExec();
  return (
    <div className={styles.shell}>
      <a className={styles.skipLink} href="#main">
        Skip to content
      </a>
      <Sidebar email={user.email!} role={user.role} />
      <div className={styles.content}>
        <header className={styles.header}>
          <span>
            University of Waterloo <span className={styles.separator}>/</span>{" "}
            Pickleball Club
          </span>
          <span className={styles.workspaceLabel}>
            <span />
            Exec workspace
          </span>
        </header>
        <main id="main" className={styles.main}>
          {children}
        </main>
        <footer className={styles.footer}>
          Built and operated by the UW Pickleball Club student team{" "}
          <span>Made by Jacob Zhou (UW SE &apos;27)</span>
        </footer>
      </div>
    </div>
  );
}
