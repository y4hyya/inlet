"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Mark } from "./mark";
import { NavLinks } from "./nav-links";
import styles from "./nav.module.css";

export function Nav() {
  const pathname = usePathname();
  const landing = pathname === "/";
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    if (!landing) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      setScrolled((current) => window.scrollY > (current ? 8 : 24));
    };
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", schedule, { passive: true });
    return () => {
      window.removeEventListener("scroll", schedule);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [landing]);

  return (
    <header className={styles.header} data-landing={landing ? "" : undefined} data-scrolled={landing && scrolled ? "" : undefined}>
      <span className={styles.veil} aria-hidden="true" />
      <div className={styles.capsule}>
        <Link href="/" className={styles.brand} aria-label="Inlet home">
          <Mark />
          <span>Inlet</span>
        </Link>
        <NavLinks />
      </div>
    </header>
  );
}
