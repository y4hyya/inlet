"use client";

import { InletProvider } from "@inletkit/widget";
import type { ReactNode } from "react";
import { site } from "@/lib/site";

const appearance = { theme: "dark", accentColor: "#f08a59", logo: `${site.url}/wordmark.svg` } as const;

export function Providers({ children }: { children: ReactNode }) {
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
  if (!appId) {
    return (
      <div className="rail section">
        <p className="muted">NEXT_PUBLIC_PRIVY_APP_ID is not set, so the live widget cannot mount.</p>
      </div>
    );
  }
  return (
    <InletProvider privyAppId={appId} relayerUrl={site.relayerUrl} appearance={appearance}>
      {children}
    </InletProvider>
  );
}
