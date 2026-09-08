"use client";

import { DepositWidget, testnetDestinations } from "@inletkit/widget";
import styles from "./hero.module.css";

export function HeroWidget() {
  return (
    <div className={styles.widget}>
      <DepositWidget destinations={testnetDestinations} title="Deposit from any chain" />
      <p className={styles.caption}>Live against the hosted relayer. Testnet USDC, real transactions.</p>
    </div>
  );
}
