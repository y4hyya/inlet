"use client";

import { exits, runs, type RecordedExit, type RecordedRun } from "@/lib/runs";
import styles from "./replay.module.css";

export interface ReplayState {
  runId: string;
  step: number;
  playing: boolean;
}

export const lastStep = 4;
export const exitLastStep = 3;

export function isExit(runId: string) {
  return exits.some((entry) => entry.id === runId);
}

export function lastStepFor(runId: string) {
  return isExit(runId) ? exitLastStep : lastStep;
}

export function Replay({ state, active, onChange }: { state: ReplayState; active: boolean; onChange: (next: ReplayState) => void }) {
  const run: RecordedRun | RecordedExit = runs.find((entry) => entry.id === state.runId) ?? exits.find((entry) => entry.id === state.runId) ?? runs[0];
  const label = (entry: RecordedRun) => `${entry.protocol}, ${entry.sourceName} to ${entry.destinationName}, ${entry.seconds}s`;
  const exitLabel = (entry: RecordedExit) => `${entry.protocol} out to ${entry.legs.map((leg) => leg.name).join(" and ")}, ${entry.seconds}s`;
  const last = lastStepFor(run.id);
  const finished = state.step >= last;

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
            <optgroup label="Deposits">
              {runs.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {label(entry)}
                </option>
              ))}
            </optgroup>
            <optgroup label="Withdrawals">
              {exits.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {exitLabel(entry)}
                </option>
              ))}
            </optgroup>
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
        <input type="range" min={0} max={last} step={1} value={active ? state.step : 0} onChange={(event) => onChange({ runId: run.id, step: Number(event.target.value), playing: false })} />
      </label>
      <p className={styles.caption}>
        {active ? `Step ${state.step + 1} of ${last + 1}` : "Press play"}
        {run.note ? <span className="soft"> · {run.note}</span> : null}
      </p>
    </div>
  );
}
