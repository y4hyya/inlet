import type { ExitRecord, IntentRecord } from "@inletkit/sdk";
import { useCallback, useState } from "react";
import { chainNameForDomain } from "../config.js";
import { useInlet } from "../context.js";
import type { Destination, SourceChain } from "../types.js";
import { useFlight } from "../useFlight.js";
import { DepositWidget } from "./DepositWidget.js";
import { ExitWidget } from "./ExitWidget.js";
import { FlightPill } from "./FlightPill.js";
import { InletDialog } from "./InletDialog.js";
import { InletMark } from "./InletMark.js";

export interface InletButtonProps {
  action: "deposit" | "withdraw";
  destination: Destination;
  amount?: string;
  label?: string;
  relayerUrl?: string;
  sources?: SourceChain[];
  className?: string;
  onRecord?: (record: IntentRecord) => void;
  onExit?: (record: ExitRecord) => void;
  onOpen?: () => void;
  onClose?: () => void;
}

const tips = {
  deposit: "Inlet moves USDC from the chain it is on into this position with one signature.",
  withdraw: "Inlet turns this position back into USDC on the chain you choose with one signature.",
};

/// One button beside a protocol's own control. It opens a dialog holding the form for a single destination,
/// and keeps a pill beside itself while the deposit or withdrawal it started is still moving.
export function InletButton({ action, destination, amount, label, relayerUrl, sources, className, onRecord, onExit, onOpen, onClose }: InletButtonProps) {
  const inlet = useInlet();
  const url = relayerUrl ?? inlet.relayerUrl;
  const [open, setOpen] = useState(false);
  const flight = useFlight({ action, destination, relayerUrl: url });
  const disabled = action === "withdraw" && !destination.exit;
  const text = label ?? (action === "deposit" ? "Deposit from another chain" : "Withdraw to another chain");
  const chain = chainNameForDomain(destination.destinationDomain);
  const where = destination.name.includes(chain) ? destination.name : `${destination.name} on ${chain}`;

  const show = () => {
    setOpen(true);
    onOpen?.();
  };
  const hide = () => {
    setOpen(false);
    onClose?.();
  };

  const { note } = flight;
  const record = useCallback(
    (next: IntentRecord) => {
      note(next);
      onRecord?.(next);
    },
    [note, onRecord],
  );
  const exit = useCallback(
    (next: ExitRecord) => {
      note(next);
      onExit?.(next);
    },
    [note, onExit],
  );

  return (
    <>
      <span className="inlet-shell">
        <button
          type="button"
          className={className ? `inlet-button ${className}` : "inlet-button"}
          onClick={show}
          disabled={disabled}
          title={disabled ? "This position cannot be withdrawn through Inlet yet" : undefined}
          aria-haspopup="dialog"
          aria-expanded={open}
        >
          <span>{text}</span>
          <span className="inlet-button-mark" title={tips[action]} aria-hidden="true">
            <InletMark height={12} />
          </span>
        </button>
        {flight.active ? <FlightPill action={action} destination={destination} record={flight.record} startedAt={flight.startedAt} onReopen={show} onDismiss={flight.dismiss} /> : null}
      </span>
      <InletDialog open={open} onClose={hide} title={text} subtitle={`${action === "deposit" ? "into" : "from"} ${where}`}>
        {action === "deposit" ? (
          <DepositWidget destinations={[destination]} relayerUrl={url} sources={sources} defaultAmount={amount || undefined} header={null} onRecord={record} />
        ) : (
          <ExitWidget destinations={[destination]} relayerUrl={url} header={null} onExit={exit} />
        )}
      </InletDialog>
    </>
  );
}
