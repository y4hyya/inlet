import Link from "next/link";
import { RevealGroup } from "@/components/reveal";
import { builtWith } from "@/lib/content";
import { delay } from "@/lib/format";
import styles from "./close.module.css";

export function Close() {
  return (
    <RevealGroup>
      <section className={`rail section ${styles.section}`} aria-labelledby="close-title">
        <ul className={styles.built} data-reveal aria-label="Built with">
          {builtWith.map((name) => (
            <li key={name}>{name}</li>
          ))}
        </ul>
        <div className={styles.close}>
          <h2 id="close-title" className={styles.title} data-reveal style={delay(1)}>
            Put a position one signature away from any chain.
          </h2>
          <div className={styles.actions} data-reveal style={delay(2)}>
            <Link className="btn btn-primary" href="/app">
              Try a live deposit
            </Link>
            <Link className="btn btn-secondary" href="/docs">
              Read the docs
            </Link>
          </div>
        </div>
      </section>
    </RevealGroup>
  );
}
