import type { Metadata } from "next";
import { Suspense } from "react";
import { AppView } from "@/components/app/app-view";

export const metadata: Metadata = {
  title: "Try a deposit",
  description: "Make a real testnet deposit through Arc into Aave, Compound, Morpho or Uniswap, follow one by hash, or replay a recorded run.",
};

export default function AppPage() {
  return (
    <Suspense fallback={<section className="rail section" />}>
      <AppView />
    </Suspense>
  );
}
