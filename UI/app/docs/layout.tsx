import type { ReactNode } from "react";
import { DocsNav } from "@/components/docs-nav";
import "./prose.css";
import styles from "./docs.module.css";

export default function DocsLayout({ children }: { children: ReactNode }) {
  return (
    <div className={`rail ${styles.docs}`}>
      <aside className={styles.sidebar}>
        <DocsNav />
      </aside>
      <article className={`prose ${styles.content}`}>{children}</article>
    </div>
  );
}
