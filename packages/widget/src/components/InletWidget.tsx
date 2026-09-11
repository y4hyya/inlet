import type { ExitRecord, IntentRecord } from "@inletkit/sdk";
import { useState } from "react";
import type { Destination, SourceChain } from "../types.js";
import { AccountPill } from "./AccountPill.js";
import { DepositWidget } from "./DepositWidget.js";
import { ExitWidget } from "./ExitWidget.js";

export type InletMode = "deposit" | "withdraw";

export interface InletWidgetProps {
  destinations: Destination[];
  relayerUrl?: string;
  sources?: SourceChain[];
  defaultDestinationId?: string;
  defaultMode?: InletMode;
  onModeChange?: (mode: InletMode) => void;
  onRecord?: (record: IntentRecord) => void;
  onExit?: (record: ExitRecord) => void;
}

/// Both directions under one header. The forms stay their own components, so a host that only
/// wants deposits keeps mounting DepositWidget.
export function InletWidget({ destinations, relayerUrl, sources, defaultDestinationId, defaultMode = "deposit", onModeChange, onRecord, onExit }: InletWidgetProps) {
  const [mode, setMode] = useState<InletMode>(defaultMode);

  const change = (next: InletMode) => {
    setMode(next);
    onModeChange?.(next);
  };

  const header = (
    <header className="inlet-header">
      <div className="inlet-modes" role="group" aria-label="Deposit or withdraw">
        {(["deposit", "withdraw"] as InletMode[]).map((option) => (
          <button key={option} type="button" className={`inlet-mode ${mode === option ? "inlet-mode-on" : ""}`} aria-pressed={mode === option} onClick={() => change(option)}>
            {option === "deposit" ? "Deposit" : "Withdraw"}
          </button>
        ))}
      </div>
      <AccountPill />
    </header>
  );

  return mode === "deposit" ? (
    <DepositWidget destinations={destinations} relayerUrl={relayerUrl} sources={sources} defaultDestinationId={defaultDestinationId} header={header} onRecord={onRecord} />
  ) : (
    <ExitWidget destinations={destinations} relayerUrl={relayerUrl} defaultDestinationId={defaultDestinationId} header={header} onExit={onExit} />
  );
}
