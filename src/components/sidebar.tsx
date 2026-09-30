"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useFormStatus } from "react-dom";
import { logout } from "@/app/actions";
import { Brand } from "./brand";
import { Icon } from "./icon";
import type { ClubRole } from "@/lib/roles";
import { sidebarStyles as styles } from "./sidebar-styles";

const navigationItems = [
  { label: "Home", href: "/home", icon: "home" },
  { label: "Sessions", href: "/sessions", icon: "sessions" },
  { label: "Tournaments", href: "/tournaments", icon: "tournaments" },
] as const;

function LogoutButton() {
  const { pending } = useFormStatus();
  return (
    <button className={styles.logoutButton} disabled={pending}>
      <Icon name="logout" />
      {pending ? "Logging out…" : "Log out"}
    </button>
  );
}

export function Sidebar({ email, role }: { email: string; role: ClubRole }) {
  const pathname = usePathname();
  const items =
    role === "admin"
      ? [
          ...navigationItems,
          { label: "Manage access", href: "/execs", icon: "accounts" as const },
        ]
      : navigationItems;
  return (
    <aside className={styles.sidebar}>
      <Brand />
      <div className={styles.heading}>WORKSPACE</div>
      <nav className={styles.navigation} aria-label="Main navigation">
        {items.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={styles.navigationLink}
            aria-current={pathname === item.href ? "page" : undefined}
          >
            <Icon name={item.icon} />
            {item.label}
          </Link>
        ))}
      </nav>
      <div className={styles.accountArea}>
        <Link
          href="/discord"
          className={`${styles.navigationLink} mb-4 max-[760px]:mb-0`}
          aria-current={pathname === "/discord" ? "page" : undefined}
        >
          <Icon name="accounts" />
          Discord account
        </Link>
        <div className={styles.profile}>
          <span className={styles.avatar} aria-hidden="true">
            {email.charAt(0).toUpperCase()}
          </span>
          <div>
            <strong>
              {role === "admin" ? "Club Admin" : "Club Executive"}
            </strong>
            <span className={styles.email}>{email}</span>
          </div>
        </div>
        <form action={logout}>
          <LogoutButton />
        </form>
      </div>
    </aside>
  );
}
