import Link from "next/link";
import { Mark } from "./mark";
import { NavLinks } from "./nav-links";
import { RelayerStatus } from "./relayer-status";
import styles from "./nav.module.css";

export function Nav() {
  return (
    <header className={styles.nav}>
      <div className={`rail ${styles.inner}`}>
        <Link href="/" className={styles.brand} aria-label="Inlet home">
          <Mark />
          <span>Inlet</span>
        </Link>
        <NavLinks />
        <RelayerStatus compact />
      </div>
    </header>
  );
}
