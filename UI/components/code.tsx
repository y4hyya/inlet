import { codeToHtml } from "shiki";
import styles from "./code.module.css";

export async function Code({ code, lang = "tsx", label }: { code: string; lang?: string; label?: string }) {
  const html = await codeToHtml(code.trim(), { lang, theme: "vesper" });
  return (
    <div className={styles.frame}>
      {label ? <p className={styles.label}>{label}</p> : null}
      <div className={styles.code} dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}
