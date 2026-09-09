import { Close } from "@/components/landing/close";
import { Contrast } from "@/components/landing/contrast";
import { Guarantees } from "@/components/landing/guarantees";
import { Hero } from "@/components/landing/hero";
import { How } from "@/components/landing/how";
import { Integrate } from "@/components/landing/integrate";
import { Tagline } from "@/components/landing/tagline";
import { Wallpaper } from "@/components/landing/wallpaper";

export default function Home() {
  return (
    <>
      <Wallpaper />
      <Hero />
      <Contrast />
      <Tagline />
      <How />
      <Guarantees />
      <Integrate />
      <Close />
    </>
  );
}
