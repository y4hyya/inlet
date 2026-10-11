"use client";

import { InletWidget, destinationsFor } from "@inletkit/widget";
import { site } from "@/lib/site";
import styles from "./hero.module.css";

export function HeroWidget() {
  return (
    <div className={styles.widget}>
      <InletWidget destinations={destinationsFor(site.network)} />
      {site.network === "mainnet" ? (
        <p className={styles.caption}>Live on Arc mainnet against the hosted relayer. Real USDC, so start small.</p>
      ) : (
        <p className={styles.caption}>
          Live against the hosted relayer. Testnet USDC from{" "}
          <a href="https://faucet.circle.com" target="_blank" rel="noreferrer">
            Circle&apos;s faucet
          </a>
          .
        </p>
      )}
    </div>
  );
}
