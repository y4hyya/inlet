import { InletRelayerClient, type RelayerHealth } from "@inletkit/sdk";
import { useCallback, useSyncExternalStore } from "react";

export type RelayerStatus = "checking" | "online" | "offline";

export interface RelayerState {
  status: RelayerStatus;
  health?: RelayerHealth;
}

interface Monitor {
  state: RelayerState;
  key: string;
  listeners: Set<() => void>;
  handle?: ReturnType<typeof setInterval>;
}

const checking: RelayerState = { status: "checking" };
const monitors = new Map<string, Monitor>();

function monitorFor(url: string): Monitor {
  let monitor = monitors.get(url);
  if (!monitor) {
    monitor = { state: checking, key: "", listeners: new Set() };
    monitors.set(url, monitor);
  }
  return monitor;
}

function publish(monitor: Monitor, state: RelayerState) {
  const key = `${state.status}:${JSON.stringify(state.health ?? null)}`;
  if (key === monitor.key) return;
  monitor.key = key;
  monitor.state = state;
  for (const listener of monitor.listeners) listener();
}

/// One poll per relayer url, shared by every widget that asks, so the header dot and the
/// forms below it always read the same answer.
export function useRelayerHealth(url: string): RelayerState {
  const subscribe = useCallback(
    (listener: () => void) => {
      const monitor = monitorFor(url);
      monitor.listeners.add(listener);
      if (!monitor.handle) {
        const client = new InletRelayerClient(url, 8000);
        const check = () =>
          client
            .health()
            .then((health) => publish(monitor, { status: health.ok ? "online" : "offline", health }))
            .catch(() => publish(monitor, { status: "offline" }));
        void check();
        monitor.handle = setInterval(check, 15_000);
      }
      return () => {
        monitor.listeners.delete(listener);
        if (monitor.listeners.size > 0) return;
        clearInterval(monitor.handle);
        monitor.handle = undefined;
      };
    },
    [url],
  );
  const snapshot = useCallback(() => monitorFor(url).state, [url]);
  return useSyncExternalStore(subscribe, snapshot, () => checking);
}
