import Link from "next/link";
import { RevealGroup } from "@/components/reveal";
import { delay } from "@/lib/format";
import { HeroWidget } from "./hero-widget";
import styles from "./hero.module.css";

export function Hero() {
  return (
    <RevealGroup>
      <section className={`rail ${styles.hero}`}>
        <div className={styles.copy}>
          <h1 className={styles.title} data-reveal>
            From <em className={styles.any}>any</em> chain into <em className={styles.any}>any</em> position.
          </h1>
          <p className={styles.lead} data-reveal style={delay(1)}>
            One signature, and your USDC arrives as a position, not a balance.
          </p>
          <div className={styles.actions} data-reveal style={delay(2)}>
            <Link className="btn btn-secondary" href="/docs">
              Read the docs
            </Link>
            <Link className={styles.quiet} href="/app">
              Watch a deposit
              <span aria-hidden="true">→</span>
            </Link>
          </div>
        </div>
        <div className={styles.stage} data-reveal style={delay(1)}>
          <HeroWidget />
        </div>
      </section>
    </RevealGroup>
  );
}
