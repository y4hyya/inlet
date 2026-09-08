"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { site } from "@/lib/site";
import styles from "./nav.module.css";

const items = [
  { href: "/docs", label: "Docs" },
  { href: "/app", label: "App" },
];

export function NavLinks() {
  const pathname = usePathname();
  return (
    <nav className={styles.links} aria-label="Primary">
      {items.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link key={item.href} href={item.href} className={styles.link} aria-current={active ? "page" : undefined}>
            {item.label}
          </Link>
        );
      })}
      <a href={site.repo} className={styles.link} target="_blank" rel="noreferrer">
        GitHub
      </a>
    </nav>
  );
}
