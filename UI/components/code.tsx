import { codeToHtml } from "shiki";
import { CodeTabs, type RenderedSample } from "./code-tabs";

export interface CodeSample {
  id: string;
  label: string;
  code: string;
}

export async function Code({ samples, lang = "tsx" }: { samples: CodeSample[]; lang?: string }) {
  const rendered: RenderedSample[] = await Promise.all(
    samples.map(async (sample) => {
      const code = sample.code.trim();
      return { id: sample.id, label: sample.label, code, html: await codeToHtml(code, { lang, theme: "vesper" }) };
    }),
  );
  return <CodeTabs samples={rendered} />;
}
