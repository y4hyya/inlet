"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "./docs-nav.module.css";

export const docsGroups = [
  {
    title: "Start",
    items: [
      { href: "/docs", label: "Overview" },
      { href: "/docs/how-it-works", label: "How it works" },
    ],
  },
  {
    title: "Build",
    items: [
      { href: "/docs/widget", label: "Mount the widget" },
      { href: "/docs/sdk", label: "Deposit without a browser" },
      { href: "/docs/exit", label: "Withdraw to any chain" },
      { href: "/docs/adapters", label: "Destinations and adapters" },
      { href: "/docs/relayer", label: "Run a relayer" },
    ],
  },
  {
    title: "Agents",
    items: [{ href: "/docs/agents", label: "MCP server and skill" }],
  },
  {
    title: "Reference",
    items: [
      { href: "/docs/addresses", label: "Addresses" },
      { href: "/docs/faq", label: "Questions" },
    ],
  },
];

export function DocsNav() {
  const pathname = usePathname();
  return (
    <nav className={styles.nav} aria-label="Docs">
      {docsGroups.map((group) => (
        <div key={group.title} className={styles.group}>
          <p className={styles.title}>{group.title}</p>
          <ul className={styles.list}>
            {group.items.map((item) => {
              const active = pathname === item.href || pathname === `${item.href}/`;
              return (
                <li key={item.href}>
                  <Link href={item.href} className={styles.link} aria-current={active ? "page" : undefined}>
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
