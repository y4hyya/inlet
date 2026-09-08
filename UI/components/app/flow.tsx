"use client";

import { explorers, type IntentState, type Route } from "@inletkit/sdk";
import { useLayoutEffect, useRef, useState } from "react";
import { short } from "@/lib/format";
import type { Actor } from "@/lib/runs";
import styles from "./flow.module.css";

export const order: IntentState[] = ["created", "funded", "swept", "attested", "executed"];
export const finals = new Set<IntentState>(["executed", "claimable", "refunded", "expired", "failed"]);

export interface FlowView {
  mode: "live" | "follow" | "replay";
  state: IntentState;
  route: Route;
  sourceDomain: number;
  sourceName: string;
  destinationDomain: number;
  destinationName: string;
  positionLabel: string;
  amount?: string;
  sourceTx?: string;
  arcMintTx?: string;
  sweepTx?: string;
  destinationTx?: string;
  refundTx?: string;
  refundMintTx?: string;
  error?: string;
  seconds?: number;
}

interface Station {
  key: IntentState;
  actor: Actor;
  label: string;
  title: (view: FlowView | undefined) => string;
  hash: (view: FlowView) => { href: string; text: string } | undefined;
}

const stations: Station[] = [
  {
    key: "created",
    actor: "user",
    label: "Registered",
    title: (view) => (view?.route === "gateway" ? "Gateway burn intent signed" : "CCTP burn from the wallet"),
    hash: (view) => (view.sourceTx ? { href: explorers[view.sourceDomain] + view.sourceTx, text: short(view.sourceTx) } : undefined),
  },
  {
    key: "funded",
    actor: "escrow",
    label: "Funded",
    title: () => "USDC at the deposit address on Arc",
    hash: (view) => (view.arcMintTx && view.arcMintTx !== "external" ? { href: explorers[26] + view.arcMintTx, text: short(view.arcMintTx) } : undefined),
  },
  {
    key: "swept",
    actor: "contract",
    label: "Swept",
    title: () => "Hub burned it toward the destination",
    hash: (view) => (view.sweepTx ? { href: explorers[26] + view.sweepTx, text: short(view.sweepTx) } : undefined),
  },
  {
    key: "attested",
    actor: "circle",
    label: "Attested",
    title: () => "Circle signed the message",
    hash: () => undefined,
  },
  {
    key: "executed",
    actor: "contract",
    label: "Executed",
    title: (view) => (view ? `${view.positionLabel} on ${view.destinationName}` : "Position delivered"),
    hash: (view) => (view.destinationTx ? { href: explorers[view.destinationDomain] + view.destinationTx, text: short(view.destinationTx) } : undefined),
  },
];

const notes: Partial<Record<IntentState, string>> = {
  claimable: "The adapter could not deposit. The USDC waits in the receiver and the user can claim it.",
  refunding: "Deadline passed. The hub burned the USDC back toward the source chain.",
  refunded: "Refund delivered on the source chain.",
  expired: "Deadline passed with nothing at the deposit address. The intent is closed.",
  failed: "The relayer hit an error. Every step is permissionless, so anyone can finish the deposit.",
};

function reachedIndex(view: FlowView | undefined) {
  if (!view) return -1;
  const linear = order.indexOf(view.state);
  if (linear >= 0) return linear;
  if (view.state === "claimable") return 3;
  if (view.state === "refunding" || view.state === "refunded") return 1;
  return 0;
}

export function Flow({ view }: { view: FlowView | undefined }) {
  const reached = reachedIndex(view);
  const active = view ? !finals.has(view.state) && view.state !== "refunding" : false;
  const trackRef = useRef<HTMLDivElement>(null);
  const markerRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const [offset, setOffset] = useState(0);

  useLayoutEffect(() => {
    const place = () => {
      const track = trackRef.current;
      const marker = markerRefs.current[Math.max(0, reached)];
      if (!track || !marker) return;
      const trackRect = track.getBoundingClientRect();
      const rect = marker.getBoundingClientRect();
      setOffset(rect.left - trackRect.left + rect.width / 2);
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [reached]);

  const note = view ? notes[view.state] : undefined;
  const refundLink = view?.refundMintTx ? { href: explorers[view.sourceDomain] + view.refundMintTx, text: short(view.refundMintTx) } : view?.refundTx ? { href: explorers[26] + view.refundTx, text: short(view.refundTx) } : undefined;

  return (
    <div className={styles.flow} data-mode={view?.mode ?? "idle"}>
      <div className={styles.summary}>
        {view ? (
          <>
            <span className={`chip ${view.route === "gateway" ? "chip-circle" : "chip-user"}`}>{view.route === "gateway" ? "Gateway" : "CCTP"}</span>
            <span className={styles.summaryText}>
              {view.amount ? `${view.amount} USDC ` : ""}
              {view.sourceName} <span className="soft">to</span> {view.destinationName}
            </span>
            {view.seconds !== undefined ? <span className={styles.seconds}>{view.seconds}s to position</span> : null}
          </>
        ) : (
          <span className={styles.summaryText}>Make a deposit, follow one by hash, or replay a recorded run.</span>
        )}
      </div>

      <div ref={trackRef} className={styles.track}>
        <span className={styles.rail} aria-hidden="true" />
        <span className={styles.fill} aria-hidden="true" style={{ transform: `scaleX(${Math.max(0, reached) / (stations.length - 1)})` }} />
        <span className={styles.dot} aria-hidden="true" data-active={active ? "" : undefined} data-idle={view ? undefined : ""} style={{ transform: `translate(${offset}px, -50%)` }} />
        <ol className={styles.stations}>
          {stations.map((station, index) => {
            const done = index <= reached;
            const current = index === reached;
            const link = view && done ? station.hash(view) : undefined;
            return (
              <li key={station.key} className={styles.station} data-actor={station.actor} data-done={done ? "" : undefined} data-current={current ? "" : undefined}>
                <span
                  ref={(element) => {
                    markerRefs.current[index] = element;
                  }}
                  className={styles.marker}
                  aria-hidden="true"
                />
                <p className={styles.label}>{station.label}</p>
                <p className={styles.title}>{station.title(view)}</p>
                {link ? (
                  <a className={`hash ${styles.link}`} href={link.href} target="_blank" rel="noreferrer">
                    {link.text}
                  </a>
                ) : (
                  <span className={styles.linkGap} aria-hidden="true" />
                )}
              </li>
            );
          })}
        </ol>
      </div>

      <p className={styles.operator}>
        <span className="chip chip-relayer">Relayer</span>
        <span>drives sweep, attest and execute. Every one of them is permissionless.</span>
      </p>

      {note ? (
        <p className={styles.note}>
          {note}{" "}
          {refundLink ? (
            <a className="hash" href={refundLink.href} target="_blank" rel="noreferrer">
              {refundLink.text}
            </a>
          ) : null}
        </p>
      ) : null}
      {view?.error ? <p className={styles.note}>{view.error}</p> : null}
    </div>
  );
}
