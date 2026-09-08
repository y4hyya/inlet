import Link from "next/link";

export default function NotFound() {
  return (
    <section className="rail section">
      <p className="eyebrow">404</p>
      <h1 style={{ fontSize: "var(--text-5)", marginTop: 12 }}>Nothing at this address.</h1>
      <p className="muted" style={{ marginTop: 16, maxWidth: "40ch" }}>
        Deposits only go where the intent names, and so do pages. Head back to the start or straight to the live app.
      </p>
      <p style={{ marginTop: 24, display: "flex", gap: 12 }}>
        <Link className="btn btn-primary" href="/">
          Back to start
        </Link>
        <Link className="btn btn-secondary" href="/app">
          Live app
        </Link>
      </p>
    </section>
  );
}
