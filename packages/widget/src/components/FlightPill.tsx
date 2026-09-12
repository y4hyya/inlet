import { useEffect, useState } from "react";
import { flightLabel, type FlightAction, type FlightRecord } from "../flight.js";
import type { Destination } from "../types.js";

/// The small status beside the button that outlives the dialog: in flight with the seconds, then the outcome with one link.
export function FlightPill({ action, destination, record, startedAt, onReopen, onDismiss }: { action: FlightAction; destination: Destination; record?: FlightRecord; startedAt: number; onReopen: () => void; onDismiss: () => void }) {
  const [now, setNow] = useState(() => Date.now());
  const label = flightLabel({ action, destination, record, startedAt, now });

  useEffect(() => {
    if (label.tone !== "flying") return;
    const handle = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(handle);
  }, [label.tone]);

  return (
    <span className={`inlet-flight inlet-flight-${label.tone}`}>
      <button type="button" className="inlet-flight-text" onClick={onReopen}>
        <span className="inlet-flight-dot" aria-hidden="true" />
        {label.text}
      </button>
      {label.link ? (
        <a className="inlet-flight-link" href={label.link.href} target="_blank" rel="noreferrer">
          {label.link.text}
        </a>
      ) : null}
      <button type="button" className="inlet-flight-dismiss" aria-label="Dismiss" onClick={onDismiss}>
        <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="M4.5 4.5l7 7m0-7l-7 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>
    </span>
  );
}
