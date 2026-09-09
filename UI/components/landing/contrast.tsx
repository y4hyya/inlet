import { RevealGroup } from "@/components/reveal";
import { delay } from "@/lib/format";
import styles from "./contrast.module.css";

const today = ["Bridge the USDC to the chain the protocol lives on", "Swap or unwrap whatever arrived", "Switch the wallet to that network", "Sign the deposit"];

export function Contrast() {
  return (
    <RevealGroup>
      <section className="rail section" aria-labelledby="contrast-title">
        <div className={styles.head} data-reveal>
          <p className="eyebrow">Why a rail</p>
          <h2 id="contrast-title" className={styles.title}>
            The deposit should be the only thing the user does.
          </h2>
        </div>
        <div className={styles.columns}>
          <div className={styles.column} data-reveal style={delay(1)}>
            <p className={styles.label}>Today</p>
            <ol className={styles.list}>
              {today.map((item, index) => (
                <li key={item} className={styles.item}>
                  <span className={styles.number}>0{index + 1}</span>
                  <span>{item}</span>
                </li>
              ))}
            </ol>
            <p className={styles.note}>Four steps, two or three signatures, gas on two chains, and a wrapped asset somewhere in the middle.</p>
          </div>
          <div className={`${styles.column} ${styles.after}`} data-reveal style={delay(2)}>
            <p className={styles.label}>With Inlet</p>
            <ol className={styles.list}>
              <li className={`${styles.item} ${styles.itemAccent}`}>
                <span className={styles.number}>01</span>
                <span>Sign once, on the chain where the USDC already is</span>
              </li>
            </ol>
            <p className={styles.note}>One transfer to an address that can only end in the position the user chose. Native USDC the whole way, no network switch, no gas on the far side.</p>
          </div>
        </div>
      </section>
    </RevealGroup>
  );
}
