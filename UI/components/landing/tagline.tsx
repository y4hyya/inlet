"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./tagline.module.css";

const text = "The address is the commitment. USDC can only move along the path the intent names, or back to the sender after the deadline.";

// The reveal finishes before the runway ends, so the whole sentence is readable for a beat.
const finish = 0.85;

export function Tagline() {
  const words = text.split(" ");
  const ref = useRef<HTMLElement>(null);
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
      const runway = element.offsetHeight - window.innerHeight;
      if (runway <= 0) {
        setCount(words.length);
        return;
      }
      const travelled = -element.getBoundingClientRect().top;
      const progress = Math.min(1, Math.max(0, travelled / runway / finish));
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
    <section ref={ref} className={styles.section} aria-label="Guarantee">
      <div className={`rail ${styles.pin}`}>
        <p className={styles.tagline}>
          {words.map((word, index) => (
            <span key={`${word}-${index}`} className={styles.word} data-on={index < count ? "" : undefined}>
              {word}{" "}
            </span>
          ))}
        </p>
      </div>
    </section>
  );
}
