import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AccountPill } from "./AccountPill.js";

const focusable = 'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])';

/// A layer under every wallet overlay. It is created on first open and hidden on close, never unmounted,
/// so the form inside keeps following a deposit or a withdrawal while the dialog is away.
export function InletDialog({ open, onClose, title, subtitle, children }: { open: boolean; onClose: () => void; title: string; subtitle: string; children: ReactNode }) {
  const [host, setHost] = useState<HTMLDivElement>();
  const panel = useRef<HTMLElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const titleId = useId();

  useEffect(() => {
    if (!open || host) return;
    const element = document.createElement("div");
    element.className = "inlet-overlay";
    document.body.appendChild(element);
    setHost(element);
  }, [open, host]);

  useEffect(() => () => host?.remove(), [host]);

  useEffect(() => {
    if (!host) return;
    host.hidden = !open;
    if (!open) return;
    opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const first = panel.current?.querySelector<HTMLElement>(focusable);
    (first ?? panel.current)?.focus();
    return () => {
      document.body.style.overflow = previous;
      opener.current?.focus();
    };
  }, [open, host]);

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape") {
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key !== "Tab" || !panel.current) return;
    const items = Array.from(panel.current.querySelectorAll<HTMLElement>(focusable));
    if (items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  if (!host) return null;
  return createPortal(
    <>
      <div className="inlet-backdrop" onClick={onClose} />
      <section ref={panel} className="inlet inlet-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} onKeyDown={onKeyDown}>
        <header className="inlet-dialog-head">
          <div className="inlet-dialog-heading">
            <h2 id={titleId} className="inlet-dialog-title">
              {title}
            </h2>
            <p className="inlet-dialog-sub">{subtitle}</p>
          </div>
          <AccountPill />
          <button type="button" className="inlet-dialog-close" aria-label="Close" onClick={onClose}>
            <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M4 4l8 8m0-8l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </header>
        {children}
      </section>
    </>,
    host,
  );
}
