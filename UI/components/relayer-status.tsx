"use client";

import { InletRelayerClient, type RelayerHealth } from "@inletkit/sdk";
import { useEffect, useState } from "react";
import { site } from "@/lib/site";
import styles from "./relayer-status.module.css";

type State = "checking" | "online" | "offline";

const labels: Record<State, string> = {
  checking: "checking relayer",
  online: "relayer online",
  offline: "relayer offline",
};

export function useRelayerHealth(intervalMs = 20_000) {
  const [state, setState] = useState<State>("checking");
  const [health, setHealth] = useState<RelayerHealth>();

  useEffect(() => {
    const client = new InletRelayerClient(site.relayerUrl, 8000);
    let stopped = false;
    const check = () =>
      client
        .health()
        .then((next) => {
          if (stopped) return;
          setHealth(next);
          setState(next.ok ? "online" : "offline");
        })
        .catch(() => !stopped && setState("offline"));
    void check();
    const handle = setInterval(check, intervalMs);
    return () => {
      stopped = true;
      clearInterval(handle);
    };
  }, [intervalMs]);

  return { state, health };
}

export function RelayerStatus({ compact = false }: { compact?: boolean }) {
  const { state } = useRelayerHealth();
  return (
    <span className={`${styles.status} ${styles[state]}`} title={site.relayerUrl}>
      <i className={styles.dot} aria-hidden="true" />
      <span className={compact ? styles.hideSmall : undefined}>{labels[state]}</span>
    </span>
  );
}
