import { explorers, testnetDestinations } from "@inletkit/sdk";
import Link from "next/link";
import { RevealGroup } from "@/components/reveal";
import { delay, short } from "@/lib/format";
import { runs } from "@/lib/runs";
import styles from "./destinations.module.css";

export function Destinations() {
  return (
    <RevealGroup>
      <section className={`rail section ${styles.section}`} aria-labelledby="destinations-title" id="destinations">
        <div className={styles.head} data-reveal>
          <p className="eyebrow">Destinations live on testnet</p>
          <h2 id="destinations-title" className={styles.title}>
            Seven destinations across five chains.
          </h2>
          <p className={styles.sub}>
            Every destination is an adapter behind a receiver. Pick one in the widget, or add your own.
          </p>
        </div>
        <div className={styles.panel}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">Destination</th>
                <th scope="col">Adapter</th>
                <th scope="col">You end up with</th>
                <th scope="col">Last run</th>
              </tr>
            </thead>
            <tbody>
              {testnetDestinations.map((destination, index) => {
                const run = runs.find((entry) => entry.destinationId === destination.id);
                return (
                  <tr key={destination.id} data-reveal style={delay(index + 1)}>
                    <td>
                      <span className={styles.name}>{destination.protocol}</span>
                      <span className={styles.chain}>{destination.chain}</span>
                    </td>
                    <td>
                      <code className={styles.adapter}>{destination.adapterName}</code>
                    </td>
                    <td className={styles.position}>{destination.positionLabel}</td>
                    <td>
                      {run ? (
                        <span className={styles.run}>
                          <span className={styles.seconds}>{run.seconds}s</span>
                          <a className="hash" href={explorers[destination.destinationDomain] + run.destinationTx} target="_blank" rel="noreferrer">
                            {short(run.destinationTx)}
                          </a>
                        </span>
                      ) : (
                        <span className="soft">not yet</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className={styles.foot} data-reveal>
          An ERC 4626 vault over USDC needs no contract work. Anything else needs one adapter with one function. <Link href="/docs/adapters">Write an adapter</Link>
        </p>
      </section>
    </RevealGroup>
  );
}
