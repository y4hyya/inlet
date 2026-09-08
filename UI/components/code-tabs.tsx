"use client";

import { useId, useRef, useState, type KeyboardEvent } from "react";
import { CopyButton } from "./copy-button";
import styles from "./code.module.css";

export interface RenderedSample {
  id: string;
  label: string;
  code: string;
  html: string;
}

export function CodeTabs({ samples }: { samples: RenderedSample[] }) {
  const group = useId();
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const [active, setActive] = useState(samples[0]?.id);
  const index = Math.max(0, samples.findIndex((sample) => sample.id === active));
  const current = samples[index];

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const moves: Record<string, number> = {
      ArrowRight: (index + 1) % samples.length,
      ArrowLeft: (index - 1 + samples.length) % samples.length,
      Home: 0,
      End: samples.length - 1,
    };
    const next = moves[event.key];
    if (next === undefined) return;
    event.preventDefault();
    setActive(samples[next].id);
    tabs.current[next]?.focus();
  };

  return (
    <div className={styles.frame} data-code-frame="">
      <div className={styles.head}>
        <div className={styles.tabs} role="tablist" aria-label="Destination chain" onKeyDown={onKeyDown}>
          {samples.map((sample, position) => (
            <button
              key={sample.id}
              ref={(element) => {
                tabs.current[position] = element;
              }}
              type="button"
              role="tab"
              id={`${group}-tab-${sample.id}`}
              aria-controls={`${group}-panel-${sample.id}`}
              aria-selected={sample.id === current.id}
              tabIndex={sample.id === current.id ? 0 : -1}
              className={styles.tab}
              onClick={() => setActive(sample.id)}
            >
              {sample.label}
            </button>
          ))}
        </div>
        <CopyButton key={current.id} code={current.code} />
      </div>
      <div
        role="tabpanel"
        id={`${group}-panel-${current.id}`}
        aria-labelledby={`${group}-tab-${current.id}`}
        tabIndex={0}
        className={styles.panel}
        data-code-body=""
        dangerouslySetInnerHTML={{ __html: current.html }}
      />
    </div>
  );
}
