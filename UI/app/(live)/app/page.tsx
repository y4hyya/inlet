import type { Metadata } from "next";

export const metadata: Metadata = { title: "Live app" };

export default function AppPage() {
  return (
    <section className="rail section">
      <p className="eyebrow">Live on testnet</p>
      <h1>Try a deposit</h1>
      <p className="muted">The live app is being built.</p>
    </section>
  );
}
