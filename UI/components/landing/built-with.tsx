import { RevealGroup } from "@/components/reveal";
import { builtWith } from "@/lib/content";
import styles from "./built-with.module.css";

export function BuiltWith() {
  return (
    <RevealGroup>
      <section className="rail section">
        <ul className={styles.built} data-reveal aria-label="Built with">
          {builtWith.map((name) => (
            <li key={name}>{name}</li>
          ))}
        </ul>
      </section>
    </RevealGroup>
  );
}
