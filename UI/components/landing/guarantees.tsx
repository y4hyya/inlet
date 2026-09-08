import Link from "next/link";
import { RevealGroup } from "@/components/reveal";
import { guarantees } from "@/lib/content";
import { delay } from "@/lib/format";
import styles from "./guarantees.module.css";

export function Guarantees() {
  return (
    <RevealGroup>
      <section className={`rail section ${styles.section}`} aria-labelledby="guarantees-title">
        <div className={styles.head} data-reveal>
          <p className="eyebrow">Why nothing gets stuck</p>
          <h2 id="guarantees-title" className={styles.title}>
            Three invariants, enforced by the contracts.
          </h2>
        </div>
        <ol className={styles.grid}>
          {guarantees.map((item, index) => (
            <li key={item.title} className={styles.cell} data-reveal style={delay(index + 1)}>
              <p className={styles.number}>0{index + 1}</p>
              <h3 className={styles.cellTitle}>{item.title}</h3>
              <p className={styles.body}>{item.body}</p>
            </li>
          ))}
        </ol>
        <figure className={styles.figure} data-reveal>
          <img src="/diagrams/intent-lifecycle.svg" alt="State diagram of an intent: created, funded, swept, attested, executed, with claimable, refunding, refunded and expired as the other exits" width={1280} height={720} loading="lazy" />
          <figcaption>
            Every state an intent can be in. Every path ends in a position, a claim, or a refund. <Link href="/docs/how-it-works#lifecycle">The lifecycle in detail</Link>
          </figcaption>
        </figure>
      </section>
    </RevealGroup>
  );
}
