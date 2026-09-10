import Link from "next/link";
import { builtWith } from "@/lib/content";
import { links, site } from "@/lib/site";
import { Wordmark } from "./wordmark";
import styles from "./footer.module.css";

export function Footer() {
  return (
    <footer className={styles.footer}>
      <div className={`rail ${styles.grid}`}>
        <div className={styles.about}>
          <p className={styles.brand}>
            <Wordmark height={30} />
            <span className="sr-only">Inlet</span>
          </p>
          <p className={styles.blurb}>A deposit and exit rail for DeFi. Native USDC only, Arc as the settlement hub, nothing wrapped and nothing stuck.</p>
          <p className="eyebrow">Hub on Arc testnet</p>
          <a className={`hash ${styles.address}`} href={links.hub} target="_blank" rel="noreferrer">
            {site.hub}
          </a>
        </div>
        <div>
          <p className={styles.heading}>Build</p>
          <ul className={styles.list}>
            <li>
              <Link href="/docs/widget">Mount the widget</Link>
            </li>
            <li>
              <Link href="/docs/adapters">Write an adapter</Link>
            </li>
            <li>
              <Link href="/docs/relayer">Run a relayer</Link>
            </li>
            <li>
              <a href={links.spec} target="_blank" rel="noreferrer">
                Specification
              </a>
            </li>
          </ul>
        </div>
        <div>
          <p className={styles.heading}>Live</p>
          <ul className={styles.list}>
            <li>
              <Link href="/app">Try a deposit</Link>
            </li>
            <li>
              <Link href="/docs/addresses">Addresses</Link>
            </li>
            <li>
              <a href={site.repo} target="_blank" rel="noreferrer">
                Source on GitHub
              </a>
            </li>
          </ul>
        </div>
      </div>
      <div className={`rail ${styles.note}`}>
        <p className="eyebrow">Built with</p>
        <ul className={styles.built}>
          {builtWith.map((name) => (
            <li key={name}>{name}</li>
          ))}
        </ul>
        <p className={`soft ${styles.legal}`}>MIT licensed. Testnet only. Version one charges no fee.</p>
      </div>
    </footer>
  );
}
