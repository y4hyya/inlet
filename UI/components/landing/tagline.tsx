"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./tagline.module.css";

const text = "The address is the commitment. USDC can only move along the path the intent names, or back to the sender after the deadline.";

export function Tagline() {
  const words = text.split(" ");
  const ref = useRef<HTMLParagraphElement>(null);
  const [count, setCount] = useState(0);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setCount(words.length);
      return;
    }
    let frame = 0;
    const update = () => {
      frame = 0;
      const rect = element.getBoundingClientRect();
      const trigger = window.innerHeight * 0.82;
      const progress = Math.min(1, Math.max(0, (trigger - rect.top) / (rect.height + window.innerHeight * 0.25)));
      setCount(Math.round(progress * words.length));
    };
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [words.length]);

  return (
    <section className={`rail ${styles.section}`} aria-label="Guarantee">
      <p ref={ref} className={styles.tagline}>
        {words.map((word, index) => (
          <span key={`${word}-${index}`} className={styles.word} data-on={index < count ? "" : undefined}>
            {word}{" "}
          </span>
        ))}
      </p>
    </section>
  );
}
