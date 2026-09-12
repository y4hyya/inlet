import type { Metadata } from "next";
import { EmbedView } from "@/components/embed/embed-view";
import { Wallpaper } from "@/components/landing/wallpaper";

export const metadata: Metadata = {
  title: "The button a protocol adds",
  description: "A mock of a protocol's own deposit page with the Inlet button beside its native control. One button, the same dialog, the position stays theirs.",
};

export default function EmbedPage() {
  return (
    <>
      <Wallpaper />
      <EmbedView />
    </>
  );
}
