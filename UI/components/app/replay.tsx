"use client";

import { runs, type RecordedRun } from "@/lib/runs";
import styles from "./replay.module.css";

export interface ReplayState {
  runId: string;
  step: number;
  playing: boolean;
}

export const lastStep = 4;

export function Replay({ state, active, onChange }: { state: ReplayState; active: boolean; onChange: (next: ReplayState) => void }) {
  const run = runs.find((entry) => entry.id === state.runId) ?? runs[0];
  const label = (entry: RecordedRun) => `${entry.protocol}, ${entry.sourceName} to ${entry.destinationName}, ${entry.seconds}s`;
  const finished = state.step >= lastStep;

  return (
    <div className={styles.replay} data-active={active ? "" : undefined}>
      <div className={styles.head}>
        <p className="eyebrow">Replay a recorded run</p>
        <p className={styles.hint}>No wallet needed. The hashes are the real ones.</p>
      </div>
      <div className={styles.controls}>
        <label className={styles.select}>
          <span className={styles.visuallyHidden}>Recorded run</span>
          <select value={run.id} onChange={(event) => onChange({ runId: event.target.value, step: 0, playing: true })}>
            {runs.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {label(entry)}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className={`btn ${active && state.playing ? "btn-secondary" : "btn-primary"} ${styles.play}`}
          onClick={() => onChange(finished ? { runId: run.id, step: 0, playing: true } : { ...state, playing: !state.playing || !active })}
        >
          {active && state.playing ? "Pause" : finished && active ? "Replay" : "Play"}
        </button>
      </div>
      <label className={styles.scrub}>
        <span className={styles.visuallyHidden}>Step</span>
        <input type="range" min={0} max={lastStep} step={1} value={active ? state.step : 0} onChange={(event) => onChange({ runId: run.id, step: Number(event.target.value), playing: false })} />
      </label>
      <p className={styles.caption}>
        {active ? `Step ${state.step + 1} of ${lastStep + 1}` : "Press play"}
        {run.note ? <span className="soft"> · {run.note}</span> : null}
      </p>
    </div>
  );
}
