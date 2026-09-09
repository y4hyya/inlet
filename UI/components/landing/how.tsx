import Link from "next/link";
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
        <figure className={styles.figure} data-reveal>
          <img src="/diagrams/deposit-sequence.svg" alt="Sequence diagram of one deposit: the wallet or Gateway balance on the source chain, the deposit address and hub on Arc, Circle attestation, the relayer, the receiver and adapter on the destination chain" width={1280} height={720} loading="lazy" />
          <figcaption>
            One deposit end to end. The Gateway route and the CCTP route are the two ways to fund the address. <Link href="/docs/how-it-works">Read the full walk through</Link>
          </figcaption>
        </figure>
        <Timeline steps={steps} />
      </section>
    </RevealGroup>
  );
}
