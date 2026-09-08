import { codeToHtml } from "shiki";
import { CopyButton } from "./copy-button";
import styles from "./code.module.css";

export async function Code({ code, lang = "tsx", label }: { code: string; lang?: string; label?: string }) {
  const source = code.trim();
  const html = await codeToHtml(source, { lang, theme: "vesper" });
  return (
    <div className={styles.frame} data-code-frame="">
      <div className={styles.head}>
        {label ? <p className={styles.label}>{label}</p> : null}
        <CopyButton code={source} />
      </div>
      <div className={styles.code} data-code-body="" dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}
