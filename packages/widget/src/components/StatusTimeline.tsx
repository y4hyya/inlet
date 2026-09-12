import { explorerLink, type IntentRecord } from "@inletkit/sdk";
import { explorers } from "../config.js";
import { short } from "../format.js";
import type { Destination } from "../types.js";

const order = ["created", "funded", "swept", "attested", "executed"] as const;

const labels: Record<string, string> = {
  created: "Intent registered, deposit address derived on Arc",
  funded: "USDC landed on Arc",
  swept: "Hub swept and burned toward the destination",
  attested: "Circle attested the transfer",
  executed: "Position delivered",
  claimable: "Adapter could not deposit, funds are claimable",
  refunding: "Refund burned toward the source chain",
  refunded: "Refund delivered on the source chain",
  expired: "Deadline passed with nothing to route",
  failed: "Failed",
};

export function StatusTimeline({ record, destination, sourceExplorer }: { record: IntentRecord; destination: Destination; sourceExplorer?: string }) {
  const reached = order.indexOf(record.state as (typeof order)[number]);
  const finished = ["executed", "claimable", "refunded", "expired", "failed"].includes(record.state);

  const links: Record<string, { href: string; label: string } | undefined> = {
    created: undefined,
    funded: record.arcMintTx && String(record.arcMintTx) !== "external" ? { href: explorers[26] + record.arcMintTx, label: short(record.arcMintTx) } : undefined,
    swept: record.sweepTx ? { href: explorers[26] + record.sweepTx, label: short(record.sweepTx) } : undefined,
    attested: undefined,
    executed: record.destinationTx ? { href: destination.explorer + record.destinationTx, label: short(record.destinationTx) } : undefined,
  };

  return (
    <ol className="inlet-timeline">
      {order.map((step, index) => {
        const done = finished ? index <= order.length - 1 && (record.state === "executed" || index < order.length - 1) : index <= reached;
        const active = !finished && index === reached + 1;
        const link = links[step];
        return (
          <li key={step} className={`inlet-step ${done ? "inlet-step-done" : active ? "inlet-step-active" : ""}`}>
            <span className="inlet-step-mark" />
            <span className="inlet-step-label">{step === "executed" ? `${destination.positionLabel} delivered` : labels[step]}</span>
            {link ? (
              <a className="inlet-step-link" href={link.href} target="_blank" rel="noreferrer">
                {link.label}
              </a>
            ) : null}
          </li>
        );
      })}
      {finished && record.state !== "executed" ? <li className="inlet-step inlet-step-warn">{labels[record.state]}</li> : null}
      {record.error ? <li className="inlet-step inlet-step-warn">{record.error}</li> : null}
      {sourceExplorer && record.sourceTx ? (
        <li className="inlet-step inlet-step-note">
          Source burn{" "}
          <a className="inlet-step-link" href={explorerLink(record.intent.sourceDomain, record.sourceTx)} target="_blank" rel="noreferrer">
            {short(record.sourceTx)}
          </a>
        </li>
      ) : null}
    </ol>
  );
}
