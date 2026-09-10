"use client";

import { explorers, type ExitRecord, type ExitState } from "@inletkit/sdk";
import { chainNameForDomain } from "@inletkit/widget";
import { useLayoutEffect, useRef, useState } from "react";
import { short } from "@/lib/format";
import type { Actor } from "@/lib/runs";
import styles from "./flow.module.css";

const order: ExitState[] = ["signed", "executed", "attested", "delivered"];

const stations: { key: ExitState; actor: Actor; label: string }[] = [
  { key: "signed", actor: "user", label: "Signed" },
  { key: "executed", actor: "contract", label: "Redeemed" },
  { key: "attested", actor: "circle", label: "Attested" },
  { key: "delivered", actor: "escrow", label: "Landed" },
];

export function ExitFlow({ record }: { record: ExitRecord }) {
  const reached = Math.max(0, order.indexOf(record.state));
  const active = record.state !== "delivered";
  const trackRef = useRef<HTMLDivElement>(null);
  const markerRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const [offset, setOffset] = useState(0);

  useLayoutEffect(() => {
    const place = () => {
      const track = trackRef.current;
      const marker = markerRefs.current[reached];
      if (!track || !marker) return;
      const trackRect = track.getBoundingClientRect();
      const rect = marker.getBoundingClientRect();
      setOffset(rect.left - trackRect.left + rect.width / 2);
    };
    place();
    // The station widths settle once the web font arrives, and the dot rides on them.
    void document.fonts?.ready.then(place);
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [reached]);

  const home = chainNameForDomain(record.domain);
  const out = record.received ?? record.intent.minAssets;
  const amount = (Number(out) / 1_000_000).toLocaleString("en-US", { maximumFractionDigits: 6 });
  const seconds = record.state === "delivered" ? Math.max(1, Math.round((record.updatedAt - record.createdAt) / 1000)) : undefined;
  const titles = [
    "One permit, spendable only by this executor",
    `Position redeemed on ${home}`,
    "Circle signed every burn",
    record.legs.length > 1 ? `USDC on ${record.legs.length} chains` : `USDC on ${chainNameForDomain(record.legs[0]?.domain ?? record.domain)}`,
  ];
  const hashes: { href: string; text: string }[][] = [
    [],
    record.exitTx ? [{ href: explorers[record.domain] + record.exitTx, text: short(record.exitTx) }] : [],
    [],
    record.legs.filter((leg) => leg.mintTx && String(leg.mintTx) !== "external").map((leg) => ({ href: explorers[leg.domain] + leg.mintTx, text: short(leg.mintTx!) })),
  ];

  return (
    <div className={styles.flow} data-mode="live">
      <div className={styles.summary}>
        <span className="chip chip-accent">Withdraw</span>
        <span className={styles.summaryText}>
          {amount} USDC {home} <span className="soft">to</span> {record.legs.map((leg) => chainNameForDomain(leg.domain)).join(", ")}
        </span>
        {seconds !== undefined ? <span className={styles.seconds}>{seconds}s to USDC</span> : null}
      </div>

      <div ref={trackRef} className={`${styles.track} ${styles.trackFour}`}>
        <span className={styles.rail} aria-hidden="true" />
        <span className={styles.fill} aria-hidden="true" style={{ transform: `scaleX(${reached / (stations.length - 1)})` }} />
        <span className={styles.dot} aria-hidden="true" data-active={active ? "" : undefined} style={{ transform: `translate(${offset}px, -50%)` }} />
        <ol className={`${styles.stations} ${styles.stationsFour}`}>
          {stations.map((station, index) => {
            const done = index <= reached;
            return (
              <li key={station.key} className={styles.station} data-actor={station.actor} data-done={done ? "" : undefined} data-current={index === reached ? "" : undefined}>
                <span
                  ref={(element) => {
                    markerRefs.current[index] = element;
                  }}
                  className={styles.marker}
                  aria-hidden="true"
                />
                <p className={styles.label}>{station.label}</p>
                <p className={styles.title}>{titles[index]}</p>
                <div className={styles.links}>
                  {done && hashes[index].length > 0 ? (
                    hashes[index].map((hash) => (
                      <a key={hash.href} className={`hash ${styles.link}`} href={hash.href} target="_blank" rel="noreferrer">
                        {hash.text}
                      </a>
                    ))
                  ) : (
                    <span className={styles.linkGap} aria-hidden="true" />
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      </div>

      <p className={styles.operator}>
        <span className="chip chip-relayer">Relayer</span>
        <span>submits the signature and finishes every leg. Anyone can, and it cannot be redirected.</span>
      </p>

      {record.error ? <p className={styles.note}>{record.error}</p> : null}
    </div>
  );
}
