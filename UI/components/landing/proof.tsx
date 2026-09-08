import { explorers } from "@inletkit/sdk";
import { RevealGroup } from "@/components/reveal";
import { delay, short } from "@/lib/format";
import { runs } from "@/lib/runs";
import styles from "./proof.module.css";

export function Proof() {
  return (
    <RevealGroup>
      <section className={`rail ${styles.proof}`} aria-labelledby="proof-title">
        <div className={styles.head} data-reveal>
          <p className="eyebrow">Recorded on testnet</p>
          <h2 id="proof-title" className={styles.title}>
            Six deposits, four protocols, every transaction on an explorer.
          </h2>
        </div>
        <ol className={styles.ledger}>
          {runs.map((run, index) => (
            <li key={run.id} className={styles.row} data-reveal style={delay(index + 1)}>
              <span className={styles.seconds}>
                {run.seconds}
                <small>s</small>
              </span>
              <span className={styles.name}>
                {run.protocol}
                <span className={styles.position}>{run.position}</span>
              </span>
              <span className={styles.route}>
                <span className={`chip ${run.route === "gateway" ? "chip-circle" : "chip-user"}`}>{run.route === "gateway" ? "Gateway" : "CCTP"}</span>
                <span>
                  {run.sourceName} <span className="soft">to</span> {run.destinationName}
                </span>
              </span>
              <a className={`hash ${styles.link}`} href={explorers[run.destinationDomain] + run.destinationTx} target="_blank" rel="noreferrer">
                {short(run.destinationTx)}
              </a>
            </li>
          ))}
        </ol>
      </section>
    </RevealGroup>
  );
}
