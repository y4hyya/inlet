"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./code.module.css";

export function CopyButton({ code }: { code: string }) {
  const button = useRef<HTMLButtonElement>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const handle = window.setTimeout(() => setCopied(false), 1800);
    return () => window.clearTimeout(handle);
  }, [copied]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
    } catch {
      const body = button.current?.closest("[data-code-frame]")?.querySelector("[data-code-body]");
      if (!body) return;
      const range = document.createRange();
      range.selectNodeContents(body);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
    }
  };

  return (
    <>
      <button ref={button} type="button" className={styles.copy} onClick={copy} data-copied={copied ? "" : undefined}>
        <span className={styles.icons} aria-hidden="true">
          <svg className={styles.icon} data-on={copied ? undefined : ""} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="5.5" y="5.5" width="8" height="8" rx="1.8" />
            <path d="M10.5 2.5H4a1.5 1.5 0 0 0-1.5 1.5v6.5" />
          </svg>
          <svg className={styles.icon} data-on={copied ? "" : undefined} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 8.5l3.2 3.2L13 5" />
          </svg>
        </span>
        {copied ? "Copied" : "Copy"}
      </button>
      <span role="status" className={styles.live}>
        {copied ? "Copied to clipboard" : ""}
      </span>
    </>
  );
}
