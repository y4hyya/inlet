"use client";

import { useEffect, useRef, useState } from "react";
import type { Step } from "@/lib/content";
import styles from "./how.module.css";

// The rail fills while the section is held in place. It completes before the runway ends,
// so all six stations are lit for a beat before the page moves on.
const finish = 0.85;

export function Timeline({ steps }: { steps: Step[] }) {
  const listRef = useRef<HTMLOListElement>(null);
  const lineRef = useRef<HTMLSpanElement>(null);
  const fillRef = useRef<HTMLSpanElement>(null);
  const [reached, setReached] = useState(-1);

  useEffect(() => {
    const list = listRef.current;
    const line = lineRef.current;
    const fill = fillRef.current;
    if (!list || !line || !fill) return;
    const marks = Array.from(list.querySelectorAll<HTMLElement>("[data-mark]"));
    if (marks.length === 0) return;

    // Run the track between the first and last dot rather than the full width.
    const place = () => {
      const listRect = list.getBoundingClientRect();
      const first = marks[0].getBoundingClientRect();
      const last = marks[marks.length - 1].getBoundingClientRect();
      const single = Math.abs(last.top - first.top) < 2;
      const left = first.left - listRect.left + first.width / 2;
      const width = last.left - first.left;
      for (const element of [line, fill]) {
        element.style.top = `${first.top - listRect.top + first.height / 2}px`;
        element.style.left = `${left}px`;
        element.style.width = `${width}px`;
        element.style.opacity = single && width > 0 ? "1" : "0";
      }
    };

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");

    const settle = () => {
      place();
      fill.style.transform = "scaleX(1)";
      setReached(marks.length - 1);
    };

    if (reduced.matches) {
      settle();
      window.addEventListener("resize", settle);
      return () => window.removeEventListener("resize", settle);
    }

    const section = list.closest("section");
    let frame = 0;
    const update = () => {
      frame = 0;
      if (!section) return;
      const runway = section.offsetHeight - window.innerHeight;
      if (runway <= 0) {
        settle();
        return;
      }
      const travelled = -section.getBoundingClientRect().top;
      const progress = Math.min(1, Math.max(0, travelled / runway / finish));
      fill.style.transform = `scaleX(${progress})`;
      setReached(Math.ceil(progress * marks.length) - 1);
    };
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };
    const resize = () => {
      place();
      schedule();
    };
    place();
    update();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", resize);
    return () => {
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", resize);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [steps.length]);

  return (
    <ol ref={listRef} className={styles.timeline}>
      <span ref={lineRef} className={styles.line} aria-hidden="true" />
      <span ref={fillRef} className={styles.fill} aria-hidden="true" />
      {steps.map((step, index) => (
        <li key={step.id} className={styles.step} data-reached={index <= reached ? "" : undefined} data-actor={step.actor} style={{ "--i": index } as React.CSSProperties}>
          <span className={styles.mark} data-mark aria-hidden="true" />
          <p className={styles.number}>{step.number}</p>
          <h3 className={styles.stepTitle}>{step.title}</h3>
          <span className={`chip chip-${step.actor} ${styles.chip}`}>{step.actorLabel}</span>
          <p className={styles.text}>{step.body}</p>
        </li>
      ))}
    </ol>
  );
}
