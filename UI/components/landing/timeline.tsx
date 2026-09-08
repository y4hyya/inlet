"use client";

import { useEffect, useRef, useState } from "react";
import type { Step } from "@/lib/content";
import styles from "./how.module.css";

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

    const place = () => {
      const listRect = list.getBoundingClientRect();
      const first = marks[0].getBoundingClientRect();
      const last = marks[marks.length - 1].getBoundingClientRect();
      const top = first.top - listRect.top + first.height / 2;
      const height = last.top - first.top;
      line.style.top = `${top}px`;
      line.style.height = `${height}px`;
      fill.style.top = `${top}px`;
      fill.style.height = `${height}px`;
    };

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      place();
      fill.style.transform = "scaleY(1)";
      setReached(marks.length - 1);
      window.addEventListener("resize", place);
      return () => window.removeEventListener("resize", place);
    }

    let frame = 0;
    const update = () => {
      frame = 0;
      const anchor = window.innerHeight * 0.6;
      const first = marks[0].getBoundingClientRect();
      const last = marks[marks.length - 1].getBoundingClientRect();
      const start = first.top + first.height / 2;
      const end = last.top + last.height / 2;
      const progress = Math.min(1, Math.max(0, (anchor - start) / (end - start)));
      fill.style.transform = `scaleY(${progress})`;
      let index = -1;
      marks.forEach((mark, position) => {
        const rect = mark.getBoundingClientRect();
        if (rect.top + rect.height / 2 <= anchor) index = position;
      });
      setReached(index);
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
        <li key={step.id} className={styles.step} data-reached={index <= reached ? "" : undefined} data-actor={step.actor}>
          <span className={styles.mark} data-mark aria-hidden="true" />
          <div className={styles.body}>
            <p className={styles.number}>{step.number}</p>
            <h3 className={styles.stepTitle}>{step.title}</h3>
            <span className={`chip chip-${step.actor} ${styles.chip}`}>{step.actorLabel}</span>
            <p className={styles.text}>{step.body}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}
