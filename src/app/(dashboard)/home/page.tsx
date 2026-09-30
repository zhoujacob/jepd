import Link from "next/link";
import { requireExec } from "@/lib/auth";
import { Icon } from "@/components/icon";
import { homeStyles as styles } from "./home-styles";

const workspaceItems = [
  {
    name: "Sessions",
    icon: "sessions",
    description: "Managing which execs show up to each session",
  },
  {
    name: "Tournaments",
    icon: "tournaments",
    description: "Managing both inter-university and local tournaments",
  },
] as const;

export const metadata = { title: "Home" };

export default async function HomePage() {
  await requireExec();
  return (
    <>
      <div className="page-heading">
        <h1>Home</h1>
      </div>
      <section className={styles.section} aria-labelledby="workspace-title">
        <h2 id="workspace-title">Your workspace</h2>
        <div className={styles.grid}>
          {workspaceItems.map((item) => (
            <Link
              className={styles.card}
              key={item.name}
              href={`/${item.icon}`}
            >
              <span className={styles.icon}>
                <Icon name={item.icon} />
              </span>
              <h3>{item.name}</h3>
              <p>{item.description}</p>
              <span className={styles.cardLink}>
                View {item.icon}
                <Icon name="arrow" />
              </span>
            </Link>
          ))}
        </div>
      </section>
    </>
  );
}
