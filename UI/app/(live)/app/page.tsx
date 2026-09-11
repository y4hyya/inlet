import type { Metadata } from "next";
import { Suspense } from "react";
import { AppView } from "@/components/app/app-view";
import { Wallpaper } from "@/components/landing/wallpaper";

export const metadata: Metadata = {
  title: "Try a deposit, then take it back out",
  description: "Make a real testnet deposit through Arc into Aave, Compound, Morpho or Uniswap, withdraw it back to the chains you choose, follow either by hash, or replay a recorded run.",
};

export default function AppPage() {
  return (
    <>
      <Wallpaper />
      <Suspense fallback={<section className="rail section" />}>
        <AppView />
      </Suspense>
    </>
  );
}
