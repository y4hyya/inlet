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
          <p className="eyebrow" data-reveal>
            Deposit rail for DeFi. Live on Arc testnet
          </p>
          <h1 className={styles.title} data-reveal style={delay(1)}>
            From any chain into any position.
          </h1>
          <p className={styles.lead} data-reveal style={delay(2)}>
            One signature on the chain where the USDC sits. The position itself on the chain where your protocol lives. Circle Gateway and CCTP V2 carry it, Arc settles it, and nothing gets stuck on the way.
          </p>
          <div className={styles.actions} data-reveal style={delay(3)}>
            <Link className="btn btn-primary" href="/app">
              Try a live deposit
            </Link>
            <Link className="btn btn-secondary" href="/docs">
              Read the docs
            </Link>
          </div>
        </div>
        <div className={styles.stage} data-reveal style={delay(2)}>
          <HeroWidget />
        </div>
      </section>
    </RevealGroup>
  );
}
