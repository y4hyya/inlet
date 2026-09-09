import type { Metadata } from "next";
import Link from "next/link";
import { Wallpaper } from "@/components/landing/wallpaper";
import styles from "./not-found.module.css";

export const metadata: Metadata = { title: "Not found" };

export default function NotFound() {
  return (
    <>
      <Wallpaper />
      <section className={`rail ${styles.page}`}>
        <div className={styles.panel}>
          <p className="eyebrow">404</p>
          <h1 className={styles.title}>Nothing at this address.</h1>
          <p className={styles.lead}>
            Deposits only go where the intent names, and so do pages. Head back to the start or straight to the live app.
          </p>
          <p className={styles.actions}>
            <Link className="btn btn-primary" href="/">
              Back to start
            </Link>
            <Link className="btn btn-secondary" href="/app">
              Live app
            </Link>
          </p>
        </div>
      </section>
    </>
  );
}
