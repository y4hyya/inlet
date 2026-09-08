"use client";

import { testnetDestinations } from "@inletkit/widget";
import { useRelayerHealth } from "@/components/relayer-status";
import styles from "./hero.module.css";

export function HeroProof() {
  const { state, health } = useRelayerHealth();
  const chains = new Set(testnetDestinations.map((entry) => entry.destinationDomain)).size;
  const served = health?.destinations?.length ?? chains;
  const relayer = state === "online" ? "relayer online" : state === "offline" ? "relayer offline" : "checking relayer";
  return (
    <p className={styles.proof}>
      <span className={`${styles.dot} ${styles[state]}`} aria-hidden="true" />
      <span>
        {testnetDestinations.length} destinations on {served} chains
      </span>
      <span className={styles.sep} aria-hidden="true" />
      <span>{relayer}</span>
    </p>
  );
}
