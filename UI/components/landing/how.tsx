import { RevealGroup } from "@/components/reveal";
import { steps } from "@/lib/content";
import { Timeline } from "./timeline";
import styles from "./how.module.css";

export function How() {
  return (
    <RevealGroup>
      <section className="rail section" aria-labelledby="how-title" id="how">
        <div className={styles.head} data-reveal>
          <p className="eyebrow">How it works</p>
          <h2 id="how-title" className={styles.title}>
            Six steps, one signature.
          </h2>
          <p className={styles.sub}>
            The user signs once. Everything after that is a contract call anyone can make, or a Circle attestation. The relayer makes it fast, not possible.
          </p>
        </div>
        <Timeline steps={steps} />
      </section>
    </RevealGroup>
  );
}
