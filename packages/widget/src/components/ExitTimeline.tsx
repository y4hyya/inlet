import type { ExitRecord, ExitState } from "@inletkit/sdk";
import { chainNameForDomain, explorers } from "../config.js";
import { short } from "../format.js";

const order: ExitState[] = ["signed", "executed", "attested", "delivered"];

export function ExitTimeline({ record }: { record: ExitRecord }) {
  const reached = order.indexOf(record.state);
  const chain = chainNameForDomain(record.domain);
  const steps = [
    { key: "signed", label: "Signed", link: undefined },
    { key: "executed", label: `Redeemed on ${chain}`, link: record.exitTx ? { href: explorers[record.domain] + record.exitTx, text: short(record.exitTx) } : undefined },
    { key: "attested", label: "Circle attested", link: undefined },
  ];

  return (
    <ol className="inlet-timeline">
      {steps.map((step, index) => (
        <li key={step.key} className={`inlet-step ${index <= reached ? "inlet-step-done" : index === reached + 1 ? "inlet-step-active" : ""}`}>
          <span className="inlet-step-mark" />
          <span className="inlet-step-label">{step.label}</span>
          {step.link ? (
            <a className="inlet-step-link" href={step.link.href} target="_blank" rel="noreferrer">
              {step.link.text}
            </a>
          ) : null}
        </li>
      ))}
      {record.legs.map((leg, index) => {
        const landed = Boolean(leg.mintTx);
        const onChain = leg.mintTx && String(leg.mintTx) !== "external";
        return (
          <li key={`${leg.domain}-${index}`} className={`inlet-step ${landed ? "inlet-step-done" : reached >= 2 ? "inlet-step-active" : ""}`}>
            <span className="inlet-step-mark" />
            <span className="inlet-step-label">Landed on {chainNameForDomain(leg.domain)}</span>
            {onChain ? (
              <a className="inlet-step-link" href={explorers[leg.domain] + leg.mintTx} target="_blank" rel="noreferrer">
                {short(leg.mintTx!)}
              </a>
            ) : null}
          </li>
        );
      })}
      {record.error ? <li className="inlet-step inlet-step-warn">{record.error}</li> : null}
    </ol>
  );
}
