"use client";

import { InletButton, morphoBaseSepoliaDestination } from "@inletkit/widget";
import Link from "next/link";
import { useState } from "react";
import styles from "./embed.module.css";

const vault = morphoBaseSepoliaDestination;

export function EmbedView() {
  const [amount, setAmount] = useState("5");
  const [out, setOut] = useState("2");

  return (
    <section className={`rail ${styles.page}`}>
      <div className={styles.intro}>
        <p className="eyebrow">For protocols</p>
        <h1 className={styles.title}>What your users see.</h1>
        <p className={styles.sub}>
          The button is the only thing a protocol adds. The dialog behind it is the same widget as on the <Link href="/app">app page</Link>, fixed to one destination, and the position it delivers is the protocol&apos;s own, in the user&apos;s name.
          The two cards below are a mock of a protocol&apos;s page. The two Inlet buttons on them are real, against the Morpho Oneshot vault on Base Sepolia.
        </p>
      </div>

      <div className={styles.cards}>
        <div className={styles.card}>
          <div className={styles.cardHead}>
            <div>
              <h2 className={styles.cardTitle}>Oneshot Vault</h2>
              <p className={styles.cardSub}>USDC vault on Base Sepolia</p>
            </div>
            <span className="chip">Mock</span>
          </div>
          <label className={styles.field}>
            <span className={styles.label}>Amount</span>
            <span className={styles.inputRow}>
              <input className={styles.input} inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} aria-label="Amount to deposit" />
              <span className={styles.unit}>USDC</span>
            </span>
          </label>
          <div className={styles.actions}>
            <div className={styles.native}>
              <button type="button" className={`btn btn-primary ${styles.nativeButton}`} disabled>
                Deposit
              </button>
              <span className={styles.caption}>the protocol&apos;s own button, needs USDC on Base Sepolia</span>
            </div>
            <InletButton action="deposit" destination={vault} amount={amount} />
          </div>
        </div>

        <div className={styles.card}>
          <div className={styles.cardHead}>
            <div>
              <h2 className={styles.cardTitle}>Oneshot Vault</h2>
              <p className={styles.cardSub}>your vUSDC shares on Base Sepolia</p>
            </div>
            <span className="chip">Mock</span>
          </div>
          <label className={styles.field}>
            <span className={styles.label}>Amount</span>
            <span className={styles.inputRow}>
              <input className={styles.input} inputMode="decimal" value={out} onChange={(event) => setOut(event.target.value)} aria-label="Amount to withdraw" />
              <span className={styles.unit}>USDC</span>
            </span>
          </label>
          <div className={styles.actions}>
            <div className={styles.native}>
              <button type="button" className={`btn btn-primary ${styles.nativeButton}`} disabled>
                Withdraw
              </button>
              <span className={styles.caption}>the protocol&apos;s own button, lands on Base Sepolia</span>
            </div>
            <InletButton action="withdraw" destination={vault} />
          </div>
        </div>
      </div>

      <p className={styles.note}>
        Two lines mount it. <Link href="/docs/widget#the-button">How to add the button</Link>.
      </p>
    </section>
  );
}
