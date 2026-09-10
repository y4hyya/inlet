"use client";

import { InletWidget, testnetDestinations } from "@inletkit/widget";
import styles from "./hero.module.css";

export function HeroWidget() {
  return (
    <div className={styles.widget}>
      <InletWidget destinations={testnetDestinations} />
      <p className={styles.caption}>
        Live against the hosted relayer. Testnet USDC from{" "}
        <a href="https://faucet.circle.com" target="_blank" rel="noreferrer">
          Circle&apos;s faucet
        </a>
        .
      </p>
    </div>
  );
}
