import type { ReactNode } from "react";
import { Providers } from "./providers";

export default function LiveLayout({ children }: { children: ReactNode }) {
  return <Providers>{children}</Providers>;
}
