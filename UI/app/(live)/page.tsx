import { Close } from "@/components/landing/close";
import { Contrast } from "@/components/landing/contrast";
import { Destinations } from "@/components/landing/destinations";
import { Guarantees } from "@/components/landing/guarantees";
import { Hero } from "@/components/landing/hero";
import { How } from "@/components/landing/how";
import { Integrate } from "@/components/landing/integrate";
import { Proof } from "@/components/landing/proof";
import { Tagline } from "@/components/landing/tagline";

export default function Home() {
  return (
    <>
      <Hero />
      <Proof />
      <Contrast />
      <Tagline />
      <How />
      <Guarantees />
      <Destinations />
      <Integrate />
      <Close />
    </>
  );
}
