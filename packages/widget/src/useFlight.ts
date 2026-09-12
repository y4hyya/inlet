import { InletRelayerClient } from "@inletkit/sdk";
import { useCallback, useEffect, useRef, useState } from "react";
import { flightKey, isTerminal, parseFlight, type FlightAction, type FlightRecord, type StoredFlight } from "./flight.js";
import type { Destination } from "./types.js";

const pollMs = 3000;
const giveUpAfter = 5;

function read(key: string): string | null {
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string | undefined) {
  try {
    if (value === undefined) window.sessionStorage.removeItem(key);
    else window.sessionStorage.setItem(key, value);
  } catch {
    // Storage can be off in a private window. The pill then lives as long as the page.
  }
}

interface Flight {
  stored: StoredFlight;
  record?: FlightRecord;
  // True while the form in the dialog feeds the record itself, so nothing here polls.
  live: boolean;
}

/// Remembers the deposit or withdrawal a button started, across a close, a reload and a navigation within the host.
export function useFlight({ action, destination, relayerUrl }: { action: FlightAction; destination: Destination; relayerUrl: string }) {
  const key = flightKey(action, destination.id);
  const [flight, setFlight] = useState<Flight>();
  const dismissed = useRef<string | undefined>(undefined);

  useEffect(() => {
    const raw = read(key);
    const stored = parseFlight(raw, action, Date.now());
    if (!stored) {
      if (raw) write(key, undefined);
      return;
    }
    setFlight({ stored, live: false });
  }, [key, action]);

  const hash = flight?.stored.hash;
  const resumed = Boolean(flight) && !flight!.live && !(flight!.record && isTerminal(action, flight!.record.state));

  useEffect(() => {
    if (!resumed || !hash) return;
    const client = new InletRelayerClient(relayerUrl);
    let stopped = false;
    let failures = 0;
    const load = async () => {
      try {
        const record = action === "deposit" ? await client.getIntent(hash) : await client.getExit(hash);
        failures = 0;
        if (!stopped) setFlight((current) => (current && !current.live && current.stored.hash === hash ? { ...current, record } : current));
      } catch {
        failures += 1;
        if (failures < giveUpAfter || stopped) return;
        write(key, undefined);
        setFlight((current) => (current && current.stored.hash === hash ? undefined : current));
      }
    };
    void load();
    const handle = setInterval(load, pollMs);
    return () => {
      stopped = true;
      clearInterval(handle);
    };
  }, [resumed, hash, action, relayerUrl, key]);

  const note = useCallback(
    (record: FlightRecord) => {
      if (dismissed.current === record.hash) return;
      const stored: StoredFlight = { action, hash: record.hash, startedAt: record.createdAt };
      write(key, JSON.stringify(stored));
      setFlight({ stored, record, live: true });
    },
    [key, action],
  );

  const dismiss = useCallback(() => {
    dismissed.current = flight?.stored.hash;
    write(key, undefined);
    setFlight(undefined);
  }, [key, flight?.stored.hash]);

  return { active: Boolean(flight), record: flight?.record, startedAt: flight?.stored.startedAt ?? 0, note, dismiss };
}
