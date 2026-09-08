"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Mark } from "./mark";
import { NavLinks } from "./nav-links";
import styles from "./nav.module.css";

export function Nav() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
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
  }, []);

  return (
    <header className={styles.header} data-scrolled={scrolled ? "" : undefined}>
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
